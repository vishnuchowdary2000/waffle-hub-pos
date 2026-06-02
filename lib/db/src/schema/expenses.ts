import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  notes: text("notes"),
  expenseDate: timestamp("expense_date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
