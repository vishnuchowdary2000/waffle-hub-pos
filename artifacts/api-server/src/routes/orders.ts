import { Router, type IRouter } from "express";
import { eq, and, or, ilike, gte, lte, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, paymentsTable, customersTable } from "@workspace/db";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

function generateOrderNumber(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `WH${now.getFullYear().toString().slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function getFullOrder(id: number) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) return null;
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, id));
  return {
    ...order,
    totalAmount: Number(order.totalAmount),
    readyTime: order.readyTime.toISOString(),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: items.map(i => ({ ...i, price: Number(i.price) })),
    payment: payment ? {
      ...payment,
      totalAmount: Number(payment.totalAmount),
      cashAmount: Number(payment.cashAmount),
      upiAmount: Number(payment.upiAmount),
      cardAmount: Number(payment.cardAmount),
      totalPaid: Number(payment.cashAmount) + Number(payment.upiAmount) + Number(payment.cardAmount),
      balance: Number(payment.totalAmount) - Number(payment.cashAmount) - Number(payment.upiAmount) - Number(payment.cardAmount),
      createdAt: payment.createdAt.toISOString(),
    } : null,
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
  }

  const orders = await db.select().from(ordersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(ordersTable.createdAt);

  const result = await Promise.all(orders.map(o => getFullOrder(o.id)));
  res.json(result.filter(Boolean));
});

// Create order
router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const readyTime = new Date(Date.now() + 10 * 60 * 1000);
  const orderNumber = generateOrderNumber();

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

  const [order] = await db.insert(ordersTable).values({
    orderNumber,
    customerId,
    customerName: parsed.data.customerName,
    customerPhone: parsed.data.customerPhone ?? null,
    orderType: parsed.data.orderType,
    notes: parsed.data.notes ?? null,
    totalAmount: "0",
    readyTime,
  }).returning();

  // Insert items
  let total = 0;
  if (parsed.data.items && parsed.data.items.length > 0) {
    const itemsToInsert = parsed.data.items.map(item => ({
      orderId: order.id,
      productId: item.productId ?? null,
      productName: item.productName,
      price: String(item.price),
      quantity: item.quantity,
      notes: item.notes ?? null,
    }));
    await db.insert(orderItemsTable).values(itemsToInsert);
    total = parsed.data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    await db.update(ordersTable).set({ totalAmount: String(total) }).where(eq(ordersTable.id, order.id));
  }

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
    notes: parsed.data.notes ?? null,
  }).returning();

  // Recalculate total
  const allItems = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, params.data.id));
  const total = allItems.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  await db.update(ordersTable).set({ totalAmount: String(total) }).where(eq(ordersTable.id, params.data.id));

  res.status(201).json({ ...item, price: Number(item.price) });
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

  res.sendStatus(204);
});

// Get payment
router.get("/orders/:id/payment", async (req, res): Promise<void> => {
  const params = GetOrderPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, params.data.id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  const totalPaid = Number(payment.cashAmount) + Number(payment.upiAmount) + Number(payment.cardAmount);
  res.json({
    ...payment,
    totalAmount: Number(payment.totalAmount),
    cashAmount: Number(payment.cashAmount),
    upiAmount: Number(payment.upiAmount),
    cardAmount: Number(payment.cardAmount),
    totalPaid,
    balance: Number(payment.totalAmount) - totalPaid,
    createdAt: payment.createdAt.toISOString(),
  });
});

// Create payment
router.post("/orders/:id/payment", async (req, res): Promise<void> => {
  const params = CreateOrderPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CreateOrderPaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const cashAmt = parsed.data.cashAmount ?? 0;
  const upiAmt = parsed.data.upiAmount ?? 0;
  const cardAmt = parsed.data.cardAmount ?? 0;
  const totalPaid = cashAmt + upiAmt + cardAmt;
  const status = totalPaid >= parsed.data.totalAmount ? "paid" : totalPaid > 0 ? "partial" : "pending";

  const [payment] = await db.insert(paymentsTable).values({
    orderId: params.data.id,
    totalAmount: String(parsed.data.totalAmount),
    cashAmount: String(cashAmt),
    upiAmount: String(upiAmt),
    cardAmount: String(cardAmt),
    status,
  }).returning();

  if (status === "paid") {
    await db.update(ordersTable).set({ status: "completed" }).where(eq(ordersTable.id, params.data.id));
    // Update customer stats
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
    if (order && order.customerId) {
      const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
      const itemNames = items.map(i => i.productName).join(", ");
      await db.execute(sql`
        UPDATE customers SET
          order_count = order_count + 1,
          total_spending = total_spending + ${Number(order.totalAmount)},
          last_order_date = NOW(),
          favorite_items = ${itemNames}
        WHERE id = ${order.customerId}
      `);
    }
  }

  res.status(201).json({
    ...payment,
    totalAmount: Number(payment.totalAmount),
    cashAmount: Number(payment.cashAmount),
    upiAmount: Number(payment.upiAmount),
    cardAmount: Number(payment.cardAmount),
    totalPaid,
    balance: Number(payment.totalAmount) - totalPaid,
    createdAt: payment.createdAt.toISOString(),
  });
});

// Update payment
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
  const status = totalPaid >= totalAmount ? "paid" : totalPaid > 0 ? "partial" : "pending";

  const [payment] = await db.update(paymentsTable).set({
    cashAmount: String(cashAmt),
    upiAmount: String(upiAmt),
    cardAmount: String(cardAmt),
    status,
  }).where(eq(paymentsTable.orderId, params.data.id)).returning();

  if (status === "paid") {
    await db.update(ordersTable).set({ status: "completed" }).where(eq(ordersTable.id, params.data.id));
  }

  res.json({
    ...payment,
    totalAmount: Number(payment.totalAmount),
    cashAmount: Number(payment.cashAmount),
    upiAmount: Number(payment.upiAmount),
    cardAmount: Number(payment.cardAmount),
    totalPaid,
    balance: totalAmount - totalPaid,
    createdAt: payment.createdAt.toISOString(),
  });
});

export default router;
