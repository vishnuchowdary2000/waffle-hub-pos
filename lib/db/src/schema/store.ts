import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storeSettingsTable = pgTable("store_settings", {
  id: integer("id").primaryKey().default(1),
  manualOverride: boolean("manual_override").notNull().default(false),
  isOpen: boolean("is_open").notNull().default(true),
  openTime: text("open_time").notNull().default("10:00"),
  closeTime: text("close_time").notNull().default("23:00"),
  contactNumber: text("contact_number").notNull().default(""),
  // Print settings
  receiptPrinting: boolean("receipt_printing").notNull().default(false),
  kotPrinting: boolean("kot_printing").notNull().default(false),
  autoPrint: boolean("auto_print").notNull().default(false),
  paperSize: text("paper_size").notNull().default("80mm"),
  // Shop info (used in receipt/KOT templates)
  shopName: text("shop_name").notNull().default("The Waffle Hub"),
  shopAddress: text("shop_address").notNull().default(""),
  shopPhone: text("shop_phone").notNull().default(""),
  fssaiNumber: text("fssai_number").notNull().default(""),
  gstNumber: text("gst_number").notNull().default(""),
  thankYouMessage: text("thank_you_message").notNull().default("Thank you for visiting! See you again."),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStoreSettingsSchema = createInsertSchema(storeSettingsTable).omit({ updatedAt: true });
export type InsertStoreSettings = z.infer<typeof insertStoreSettingsSchema>;
export type StoreSettings = typeof storeSettingsTable.$inferSelect;

export const storeAnnouncementsTable = pgTable("store_announcements", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStoreAnnouncementSchema = createInsertSchema(storeAnnouncementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStoreAnnouncement = z.infer<typeof insertStoreAnnouncementSchema>;
export type StoreAnnouncement = typeof storeAnnouncementsTable.$inferSelect;

export const printHistoryTable = pgTable("print_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  orderNumber: text("order_number").notNull(),
  type: text("type").notNull(),
  action: text("action").notNull(),
  printedBy: text("printed_by").notNull(),
  paperSize: text("paper_size").notNull(),
  printedAt: timestamp("printed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPrintHistorySchema = createInsertSchema(printHistoryTable).omit({ id: true, printedAt: true });
export type InsertPrintHistory = z.infer<typeof insertPrintHistorySchema>;
export type PrintHistory = typeof printHistoryTable.$inferSelect;
