import { sql } from "drizzle-orm";
import { db } from "../server/db";

async function migrate() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      player_id   TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
      expires_at  TIMESTAMP NOT NULL,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("✓ sessions table");

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sessions_player  ON sessions(player_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS purchase_transactions (
      id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      player_id           TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
      product_id          TEXT NOT NULL,
      stripes_granted     INTEGER NOT NULL,
      price_usd_cents     INTEGER NOT NULL,
      purchase_token      TEXT NOT NULL UNIQUE,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      google_order_id     TEXT,
      created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
      verified_at         TIMESTAMP
    )
  `);
  console.log("✓ purchase_transactions table");

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pt_player ON purchase_transactions(player_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pt_token  ON purchase_transactions(purchase_token)`);

  console.log("Migration complete");
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
