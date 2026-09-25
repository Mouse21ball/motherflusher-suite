import { describe, expect, it } from 'vitest';
import type { GameState, Player } from '../shared/gameTypes';
import {
  availableStreakSeat, claimSeatStreak, confirmedWinStreaks, ownedStreakSeat,
  releaseSeatStreak, resetSeatWinStreak,
} from '../server/utils/tableWinStreaks';

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id, name: id, chips: 1000, bet: 0, cards: [], status: 'active',
    isDealer: false, declaration: null, ...overrides,
  };
}

function table(players: Player[], winStreaks: Record<string, number> = {}): GameState {
  return {
    tableId: 'active-table', phase: 'SHOWDOWN', winStreaks, players,
    pot: 0, currentBet: 0, minBet: 25, activePlayerId: players[0]?.id ?? null,
    communityCards: [], messages: [], chatMessages: [], deck: [], discardPile: [],
  };
}

describe('server-owned table win streaks', () => {
  it('starts a new table at zero and increments only after a confirmed winner', () => {
    const initial = table([player('hot'), player('other')]);
    expect(initial.winStreaks).toEqual({});
    const result = [player('hot', { chips: 1100, isWinner: true }), player('other')];
    expect(confirmedWinStreaks(initial, result)).toEqual({ hot: 1, other: 0 });
    expect(confirmedWinStreaks(initial, initial.players)).toEqual({});
  });

  it('restores a persisted table streak across reconnect and counts its next win', () => {
    const saved = table([player('hot'), player('other')], { hot: 4, other: 0 });
    saved.seatStreakOwners = { hot: 'identity-hot', other: 'identity-other' };
    const restored = JSON.parse(JSON.stringify(saved)) as GameState;
    expect(restored.winStreaks?.hot).toBe(4);
    expect(ownedStreakSeat(restored, 'identity-hot')).toBe('hot');
    expect(claimSeatStreak(restored, 'hot', 'identity-hot')).toMatchObject({
      winStreaks: { hot: 4, other: 0 },
      seatStreakOwners: { hot: 'identity-hot', other: 'identity-other' },
    });
    expect(confirmedWinStreaks(restored, [
      player('hot', { chips: 1100, isWinner: true }), player('other'),
    ])).toEqual({ hot: 5, other: 0 });
  });

  it('resets a participating loser but leaves a sitting-out seat unchanged', () => {
    const before = table([
      player('hot', { status: 'folded' }),
      player('winner'),
      player('absent', { status: 'sitting_out' }),
    ], { hot: 4, winner: 0, absent: 2 });
    expect(confirmedWinStreaks(before, [
      player('hot', { status: 'folded' }),
      player('winner', { chips: 1100, isWinner: true }),
      player('absent', { status: 'sitting_out' }),
    ])).toEqual({ hot: 0, winner: 1, absent: 2 });
  });

  it('does not count unresolved or duplicate showdowns twice', () => {
    const before = table([player('hot')], { hot: 2 });
    expect(confirmedWinStreaks(before, [player('hot')])).toEqual({ hot: 2 });
    const paid = table([player('hot', { isWinner: true })], { hot: 3 });
    expect(confirmedWinStreaks(paid, paid.players)).toEqual({ hot: 3 });
    expect(confirmedWinStreaks(before, [player('hot', { isWinner: true })])).toEqual({ hot: 2 });
  });

  it('does not count a winner flagged without an award, even if another winner was paid', () => {
    const before = table([player('paid'), player('unpaid')], { paid: 2, unpaid: 3 });
    expect(confirmedWinStreaks(before, [
      player('paid', { chips: 1100, isWinner: true }),
      player('unpaid', { isWinner: true }),
    ])).toEqual({ paid: 3, unpaid: 3 });
  });

  it('clears the departing seat without changing other players or another table', () => {
    const active = table([player('leaving'), player('staying')], { leaving: 4, staying: 2 });
    active.seatStreakOwners = { leaving: 'identity-old', staying: 'identity-staying' };
    expect(resetSeatWinStreak(active, 'leaving')).toEqual({ leaving: 0, staying: 2 });
    expect(releaseSeatStreak(active, 'leaving')).toEqual({
      winStreaks: { leaving: 0, staying: 2 },
      seatStreakOwners: { staying: 'identity-staying' },
    });
    expect(active.winStreaks?.leaving).toBe(4);
    const newTable = table([player('leaving')]);
    expect(newTable.winStreaks).toEqual({});
  });

  it('resets a new occupant rather than inheriting a restored seat streak', () => {
    const persisted = table([player('p1'), player('p2')], { p1: 4, p2: 2 });
    persisted.seatStreakOwners = { p1: 'identity-old', p2: 'identity-staying' };
    const restored = JSON.parse(JSON.stringify(persisted)) as GameState;
    expect(claimSeatStreak(restored, 'p1', 'identity-new')).toEqual({
      winStreaks: { p1: 0, p2: 2 },
      seatStreakOwners: { p1: 'identity-new', p2: 'identity-staying' },
    });
    expect(claimSeatStreak(table([player('p1')], { p1: 4 }), 'p1', 'unverified')).toMatchObject({
      winStreaks: { p1: 0 },
    });
  });

  it('reserves restored owners while other players join first', () => {
    const saved = table([player('p1'), player('p2')], { p1: 4, p2: 0 });
    saved.seatStreakOwners = { p1: 'identity-a' };
    let restored = JSON.parse(JSON.stringify(saved)) as GameState;
    const connections = new Set<string>();
    const seats = ['p1', 'p2'];

    const otherSeat = availableStreakSeat(restored, seats, connections, 'identity-b');
    expect(otherSeat).toBe('p2');
    restored = { ...restored, ...claimSeatStreak(restored, otherSeat!, 'identity-b') };
    connections.add(otherSeat!);
    const returningSeat = availableStreakSeat(restored, seats, connections, 'identity-a');
    expect(returningSeat).toBe('p1');
    expect(claimSeatStreak(restored, returningSeat!, 'identity-a').winStreaks).toEqual({ p1: 4, p2: 0 });
    expect(availableStreakSeat(restored, seats, connections, 'identity-c')).toBeNull();
  });
});