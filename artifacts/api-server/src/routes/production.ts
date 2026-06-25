import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, productionCountsTable } from "@workspace/db";
import { AdjustProductionCountBody } from "@workspace/api-zod";

const router = Router();

const getTodayDate = () => new Date().toISOString().split("T")[0];

// GET /production — today's prepared counts
router.get("/production", async (req, res): Promise<void> => {
  const today = getTodayDate();
  const rows = await db
    .select()
    .from(productionCountsTable)
    .where(eq(productionCountsTable.sessionDate, today));
  res.json(rows);
});

// POST /production/:categoryName/adjust — increment or decrement
router.post("/production/:categoryName/adjust", async (req, res): Promise<void> => {
  const { categoryName } = req.params;
  const parsed = AdjustProductionCountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const today = getTodayDate();
  const { delta } = parsed.data;

  const [row] = await db
    .insert(productionCountsTable)
    .values({
      categoryName,
      quantity: Math.max(0, delta),
      sessionDate: today,
    })
    .onConflictDoUpdate({
      target: [productionCountsTable.categoryName, productionCountsTable.sessionDate],
      set: {
        quantity: sql`GREATEST(0, ${productionCountsTable.quantity} + ${delta})`,
      },
    })
    .returning();

  res.json(row);
});

// DELETE /production — reset today's counts (convenience for testing)
router.delete("/production", async (req, res): Promise<void> => {
  const today = getTodayDate();
  await db
    .delete(productionCountsTable)
    .where(and(eq(productionCountsTable.sessionDate, today)));
  res.status(204).send();
});

export default router;
