import { Router, type IRouter } from "express";
import { eq, and, or, ilike, gte, lte, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, paymentsTable, customersTable, subOrdersTable, offersTable } from "@workspace/db";
import { computeOfferDiscount } from "./offers";
import {
  CreateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  UpdateOrderBody,
  DeleteOrderParams,
  UpdateOrderStatusParams,
  UpdateOrderStatusBody,
  AddOrderItemParams,
  AddOrderItemBody,
  UpdateOrderItemParams,
  UpdateOrderItemBody,
  DeleteOrderItemParams,
  GetOrderPaymentParams,
  CreateOrderPaymentParams,
  CreateOrderPaymentBody,
  UpdateOrderPaymentParams,
  UpdateOrderPaymentBody,
  ListOrdersQueryParams,
  ReplaceOrderItemsBody,
  UpdateSubOrderStatusParams,
  UpdateSubOrderStatusBody,
} from "@workspace/api-zod";

const EDITABLE_STATUSES = ["pending_payment", "approved", "preparing"];
const SUB_CODE_MAP: Record<string, string> = { dine_in: "A", takeaway: "B", delivery: "C" };
const KITCHEN_RANK: Record<string, number> = { approved: 0, preparing: 1, ready: 2 };

// Sync sub-orders to match current item types. Preserves existing sub-order statuses.
async function syncSubOrders(orderId: number, parentStatus: string) {
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  const typeSet = new Set(items.map(i => i.itemOrderType));
  const types = [...typeSet].sort();
  const existing = await db.select().from(subOrdersTable).where(eq(subOrdersTable.orderId, orderId));
  const existingByType = new Map(existing.map(s => [s.orderType, s]));

  if (types.length <= 1) {
    if (existing.length > 0) {
      await db.delete(subOrdersTable).where(eq(subOrdersTable.orderId, orderId));
    }
    return;
  }
  // Delete sub-orders for types no longer present
  for (const [type, sub] of existingByType) {
    if (!typeSet.has(type)) {
      await db.delete(subOrdersTable).where(eq(subOrdersTable.id, sub.id));
    }
  }
  // Create sub-orders for new types (existing ones keep their status)
  for (const type of types) {
    if (!existingByType.has(type)) {
      await db.insert(subOrdersTable).values({
        orderId,
        subCode: SUB_CODE_MAP[type] ?? "X",
        orderType: type,
        status: parentStatus,
      });
    }
  }
}

function serializePayment(p: typeof paymentsTable.$inferSelect) {
  const totalAmount    = Number(p.totalAmount);
  const cashAmount     = Number(p.cashAmount);
  const upiAmount      = Number(p.upiAmount);
  const cardAmount     = Number(p.cardAmount);
  const discountValue  = Number(p.discountValue);
  const discountAmount = Number(p.discountAmount);
  const charityAmount  = Number(p.charityAmount);
  const finalAmount    = totalAmount - discountAmount + charityAmount;
  const totalPaid      = cashAmount + upiAmount + cardAmount;
  return {
    ...p,
    totalAmount, cashAmount, upiAmount, cardAmount,
    discountType:   p.discountType ?? null,
    discountValue,  discountAmount, charityAmount, finalAmount,
    totalPaid,
    balance:   finalAmount - totalPaid,
    createdAt: p.createdAt.toISOString(),
  };
}

async function syncPaymentTotal(orderId: number, newTotal: number) {
  const [p] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, orderId));
  if (!p) return;
  const discountAmount = p.discountType === "percentage"
    ? newTotal * Number(p.discountValue) / 100
    : Number(p.discountAmount);
  await db.update(paymentsTable)
    .set({ totalAmount: String(newTotal), discountAmount: String(discountAmount) })
    .where(eq(paymentsTable.orderId, orderId));
}

const router: IRouter = Router();

