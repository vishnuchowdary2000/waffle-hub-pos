import { Router, type IRouter } from "express";
import { eq, gte, lte, and, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, paymentsTable, expensesTable, productsTable, categoriesTable } from "@workspace/db";
import { GetDailyReportQueryParams, GetProductReportQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/reports/daily", async (req, res): Promise<void> => {
  const q = GetDailyReportQueryParams.safeParse(req.query);
  const targetDate = q.success && q.data.date ? new Date(q.data.date) : new Date();
  const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
  const end = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

  const [completedOrders, cancelledOrders, allTodayOrders, expenses] = await Promise.all([
    db.select().from(ordersTable).where(and(
      eq(ordersTable.status, "completed"),
      gte(ordersTable.createdAt, start),
      lte(ordersTable.createdAt, end),
    )),
    db.select().from(ordersTable).where(and(
      eq(ordersTable.status, "cancelled"),
      gte(ordersTable.createdAt, start),
      lte(ordersTable.createdAt, end),
    )),
    db.select().from(ordersTable).where(and(
      gte(ordersTable.createdAt, start),
      lte(ordersTable.createdAt, end),
    )),
    db.select().from(expensesTable).where(and(
      gte(expensesTable.expenseDate, start),
      lte(expensesTable.expenseDate, end),
    )),
  ]);

  const payments = await db.select().from(paymentsTable)
    .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
    .where(and(
      eq(paymentsTable.status, "paid"),
      gte(ordersTable.createdAt, start),
      lte(ordersTable.createdAt, end),
    ));

  const cashRevenue    = payments.reduce((s, p) => s + Number(p.payments.cashAmount), 0);
  const upiRevenue     = payments.reduce((s, p) => s + Number(p.payments.upiAmount), 0);
  const cardRevenue    = payments.reduce((s, p) => s + Number(p.payments.cardAmount), 0);
  const totalCharity   = payments.reduce((s, p) => s + Number(p.payments.charityAmount), 0);
  const totalDiscount  = payments.reduce((s, p) => s + Number(p.payments.discountAmount), 0);
  const totalCollected = cashRevenue + upiRevenue + cardRevenue;
  const totalRevenue   = totalCollected - totalCharity;
  const totalExpenses  = expenses.reduce((s, e) => s + Number(e.amount), 0);

  res.json({
    date: targetDate.toISOString().split("T")[0],
    totalOrders: allTodayOrders.length,
    totalRevenue,
    cashRevenue,
    upiRevenue,
    cardRevenue,
    totalExpenses,
    totalDiscount,
    totalCharity,
    estimatedProfit: totalRevenue - totalExpenses,
    avgOrderValue: completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0,
    completedOrders: completedOrders.length,
    cancelledOrders: cancelledOrders.length,
  });
});

