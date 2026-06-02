import { pgTable, serial, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  totalSpending: numeric("total_spending", { precision: 10, scale: 2 }).notNull().default("0"),
  orderCount: integer("order_count").notNull().default(0),
  lastOrderDate: timestamp("last_order_date", { withTimezone: true }),
  favoriteItems: text("favorite_items"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true, totalSpending: true, orderCount: true, lastOrderDate: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
