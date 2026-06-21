import { pgTable, serial, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const offersTable = pgTable("offers", {
  id:        serial("id").primaryKey(),
  name:      text("name").notNull(),
  type:      text("type").notNull(),
  params:    jsonb("params").notNull().default({}),
  startDate: text("start_date"),
  endDate:   text("end_date"),
  active:    boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOfferSchema = createInsertSchema(offersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type Offer = typeof offersTable.$inferSelect;
