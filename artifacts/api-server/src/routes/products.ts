import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, productsTable, categoriesTable } from "@workspace/db";
import {
  CreateProductBody,
  UpdateProductParams,
  UpdateProductBody,
  DeleteProductParams,
  ListProductsQueryParams,
  ListProductsResponse,
  UpdateProductResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/products", async (req, res): Promise<void> => {
  const q = ListProductsQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success) {
    if (q.data.categoryId != null) conditions.push(eq(productsTable.categoryId, q.data.categoryId));
    if (q.data.active != null) conditions.push(eq(productsTable.active, q.data.active));
  }
  const rows = await db
    .select({
      id: productsTable.id,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      name: productsTable.name,
      description: productsTable.description,
      price: productsTable.price,
      active: productsTable.active,
      createdAt: productsTable.createdAt,
    })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(productsTable.name);

  res.json(rows.map(r => ({ ...r, price: Number(r.price), createdAt: r.createdAt.toISOString() })));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(productsTable).values({
    name: parsed.data.name,
    categoryId: parsed.data.categoryId ?? null,
    description: parsed.data.description ?? null,
    price: String(parsed.data.price),
    active: parsed.data.active ?? true,
  }).returning();
  res.status(201).json({ ...row, price: Number(row.price) });
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if (parsed.data.categoryId !== undefined) updateData.categoryId = parsed.data.categoryId;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.price != null) updateData.price = String(parsed.data.price);
  if (parsed.data.active != null) updateData.active = parsed.data.active;
  const [row] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Product not found" }); return; }
  res.json({ ...row, price: Number(row.price), createdAt: row.createdAt.toISOString() });
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(productsTable).where(eq(productsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
