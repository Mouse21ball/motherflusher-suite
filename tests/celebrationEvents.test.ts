import { describe, expect, it } from 'vitest';
import type { GameState, Player } from '../shared/gameTypes';
import {
  BIG_POT_MIN_CHIPS,
  deriveCelebration,
  resolveCelebration,
  snapshotForCelebrations,
  type CelebrationEvent,
} from '../client/src/components/celebrations/celebrationEvents';
import {
  dismissCelebration,
  playCelebration,
  subscribeCelebrations,
} from '../client/src/components/celebrations/celebrationService';

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

function state(phase: GameState['phase'], players: Player[], tableId = 'table-1'): GameState {
  return {
    tableId,
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

describe('celebration event derivation', () => {
  it('derives a normal win from a positive winner chip delta', () => {
    const previous = snapshotForCelebrations(state('BET_4', [
      player('winner', { chips: 700 }),
      player('other', { chips: 1300 }),
    ]));
    const showdown = state('SHOWDOWN', [
      player('winner', { chips: 900, isWinner: true }),
      player('other', { chips: 1100 }),
    ]);

    expect(deriveCelebration(previous, showdown, 'badugi')).toEqual({
      type: 'NORMAL_WIN',
      playerId: 'winner',
      playerName: 'winner',
      targets: [{ playerId: 'winner', amount: 200 }],
      amount: 200,
    });
  });

  it('restores the gross award when the winner final bet is debited between snapshots', () => {
    const previous = snapshotForCelebrations(state('BET_4', [
      player('winner', { chips: 1000, totalBet: 100 }),
    ]));
    const showdown = state('SHOWDOWN', [
      player('winner', { chips: 1200, totalBet: 300, isWinner: true }),
    ]);

    expect(deriveCelebration(previous, showdown, 'badugi')).toEqual({
      type: 'NORMAL_WIN',
      playerId: 'winner',
      playerName: 'winner',
      targets: [{ playerId: 'winner', amount: 400 }],
      amount: 400,
    });
  });

  it('derives an all-in gross award when the chip delta is net zero', () => {
    const previous = snapshotForCelebrations(state('BET_4', [
      player('winner', { chips: 1000, totalBet: 0 }),
    ]));
    const showdown = state('SHOWDOWN', [
      player('winner', { chips: 1000, totalBet: 1000, isWinner: true }),
    ]);

    expect(deriveCelebration(previous, showdown, 'badugi')?.amount).toBe(1000);
  });

  it('classifies the big-pot threshold using the gross award, not net chip delta', () => {
    const previous = snapshotForCelebrations(state('BET_4', [
      player('winner', { chips: 1000, totalBet: 100 }),
    ]));
    const showdown = state('SHOWDOWN', [
      player('winner', { chips: 950, totalBet: 650, isWinner: true }),
    ]);

    expect(deriveCelebration(previous, showdown, 'badugi')).toEqual({
      type: 'BIG_POT',
      playerId: 'winner',
      playerName: 'winner',
      targets: [{ playerId: 'winner', amount: BIG_POT_MIN_CHIPS }],
      amount: BIG_POT_MIN_CHIPS,
    });
  });

  it('classifies observed awards at the big-pot threshold as BIG_POT', () => {
    const previous = snapshotForCelebrations(state('BET_4', [
      player('winner', { chips: 500 }),
    ]));
    const showdown = state('SHOWDOWN', [
      player('winner', { chips: 500 + BIG_POT_MIN_CHIPS, isWinner: true }),
    ]);

    expect(deriveCelebration(previous, showdown, 'badugi')?.type).toBe('BIG_POT');
    expect(deriveCelebration(previous, showdown, 'badugi')?.amount).toBe(BIG_POT_MIN_CHIPS);
  });

  it('gives the Dead7 signature precedence over the big-pot classification', () => {
    const previous = snapshotForCelebrations(state('BET_4', [
      player('winner', { chips: 100 }),
    ]));
    const showdown = state('SHOWDOWN', [
      player('winner', { chips: 100 + BIG_POT_MIN_CHIPS, isWinner: true }),
    ]);

    expect(deriveCelebration(previous, showdown, 'dead7')?.type).toBe('DEAD7_SPECIAL');
  });

  it('preserves split payout targets and selects the largest award as primary', () => {
    const previous = snapshotForCelebrations(state('BET_4', [
      player('first', { chips: 700 }),
      player('second', { chips: 800 }),
      player('other', { chips: 1000 }),
    ]));
    const showdown = state('SHOWDOWN', [
      player('first', { name: 'First', chips: 850, isWinner: true }),
      player('second', { name: 'Second', chips: 1000, isWinner: true }),
      player('other', { chips: 650 }),
    ]);

    expect(deriveCelebration(previous, showdown, 'badugi')).toEqual({
      type: 'NORMAL_WIN',
      playerId: 'second',
      playerName: 'First & Second',
      targets: [
        { playerId: 'first', amount: 150 },
        { playerId: 'second', amount: 200 },
      ],
      amount: 350,
    });
  });

  it('suppresses an unresolved showdown but celebrates when the winner resolves', () => {
    const beforeShowdown = snapshotForCelebrations(state('BET_4', [
      player('winner', { chips: 700 }),
    ]));
    const unresolved = state('SHOWDOWN', [
      player('winner', { chips: 700, isWinner: false }),
    ]);

    expect(deriveCelebration(beforeShowdown, unresolved, 'badugi')).toBeNull();

    const resolved = state('SHOWDOWN', [
      player('winner', { chips: 900, isWinner: true }),
    ]);
    expect(deriveCelebration(snapshotForCelebrations(unresolved), resolved, 'badugi')?.amount).toBe(200);
  });

  it('suppresses initial and reconnect snapshots without a prior table snapshot', () => {
    const current = state('SHOWDOWN', [
      player('winner', { chips: 900, isWinner: true }),
    ]);

    expect(deriveCelebration(null, current, 'badugi')).toBeNull();
  });

  it('suppresses a resolved reconnect snapshot explicitly marked as initialization', () => {
    const previous = snapshotForCelebrations(state('BET_4', [
      player('winner', { chips: 700, totalBet: 100 }),
    ]));
    const resolved = state('SHOWDOWN', [
      player('winner', { chips: 900, totalBet: 300, isWinner: true }),
    ]);

    expect(deriveCelebration(previous, resolved, 'badugi', 'init')).toBeNull();
  });

  it('does not celebrate rollovers, non-showdown phases, or awards without a positive delta', () => {
    const previous = snapshotForCelebrations(state('BET_4', [
      player('winner', { chips: 900 }),
    ]));

    expect(deriveCelebration(previous, state('BET_1', [
      player('winner', { chips: 1100, isWinner: true }),
    ]), 'badugi')).toBeNull();
    expect(deriveCelebration(previous, state('SHOWDOWN', [
      player('winner', { chips: 900, isWinner: true }),
    ]), 'badugi')).toBeNull();

    const alreadyResolved = snapshotForCelebrations(state('SHOWDOWN', [
      player('winner', { chips: 900, isWinner: true }),
    ]));
    expect(deriveCelebration(alreadyResolved, state('SHOWDOWN', [
      player('winner', { chips: 900, isWinner: true }),
    ]), 'badugi')).toBeNull();
  });

  it('suppresses a duplicate after the latest showdown is snapshotted', () => {
    const previous = snapshotForCelebrations(state('BET_4', [
      player('winner', { chips: 700 }),
    ]));
    const showdown = state('SHOWDOWN', [
      player('winner', { chips: 900, isWinner: true }),
    ]);

    expect(deriveCelebration(previous, showdown, 'badugi')).not.toBeNull();
    expect(deriveCelebration(snapshotForCelebrations(showdown), showdown, 'badugi')).toBeNull();
  });

  it('suppresses transitions between different tables', () => {
    const previous = snapshotForCelebrations(state('BET_4', [
      player('winner', { chips: 700 }),
    ], 'old-table'));
    const current = state('SHOWDOWN', [
      player('winner', { chips: 900, isWinner: true }),
    ], 'new-table');

    expect(deriveCelebration(previous, current, 'badugi')).toBeNull();
  });
});

describe('celebration presentation presets', () => {
  it('clamps custom durations to the selected intensity bounds', () => {
    const event: CelebrationEvent = {
      type: 'NORMAL_WIN',
      playerId: 'p1',
      playerName: 'Player 1',
      targets: [{ playerId: 'p1', amount: 100 }],
      amount: 100,
      durationMs: 1,
    };
    expect(resolveCelebration(event).durationMs).toBe(800);
    expect(resolveCelebration({ ...event, durationMs: 5000 }).durationMs).toBe(1500);
  });

  it('fails explicitly when a celebration type has no registered preset', () => {
    const event: CelebrationEvent = {
      type: 'RARE_HAND',
      playerId: 'p1',
      playerName: 'Player 1',
      targets: [{ playerId: 'p1', amount: 100 }],
      amount: 100,
    };

    expect(() => resolveCelebration(event)).toThrow(
      'No presentation preset registered for RARE_HAND',
    );
  });
});

describe('celebration event channel', () => {
  it('publishes, dismisses, and stops publishing after unsubscribe', () => {
    const received: (CelebrationEvent | null)[] = [];
    const unsubscribe = subscribeCelebrations(event => received.push(event));
    const event: CelebrationEvent = {
      type: 'NORMAL_WIN',
      playerId: 'p1',
      playerName: 'Player 1',
      targets: [{ playerId: 'p1', amount: 100 }],
      amount: 100,
    };

    playCelebration(event);
    dismissCelebration();
    unsubscribe();
    playCelebration(event);
    dismissCelebration();

    expect(received).toEqual([event, null]);
  });
});