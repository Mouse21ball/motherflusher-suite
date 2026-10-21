import { describe, expect, it } from 'vitest';
import type { CardType, GamePhase, GameState, Player } from '../shared/gameTypes';
import { applyBadugiDraw } from '../server/utils/badugiDraw';

/**
 * Detroit 2026-10-20 (Bug 2): the card-identity invariant, proven at the
 * engine boundary. If a player selects N cards to swap, exactly those N
 * positions are replaced; every other position retains its original card
 * identity. Zero selections replace zero cards. (Detroit's test matrix
 * asked for a 4-card swap; Badugi's standing round caps are 3/2/1, so a
 * 4-card submission is REFUSED whole — asserted below as its own case.)
 */

const hand: CardType[] = [
  { rank: 'A', suit: 'hearts', isHidden: false },
  { rank: '2', suit: 'diamonds', isHidden: false },
  { rank: '3', suit: 'clubs', isHidden: false },
  { rank: '4', suit: 'spades', isHidden: false },
];
const deckCards: CardType[] = [
  { rank: '5', suit: 'hearts', isHidden: true },
  { rank: '6', suit: 'diamonds', isHidden: true },
  { rank: '7', suit: 'clubs', isHidden: true },
  { rank: '8', suit: 'spades', isHidden: true },
  { rank: '9', suit: 'hearts', isHidden: true },
];

function state(phase: GamePhase = 'DRAW_1'): GameState {
  const players: Player[] = [
    { id: 'p1', name: 'One', chips: 100, bet: 0, status: 'active', cards: structuredClone(hand), hasActed: false, isDealer: true, declaration: null },
    { id: 'p2', name: 'Two', chips: 100, bet: 0, status: 'active', cards: structuredClone(hand), hasActed: false, isDealer: false, declaration: null },
  ];
  return {
    tableId: 'badugi-draw-invariant', phase, players, activePlayerId: 'p1',
    pot: 0, currentBet: 0, minBet: 25, deck: structuredClone(deckCards),
    discardPile: [], communityCards: [], messages: [], chatMessages: [],
  };
}

const sig = (c: CardType) => `${c.rank}:${c.suit}`;

describe('Badugi draw identity invariant', () => {
  it('swap 0 (stand pat) replaces zero cards and touches nothing', () => {
    const s = state();
    const result = applyBadugiDraw(s, 'p1', []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBe(0);
    const after = result.players.find(p => p.id === 'p1')!;
    expect(after.cards.map(sig)).toEqual(hand.map(sig));
    expect(result.deck.map(sig)).toEqual(deckCards.map(sig));
    expect(result.discardPile).toHaveLength(0);
  });

  it.each([
    ['DRAW_3', [2]],
    ['DRAW_2', [0, 3]],
    ['DRAW_1', [0, 1, 3]],
  ] as const)('%s swap %j replaces exactly the selected positions', (phase, indices) => {
    const s = state(phase);
    const result = applyBadugiDraw(s, 'p1', [...indices]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBe(indices.length);
    const after = result.players.find(p => p.id === 'p1')!;
    for (let i = 0; i < 4; i++) {
      if (indices.includes(i as never)) {
        // Replaced: identity differs from the original card at this slot
        expect(sig(after.cards[i])).not.toBe(sig(hand[i]));
      } else {
        // Kept: identity is exactly the original card
        expect(sig(after.cards[i])).toBe(sig(hand[i]));
      }
    }
    // Discard pile receives exactly the discarded originals, in order
    expect(result.discardPile.map(sig)).toEqual(indices.map(i => sig(hand[i])));
    // Replacements are dealt from the deck in order
    const expectedNew = indices.map((_, k) => sig(deckCards[k]));
    indices.forEach((slot, k) => {
      expect(sig(after.cards[slot])).toBe(expectedNew[k]);
    });
    // The other player is untouched
    const other = result.players.find(p => p.id === 'p2')!;
    expect(other.cards.map(sig)).toEqual(hand.map(sig));
  });

  it('a 4-card swap exceeds the round cap and is refused with the hand unchanged', () => {
    const s = state('DRAW_1');
    const before = structuredClone(s);
    const result = applyBadugiDraw(s, 'p1', [0, 1, 2, 3]);
    expect(result).toMatchObject({ ok: false, reason: 'cap_exceeded' });
    expect(s).toEqual(before);
  });
});
