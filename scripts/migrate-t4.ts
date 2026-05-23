// ─── Ticket 4 migration ───────────────────────────────────────────────────────
// Creates cosmetic_items, player_inventory, cosmetic_purchases tables,
// adds equipped_* columns to player_profiles, and seeds the v1 catalog.
// Safe to re-run — all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.

import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("[migrate-t4] Starting…");

  // ── 1. Add equipped columns to player_profiles ────────────────────────────
  await db.execute(sql`
    ALTER TABLE player_profiles
      ADD COLUMN IF NOT EXISTS equipped_avatar_id    TEXT,
      ADD COLUMN IF NOT EXISTS equipped_frame_id     TEXT,
      ADD COLUMN IF NOT EXISTS equipped_name_color_id TEXT
  `);
  console.log("[migrate-t4] player_profiles columns added ✓");

  // ── 2. cosmetic_items ─────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cosmetic_items (
      id           VARCHAR(64)  PRIMARY KEY,
      category     VARCHAR(32)  NOT NULL,
      display_name VARCHAR(128) NOT NULL,
      description  VARCHAR(512) NOT NULL,
      stripes_cost INTEGER      NOT NULL,
      asset_path   VARCHAR(256) NOT NULL,
      color_value  VARCHAR(16),
      active       BOOLEAN      NOT NULL DEFAULT TRUE,
      created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
    )
  `);
  console.log("[migrate-t4] cosmetic_items table created ✓");

  // ── 3. player_inventory ───────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS player_inventory (
      id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      player_id        TEXT        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
      cosmetic_item_id VARCHAR(64) NOT NULL REFERENCES cosmetic_items(id),
      acquired_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
      equipped         BOOLEAN     NOT NULL DEFAULT FALSE,
      UNIQUE (player_id, cosmetic_item_id)
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_player_inventory_player_id
      ON player_inventory (player_id)
  `);
  console.log("[migrate-t4] player_inventory table created ✓");

  // ── 4. cosmetic_purchases (audit) ─────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cosmetic_purchases (
      id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      player_id        TEXT        NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
      cosmetic_item_id VARCHAR(64) NOT NULL REFERENCES cosmetic_items(id),
      stripes_spent    INTEGER     NOT NULL,
      purchased_at     TIMESTAMP   NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_cosmetic_purchases_player_id
      ON cosmetic_purchases (player_id)
  `);
  console.log("[migrate-t4] cosmetic_purchases table created ✓");

  // ── 5. Seed the v1 catalog ────────────────────────────────────────────────
  const items = [
    // Premium Avatars
    { id: 'avatar_skull_mask',    category: 'avatar',      name: 'Skull Mask',       desc: 'Strike fear at the table with this iconic skull visage.',              cost: 100,  asset: '/cosmetics/avatars/skull-mask.png',      color: null },
    { id: 'avatar_crown',         category: 'avatar',      name: 'Crown',             desc: 'Royalty plays the best poker. Wear your crown.',                       cost: 150,  asset: '/cosmetics/avatars/crown.png',           color: null },
    { id: 'avatar_diamond_chain', category: 'avatar',      name: 'Diamond Chain',     desc: 'Heavy ice, heavy game.',                                               cost: 200,  asset: '/cosmetics/avatars/diamond-chain.png',   color: null },
    { id: 'avatar_gold_tooth',    category: 'avatar',      name: 'Gold Tooth',        desc: 'Flash the gold when you rake in that pot.',                            cost: 250,  asset: '/cosmetics/avatars/gold-tooth.png',      color: null },
    // Avatar Frames
    { id: 'frame_copper_bezel',   category: 'frame',       name: 'Copper Bezel',      desc: 'A warm copper border — understated but unmistakably premium.',          cost: 80,   asset: '/cosmetics/frames/copper-bezel.png',     color: null },
    { id: 'frame_silver_bars',    category: 'frame',       name: 'Silver Bars',       desc: 'Cold silver bars wrap your avatar in vault energy.',                   cost: 150,  asset: '/cosmetics/frames/silver-bars.png',      color: null },
    { id: 'frame_gold_chain',     category: 'frame',       name: 'Gold Chain',        desc: 'Links of pure gold. The Chain Gang frame.',                            cost: 250,  asset: '/cosmetics/frames/gold-chain.png',       color: null },
    { id: 'frame_diamond_studded',category: 'frame',       name: 'Diamond Studded',   desc: 'Each corner set with a flawless diamond cut.',                         cost: 400,  asset: '/cosmetics/frames/diamond-studded.png',  color: null },
    { id: 'frame_animated_flame', category: 'frame',       name: 'Animated Flame',    desc: 'You\'re on a heater. Let them know.',                                  cost: 600,  asset: '/cosmetics/frames/animated-flame.png',   color: null },
    // Name Colors
    { id: 'color_silver',         category: 'name_color',  name: 'Silver',            desc: 'Your name shines in polished silver.',                                 cost: 50,   asset: '/cosmetics/colors/silver.png',           color: '#C0C0C0' },
    { id: 'color_gold',           category: 'name_color',  name: 'Gold',              desc: 'Classic Chain Gang gold — the default flex.',                          cost: 100,  asset: '/cosmetics/colors/gold.png',             color: '#FFD700' },
    { id: 'color_crimson',        category: 'name_color',  name: 'Crimson',           desc: 'Blood money. Your name runs red.',                                     cost: 150,  asset: '/cosmetics/colors/crimson.png',          color: '#DC143C' },
    { id: 'color_purple_royalty', category: 'name_color',  name: 'Purple Royalty',    desc: 'Reserved for kings. Are you one?',                                     cost: 200,  asset: '/cosmetics/colors/purple-royalty.png',   color: '#7B2D8B' },
  ];

  for (const item of items) {
    await db.execute(sql`
      INSERT INTO cosmetic_items (id, category, display_name, description, stripes_cost, asset_path, color_value, active)
      VALUES (
        ${item.id}, ${item.category}, ${item.name}, ${item.desc},
        ${item.cost}, ${item.asset}, ${item.color}, TRUE
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }
  console.log(`[migrate-t4] Seeded ${items.length} cosmetic items ✓`);

  console.log("[migrate-t4] Done ✓");
  process.exit(0);
}

main().catch(err => {
  console.error("[migrate-t4] FATAL:", err);
  process.exit(1);
});
