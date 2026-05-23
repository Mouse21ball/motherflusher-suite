import { db } from '../server/db';
import { cosmeticItems } from '../shared/schema';
import { eq, inArray } from 'drizzle-orm';

const PLACEHOLDER_IDS = [
  'avatar_skull_mask',
  'avatar_crown',
  'avatar_diamond_chain',
  'avatar_gold_tooth',
  'frame_copper_bezel',
  'frame_silver_bars',
  'frame_gold_chain',
  'frame_diamond_studded',
  'frame_animated_flame',
];

const NEW_ITEMS = [
  // ── Avatars ────────────────────────────────────────────────────────────
  { id: 'avatar_urban',         category: 'avatar', displayName: 'Urban',          description: 'Street-ready urban avatar.',         stripesCost: 100, assetPath: '/cosmetics/avatars/urban.png',              sortOrder: 10 },
  { id: 'avatar_urban_2',       category: 'avatar', displayName: 'Urban II',        description: 'Second urban colorway.',             stripesCost: 100, assetPath: '/cosmetics/avatars/urban-2.png',            sortOrder: 11 },
  { id: 'avatar_bandana_black', category: 'avatar', displayName: 'Black Bandana',   description: 'All-black bandana look.',            stripesCost: 125, assetPath: '/cosmetics/avatars/bandana-black.png',      sortOrder: 12 },
  { id: 'avatar_bandana_blue',  category: 'avatar', displayName: 'Blue Bandana',    description: 'Blue bandana street style.',         stripesCost: 125, assetPath: '/cosmetics/avatars/bandana-blue.png',       sortOrder: 13 },
  { id: 'avatar_bandana_red',   category: 'avatar', displayName: 'Red Bandana',     description: 'Red bandana, ride or die.',          stripesCost: 125, assetPath: '/cosmetics/avatars/bandana-red.png',        sortOrder: 14 },
  { id: 'avatar_bandana_ghost', category: 'avatar', displayName: 'Ghost Bandana',   description: 'Ghost-white bandana, unseen.',       stripesCost: 150, assetPath: '/cosmetics/avatars/bandana-ghost.png',      sortOrder: 15 },
  { id: 'avatar_classy_girl',   category: 'avatar', displayName: 'Classy Girl',     description: 'Dressed to impress at the table.',   stripesCost: 175, assetPath: '/cosmetics/avatars/classy-girl.png',        sortOrder: 16 },
  { id: 'avatar_gangster_girl', category: 'avatar', displayName: 'Gangster Girl',   description: 'She runs the table.',                stripesCost: 200, assetPath: '/cosmetics/avatars/gangster-girl.png',      sortOrder: 17 },
  { id: 'avatar_king',          category: 'avatar', displayName: 'The King',        description: 'Royalty at every table.',            stripesCost: 300, assetPath: '/cosmetics/avatars/king.png',               sortOrder: 18 },

  // ── Frames ─────────────────────────────────────────────────────────────
  { id: 'frame_gold',               category: 'frame', displayName: 'Gold Frame',          description: 'Classic gold border.',                stripesCost: 100, assetPath: '/cosmetics/frames/frame-gold.png',               sortOrder: 10 },
  { id: 'frame_slime',              category: 'frame', displayName: 'Slime Frame',         description: 'Dripping slime border.',              stripesCost: 125, assetPath: '/cosmetics/frames/frame-slime.png',              sortOrder: 11 },
  { id: 'frame_bandana_blue',       category: 'frame', displayName: 'Blue Bandana Frame',  description: 'Blue bandana wraps the border.',      stripesCost: 150, assetPath: '/cosmetics/frames/frame-bandana-blue.png',       sortOrder: 12 },
  { id: 'frame_bandana_red',        category: 'frame', displayName: 'Red Bandana Frame',   description: 'Red bandana wraps the border.',       stripesCost: 150, assetPath: '/cosmetics/frames/frame-bandana-red.png',        sortOrder: 13 },
  { id: 'frame_classy_lady',        category: 'frame', displayName: 'Classy Lady Frame',   description: 'Elegant frame for the refined player.',stripesCost: 175, assetPath: '/cosmetics/frames/frame-classy-lady.png',        sortOrder: 14 },
  { id: 'frame_gangster_girl',      category: 'frame', displayName: 'Gangster Girl Frame', description: 'Street-style frame, boss energy.',    stripesCost: 200, assetPath: '/cosmetics/frames/frame-gangster-girl.png',      sortOrder: 15 },
  { id: 'frame_about_her_business', category: 'frame', displayName: 'About Her Business',  description: 'All business, no games.',             stripesCost: 250, assetPath: '/cosmetics/frames/frame-about-her-business.png', sortOrder: 16 },
  { id: 'frame_platinum',           category: 'frame', displayName: 'Platinum Frame',      description: 'Platinum-grade prestige.',            stripesCost: 300, assetPath: '/cosmetics/frames/frame-platinum.png',           sortOrder: 17 },
  { id: 'frame_firestyle',          category: 'frame', displayName: 'Firestyle Frame',     description: 'Fire-styled border, heat at the table.',stripesCost: 400, assetPath: '/cosmetics/frames/frame-firestyle.png',          sortOrder: 18 },
  { id: 'frame_diamond',            category: 'frame', displayName: 'Diamond Frame',       description: 'Diamond-encrusted prestige border.',  stripesCost: 500, assetPath: '/cosmetics/frames/frame-diamond.png',            sortOrder: 19 },
  { id: 'frame_fire',               category: 'frame', displayName: 'Fire Frame',          description: 'Ablaze with the rarest fire.',        stripesCost: 600, assetPath: '/cosmetics/frames/frame-fire.png',               sortOrder: 20 },
];