router.get("/reports/products", async (req, res): Promise<void> => {
  const q = GetProductReportQueryParams.safeParse(req.query);
  const now = new Date();
  let start: Date;
  let end: Date | undefined;

  const fromParam = (q.success && (q.data as { from?: string }).from) ? String((q.data as { from?: string }).from) : null;
  const toParam   = (q.success && (q.data as { to?: string }).to)   ? String((q.data as { to?: string }).to)   : null;

  if (fromParam && toParam) {
    const fd = new Date(fromParam);
    const td = new Date(toParam);
    start = new Date(fd.getFullYear(), fd.getMonth(), fd.getDate(), 0, 0, 0);
    end   = new Date(td.getFullYear(), td.getMonth(), td.getDate(), 23, 59, 59);
  } else if (q.success && q.data.period === "weekly") {
    const day = now.getDay();
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  } else if (q.success && q.data.period === "monthly") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  }

  const whereConditions = [
    eq(ordersTable.status, "completed"),
    gte(ordersTable.createdAt, start),
    ...(end ? [lte(ordersTable.createdAt, end)] : []),
  ];

  const items = await db.select({
    productName: orderItemsTable.productName,
    quantity: orderItemsTable.quantity,
    price: orderItemsTable.price,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(and(...whereConditions));

  const map = new Map<string, { totalQuantity: number; totalRevenue: number }>();
  for (const item of items) {
    const existing = map.get(item.productName) ?? { totalQuantity: 0, totalRevenue: 0 };
    existing.totalQuantity += item.quantity;
    existing.totalRevenue += Number(item.price) * item.quantity;
    map.set(item.productName, existing);
  }

  const result = Array.from(map.entries())
    .map(([productName, data]) => ({ productName, ...data }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  res.json(result);
});

router.get("/reports/range", async (req, res): Promise<void> => {
  const from = String(req.query.from ?? "");
  const to   = String(req.query.to ?? "");
  if (!from || !to) { res.status(400).json({ error: "from and to are required" }); return; }

  const fd = new Date(from);
  const td = new Date(to);
  const start = new Date(fd.getFullYear(), fd.getMonth(), fd.getDate(), 0, 0, 0);
  const end   = new Date(td.getFullYear(), td.getMonth(), td.getDate(), 23, 59, 59);

  const [allOrders, expenses] = await Promise.all([
    db.select().from(ordersTable).where(and(gte(ordersTable.createdAt, start), lte(ordersTable.createdAt, end))),
    db.select().from(expensesTable).where(and(gte(expensesTable.expenseDate, start), lte(expensesTable.expenseDate, end))),
  ]);

  const completedOrders = allOrders.filter(o => o.status === "completed");
  const cancelledOrders = allOrders.filter(o => o.status === "cancelled");
  const pendingOrders   = allOrders.filter(o => o.status !== "completed" && o.status !== "cancelled");
  const dineInOrders    = allOrders.filter(o => o.orderType === "dine_in").length;
  const takeawayOrders  = allOrders.filter(o => o.orderType === "takeaway").length;
  const mixedOrders     = allOrders.length - dineInOrders - takeawayOrders;

  const payments = await db.select().from(paymentsTable)
    .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
    .where(and(eq(paymentsTable.status, "paid"), gte(ordersTable.createdAt, start), lte(ordersTable.createdAt, end)));

  const cashRevenue   = payments.reduce((s, p) => s + Number(p.payments.cashAmount),     0);
  const upiRevenue    = payments.reduce((s, p) => s + Number(p.payments.upiAmount),      0);
  const cardRevenue   = payments.reduce((s, p) => s + Number(p.payments.cardAmount),     0);
  const totalCharity  = payments.reduce((s, p) => s + Number(p.payments.charityAmount),  0);
  const totalDiscount = payments.reduce((s, p) => s + Number(p.payments.discountAmount), 0);
  const totalRevenue  = cashRevenue + upiRevenue + cardRevenue - totalCharity;
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

  // Category performance
  const categoryRows = await db.select({
    categoryName: sql<string>`COALESCE(${categoriesTable.name}, 'Other')`,
    orders:   sql<number>`COUNT(DISTINCT ${orderItemsTable.orderId})::int`,
    quantity: sql<number>`SUM(${orderItemsTable.quantity})::int`,
    revenue:  sql<number>`SUM(${orderItemsTable.quantity} * ${orderItemsTable.price}::numeric)`,
  })
  .from(orderItemsTable)
  .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
  .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
  .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
  .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, start), lte(ordersTable.createdAt, end)))
  .groupBy(sql`COALESCE(${categoriesTable.name}, 'Other')`);

  // Top products
  const productRows = await db.select({
    productName: orderItemsTable.productName,
    quantity:    orderItemsTable.quantity,
    price:       orderItemsTable.price,
  })
  .from(orderItemsTable)
  .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
  .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, start), lte(ordersTable.createdAt, end)));

  const productMap = new Map<string, { totalQuantity: number; totalRevenue: number }>();
  for (const item of productRows) {
    const cur = productMap.get(item.productName) ?? { totalQuantity: 0, totalRevenue: 0 };
    cur.totalQuantity += item.quantity;
    cur.totalRevenue  += Number(item.price) * item.quantity;
    productMap.set(item.productName, cur);
  }
  const topProducts = Array.from(productMap.entries())
    .map(([productName, d]) => ({ productName, ...d }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
    .slice(0, 10);

  res.json({
    from: start.toISOString().split("T")[0],
    to:   end.toISOString().split("T")[0],
    totalOrders:     allOrders.length,
    completedOrders: completedOrders.length,
    pendingOrders:   pendingOrders.length,
    cancelledOrders: cancelledOrders.length,
    totalRevenue,
    totalExpenses,
    netRevenue:    totalRevenue - totalExpenses,
    avgOrderValue: completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0,
    cashRevenue,
    upiRevenue,
    cardRevenue,
    totalDiscount,
    totalCharity,
    dineInOrders,
    takeawayOrders,
    mixedOrders,
    categories: categoryRows.map(r => ({
      categoryName: r.categoryName,
      orders:   Number(r.orders),
      quantity: Number(r.quantity),
      revenue:  Number(r.revenue),
    })),
    topProducts,
  });
});

export default router;
