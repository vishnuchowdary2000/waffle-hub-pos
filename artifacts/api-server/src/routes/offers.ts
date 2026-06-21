import { Router } from "express";
import { db, offersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateOfferBody } from "@workspace/api-zod";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function serializeOffer(o: typeof offersTable.$inferSelect) {
  return {
    id:        o.id,
    name:      o.name,
    type:      o.type,
    params:    o.params,
    startDate: o.startDate ?? null,
    endDate:   o.endDate ?? null,
    active:    o.active,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export type OfferParams = {
  buyQty?:        number;  // buy_x_get_y
  getQty?:        number;  // buy_x_get_y
  percentage?:    number;  // percentage
  amount?:        number;  // fixed_amount
  minBill?:       number;  // min_bill
  discountAmount?: number; // min_bill
};

/**
 * Compute the offer discount for a set of cart items.
 * items: array of { price: number; quantity: number }
 */
export function computeOfferDiscount(
  offer: { type: string; params: unknown },
  items: Array<{ price: number; quantity: number }>
): number {
  const p = offer.params as OfferParams;
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  switch (offer.type) {
    case "percentage":
      return Math.round(subtotal * (p.percentage ?? 0)) / 100;

    case "fixed_amount":
      return Math.min(p.amount ?? 0, subtotal);

    case "min_bill":
      return subtotal >= (p.minBill ?? 0) ? (p.discountAmount ?? 0) : 0;

    case "buy_x_get_y": {
      const buyQty = p.buyQty ?? 0;
      const getQty = p.getQty ?? 0;
      if (buyQty <= 0 || getQty <= 0) return 0;
      const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
      const freeUnits = Math.floor(totalUnits / (buyQty + getQty)) * getQty;
      if (freeUnits <= 0) return 0;
      // Cheapest units are free — expand all units and sort by price asc
      const units: number[] = [];
      for (const item of items) {
        for (let q = 0; q < item.quantity; q++) units.push(item.price);
      }
      units.sort((a, b) => a - b);
      return units.slice(0, freeUnits).reduce((s, p) => s + p, 0);
    }

    default:
      return 0;
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /offers
router.get("/offers", async (req, res): Promise<void> => {
  const activeFilter = req.query.active;
  let rows = await db.select().from(offersTable).orderBy(offersTable.createdAt);
  if (activeFilter === "true") rows = rows.filter(r => r.active);
  if (activeFilter === "false") rows = rows.filter(r => !r.active);
  res.json(rows.map(serializeOffer));
});

// POST /offers
router.post("/offers", async (req, res): Promise<void> => {
  const parsed = CreateOfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }
  const [row] = await db.insert(offersTable).values({
    name:      parsed.data.name,
    type:      parsed.data.type,
    params:    parsed.data.params,
    startDate: parsed.data.startDate ?? null,
    endDate:   parsed.data.endDate ?? null,
    active:    parsed.data.active,
  }).returning();
  res.status(201).json(serializeOffer(row));
});

// GET /offers/:id
router.get("/offers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(offersTable).where(eq(offersTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeOffer(row));
});

// PUT /offers/:id
router.put("/offers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = CreateOfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }
  const [row] = await db.update(offersTable)
    .set({
      name:      parsed.data.name,
      type:      parsed.data.type,
      params:    parsed.data.params,
      startDate: parsed.data.startDate ?? null,
      endDate:   parsed.data.endDate ?? null,
      active:    parsed.data.active,
    })
    .where(eq(offersTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeOffer(row));
});

// DELETE /offers/:id
router.delete("/offers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(offersTable).where(eq(offersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

// PATCH /offers/:id/toggle
router.patch("/offers/:id/toggle", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(offersTable).where(eq(offersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(offersTable)
    .set({ active: !existing.active })
    .where(eq(offersTable.id, id))
    .returning();
  res.json(serializeOffer(row));
});

export default router;
