import { describe, expect, it } from 'vitest';
import type { GameState, Player } from '../shared/gameTypes';
import {
  BIG_POT_MIN_CHIPS,
  deriveCelebration,
  resolveCelebration,
  snapshotForCelebrations,
  WIN_STREAK_MIN_HANDS,
  type CelebrationEvent,
} from '../client/src/components/celebrations/celebrationEvents';
import { confirmedWinStreaks } from '../server/utils/tableWinStreaks';
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

function state(
  phase: GameState['phase'],
  players: Player[],
  tableId = 'table-1',
  winStreaks: Record<string, number> = {},
): GameState {
  return {
    tableId,
    phase,
    winStreaks,
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

function settledState(before: GameState, players: Player[]): GameState {
  return state('SHOWDOWN', players, before.tableId, confirmedWinStreaks(before, players));
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

  it('celebrates only confirmed paid rare hands, including a perfect Badugi', () => {
    const before = snapshotForCelebrations(state('BET_4', [player('winner', { chips: 700 })]));
    const royal = state('SHOWDOWN', [player('winner', {
      chips: 900, isWinner: true, score: { highEval: { description: 'Royal Flush', usedHoleCardIndices: [], usedCommunityCardIndices: [] } },
    })]);
    expect(deriveCelebration(before, royal, 'suitspoker')).toMatchObject({
      type: 'RARE_HAND', handName: 'Royal Flush', amount: 200,
    });
    expect(deriveCelebration(before, state('SHOWDOWN', [
      { ...royal.players[0], isWinner: false },
    ]), 'suitspoker')).toBeNull();
    expect(deriveCelebration(null, royal, 'suitspoker')).toBeNull();
    expect(deriveCelebration(before, royal, 'suitspoker', 'init')).toBeNull();
    const perfect = state('SHOWDOWN', [player('winner', {
      chips: 900, isWinner: true,
      score: { description: '4-High Badugi', isValidBadugi: true, badugiRankValues: [4, 3, 2, 1] },
    })]);
    expect(deriveCelebration(before, perfect, 'badugi')).toMatchObject({
      type: 'RARE_HAND', handName: 'Perfect Badugi',
    });
    perfect.players[0].score!.badugiRankValues = [4, 3, 2, 2];
    expect(deriveCelebration(before, perfect, 'badugi')?.type).toBe('NORMAL_WIN');
  });

  it('counts consecutive confirmed wins, resets on losses, and does not count duplicate snapshots', () => {
    let before = state('BET_4', [
      player('hot', { chips: 700 }), player('other'),
    ]);
    for (let hand = 1; hand <= WIN_STREAK_MIN_HANDS + 1; hand++) {
      const resolved = settledState(before, [
        player('hot', { chips: 700 + hand * 100, isWinner: true }),
        player('other', { chips: 1000 - hand * 100 }),
      ]);
      const event = deriveCelebration(snapshotForCelebrations(before), resolved, 'badugi');
      expect(event?.type).toBe(hand >= WIN_STREAK_MIN_HANDS ? 'WIN_STREAK' : 'NORMAL_WIN');
      if (hand >= WIN_STREAK_MIN_HANDS) expect(event?.streakCount).toBe(hand);
      expect(deriveCelebration(snapshotForCelebrations(resolved), resolved, 'badugi')).toBeNull();
      before = state('BET_4', resolved.players.map(p => ({ ...p, isWinner: false })),
        resolved.tableId, resolved.winStreaks);
    }
    const loss = settledState(before, [
      player('hot', { chips: 1000 }), player('other', { chips: 800, isWinner: true }),
    ]);
    expect(loss.winStreaks?.hot).toBe(0);
    const reset = state('BET_4', [
      player('hot', { chips: 1000 }), player('other', { chips: 800 }),
    ], before.tableId, loss.winStreaks);
    expect(deriveCelebration(snapshotForCelebrations(reset), settledState(reset, [
      player('hot', { chips: 1100, isWinner: true }), player('other', { chips: 700 }),
    ]), 'badugi')?.type).toBe('NORMAL_WIN');
  });

  it('does not replay a win-streak celebration from a reconnect initialization snapshot', () => {
    const before = state('BET_4', [
      player('hot', { chips: 700 }),
    ], 'table-1', { hot: WIN_STREAK_MIN_HANDS - 1 });
    const resolved = settledState(before, [
      player('hot', { chips: 800, isWinner: true }),
    ]);

    expect(deriveCelebration(snapshotForCelebrations(before), resolved, 'badugi')).toMatchObject({
      type: 'WIN_STREAK',
      streakCount: WIN_STREAK_MIN_HANDS,
    });
    expect(deriveCelebration(snapshotForCelebrations(before), resolved, 'badugi', 'init')).toBeNull();
    expect(deriveCelebration(null, resolved, 'badugi', 'init')).toBeNull();
  });

  it('uses the restored server streak after reconnect and celebrates the next confirmed win', () => {
    const reconnect = state('SHOWDOWN', [
      player('hot', { chips: 900, isWinner: true }),
    ], 'table-1', { hot: 4 });
    expect(deriveCelebration(null, reconnect, 'badugi', 'init')).toBeNull();
    expect(deriveCelebration(snapshotForCelebrations(reconnect), reconnect, 'badugi')).toBeNull();

    const nextHand = state('BET_4', [
      player('hot', { chips: 800 }),
    ], reconnect.tableId, reconnect.winStreaks);
    const fifthWin = settledState(nextHand, [
      player('hot', { chips: 1000, isWinner: true }),
    ]);
    expect(fifthWin.winStreaks?.hot).toBe(5);
    expect(deriveCelebration(snapshotForCelebrations(nextHand), fifthWin, 'badugi')).toMatchObject({
      type: 'WIN_STREAK', streakCount: 5,
    });
  });

  it('gives rare hands priority over streaks and big pots without dropping split targets', () => {
    const before = state('BET_4', [
      player('rare', { chips: 100 }), player('streak', { chips: 100 }),
    ], 'table-1', { streak: 2 });
    const resolved = settledState(before, [
      player('rare', { chips: 300, isWinner: true, score: { description: 'Straight Flush' } }),
      player('streak', { chips: 700, isWinner: true }),
    ]);
    expect(deriveCelebration(snapshotForCelebrations(before), resolved, 'boxchevy')).toMatchObject({
      type: 'RARE_HAND', playerId: 'rare', handName: 'Straight Flush',
      amount: 800, targets: [{ playerId: 'rare', amount: 200 }, { playerId: 'streak', amount: 600 }],
    });
    expect(resolved.winStreaks).toEqual({
      rare: 1, streak: 3,
    });
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

  it('registers distinct bounded presets for rare hands and streaks', () => {
    const event: CelebrationEvent = {
      type: 'RARE_HAND', playerId: 'p1', playerName: 'P1',
      targets: [{ playerId: 'p1', amount: 100 }], amount: 100,
    };
    expect(resolveCelebration(event)).toMatchObject({
      animation: 'rare-halo', intensity: 'premium', durationMs: 2300,
    });
    expect(resolveCelebration({ ...event, durationMs: 9999 }).durationMs).toBe(3000);
    expect(resolveCelebration({ ...event, type: 'WIN_STREAK' })).toMatchObject({
      animation: 'streak-flare', intensity: 'big', durationMs: 2000,
    });
    expect(resolveCelebration({ ...event, type: 'WIN_STREAK', durationMs: 9999 }).durationMs).toBe(2200);
  });

  it('fails explicitly when a celebration type has no registered preset', () => {
    const event: CelebrationEvent = {
      type: 'BLUFF_WIN',
      playerId: 'p1',
      playerName: 'Player 1',
      targets: [{ playerId: 'p1', amount: 100 }],
      amount: 100,
    };

    expect(() => resolveCelebration(event)).toThrow(
      'No presentation preset registered for BLUFF_WIN',
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