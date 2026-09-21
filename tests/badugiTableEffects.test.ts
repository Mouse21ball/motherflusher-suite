import { describe, expect, it } from 'vitest';
import type { GameState, Player } from '../shared/gameTypes';
import {
  deriveBadugiVisualIntents,
  snapshotBadugiVisualState,
} from '../client/src/components/badugi/BadugiTableEffects';

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    chips: 1000,
    bet: 0,
    cards: [
      { rank: 'A', suit: 'spades' },
      { rank: '2', suit: 'hearts' },
      { rank: '3', suit: 'diamonds' },
      { rank: '4', suit: 'clubs' },
    ],
    status: 'active',
    isDealer: false,
    declaration: null,
    ...overrides,
  };
}

function state(phase: GameState['phase'], players: Player[]): GameState {
  return {
    tableId: 'test',
    phase,
    pot: 0,
    currentBet: 0,
    minBet: 25,
    activePlayerId: players[0]?.id ?? null,
    players,
    communityCards: [],
    messages: [],
    chatMessages: [],
    deck: [],
    discardPile: [],
  };
}

describe('Badugi visual transition derivation', () => {
  it('uses the authoritative bet delta for seat-to-pot travel', () => {
    const before = state('BET_1', [player('p1')]);
    const after = state('BET_1', [player('p1', { bet: 75, chips: 925 })]);

    expect(deriveBadugiVisualIntents(snapshotBadugiVisualState(before), after)).toEqual([
      { kind: 'bet', playerId: 'p1', amount: 75, cardCount: 0 },
    ]);
  });

  it('creates one authoritative payout flight per winner in a split pot', () => {
    const before = state('BET_4', [player('p1', { chips: 700 }), player('p2', { chips: 800 })]);
    const after = state('SHOWDOWN', [
      player('p1', { chips: 850, isWinner: true }),
      player('p2', { chips: 950, isWinner: true }),
    ]);

    expect(deriveBadugiVisualIntents(snapshotBadugiVisualState(before), after)).toEqual([
      { kind: 'payout', playerId: 'p1', amount: 150, cardCount: 0 },
      { kind: 'payout', playerId: 'p2', amount: 150, cardCount: 0 },
    ]);
  });

  it('moves the previous authoritative card count to the muck on fold', () => {
    const before = state('BET_2', [player('p1')]);
    const after = state('BET_2', [player('p1', { status: 'folded' })]);

    expect(deriveBadugiVisualIntents(snapshotBadugiVisualState(before), after)).toContainEqual({
      kind: 'fold',
      playerId: 'p1',
      amount: 0,
      cardCount: 4,
    });
  });

  it('does not create visual payouts without an authoritative chip award', () => {
    const before = state('BET_4', [player('p1', { chips: 700 })]);
    const after = state('SHOWDOWN', [player('p1', { chips: 700, isWinner: true })]);

    expect(deriveBadugiVisualIntents(snapshotBadugiVisualState(before), after)).toEqual([]);
  });
});