async function getFullOrder(id: number) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) return null;
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, id));
  const subOrders = await db.select().from(subOrdersTable)
    .where(eq(subOrdersTable.orderId, id))
    .orderBy(subOrdersTable.subCode);
  return {
    ...order,
    totalAmount:    Number(order.totalAmount),
    subtotalAmount: Number(order.subtotalAmount),
    discountAmount: Number(order.discountAmount),
    offerId:        order.offerId ?? null,
    source:         order.source ?? "counter",
    readyTime: order.readyTime.toISOString(),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: items.map(i => ({ ...i, price: Number(i.price) })),
    subOrders: subOrders.map(s => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    payment: payment ? serializePayment(payment) : null,
  };
}

// List orders
router.get("/orders", async (req, res): Promise<void> => {
  const q = ListOrdersQueryParams.safeParse(req.query);
  const conditions = [];

  if (q.success) {
    if (q.data.status) {
      const statuses = q.data.status.split(",").map(s => s.trim());
      if (statuses.length === 1) {
        conditions.push(eq(ordersTable.status, statuses[0]));
      } else {
        conditions.push(or(...statuses.map(s => eq(ordersTable.status, s)))!);
      }
    }
    if (q.data.search) {
      const s = `%${q.data.search}%`;
      conditions.push(or(
        ilike(ordersTable.customerName, s),
        ilike(ordersTable.customerPhone, s),
        ilike(ordersTable.orderNumber, s),
      )!);
    }
    if (q.data.date) {
      const d = new Date(q.data.date);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      conditions.push(gte(ordersTable.createdAt, start));
      conditions.push(lte(ordersTable.createdAt, end));
    }
    if (q.data.customerId) {
      conditions.push(eq(ordersTable.customerId, q.data.customerId));
    }
    if ((q.data as { source?: string }).source) {
      conditions.push(eq(ordersTable.source, (q.data as { source?: string }).source!));
    }
  }

  const orders = await db.select().from(ordersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${ordersTable.createdAt} DESC`);

  const result = await Promise.all(orders.map(o => getFullOrder(o.id)));
  res.json(result.filter(Boolean));
});

// Create order
router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const readyTime = new Date(Date.now() + 10 * 60 * 1000);
  let customerId = parsed.data.customerId ?? null;

  // Auto-create or find customer by phone
  if (parsed.data.customerPhone && !customerId) {
    const existing = await db.select().from(customersTable).where(eq(customersTable.phone, parsed.data.customerPhone));
    if (existing.length > 0) {
      customerId = existing[0].id;
    } else {
      const [newCustomer] = await db.insert(customersTable).values({
        name: parsed.data.customerName,
        phone: parsed.data.customerPhone,
      }).returning();
      customerId = newCustomer.id;
    }
  }

  // Insert with temp order number; update to sequential ORD-XXXX after getting id
  const [order] = await db.insert(ordersTable).values({
    orderNumber: `TMP-${Date.now()}`,
    customerId,
    customerName: parsed.data.customerName,
    customerPhone: parsed.data.customerPhone ?? null,
    orderType: parsed.data.orderType,
    status: "pending_payment",
    notes: parsed.data.notes ?? null,
    totalAmount: "0",
    readyTime,
  }).returning();

  // Sequential order number: ORD-0001, ORD-0002...
  const orderNumber = `ORD-${String(order.id).padStart(4, "0")}`;
  await db.update(ordersTable).set({ orderNumber }).where(eq(ordersTable.id, order.id));

  // Insert items
  let subtotal = 0;
  if (parsed.data.items && parsed.data.items.length > 0) {
    const itemsToInsert = parsed.data.items.map(item => ({
      orderId: order.id,
      productId: item.productId ?? null,
      productName: item.productName,
      price: String(item.price),
      quantity: item.quantity,
      itemOrderType: item.itemOrderType ?? parsed.data.orderType ?? "dine_in",
      notes: item.notes ?? null,
    }));
    await db.insert(orderItemsTable).values(itemsToInsert);
    subtotal = parsed.data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  // Apply offer discount
  const offerId = (parsed.data as { offerId?: number | null }).offerId ?? null;
  let discountAmt = 0;
  if (offerId) {
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, offerId));
    if (offer && offer.active) {
      const cartItems = (parsed.data.items ?? []).map(i => ({ price: i.price, quantity: i.quantity }));
      discountAmt = computeOfferDiscount(offer, cartItems);
      discountAmt = Math.min(discountAmt, subtotal);
      discountAmt = Math.round(discountAmt * 100) / 100;
    }
  }

  const total = subtotal - discountAmt;
  await db.update(ordersTable).set({
    totalAmount:    String(total),
    subtotalAmount: String(subtotal),
    discountAmount: String(discountAmt),
    offerId,
  }).where(eq(ordersTable.id, order.id));

  // Sync sub-orders (creates A/B if mixed)
  await syncSubOrders(order.id, "pending_payment");

  const full = await getFullOrder(order.id);
  res.status(201).json(full);
});

// Get single order
router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const full = await getFullOrder(params.data.id);
  if (!full) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(full);
});

// Update order
router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(ordersTable).set(parsed.data).where(eq(ordersTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Order not found" }); return; }
  const full = await getFullOrder(row.id);
  res.json(full);
});

// Delete order
router.delete("/orders/:id", async (req, res): Promise<void> => {
  const params = DeleteOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(subOrdersTable).where(eq(subOrdersTable.orderId, params.data.id));
  await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, params.data.id));
  await db.delete(paymentsTable).where(eq(paymentsTable.orderId, params.data.id));
  await db.delete(ordersTable).where(eq(ordersTable.id, params.data.id));
  res.sendStatus(204);
});

// Update order status
router.patch("/orders/:id/status", async (req, res): Promise<void> => {
  const params = UpdateOrderStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(ordersTable).set({ status: parsed.data.status }).where(eq(ordersTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Order not found" }); return; }

  // Propagate status change to sub-orders (e.g. approved, cancelled, completed)
  await db.update(subOrdersTable)
    .set({ status: parsed.data.status })
    .where(eq(subOrdersTable.orderId, params.data.id));

  // Update customer stats on completion
  if (parsed.data.status === "completed" && row.customerId) {
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, row.id));
    const itemNames = items.map(i => i.productName).join(", ");
    await db.execute(sql`
      UPDATE customers SET
        order_count = order_count + 1,
        total_spending = total_spending + ${Number(row.totalAmount)},
        last_order_date = NOW(),
        favorite_items = ${itemNames}
      WHERE id = ${row.customerId}
    `);
  }

  // Auto-delete customer if cancelled and they have no other orders
  if (parsed.data.status === "cancelled" && row.customerId) {
    const otherOrders = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(and(eq(ordersTable.customerId, row.customerId), sql`${ordersTable.id} != ${row.id}`));
    if (otherOrders.length === 0) {
      await db.delete(customersTable).where(eq(customersTable.id, row.customerId));
    }
  }

  const full = await getFullOrder(row.id);
  res.json(full);
});

// Add item to order
router.post("/orders/:id/items", async (req, res): Promise<void> => {
  const params = AddOrderItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = AddOrderItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [item] = await db.insert(orderItemsTable).values({
    orderId: params.data.id,
    productId: parsed.data.productId ?? null,
    productName: parsed.data.productName,
    price: String(parsed.data.price),
    quantity: parsed.data.quantity,
    itemOrderType: parsed.data.itemOrderType ?? "dine_in",
    notes: parsed.data.notes ?? null,
  }).returning();

  // Recalculate total
  const allItems = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, params.data.id));
  const total = allItems.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  await db.update(ordersTable).set({ totalAmount: String(total) }).where(eq(ordersTable.id, params.data.id));

  res.status(201).json({ ...item, price: Number(item.price) });
});

// Replace all items in an active order (atomic edit)
router.put("/orders/:id/items", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = ReplaceOrderItemsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!EDITABLE_STATUSES.includes(order.status)) {
    res.status(409).json({ error: `Cannot edit order in status: ${order.status}` });
    return;
  }

  // Atomically replace all items
  await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, params.data.id));

  let total = 0;
  if (parsed.data.items.length > 0) {
    await db.insert(orderItemsTable).values(
      parsed.data.items.map(item => ({
        orderId: params.data.id,
        productId: item.productId ?? null,
        productName: item.productName,
        price: String(item.price),
        quantity: item.quantity,
        itemOrderType: item.itemOrderType ?? "dine_in",
        notes: item.notes ?? null,
      }))
    );
    total = parsed.data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  // Derive order_type from item types so Kitchen badge stays in sync
  const itemTypes = new Set(
    parsed.data.items.map(item => item.itemOrderType ?? "dine_in")
  );
  const newOrderType = itemTypes.size === 1 ? [...itemTypes][0] : "mixed";

  // Update total, order_type, and notes
  const updateData: Record<string, unknown> = { totalAmount: String(total), orderType: newOrderType };
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  await db.update(ordersTable).set(updateData).where(eq(ordersTable.id, params.data.id));

  // Sync payment total if a payment record exists (keeps pending amount correct)
  await syncPaymentTotal(params.data.id, total);

  // Sync sub-orders to match the new item set (preserves existing sub-order statuses)
  const [currentOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  await syncSubOrders(params.data.id, currentOrder?.status ?? "pending_payment");

  const full = await getFullOrder(params.data.id);
  res.json(full);
});

// Update order item
router.patch("/orders/:id/items/:itemId", async (req, res): Promise<void> => {
  const params = UpdateOrderItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.quantity != null) updateData.quantity = parsed.data.quantity;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  const [item] = await db.update(orderItemsTable).set(updateData)
    .where(and(eq(orderItemsTable.id, params.data.itemId), eq(orderItemsTable.orderId, params.data.id)))
    .returning();
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  // Recalculate total
  const allItems = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, params.data.id));
  const total = allItems.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  await db.update(ordersTable).set({ totalAmount: String(total) }).where(eq(ordersTable.id, params.data.id));
  await syncPaymentTotal(params.data.id, total);

  res.json({ ...item, price: Number(item.price) });
});

// Delete order item
router.delete("/orders/:id/items/:itemId", async (req, res): Promise<void> => {
  const params = DeleteOrderItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(orderItemsTable)
    .where(and(eq(orderItemsTable.id, params.data.itemId), eq(orderItemsTable.orderId, params.data.id)));

  // Recalculate total
  const allItems = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, params.data.id));
  const total = allItems.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  await db.update(ordersTable).set({ totalAmount: String(total) }).where(eq(ordersTable.id, params.data.id));
  await syncPaymentTotal(params.data.id, total);

  res.sendStatus(204);
});

// Void payment — zero all amounts, mark as voided
router.post("/orders/:id/payment/void", async (req, res): Promise<void> => {
  const params = GetOrderPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, params.data.id));
  if (!existing) { res.status(404).json({ error: "Payment not found" }); return; }

  const [payment] = await db.update(paymentsTable).set({
    cashAmount: "0",
    upiAmount: "0",
    cardAmount: "0",
    discountType: null,
    discountValue: "0",
    discountAmount: "0",
    charityAmount: "0",
    status: "voided",
  }).where(eq(paymentsTable.orderId, params.data.id)).returning();

  res.json(serializePayment(payment));
});

// Get payment
router.get("/orders/:id/payment", async (req, res): Promise<void> => {
  const params = GetOrderPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, params.data.id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  res.json(serializePayment(payment));
});

// Create payment — auto-approves order if pending_payment
router.post("/orders/:id/payment", async (req, res): Promise<void> => {
  const params = CreateOrderPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CreateOrderPaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const cashAmt = parsed.data.cashAmount ?? 0;
  const upiAmt = parsed.data.upiAmount ?? 0;
  const cardAmt = parsed.data.cardAmount ?? 0;
  const totalPaid = cashAmt + upiAmt + cardAmt;
  const discountType = parsed.data.discountType ?? null;
  const discountValue = parsed.data.discountValue ?? 0;
  const discountAmount = discountType === "percentage"
    ? parsed.data.totalAmount * discountValue / 100
    : discountType === "fixed" ? discountValue : 0;
  const charityAmount = parsed.data.charityAmount ?? 0;
  const finalAmount = parsed.data.totalAmount - discountAmount + charityAmount;
  const status = totalPaid >= finalAmount ? "paid" : totalPaid > 0 ? "partial" : "pending";

  const [payment] = await db.insert(paymentsTable).values({
    orderId: params.data.id,
    totalAmount: String(parsed.data.totalAmount),
    cashAmount: String(cashAmt),
    upiAmount: String(upiAmt),
    cardAmount: String(cardAmt),
    discountType,
    discountValue: String(discountValue),
    discountAmount: String(discountAmount),
    charityAmount: String(charityAmount),
    status,
  }).returning();

  // Auto-approve order + sub-orders if still in pending_payment state
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (order && order.status === "pending_payment") {
    await db.update(ordersTable).set({ status: "approved" }).where(eq(ordersTable.id, params.data.id));
    await db.update(subOrdersTable).set({ status: "approved" }).where(eq(subOrdersTable.orderId, params.data.id));
  }

  res.status(201).json(serializePayment(payment));
});

// Update payment — auto-approves order if pending_payment
router.patch("/orders/:id/payment", async (req, res): Promise<void> => {
  const params = UpdateOrderPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderPaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, params.data.id));
  if (!existing) { res.status(404).json({ error: "Payment not found" }); return; }

  const cashAmt = parsed.data.cashAmount ?? Number(existing.cashAmount);
  const upiAmt = parsed.data.upiAmount ?? Number(existing.upiAmount);
  const cardAmt = parsed.data.cardAmount ?? Number(existing.cardAmount);
  const totalPaid = cashAmt + upiAmt + cardAmt;
  const totalAmount = Number(existing.totalAmount);
  const discountType = parsed.data.discountType !== undefined
    ? (parsed.data.discountType || null)
    : (existing.discountType ?? null);
  const discountValue = parsed.data.discountValue ?? Number(existing.discountValue);
  const discountAmount = discountType === "percentage"
    ? totalAmount * discountValue / 100
    : discountType === "fixed" ? discountValue : 0;
  const charityAmount = parsed.data.charityAmount ?? Number(existing.charityAmount);
  const finalAmount = totalAmount - discountAmount + charityAmount;
  const status = totalPaid >= finalAmount ? "paid" : totalPaid > 0 ? "partial" : "pending";

  const [payment] = await db.update(paymentsTable).set({
    cashAmount: String(cashAmt),
    upiAmount: String(upiAmt),
    cardAmount: String(cardAmt),
    discountType,
    discountValue: String(discountValue),
    discountAmount: String(discountAmount),
    charityAmount: String(charityAmount),
    status,
  }).where(eq(paymentsTable.orderId, params.data.id)).returning();

  // Auto-approve order + sub-orders if still in pending_payment state
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (order && order.status === "pending_payment") {
    await db.update(ordersTable).set({ status: "approved" }).where(eq(ordersTable.id, params.data.id));
    await db.update(subOrdersTable).set({ status: "approved" }).where(eq(subOrdersTable.orderId, params.data.id));
  }

  res.json(serializePayment(payment));
});

// Update sub-order kitchen status (rolls up to parent)
router.patch("/sub-orders/:id/status", async (req, res): Promise<void> => {
  const params = UpdateSubOrderStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateSubOrderStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [subOrder] = await db.update(subOrdersTable)
    .set({ status: parsed.data.status })
    .where(eq(subOrdersTable.id, params.data.id))
    .returning();
  if (!subOrder) { res.status(404).json({ error: "Sub-order not found" }); return; }

  // Roll up: parent becomes the least-advanced sub-order status
  const allSubs = await db.select().from(subOrdersTable)
    .where(eq(subOrdersTable.orderId, subOrder.orderId));
  const minRank = Math.min(...allSubs.map(s => KITCHEN_RANK[s.status] ?? 0));
  const parentStatus = (Object.entries(KITCHEN_RANK).find(([, r]) => r === minRank)?.[0]) ?? "approved";
  await db.update(ordersTable)
    .set({ status: parentStatus })
    .where(eq(ordersTable.id, subOrder.orderId));

  const full = await getFullOrder(subOrder.orderId);
  res.json(full);
});

export default router;
