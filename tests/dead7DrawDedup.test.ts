import { describe, expect, it } from 'vitest';
import type { CardType } from '../shared/gameTypes';
import { applyGenericDraw } from '../server/utils/genericDraw';

const hand: CardType[] = [
  { rank: 'A', suit: 'spades' },
  { rank: '2', suit: 'hearts' },
  { rank: '3', suit: 'diamonds' },
  { rank: '4', suit: 'clubs' },
];
const deck: CardType[] = [
  { rank: '5', suit: 'hearts' },
  { rank: '6', suit: 'diamonds' },
  { rank: '7', suit: 'clubs' },
];

describe('Dead 7 draw indices', () => {
  it('draws and discards once per unique slot, even with duplicate indices', () => {
    // DRAW_1 permits three replacements; four submitted indices represent only two slots.
    const result = applyGenericDraw(hand, deck, [], [0, 0, 2, 2], 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBe(2);
    expect(result.cards).toEqual([
      { ...deck[0], isHidden: false }, hand[1],
      { ...deck[1], isHidden: false }, hand[3],
    ]);
    expect(result.deck).toEqual([deck[2]]);
    expect(result.discardPile).toEqual([hand[0], hand[2]]);
    expect(hand[0]).toEqual({ rank: 'A', suit: 'spades' });
    expect(deck).toHaveLength(3);
  });

  it.each([
    ['fractional slot after a valid slot', [0, 1.5]],
    ['negative slot', [-1]],
    ['slot beyond the hand', [hand.length]],
    ['non-numeric slot', ['1']],
    ['sparse slot', new Array(1)],
  ])('rejects a malformed %s without consuming cards', (_description, payload) => {
    const originalHand = structuredClone(hand);
    const originalDeck = structuredClone(deck);
    const originalDiscard: CardType[] = [{ rank: '8', suit: 'spades' }];
    const discard = structuredClone(originalDiscard);

    const result = applyGenericDraw(hand, deck, discard, payload, 3);

    expect(result).toEqual({ ok: false });
    expect(hand).toEqual(originalHand);
    expect(deck).toEqual(originalDeck);
    expect(discard).toEqual(originalDiscard);
  });
});