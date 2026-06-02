import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, categoriesTable } from "@workspace/db";
import {
  CreateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryBody,
  DeleteCategoryParams,
  ListCategoriesResponse,
  UpdateCategoryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/categories", async (req, res): Promise<void> => {
  const rows = await db.select().from(categoriesTable).orderBy(categoriesTable.displayOrder, categoriesTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(categoriesTable).values({
    name: parsed.data.name,
    displayOrder: parsed.data.displayOrder ?? 0,
    active: parsed.data.active ?? true,
  }).returning();
  res.status(201).json(row);
});

router.patch("/categories/:id", async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(categoriesTable).set(parsed.data).where(eq(categoriesTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Category not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/categories/:id", async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(categoriesTable).where(eq(categoriesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
