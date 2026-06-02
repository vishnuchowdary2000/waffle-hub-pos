import { Router, type IRouter } from "express";
import { eq, ilike, or } from "drizzle-orm";
import { db, customersTable } from "@workspace/db";
import {
  CreateCustomerBody,
  UpdateCustomerParams,
  UpdateCustomerBody,
  GetCustomerParams,
  ListCustomersQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/customers", async (req, res): Promise<void> => {
  const q = ListCustomersQueryParams.safeParse(req.query);
  let rows;
  if (q.success && q.data.search) {
    const s = `%${q.data.search}%`;
    rows = await db.select().from(customersTable)
      .where(or(ilike(customersTable.name, s), ilike(customersTable.phone, s)))
      .orderBy(customersTable.name);
  } else {
    rows = await db.select().from(customersTable).orderBy(customersTable.name);
  }
  res.json(rows.map(r => ({
    ...r,
    totalSpending: Number(r.totalSpending),
    lastOrderDate: r.lastOrderDate ? r.lastOrderDate.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const existing = await db.select().from(customersTable).where(eq(customersTable.phone, parsed.data.phone));
  if (existing.length > 0) {
    res.status(200).json({ ...existing[0], totalSpending: Number(existing[0].totalSpending) });
    return;
  }
  const [row] = await db.insert(customersTable).values({
    name: parsed.data.name,
    phone: parsed.data.phone,
  }).returning();
  res.status(201).json({ ...row, totalSpending: Number(row.totalSpending) });
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json({ ...row, totalSpending: Number(row.totalSpending), lastOrderDate: row.lastOrderDate ? row.lastOrderDate.toISOString() : null, createdAt: row.createdAt.toISOString() });
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(customersTable).set(parsed.data).where(eq(customersTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json({ ...row, totalSpending: Number(row.totalSpending), lastOrderDate: row.lastOrderDate ? row.lastOrderDate.toISOString() : null, createdAt: row.createdAt.toISOString() });
});

router.delete("/customers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(customersTable).where(eq(customersTable.id, id));
  res.sendStatus(204);
});

export default router;
