import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, tablesTable } from "@workspace/db";
import { ConfigureTablesBody, UpdateTableStatusParams, UpdateTableStatusBody } from "@workspace/api-zod";

const router: IRouter = Router();

function serializeTable(t: typeof tablesTable.$inferSelect) {
  return {
    id:        t.id,
    number:    t.number,
    status:    t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// List all tables
router.get("/tables", async (req, res): Promise<void> => {
  const tables = await db.select().from(tablesTable).orderBy(tablesTable.number);
  res.json(tables.map(serializeTable));
});

// Configure number of tables (creates/removes to match count)
router.post("/tables/configure", async (req, res): Promise<void> => {
  const parsed = ConfigureTablesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const targetCount = parsed.data.count;
  const existing = await db.select().from(tablesTable).orderBy(tablesTable.number);

  if (existing.length > targetCount) {
    // Remove highest-numbered tables down to targetCount
    const toRemove = existing.slice(targetCount);
    for (const t of toRemove) {
      await db.delete(tablesTable).where(eq(tablesTable.id, t.id));
    }
  } else if (existing.length < targetCount) {
    // Find which numbers already exist, fill in any gaps, then add new
    const existingNums = new Set(existing.map(t => t.number));
    const toCreate: number[] = [];
    for (let n = 1; n <= targetCount; n++) {
      if (!existingNums.has(n)) toCreate.push(n);
    }
    if (toCreate.length > 0) {
      await db.insert(tablesTable).values(toCreate.map(number => ({ number, status: "available" })));
    }
  }

  const tables = await db.select().from(tablesTable).orderBy(tablesTable.number);
  res.json(tables.map(serializeTable));
});

// Update table status
router.patch("/tables/:id/status", async (req, res): Promise<void> => {
  const params = UpdateTableStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateTableStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.update(tablesTable)
    .set({ status: parsed.data.status })
    .where(eq(tablesTable.id, params.data.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Table not found" }); return; }
  res.json(serializeTable(row));
});

export { router as tablesRouter };
export default router;
