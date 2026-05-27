import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS blocked_players (
      id         TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      blocker_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS blocked_players_blocker_blocked_uniq
      ON blocked_players (blocker_id, blocked_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS blocked_players_blocker_idx
      ON blocked_players (blocker_id)
  `);
  console.log("OK: blocked_players table and indexes created.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
