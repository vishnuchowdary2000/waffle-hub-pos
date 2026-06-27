import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, storeSettingsTable, storeAnnouncementsTable } from "@workspace/db";
import { requireRole } from "../middleware/auth";

const router = Router();

// ── Shared helper: compute current open status ────────────────────────────────
export async function getStoreOpenStatus(): Promise<{
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  settings: typeof storeSettingsTable.$inferSelect;
}> {
  let [settings] = await db.select().from(storeSettingsTable).where(eq(storeSettingsTable.id, 1));
  if (!settings) {
    await db.insert(storeSettingsTable).values({ id: 1 }).onConflictDoNothing();
    [settings] = await db.select().from(storeSettingsTable).where(eq(storeSettingsTable.id, 1));
  }

  let isOpen: boolean;
  if (settings.manualOverride) {
    isOpen = settings.isOpen;
  } else {
    // Schedule-based: compare current time (IST) against openTime/closeTime
    const now = new Date();
    const istOffset = 5.5 * 60; // IST is UTC+5:30
    const istNow = new Date(now.getTime() + istOffset * 60 * 1000);
    const hours = istNow.getUTCHours();
    const minutes = istNow.getUTCMinutes();
    const currentMins = hours * 60 + minutes;

    const [openH, openM] = settings.openTime.split(":").map(Number);
    const [closeH, closeM] = settings.closeTime.split(":").map(Number);
    const openMins = openH * 60 + openM;
    const closeMins = closeH * 60 + closeM;

    isOpen = currentMins >= openMins && currentMins < closeMins;
  }

  return { isOpen, openTime: settings.openTime, closeTime: settings.closeTime, settings };
}

// ── GET /public/store/status ─────────────────────────────────────────────────
router.get("/public/store/status", async (_req, res): Promise<void> => {
  const { isOpen, openTime, closeTime, settings } = await getStoreOpenStatus();
  const announcements = await db.select().from(storeAnnouncementsTable)
    .where(eq(storeAnnouncementsTable.enabled, true))
    .orderBy(storeAnnouncementsTable.createdAt);

  res.json({
    isOpen,
    openTime,
    closeTime,
    contactNumber: settings.contactNumber ?? "",
    announcements: announcements.map(a => ({ id: a.id, message: a.message })),
  });
});

// ── GET /store/settings ──────────────────────────────────────────────────────
router.get("/store/settings", requireRole("admin", "counter"), async (_req, res): Promise<void> => {
  const { settings } = await getStoreOpenStatus();
  res.json({
    manualOverride:  settings.manualOverride,
    isOpen:          settings.isOpen,
    openTime:        settings.openTime,
    closeTime:       settings.closeTime,
    contactNumber:   settings.contactNumber ?? "",
    receiptPrinting: settings.receiptPrinting,
    kotPrinting:     settings.kotPrinting,
    autoPrint:       settings.autoPrint,
    paperSize:       settings.paperSize,
    shopName:        settings.shopName,
    shopAddress:     settings.shopAddress,
    shopPhone:       settings.shopPhone,
    fssaiNumber:     settings.fssaiNumber,
    gstNumber:       settings.gstNumber,
    thankYouMessage: settings.thankYouMessage,
    updatedAt:       settings.updatedAt.toISOString(),
  });
});

