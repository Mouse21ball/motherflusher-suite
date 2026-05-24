/**
 * Ticket 5 — Subscription Tiers migration
 *
 * Run:  npx tsx scripts/migrate-t5.ts
 *
 * What this does:
 *   1. Adds 3 subscription columns to player_profiles
 *   2. Makes cosmetic_items.stripes_cost nullable (subscription-exclusive items have null)
 *   3. Creates subscriptions table
 *   4. Creates subscription_events table
 *   5. Seeds 2 subscription-exclusive frame items (frames only — badges and Diamond
 *      background are client-rendered tier assets, not catalog entries)
 *   6. Creates index on subscriptions.purchase_token (already UNIQUE, but explicit)
 */

import { Pool } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. player_profiles: add subscription columns ──────────────────────────
    console.log("1. Adding subscription columns to player_profiles…");
    await client.query(`
      ALTER TABLE player_profiles
        ADD COLUMN IF NOT EXISTS active_subscription_tier          text,
        ADD COLUMN IF NOT EXISTS subscription_expires_at           timestamptz,
        ADD COLUMN IF NOT EXISTS subscription_last_stripes_grant_at timestamptz;
    `);

    // ── 2. cosmetic_items: make stripes_cost nullable ─────────────────────────
    console.log("2. Making cosmetic_items.stripes_cost nullable…");
    await client.query(`
      ALTER TABLE cosmetic_items
        ALTER COLUMN stripes_cost DROP NOT NULL;
    `);

    // ── 3. Create subscriptions table ─────────────────────────────────────────
    console.log("3. Creating subscriptions table…");
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id                           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        player_id                    text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
        tier                         varchar(32)  NOT NULL,
        billing_period               varchar(16)  NOT NULL,
        product_id                   varchar(64)  NOT NULL,
        purchase_token               text         NOT NULL UNIQUE,
        status                       varchar(32)  NOT NULL DEFAULT 'active',
        expires_at                   timestamptz,
        auto_renewing                boolean      NOT NULL DEFAULT true,
        started_at                   timestamptz  NOT NULL DEFAULT now(),
        last_verified_at             timestamptz  NOT NULL DEFAULT now(),
        canceled_at                  timestamptz,
        previous_frame_id            text,
        stripes_granted_current_cycle integer     NOT NULL DEFAULT 0
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_player_id
        ON subscriptions(player_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status
        ON subscriptions(status);
    `);

    // ── 4. Create subscription_events table ───────────────────────────────────
    console.log("4. Creating subscription_events table…");
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_events (
        id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        player_id       text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
        subscription_id text REFERENCES subscriptions(id) ON DELETE SET NULL,
        event_type      varchar(32) NOT NULL,
        event_data      jsonb,
        occurred_at     timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_subscription_events_player_id
        ON subscription_events(player_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_subscription_events_subscription_id
        ON subscription_events(subscription_id);
    `);

    // ── 5. Seed subscription-exclusive cosmetic items ─────────────────────────
    // Only the 2 frames live in cosmetic_items (so the server can auto-equip /
    // restore them).  Badges and the Diamond background are tier-rendering assets
    // loaded directly by the client from active_subscription_tier — they are NOT
    // catalog entries and must NOT be seeded here.
    console.log("5. Seeding subscription-exclusive frame items…");

    const subItems = [
      {
        id: "frame_gold_subscription",
        category: "subscription_exclusive",
        displayName: "Gold Pro Frame",
        description: "Exclusive animated gold border. Auto-equipped while Gold Pro subscription is active.",
        assetPath: "/cosmetics/frames/frame-gold-subscription.png",
      },
      {
        id: "frame_diamond_animated",
        category: "subscription_exclusive",
        displayName: "Diamond Elite Frame",
        description: "Exclusive animated diamond border. Auto-equipped while Diamond Elite subscription is active.",
        assetPath: "/cosmetics/frames/frame-diamond-animated.png",
      },
    ];

    for (const item of subItems) {
      await client.query(`
        INSERT INTO cosmetic_items (id, category, display_name, description, stripes_cost, asset_path, active)
        VALUES ($1, $2, $3, $4, NULL, $5, true)
        ON CONFLICT (id) DO UPDATE
          SET category     = EXCLUDED.category,
              display_name = EXCLUDED.display_name,
              description  = EXCLUDED.description,
              stripes_cost = EXCLUDED.stripes_cost,
              asset_path   = EXCLUDED.asset_path,
              active       = EXCLUDED.active;
      `, [item.id, item.category, item.displayName, item.description, item.assetPath]);
      console.log(`   ✓ ${item.id}`);
    }

    await client.query("COMMIT");
    console.log("\n✅ Ticket 5 migration complete.");

    // ── Summary ───────────────────────────────────────────────────────────────
    const { rows: profileCols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'player_profiles'
        AND column_name IN ('active_subscription_tier','subscription_expires_at','subscription_last_stripes_grant_at')
      ORDER BY column_name;
    `);
    console.log("player_profiles new columns:", profileCols.map(r => r.column_name));

    const { rows: tables } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('subscriptions','subscription_events')
        AND table_schema = 'public';
    `);
    console.log("new tables:", tables.map(r => r.table_name));

    const { rows: subExclusive } = await client.query(`
      SELECT id FROM cosmetic_items WHERE category = 'subscription_exclusive' ORDER BY id;
    `);
    console.log("subscription_exclusive items:", subExclusive.map(r => r.id));

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed, rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
