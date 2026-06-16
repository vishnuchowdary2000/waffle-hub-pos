import { pgTable, serial, text, integer, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerId: integer("customer_id"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  orderType: text("order_type").notNull().default("dine_in"),
  status: text("status").notNull().default("pending_payment"),
  notes: text("notes"),
  priority: boolean("priority").notNull().default(false),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  readyTime: timestamp("ready_time", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id"),
  productName: text("product_name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  itemOrderType: text("item_order_type").notNull().default("dine_in"),
  notes: text("notes"),
});

export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  cashAmount: numeric("cash_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  upiAmount: numeric("upi_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  cardAmount: numeric("card_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
