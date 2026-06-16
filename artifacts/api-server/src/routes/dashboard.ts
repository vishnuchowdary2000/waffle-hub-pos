import { Router, type IRouter } from "express";
import { eq, gte, lte, and, or, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, paymentsTable, expensesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard", async (req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const [
    pendingPaymentOrders,
    approvedOrders,
    preparingOrders,
    readyOrders,
    completedToday,
    cancelledToday,
    recentOrders,
  ] = await Promise.all([
    db.select().from(ordersTable).where(eq(ordersTable.status, "pending_payment")),
    db.select().from(ordersTable).where(eq(ordersTable.status, "approved")),
    db.select().from(ordersTable).where(eq(ordersTable.status, "preparing")),
    db.select().from(ordersTable).where(eq(ordersTable.status, "ready")),
    db.select().from(ordersTable).where(and(
      eq(ordersTable.status, "completed"),
      gte(ordersTable.createdAt, todayStart),
      lte(ordersTable.createdAt, todayEnd),
    )),
    db.select().from(ordersTable).where(and(
      eq(ordersTable.status, "cancelled"),
      gte(ordersTable.createdAt, todayStart),
      lte(ordersTable.createdAt, todayEnd),
    )),
    db.select().from(ordersTable)
      .where(and(gte(ordersTable.createdAt, todayStart), lte(ordersTable.createdAt, todayEnd)))
      .orderBy(sql`${ordersTable.createdAt} DESC`)
      .limit(20),
  ]);

  // Today's revenue from paid payments
  const todayPayments = await db.select().from(paymentsTable)
    .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
    .where(and(
      or(eq(paymentsTable.status, "paid"), eq(paymentsTable.status, "partial"))!,
      gte(ordersTable.createdAt, todayStart),
      lte(ordersTable.createdAt, todayEnd),
    ));
  const todayRevenue = todayPayments.reduce((sum, p) =>
    sum + Number(p.payments.cashAmount) + Number(p.payments.upiAmount) + Number(p.payments.cardAmount), 0);

  // Today's expenses
  const todayExpenseRows = await db.select().from(expensesTable)
    .where(and(gte(expensesTable.expenseDate, todayStart), lte(expensesTable.expenseDate, todayEnd)));
  const todayExpenses = todayExpenseRows.reduce((sum, e) => sum + Number(e.amount), 0);

  // Enrich recent orders with items + payment
  const enriched = await Promise.all(recentOrders.map(async order => {
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, order.id));
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
  }));

  const activeCount = pendingPaymentOrders.length + approvedOrders.length + preparingOrders.length + readyOrders.length;

  res.json({
    pendingCount: pendingPaymentOrders.length,
    approvedCount: approvedOrders.length,
    preparingCount: preparingOrders.length,
    readyCount: readyOrders.length,
    completedToday: completedToday.length,
    cancelledToday: cancelledToday.length,
    todayRevenue,
    todayOrders: activeCount + completedToday.length + cancelledToday.length,
    todayExpenses,
    recentOrders: enriched,
  });
});

export default router;
