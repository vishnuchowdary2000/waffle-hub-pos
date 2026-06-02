# The Waffle Hub BCM

A real-time KOT (Kitchen Order Ticket) + Billing + Customer Management system for a waffle shop. Full-stack React+Vite frontend with Express API backend and PostgreSQL.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/waffle-hub run dev` — run the frontend (port 18660, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed the DB with waffle menu items
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind v4 + shadcn/ui + TanStack Query
- API: Express 5 (port 8080, base path `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)
- Router: wouter

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth for all API shapes)
- `lib/api-zod/src/generated/api.ts` — generated Zod schemas (run codegen to refresh)
- `lib/api-client-react/src/generated/api.ts` — generated React Query hooks
- `lib/db/src/schema/` — Drizzle schema files (categories, products, customers, orders, expenses)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/waffle-hub/src/pages/` — Frontend pages
- `artifacts/waffle-hub/src/components/Layout.tsx` — App sidebar/nav
- `scripts/src/seed.ts` — DB seed script with full waffle menu

## Architecture decisions

- Contract-first: OpenAPI spec is written first, then Zod schemas + React Query hooks are generated via Orval. Never hand-write API types.
- No WebSocket: Kitchen/Dashboard use `refetchInterval: 3000` for near-real-time polling (simpler, sufficient for a waffle shop).
- Date serialization: Drizzle returns JS `Date` objects; routes always call `.toISOString()` before `res.json()`. Never use Zod `.parse()` on response objects that include DB dates.
- Dark mode default: `class="dark"` is set on `<html>` in `index.html`. Do NOT use `@apply dark` in CSS (Tailwind v4 limitation).
- Decimal amounts stored as Postgres `numeric` (string in Drizzle) — always convert to `Number()` before returning in JSON.

## Product

- **Counter** (`/`) — Order taking screen: category tabs, product grid, cart, customer info, order type (Dine In / Takeaway / Delivery), special instructions
- **Kitchen** (`/kitchen`) — Live KOT display: Pending → Preparing → Ready flow with countdown timers; auto sound on new orders; 3-second polling
- **Dashboard** (`/dashboard`) — Live stats (pending/preparing/ready/done counts), today's revenue + expenses, recent orders list with search
- **Billing** (`/billing/:id`) — Split payment entry: Cash + UPI + Card with balance calculation, marks order complete on full payment
- **Customers** (`/customers`) — Customer database with order history, total spend, last order date, favorite items
- **Expenses** (`/expenses`) — Daily expense tracking with Today/Week/Month filter; cash/UPI/card/other payment methods
- **Reports** (`/reports`) — Daily summary (revenue by payment method, completed vs cancelled, avg order value, profit estimate) + best-selling products by period
- **Menu** (`/menu`) — Product and category management: add/edit/delete, toggle active state

## User preferences

- Indian Rupee (₹) formatting throughout
- Dark amber/orange brand theme (dark background default)
- Prices in whole rupees (no paise display unless needed)

## Gotchas

- Always call `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` — the libs must be built first for type resolution.
- Do NOT use Zod Response `.parse()` on objects returned from Drizzle — Drizzle Date objects fail Zod string validation. Manually serialize dates with `.toISOString()`.
- `@apply dark` does not work in Tailwind v4 CSS — set `class="dark"` on `<html>` in index.html instead.
- `@custom-variant dark` conflicts with Tailwind v4's built-in dark variant — do not add it.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
