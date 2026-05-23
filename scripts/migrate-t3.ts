// ─── Ticket 3 Migration: Daily Bonus System ──────────────────────────────────
// Adds three columns to player_profiles and creates the daily_bonus_claims
// audit table. Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS).

import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("[migrate-t3] Adding daily bonus columns to player_profiles…");
  await db.execute(sql`
    ALTER TABLE player_profiles
      ADD COLUMN IF NOT EXISTS last_bonus_claimed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS bonus_streak_day      INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS total_bonus_claims    INTEGER NOT NULL DEFAULT 0
  `);

  console.log("[migrate-t3] Creating daily_bonus_claims table…");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS daily_bonus_claims (
      id              TEXT      PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      player_id       TEXT      NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
      claimed_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      streak_day      INTEGER   NOT NULL,
      chips_granted   INTEGER   NOT NULL,
      stripes_granted INTEGER   NOT NULL DEFAULT 0
    )
  `);

  console.log("[migrate-t3] Creating index on daily_bonus_claims(player_id)…");
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_daily_bonus_claims_player_id
      ON daily_bonus_claims (player_id)
  `);

  console.log("[migrate-t3] Migration complete ✓");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("[migrate-t3] Migration failed:", err);
  process.exit(1);
});
