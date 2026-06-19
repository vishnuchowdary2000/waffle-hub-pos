---
name: Session persistence setup
description: What's needed for connect-pg-simple sessions to work in this app
---

## The rule
`connect-pg-simple` with `createTableIfMissing: true` silently fails to create the `session` table in Replit's PostgreSQL environment. The table MUST be created explicitly before first use.

**Why:** `createTableIfMissing` emits an error event on failure instead of crashing. When the table doesn't exist, sessions fall back to an in-memory MemoryStore that is cleared on every server restart — causing all users to be logged out on page refresh or API server hot-reload. This breaks ALL auth-gated routes (403 Forbidden), not just the session itself.

**How to apply:**
- After any DB reset or new deployment where the session table may be missing, run:
  ```sql
  CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
  ) WITH (OIDS=FALSE);
  ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
  CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session ("expire");
  ```
- The login route must call `req.session.save(cb)` explicitly before sending the response — do not rely on auto-save after `res.json()`.
- `custom-fetch.ts` must default to `credentials: "include"` so generated API hooks send the session cookie.
- Set `app.set("trust proxy", 1)` for the Replit reverse proxy.
