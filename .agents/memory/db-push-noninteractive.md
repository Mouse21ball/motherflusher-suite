---
name: drizzle-kit push non-interactive
description: drizzle-kit push hangs waiting for TTY input in non-interactive shells; workaround is raw SQL via tsx script.
---

**Rule:** Never rely on `npm run db:push` in automation or agent scripts — it waits for TTY confirmation even with `--force`.

**Why:** drizzle-kit prompts "created or renamed from another table?" when a new table is detected. The prompt cannot be satisfied by stdin piping or `--force`.

**How to apply:** For one-off migrations (CI, agent scripts), write a small `server/migrate-<name>.ts` that calls `await db.execute(sql\`CREATE TABLE IF NOT EXISTS ...\`)` and run it with `npx tsx server/migrate-<name>.ts`. Delete the file after use. The `CREATE TABLE IF NOT EXISTS` pattern is idempotent and safe to re-run.
