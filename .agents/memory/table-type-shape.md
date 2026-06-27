---
name: Table API type shape
description: The generated TypeScript types for Table and TableReportItem have non-obvious property names that differ from the DB column names.
---

## Rule
The Orval-generated `Table` interface (from `api.schemas.ts`) exposes the table number as `number`, **not** `tableNumber`:

```ts
export interface Table {
  id: number;
  number: number;   // ← NOT tableNumber
  status: string;
  createdAt: string;
  updatedAt?: string;
}
```

`TableReportItem` exposes:
```ts
export interface TableReportItem {
  tableNumber: number;  // ← tableNumber here (consistent with the report context)
  orderCount: number;   // ← NOT totalOrders
  revenue: number;      // ← NOT totalRevenue; no avgOrderValue field
}
```

**Why:** The OpenAPI spec defines the `Table` schema with a field called `number` (matching the DB column name in `restaurant_tables`). Orval faithfully generates this name. It's easy to mistakenly write `table.tableNumber` when iterating tables, which compiles but is `undefined` at runtime.

**How to apply:** When referencing a `Table` object, always use `table.number`. When referencing a `TableReportItem`, use `t.tableNumber`, `t.orderCount`, and `t.revenue`. Calculate avg order value manually: `t.orderCount > 0 ? t.revenue / t.orderCount : 0`.
