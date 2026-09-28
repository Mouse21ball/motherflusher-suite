import { describe, expect, it } from 'vitest';
import {
  APPLE_SUBSCRIPTION_PRODUCT_BY_GOOGLE_ID,
  APPLE_SUBSCRIPTION_PRODUCT_IDS,
  APPLE_SUBSCRIPTION_PRODUCTS as APPLE_PRODUCT_IDS,
  GOOGLE_SUBSCRIPTION_PRODUCT_IDS,
} from '../shared/billingProducts';
import { APPLE_SUBSCRIPTION_PRODUCTS as APPLE_SHOP_PRODUCTS } from '../client/src/lib/billing';
import { SUBSCRIPTION_PRODUCTS } from '../server/billing';

describe('Apple Diamond Elite subscription pricing', () => {
  it('registers and verifies monthly Diamond Elite at $9.99', () => {
    const productId = APPLE_PRODUCT_IDS.diamondEliteMonthly;
    expect(APPLE_SUBSCRIPTION_PRODUCT_IDS).toContain(productId);
    expect(APPLE_SUBSCRIPTION_PRODUCT_BY_GOOGLE_ID[GOOGLE_SUBSCRIPTION_PRODUCT_IDS.diamondEliteMonthly]).toBe(productId);
    expect(APPLE_SHOP_PRODUCTS.diamondElite).toMatchObject({
      id: productId,
      price: '$9.99',
      period: 'monthly',
    });
    expect(SUBSCRIPTION_PRODUCTS[productId]).toMatchObject({
      tier: 'diamond_elite',
      billingPeriod: 'monthly',
      priceCents: 999,
    });
  });

  it('registers and verifies the new yearly Diamond Elite product at $59.99', () => {
    const productId = APPLE_PRODUCT_IDS.diamondEliteYearly;
    expect(APPLE_SUBSCRIPTION_PRODUCT_IDS).toContain(productId);
    expect(APPLE_SUBSCRIPTION_PRODUCT_BY_GOOGLE_ID[GOOGLE_SUBSCRIPTION_PRODUCT_IDS.diamondEliteYearly]).toBe(productId);
    expect(APPLE_SHOP_PRODUCTS.diamondElite).toMatchObject({
      yearlyId: productId,
      yearlyPrice: '$59.99',
      yearlyPeriod: 'yearly',
    });
    expect(SUBSCRIPTION_PRODUCTS[productId]).toMatchObject({
      tier: 'diamond_elite',
      billingPeriod: 'yearly',
      priceCents: 5999,
    });
    expect(GOOGLE_SUBSCRIPTION_PRODUCT_IDS.diamondEliteYearly).toBe('sub_diamond_elite_yearly');
  });
});