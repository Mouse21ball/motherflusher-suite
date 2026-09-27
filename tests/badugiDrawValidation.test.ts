import { describe, expect, it } from 'vitest';
import type { CardType, GamePhase, GameState, Player } from '../shared/gameTypes';
import { applyBadugiDraw } from '../server/utils/badugiDraw';

const hand: CardType[] = [
  { rank: 'A', suit: 'hearts', isHidden: false },
  { rank: '2', suit: 'diamonds', isHidden: false },
  { rank: '3', suit: 'clubs', isHidden: false },
  { rank: '4', suit: 'spades', isHidden: false },
];
const replacements: CardType[] = [
  { rank: '5', suit: 'hearts', isHidden: true },
  { rank: '6', suit: 'diamonds', isHidden: true },
  { rank: '7', suit: 'clubs', isHidden: true },
  { rank: '8', suit: 'spades', isHidden: true },
];

function state(phase: GamePhase = 'DRAW_1'): GameState {
  const players: Player[] = [
    { id: 'p1', name: 'One', chips: 100, bet: 0, status: 'active', cards: [...hand], hasActed: false, isDealer: true, declaration: null },
    { id: 'p2', name: 'Two', chips: 100, bet: 0, status: 'active', cards: [...hand], hasActed: false, isDealer: false, declaration: null },
  ];
  return {
    tableId: 'badugi-draw-test', phase, players, activePlayerId: 'p1',
    pot: 0, currentBet: 0, minBet: 25, deck: [...replacements],
    discardPile: [], communityCards: [], messages: [], chatMessages: [],
  };
}

describe('server Badugi draw validation', () => {
  it.each([
    ['DRAW_1', 3], ['DRAW_2', 2], ['DRAW_3', 1],
  ] as const)('%s rejects more than %i discards without touching the hand', (phase, cap) => {
    const before = state(phase);
    const original = structuredClone(before);
    const result = applyBadugiDraw(before, 'p1', Array.from({ length: cap + 1 }, (_, i) => i));
    expect(result).toMatchObject({ ok: false, reason: 'cap_exceeded' });
    expect(before).toEqual(original);

    const allowed = applyBadugiDraw(before, 'p1', Array.from({ length: cap }, (_, i) => i));
    expect(allowed).toMatchObject({ ok: true, count: cap });
  });

  it.each([
    [[0, -1]], [[0, 4]], [[0, 1.5]], [[0, '1']], [[0, null]],
  ])('rejects out-of-range or non-integer indices %j as a whole action', (indices) => {
    const before = state();
    const result = applyBadugiDraw(before, 'p1', indices);
    expect(result).toMatchObject({ ok: false, reason: 'invalid_index' });
    expect(before.players[0].hasActed).toBe(false);
    expect(before.discardPile).toHaveLength(0);
    expect(before.deck).toEqual(replacements);
  });

  it('rejects duplicate indices and a missing/non-array payload', () => {
    const before = state();
    expect(applyBadugiDraw(before, 'p1', [0, 0])).toMatchObject({ ok: false, reason: 'duplicate_index' });
    expect(applyBadugiDraw(before, 'p1', undefined)).toMatchObject({ ok: false, reason: 'invalid_payload' });
    expect(before.players[0].cards).toEqual(hand);
    expect(before.discardPile).toHaveLength(0);
  });

  it('replaces only selected cards and adds the originals to the discard pile', () => {
    const before = state('DRAW_2');
    const result = applyBadugiDraw(before, 'p1', [0, 2]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.players[0].cards).toEqual([
      { ...replacements[0], isHidden: false }, hand[1],
      { ...replacements[1], isHidden: false }, hand[3],
    ]);
    expect(result.players[0].hasActed).toBe(true);
    expect(result.players[1]).toEqual(before.players[1]);
    expect(result.discardPile).toEqual([hand[0], hand[2]]);
    expect(result.deck).toEqual(replacements.slice(2));
    expect(before.players[0].cards).toEqual(hand);
  });

  it('allows standing pat without discarding a card', () => {
    const result = applyBadugiDraw(state('DRAW_3'), 'p1', []);
    expect(result).toMatchObject({ ok: true, count: 0, discardPile: [] });
    if (result.ok) expect(result.players[0].hasActed).toBe(true);
  });
});