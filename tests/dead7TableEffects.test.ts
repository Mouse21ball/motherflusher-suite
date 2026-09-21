import { describe, expect, it } from 'vitest';
import type { GameState, Player } from '../shared/gameTypes';
import {
  deriveDead7AwardAmounts,
  deriveDead7VisualIntents,
  snapshotDead7VisualState,
} from '../client/src/components/dead7/Dead7TableEffects';

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

function state(phase: GameState['phase'], players: Player[], pot = 0): GameState {
  return {
    tableId: 'dead7-effects-test',
    phase,
    pot,
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

describe('Dead 7 visual transition derivation', () => {
  it('uses authoritative bet deltas in Dead 7 betting rounds', () => {
    const before = state('BET_3', [player('p1')]);
    const after = state('BET_3', [player('p1', { bet: 125, chips: 875 })], 125);

    expect(deriveDead7VisualIntents(snapshotDead7VisualState(before), after)).toEqual([
      { kind: 'bet', playerId: 'p1', amount: 125, cardCount: 0 },
    ]);
  });

  it('does not treat Dead 7 draw or declare updates as bets', () => {
    const before = state('DECLARE', [player('p1')]);
    const after = state('DECLARE', [player('p1', { bet: 50, chips: 950, declaration: 'HIGH' })]);

    expect(deriveDead7VisualIntents(snapshotDead7VisualState(before), after)).toEqual([]);
  });

  it('creates one payout flight per authoritative split-pot winner', () => {
    const before = state('BET_3', [player('high', { chips: 700 }), player('low', { chips: 800 })], 301);
    const after = state('SHOWDOWN', [
      player('high', { chips: 851, isWinner: true, declaration: 'HIGH' }),
      player('low', { chips: 950, isWinner: true, declaration: 'LOW' }),
    ]);

    expect(deriveDead7VisualIntents(snapshotDead7VisualState(before), after)).toEqual([
      { kind: 'payout', playerId: 'high', amount: 151, cardCount: 0 },
      { kind: 'payout', playerId: 'low', amount: 150, cardCount: 0 },
    ]);
  });

  it('animates all four cards when DECLARE auto-folds an invalid hand', () => {
    const before = state('DECLARE', [player('p1')]);
    const after = state('DECLARE', [player('p1', { status: 'folded' })]);

    expect(deriveDead7VisualIntents(snapshotDead7VisualState(before), after)).toEqual([
      { kind: 'fold', playerId: 'p1', amount: 0, cardCount: 4 },
    ]);
  });

  it('does not animate a rollover when no authoritative winner is paid', () => {
    const before = state('DECLARE', [player('p1', { chips: 700 })], 300);
    const after = state('SHOWDOWN', [player('p1', { chips: 700 })], 300);

    expect(deriveDead7VisualIntents(snapshotDead7VisualState(before), after)).toEqual([]);
  });

  it('reports each authoritative award while excluding a partial rollover', () => {
    const resolved = state('SHOWDOWN', [
      player('high', { chips: 801, isWinner: true, declaration: 'HIGH' }),
      player('unqualified', { chips: 700 }),
    ], 99);

    expect(deriveDead7AwardAmounts({ high: 700, unqualified: 700 }, resolved)).toEqual({
      high: 101,
    });
  });
});