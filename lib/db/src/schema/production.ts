import { pgTable, serial, text, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productionCountsTable = pgTable("production_counts", {
  id: serial("id").primaryKey(),
  categoryName: text("category_name").notNull(),
  quantity: integer("quantity").notNull().default(0),
  sessionDate: date("session_date").notNull(),
});

export const insertProductionCountSchema = createInsertSchema(productionCountsTable).omit({ id: true });
export type InsertProductionCount = z.infer<typeof insertProductionCountSchema>;
export type ProductionCount = typeof productionCountsTable.$inferSelect;
