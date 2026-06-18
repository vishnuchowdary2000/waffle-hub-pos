import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storeSettingsTable = pgTable("store_settings", {
  id: integer("id").primaryKey().default(1),
  manualOverride: boolean("manual_override").notNull().default(false),
  isOpen: boolean("is_open").notNull().default(true),
  openTime: text("open_time").notNull().default("10:00"),
  closeTime: text("close_time").notNull().default("23:00"),
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
