import { describe, expect, it } from 'vitest';
import { clampBuyIn, getBuyInBounds, getStakeTier, getStakeTierId, meetsMinimumBet, STAKE_TIERS } from '../shared/stakeTiers';
import { getOrCreateBadugiTable } from '../server/gameEngine';
import { getOrCreateTable } from '../server/genericEngine';

describe('stake tiers', () => {
  it('defines the central min-bet tiers and preserves Low as the default', () => {
    expect(STAKE_TIERS.map(({ id, minBet }) => [id, minBet])).toEqual([
      ['micro', 10],
      ['low', 50],
      ['mid', 250],
      ['high', 1000],
    ]);
    expect(getStakeTierId(undefined)).toBe('low');
    expect(getStakeTier('low').minBet).toBe(50);
  });

  it('scales the 20–200 BB buy-in bounds with each tier', () => {
    for (const tier of STAKE_TIERS) {
      expect(getBuyInBounds(tier.minBet)).toEqual({
        minBuyin: tier.minBet * 20,
        maxBuyin: tier.minBet * 200,
      });
      expect(clampBuyIn(1, tier.minBet)).toBe(tier.minBet * 20);
      expect(clampBuyIn(tier.minBet * 500, tier.minBet)).toBe(tier.minBet * 200);
    }
  });

  it('enforces tier minimum bets while allowing an all-in below the minimum', () => {
    expect(meetsMinimumBet(0, 9, false, 10)).toBe(false);
    expect(meetsMinimumBet(0, 10, false, 10)).toBe(true);
    expect(meetsMinimumBet(50, 299, false, 250)).toBe(false);
    expect(meetsMinimumBet(50, 300, false, 250)).toBe(true);
    expect(meetsMinimumBet(0, 5, true, 10)).toBe(true);
  });

  it('propagates selected tiers into both engine table states', () => {
    const badugiId = `stake-badugi-${Date.now()}`;
    const genericId = `stake-generic-${Date.now()}`;
    const badugi = getOrCreateBadugiTable(badugiId, true, false, { stakeTier: 'high' });
    const generic = getOrCreateTable('box_chevy', genericId, true, false, { stakeTier: 'mid' });

    expect(badugi.stakeTier).toBe('high');
    expect(badugi.state.minBet).toBe(1000);
    expect(generic?.stakeTier).toBe('mid');
    expect(generic?.state.minBet).toBe(250);
  });
});