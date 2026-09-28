import { describe, expect, it } from 'vitest';
import { APPLE_SUBSCRIPTION_PRODUCTS } from '../client/src/lib/billing';
import { SUBSCRIPTION_PRODUCTS } from '../server/billing';

describe('Chain Pro display rename', () => {
  it('changes the player-facing name without changing Apple or Google receipt keys', () => {
    expect(APPLE_SUBSCRIPTION_PRODUCTS.goldPro.name).toBe('Chain Pro');
    expect(APPLE_SUBSCRIPTION_PRODUCTS.goldPro.id).toBe('com.dgmentertainment.poker.goldpro.monthly');
    expect(SUBSCRIPTION_PRODUCTS.sub_gold_pro_monthly.tier).toBe('gold_pro');
    expect(SUBSCRIPTION_PRODUCTS.sub_gold_pro_yearly.tier).toBe('gold_pro');
    expect(SUBSCRIPTION_PRODUCTS['com.dgmentertainment.poker.goldpro.monthly'].tier).toBe('gold_pro');
  });
});