import { Router, type IRouter } from "express";
import { eq, gte, lte, and } from "drizzle-orm";
import { db, expensesTable } from "@workspace/db";
import {
  CreateExpenseBody,
  UpdateExpenseParams,
  UpdateExpenseBody,
  DeleteExpenseParams,
  ListExpensesQueryParams,
  ListExpensesResponse,
  UpdateExpenseResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/expenses", async (req, res): Promise<void> => {
  const q = ListExpensesQueryParams.safeParse(req.query);
  let start: Date | undefined;
  let end: Date | undefined;

  if (q.success) {
    const now = new Date();
    if (q.data.period === "daily" || q.data.date) {
      const d = q.data.date ? new Date(q.data.date) : now;
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    } else if (q.data.period === "weekly") {
      const day = now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59);
    } else if (q.data.period === "monthly") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }
  }

  const conditions = [];
  if (start) conditions.push(gte(expensesTable.expenseDate, start));
  if (end) conditions.push(lte(expensesTable.expenseDate, end));

  const rows = await db.select().from(expensesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(expensesTable.expenseDate);

  res.json(rows.map(r => ({
    ...r,
    amount: Number(r.amount),
    expenseDate: r.expenseDate.toISOString(),
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/expenses", async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(expensesTable).values({
    title: parsed.data.title,
    amount: String(parsed.data.amount),
    paymentMethod: parsed.data.paymentMethod,
    notes: parsed.data.notes ?? null,
    expenseDate: parsed.data.expenseDate ? new Date(parsed.data.expenseDate) : new Date(),
  }).returning();
  res.status(201).json({ ...row, amount: Number(row.amount), expenseDate: row.expenseDate.toISOString() });
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const params = UpdateExpenseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.title != null) updateData.title = parsed.data.title;
  if (parsed.data.amount != null) updateData.amount = String(parsed.data.amount);
  if (parsed.data.paymentMethod != null) updateData.paymentMethod = parsed.data.paymentMethod;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.expenseDate != null) updateData.expenseDate = new Date(parsed.data.expenseDate);
  const [row] = await db.update(expensesTable).set(updateData).where(eq(expensesTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json({ ...row, amount: Number(row.amount), expenseDate: row.expenseDate.toISOString(), createdAt: row.createdAt.toISOString() });
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const params = DeleteExpenseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(expensesTable).where(eq(expensesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
