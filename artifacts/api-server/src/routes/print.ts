import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, printHistoryTable } from "@workspace/db";
import { requireRole } from "../middleware/auth";

const router = Router();

// ── GET /print/history ────────────────────────────────────────────────────────
router.get("/print/history", requireRole("admin", "counter", "kitchen"), async (req, res): Promise<void> => {
  const orderId = req.query.orderId ? Number(req.query.orderId) : undefined;
  let rows;
  if (orderId) {
    rows = await db.select().from(printHistoryTable)
      .where(eq(printHistoryTable.orderId, orderId))
      .orderBy(printHistoryTable.printedAt);
  } else {
    rows = await db.select().from(printHistoryTable)
      .orderBy(printHistoryTable.printedAt);
  }

  res.json(rows.map(r => ({
    id:          r.id,
    orderId:     r.orderId,
    orderNumber: r.orderNumber,
    type:        r.type,
    action:      r.action,
    printedBy:   r.printedBy,
    paperSize:   r.paperSize,
    printedAt:   r.printedAt.toISOString(),
  })));
});

// ── POST /print/history ───────────────────────────────────────────────────────
router.post("/print/history", requireRole("admin", "counter", "kitchen"), async (req, res): Promise<void> => {
  const { orderId, orderNumber, type, action, printedBy, paperSize } = req.body as {
    orderId: number; orderNumber: string;
    type: string; action: string;
    printedBy: string; paperSize: string;
  };

  if (!orderId || !orderNumber || !type || !action || !printedBy || !paperSize) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }

  const [row] = await db.insert(printHistoryTable).values({
    orderId, orderNumber, type, action, printedBy, paperSize,
  }).returning();

  res.status(201).json({
    id:          row.id,
    orderId:     row.orderId,
    orderNumber: row.orderNumber,
    type:        row.type,
    action:      row.action,
    printedBy:   row.printedBy,
    paperSize:   row.paperSize,
    printedAt:   row.printedAt.toISOString(),
  });
});

export default router;
