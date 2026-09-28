import { describe, expect, it } from 'vitest';
import { getStripeGoal } from '../client/src/lib/stripeGoal';
import { buildDeck } from '../server/ladyluckEngine';

describe('Home Stripes goal', () => {
  it('shows the real 100◆ crew threshold alongside the Gold Frame', () => {
    expect(getStripeGoal(0)).toEqual({ label: '100◆ away from a Gold Frame or creating a Crew', progress: 0 });
    expect(getStripeGoal(99).label).toContain('1◆ away');
    expect(getStripeGoal(100).label).toContain('first avatar');
    expect(getStripeGoal(125)).toEqual({ label: 'Ready to create a Crew', progress: 1 });
  });
});

describe('Lady Luck tutorial deck', () => {
  it('contains all 52 cards: thirteen ranks in each of four racing suits', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(c => `${c.rank}:${c.suit}`)).size).toBe(52);
    for (const suit of ['spades', 'hearts', 'diamonds', 'clubs']) {
      expect(deck.filter(c => c.suit === suit)).toHaveLength(13);
    }
  });
});