// ── PUT /store/settings ──────────────────────────────────────────────────────
router.put("/store/settings", requireRole("admin", "counter"), async (req, res): Promise<void> => {
  const body = req.body as {
    manualOverride?: boolean; isOpen?: boolean;
    openTime?: string; closeTime?: string; contactNumber?: string;
    receiptPrinting?: boolean; kotPrinting?: boolean; autoPrint?: boolean;
    paperSize?: string; shopName?: string; shopAddress?: string;
    shopPhone?: string; fssaiNumber?: string; gstNumber?: string;
    thankYouMessage?: string;
  };

  const updates: Partial<typeof storeSettingsTable.$inferInsert> = {};
  if (typeof body.manualOverride  === "boolean") updates.manualOverride  = body.manualOverride;
  if (typeof body.isOpen          === "boolean") updates.isOpen          = body.isOpen;
  if (typeof body.openTime        === "string")  updates.openTime        = body.openTime;
  if (typeof body.closeTime       === "string")  updates.closeTime       = body.closeTime;
  if (typeof body.contactNumber   === "string")  updates.contactNumber   = body.contactNumber;
  if (typeof body.receiptPrinting === "boolean") updates.receiptPrinting = body.receiptPrinting;
  if (typeof body.kotPrinting     === "boolean") updates.kotPrinting     = body.kotPrinting;
  if (typeof body.autoPrint       === "boolean") updates.autoPrint       = body.autoPrint;
  if (typeof body.paperSize       === "string")  updates.paperSize       = body.paperSize;
  if (typeof body.shopName        === "string")  updates.shopName        = body.shopName;
  if (typeof body.shopAddress     === "string")  updates.shopAddress     = body.shopAddress;
  if (typeof body.shopPhone       === "string")  updates.shopPhone       = body.shopPhone;
  if (typeof body.fssaiNumber     === "string")  updates.fssaiNumber     = body.fssaiNumber;
  if (typeof body.gstNumber       === "string")  updates.gstNumber       = body.gstNumber;
  if (typeof body.thankYouMessage === "string")  updates.thankYouMessage = body.thankYouMessage;

  await db.insert(storeSettingsTable).values({ id: 1, ...updates })
    .onConflictDoUpdate({ target: storeSettingsTable.id, set: updates });

  const [updated] = await db.select().from(storeSettingsTable).where(eq(storeSettingsTable.id, 1));
  res.json({
    manualOverride:  updated.manualOverride,
    isOpen:          updated.isOpen,
    openTime:        updated.openTime,
    closeTime:       updated.closeTime,
    contactNumber:   updated.contactNumber ?? "",
    receiptPrinting: updated.receiptPrinting,
    kotPrinting:     updated.kotPrinting,
    autoPrint:       updated.autoPrint,
    paperSize:       updated.paperSize,
    shopName:        updated.shopName,
    shopAddress:     updated.shopAddress,
    shopPhone:       updated.shopPhone,
    fssaiNumber:     updated.fssaiNumber,
    gstNumber:       updated.gstNumber,
    thankYouMessage: updated.thankYouMessage,
    updatedAt:       updated.updatedAt.toISOString(),
  });
});

// ── GET /store/announcements ─────────────────────────────────────────────────
router.get("/store/announcements", requireRole("admin", "counter"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(storeAnnouncementsTable)
    .orderBy(storeAnnouncementsTable.createdAt);
  res.json(rows.map(a => ({
    id: a.id,
    message: a.message,
    enabled: a.enabled,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  })));
});

// ── POST /store/announcements ────────────────────────────────────────────────
router.post("/store/announcements", requireRole("admin"), async (req, res): Promise<void> => {
  const { message, enabled = true } = req.body as { message: string; enabled?: boolean };
  if (!message?.trim()) { res.status(400).json({ error: "Message is required" }); return; }

  const [row] = await db.insert(storeAnnouncementsTable).values({ message: message.trim(), enabled }).returning();
  res.status(201).json({
    id: row.id,
    message: row.message,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

// ── PUT /store/announcements/:id ─────────────────────────────────────────────
router.put("/store/announcements/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { message, enabled } = req.body as { message?: string; enabled?: boolean };

  const updates: Partial<typeof storeAnnouncementsTable.$inferInsert> = {};
  if (typeof message === "string" && message.trim()) updates.message = message.trim();
  if (typeof enabled === "boolean") updates.enabled = enabled;

  const [row] = await db.update(storeAnnouncementsTable).set(updates)
    .where(eq(storeAnnouncementsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  res.json({
    id: row.id,
    message: row.message,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

// ── DELETE /store/announcements/:id ─────────────────────────────────────────
router.delete("/store/announcements/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(storeAnnouncementsTable).where(eq(storeAnnouncementsTable.id, id));
  res.status(204).send();
});

export default router;