async function main() {
  console.log('[migrate-t4b] Starting…');

  // 1. Deactivate placeholder items (do not delete — preserve inventory rows)
  await db.update(cosmeticItems)
    .set({ active: false })
    .where(inArray(cosmeticItems.id, PLACEHOLDER_IDS));
  console.log(`[migrate-t4b] Deactivated ${PLACEHOLDER_IDS.length} placeholder items ✓`);

  // 2. Insert new launch catalog items (skip if already exists)
  let inserted = 0;
  for (const item of NEW_ITEMS) {
    const existing = await db.select({ id: cosmeticItems.id })
      .from(cosmeticItems)
      .where(eq(cosmeticItems.id, item.id))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(cosmeticItems).values({ ...item, active: true });
      inserted++;
    } else {
      // Re-activate and update if it somehow already exists
      await db.update(cosmeticItems)
        .set({ displayName: item.displayName, stripesCost: item.stripesCost, assetPath: item.assetPath, sortOrder: item.sortOrder, active: true })
        .where(eq(cosmeticItems.id, item.id));
    }
  }
  console.log(`[migrate-t4b] Inserted/updated ${NEW_ITEMS.length} new launch items ✓`);

  // 3. Verify final state
  const active = await db.select({ id: cosmeticItems.id, category: cosmeticItems.category, active: cosmeticItems.active })
    .from(cosmeticItems);

  const activeItems  = active.filter(i => i.active);
  const avatars      = activeItems.filter(i => i.category === 'avatar');
  const frames       = activeItems.filter(i => i.category === 'frame');
  const nameColors   = activeItems.filter(i => i.category === 'name_color');
  const deactivated  = active.filter(i => !i.active);

  console.log(`[migrate-t4b] Active catalog: ${activeItems.length} items total`);
  console.log(`  avatars=${avatars.length}  frames=${frames.length}  name_colors=${nameColors.length}`);
  console.log(`  deactivated placeholders: ${deactivated.length}`);

  if (avatars.length !== 9 || frames.length !== 11 || nameColors.length !== 4) {
    throw new Error(`[migrate-t4b] Count mismatch — expected 9/11/4, got ${avatars.length}/${frames.length}/${nameColors.length}`);
  }

  console.log('[migrate-t4b] Done ✓');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
