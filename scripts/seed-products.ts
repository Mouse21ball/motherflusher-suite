/**
 * Seed Stripe with CGP chip pack products.
 * Idempotent — skips products that already exist.
 * Run: npx tsx scripts/seed-products.ts
 */
import { getUncachableStripeClient } from './stripeClient';

const CHIP_PACKS = [
  {
    name: 'Starter Pack',
    description: 'Play money chip bundle — for entertainment only. No cash value.',
    chips: 5000,
    priceCents: 199,
    icon: '🪙',
  },
  {
    name: 'Popular Pack',
    description: 'Play money chip bundle — for entertainment only. No cash value.',
    chips: 15000,
    priceCents: 499,
    icon: '💰',
    badge: 'Best Value',
  },
  {
    name: 'High Roller',
    description: 'Play money chip bundle — for entertainment only. No cash value.',
    chips: 50000,
    priceCents: 999,
    icon: '💎',
  },
  {
    name: 'Whale Pack',
    description: 'Play money chip bundle — for entertainment only. No cash value.',
    chips: 150000,
    priceCents: 1999,
    icon: '🐳',
  },
];

async function seed() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log('Seeding CGP chip pack products…');

    for (const pack of CHIP_PACKS) {
      const existing = await stripe.products.search({
        query: `name:'${pack.name}' AND active:'true' AND metadata['category']:'chip_pack'`,
      });

      if (existing.data.length > 0) {
        const p = existing.data[0];
        console.log(`  ✓ ${pack.name} already exists (${p.id})`);
        continue;
      }

      const product = await stripe.products.create({
        name: pack.name,
        description: pack.description,
        metadata: {
          category: 'chip_pack',
          chips: String(pack.chips),
          icon: pack.icon,
          ...(pack.badge ? { badge: pack.badge } : {}),
        },
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: pack.priceCents,
        currency: 'usd',
      });

      console.log(`  + Created ${pack.name}: ${product.id}  price: ${price.id}  ($${(pack.priceCents / 100).toFixed(2)})`);
    }

    console.log('Done. Webhooks will sync products to the local database automatically.');
  } catch (err: any) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
