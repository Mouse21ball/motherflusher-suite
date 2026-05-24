/**
 * Crews migration — adds Crews social system tables.
 *
 * Run:  node -e "require('tsx/cjs'); require('./scripts/migrate-crews.ts')"
 *   OR: npx tsx scripts/migrate-crews.ts   (requires dotenv package)
 *
 * Uses DATABASE_URL from environment — no dotenv required when run in Replit.
 */

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. player_profiles: add current_crew_id
    console.log("1. Adding current_crew_id to player_profiles…");
    await client.query(`
      ALTER TABLE player_profiles
        ADD COLUMN IF NOT EXISTS current_crew_id text;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_player_profiles_current_crew_id
        ON player_profiles(current_crew_id)
        WHERE current_crew_id IS NOT NULL;
    `);

    // 2. crews
    console.log("2. Creating crews table…");
    await client.query(`
      CREATE TABLE IF NOT EXISTS crews (
        id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name         varchar(30) NOT NULL,
        description  varchar(200),
        invite_code  varchar(6)  NOT NULL UNIQUE,
        captain_id   text        NOT NULL REFERENCES player_profiles(id),
        member_count integer     NOT NULL DEFAULT 1,
        disbanded_at timestamptz,
        created_at   timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_crews_name_ci  ON crews (LOWER(name)) WHERE disbanded_at IS NULL;`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_crews_invite    ON crews (invite_code) WHERE disbanded_at IS NULL;`);
    await client.query(`CREATE        INDEX IF NOT EXISTS idx_crews_captain   ON crews (captain_id);`);

    // 3. crew_members
    console.log("3. Creating crew_members table…");
    await client.query(`
      CREATE TABLE IF NOT EXISTS crew_members (
        id                  text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
        crew_id             text        NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
        player_id           text        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
        role                varchar(16) NOT NULL DEFAULT 'member',
        joined_at           timestamptz NOT NULL DEFAULT now(),
        total_chips_won     integer     NOT NULL DEFAULT 0
      );
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_members_crew_player ON crew_members(crew_id, player_id);`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_members_player      ON crew_members(player_id);`);

    // 4. crew_chat_messages
    console.log("4. Creating crew_chat_messages table…");
    await client.query(`
      CREATE TABLE IF NOT EXISTS crew_chat_messages (
        id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
        crew_id    text        NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
        player_id  text        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
        message    varchar(500) NOT NULL,
        created_at timestamptz  NOT NULL DEFAULT now()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crew_chat_crew_time ON crew_chat_messages(crew_id, created_at DESC);`);

    // 5. crew_events (audit log)
    console.log("5. Creating crew_events table…");
    await client.query(`
      CREATE TABLE IF NOT EXISTS crew_events (
        id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
        crew_id     text        NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
        player_id   text        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
        event_type  varchar(32) NOT NULL,
        event_data  jsonb,
        occurred_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crew_events_crew ON crew_events(crew_id, occurred_at DESC);`);

    await client.query("COMMIT");
    console.log("\n✅  Crews migration complete.");

    // Summary
    const { rows: cols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'player_profiles' AND column_name = 'current_crew_id';
    `);
    console.log("player_profiles.current_crew_id:", cols.length > 0 ? "✓" : "✗ MISSING");

    const { rows: tbls } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('crews','crew_members','crew_chat_messages','crew_events')
        AND table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log("New tables:", tbls.map(r => r.table_name));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌  Migration failed, rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
