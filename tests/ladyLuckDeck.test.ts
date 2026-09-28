import { describe, expect, it } from 'vitest';
import { buildDeck } from '../server/ladyluckEngine';
import { SUITS } from '../shared/modes/ladyluck';

describe('Lady Luck deck', () => {
  it('contains 52 distinct cards, including every Queen', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(card => `${card.rank}:${card.suit}`)).size).toBe(52);
    expect(deck.filter(card => card.rank === 'Q').map(card => card.suit).sort())
      .toEqual([...SUITS].sort());
  });
});