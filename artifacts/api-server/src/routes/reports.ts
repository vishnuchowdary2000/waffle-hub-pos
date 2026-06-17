import { Router, type IRouter } from "express";
import { eq, gte, lte, and, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, paymentsTable, expensesTable } from "@workspace/db";
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

  if (q.success && q.data.period === "weekly") {
    const day = now.getDay();
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  } else if (q.success && q.data.period === "monthly") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  }

  const items = await db.select({
    productName: orderItemsTable.productName,
    quantity: orderItemsTable.quantity,
    price: orderItemsTable.price,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(and(
      eq(ordersTable.status, "completed"),
      gte(ordersTable.createdAt, start),
    ));

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

export default router;
