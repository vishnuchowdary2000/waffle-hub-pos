import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tablesTable = pgTable("restaurant_tables", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull().unique(),
  status: text("status").notNull().default("available"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTableSchema = createInsertSchema(tablesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTable = z.infer<typeof insertTableSchema>;
export type RestaurantTable = typeof tablesTable.$inferSelect;
