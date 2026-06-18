import { Router, type IRouter } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, categoriesTable, productsTable, customersTable } from "@workspace/db";
import { CreateOrderBody } from "@workspace/api-zod";
import { getStoreOpenStatus } from "./store";

const router: IRouter = Router();

// ── GET /public/menu ──────────────────────────────────────────────────────────
router.get("/public/menu", async (_req, res): Promise<void> => {
  const cats = await db.select().from(categoriesTable)
    .where(eq(categoriesTable.active, true))
    .orderBy(categoriesTable.displayOrder);

  const prods = await db.select().from(productsTable)
    .where(and(eq(productsTable.active, true)));

  const result = cats.map(cat => ({
    id: cat.id,
    name: cat.name,
    displayOrder: cat.displayOrder,
    products: prods
      .filter(p => p.categoryId === cat.id)
      .map(p => ({ id: p.id, name: p.name, description: p.description ?? null, price: Number(p.price) })),
  })).filter(cat => cat.products.length > 0);

  res.json(result);
});

// ── GET /public/customers/lookup ──────────────────────────────────────────────
router.get("/public/customers/lookup", async (req, res): Promise<void> => {
  const phone = String(req.query.phone ?? "").trim();
  if (!phone) { res.status(400).json({ error: "Phone is required" }); return; }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.phone, phone));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const recentOrders = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.customerId, customer.id), eq(ordersTable.status, "completed")))
    .orderBy(desc(ordersTable.createdAt))
    .limit(3);

  const recentOrdersWithItems = await Promise.all(
    recentOrders.map(async o => {
      const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, o.id));
      const itemSummary = items.map(i => `${i.productName}×${i.quantity}`).join(", ");
      return {
        orderNumber: o.orderNumber,
        totalAmount: Number(o.totalAmount),
        createdAt: o.createdAt.toISOString(),
        itemSummary,
      };
    })
  );

  res.json({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    orderCount: customer.orderCount,
    totalSpending: Number(customer.totalSpending),
    favoriteItems: customer.favoriteItems ?? null,
    lastOrderDate: customer.lastOrderDate?.toISOString() ?? null,
    recentOrders: recentOrdersWithItems,
  });
});

// ── GET /public/stats ─────────────────────────────────────────────────────────
router.get("/public/stats", async (_req, res): Promise<void> => {
  const active = await db.select({ status: ordersTable.status })
    .from(ordersTable)
    .where(inArray(ordersTable.status, ["approved", "preparing", "ready", "pending_payment"]));

  const preparing = active.filter(o => o.status === "approved" || o.status === "preparing").length;
  const rushLevel = preparing <= 3 ? "low" : preparing <= 7 ? "moderate" : "high";

  res.json({ preparing, rushLevel });
});

// ── POST /public/orders ───────────────────────────────────────────────────────
router.post("/public/orders", async (req, res): Promise<void> => {
  // Guard: reject if store is closed
  const { isOpen } = await getStoreOpenStatus();
  if (!isOpen) {
    res.status(503).json({ error: "Sorry, we are currently closed. Please visit us during business hours." });
    return;
  }

  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const readyTime = new Date(Date.now() + 10 * 60 * 1000);
  let customerId: number | null = parsed.data.customerId ?? null;

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

  const orderNumber = `ORD-${String(order.id).padStart(4, "0")}`;
  await db.update(ordersTable).set({ orderNumber }).where(eq(ordersTable.id, order.id));

  let total = 0;
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
    total = parsed.data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    await db.update(ordersTable).set({ totalAmount: String(total) }).where(eq(ordersTable.id, order.id));
  }

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  res.status(201).json({
    id: order.id,
    orderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    orderType: order.orderType,
    status: "pending_payment",
    totalAmount: total,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    items: items.map(i => ({ ...i, price: Number(i.price) })),
  });
});

// ── GET /public/orders/:orderNumber ──────────────────────────────────────────
router.get("/public/orders/:orderNumber", async (req, res): Promise<void> => {
  const orderNumber = String(req.params.orderNumber);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.orderNumber, orderNumber));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  res.json({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    orderType: order.orderType,
    status: order.status,
    totalAmount: Number(order.totalAmount),
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    items: items.map(i => ({ ...i, price: Number(i.price) })),
  });
});

export default router;
