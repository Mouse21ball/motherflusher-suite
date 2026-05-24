// Migration: Ticket 7 — Buy-in Slider + Time Bank
// Adds time_bank columns to player_profiles and creates time_bank_events table.
// Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE player_profiles
        ADD COLUMN IF NOT EXISTS time_bank_free_uses_remaining integer NOT NULL DEFAULT 2,
        ADD COLUMN IF NOT EXISTS time_bank_purchased_uses       integer NOT NULL DEFAULT 0
    `);
    console.log("[migrate] player_profiles: time_bank columns added");

    await client.query(`
      CREATE TABLE IF NOT EXISTS time_bank_events (
        id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
        player_id    text        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
        event_type   varchar(32) NOT NULL,
        table_id     text,
        stripes_cost integer,
        occurred_at  timestamp   NOT NULL DEFAULT now()
      )
    `);
    console.log("[migrate] time_bank_events table ensured");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tbe_player ON time_bank_events(player_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tbe_occurred ON time_bank_events(occurred_at DESC)
    `);
    console.log("[migrate] time_bank_events indexes ensured");

    await client.query("COMMIT");
    console.log("[migrate] Ticket 7 migration complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[migrate] ROLLBACK:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
