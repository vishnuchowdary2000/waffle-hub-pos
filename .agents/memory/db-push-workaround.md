---
name: DB schema push workaround
description: drizzle-kit push fails non-interactively due to a TTY check triggered by an unrelated constraint prompt; use executeSql instead.
---

drizzle-kit push fails when run non-interactively (e.g. from the agent sandbox) because it detects a TTY for interactive confirmation of constraint changes (e.g. unique constraints on restaurant_tables). The process hangs/fails even when the target columns are unrelated.

**Why:** `drizzle-kit push` prompts the user to confirm destructive/constraint changes interactively, and the agent shell has no TTY.

**How to apply:** For any new column additions, use `executeSql` directly:
```sql
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS my_col TEXT DEFAULT '';
ALTER TABLE print_history ADD COLUMN IF NOT EXISTS printer_name TEXT DEFAULT '';
```
Always use `IF NOT EXISTS` to make the migration idempotent. After adding columns, update the Drizzle schema file to match so the ORM types stay in sync.
