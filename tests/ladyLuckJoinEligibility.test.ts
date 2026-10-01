import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createLLTable, getLLActiveTables, handleLLJoin } from '../server/ladyluckEngine';
import {
  canJoinLadyLuckTable,
  isValidLadyLuckSideBetAmount,
  validateLadyLuckWagerAmount,
} from '../shared/ladyLuckJoinEligibility';
import type { LadyLuckState } from '../shared/modes/ladyluck';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function makeState(overrides: Partial<LadyLuckState> = {}): LadyLuckState {
  return {
    raceId: 'race',
    phase: 'LOBBY',
    players: [],
    positions: { spades: 0, hearts: 0, diamonds: 0, clubs: 0 },
    flippedCards: [],
    currentCard: null,
    winner: null,
    pot: 0,
    sideBets: [],
    roomType: 'pony',
    dealerIndex: 0,
    currentPickIndex: 1,
    claimedSuits: [],
    startingIn: null,
    resultsTimeLeft: null,
    betTimeLeft: null,
    spectatorCount: 0,
    ...overrides,
  };
}

describe('Lady Luck zero-stack joins', () => {
  it('rejects a fresh zero-wallet seat through the server join handler', () => {
    const tableId = `lady-luck-zero-${randomUUID()}`;
    createLLTable(tableId, 'pony', 'zero-wallet-user');
    const ws = { readyState: 1, send: vi.fn(), close: vi.fn() } as any;

    handleLLJoin(tableId, 'zero-wallet-user', 'Player', 0, ws);

    expect(getLLActiveTables().find(table => table.tableId === tableId)?.playerCount).toBe(0);
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('insufficient_chips'));
  });

  it('rejects zero-wallet joins without creating a new active player seat', () => {
    const state = makeState();
    expect(canJoinLadyLuckTable(state, 'zero-wallet-user', 0)).toBe(false);
    expect(canJoinLadyLuckTable(state, 'funded-user', 1)).toBe(true);
    expect(state.players).toHaveLength(0);
  });

  it('allows reconnection to an in-progress hand only when the player already committed a wager', () => {
    const player = {
      id: 'wagered-user',
      name: 'Player',
      chips: 0,
      suit: 'hearts',
      wager: 100,
      presence: 'human',
      wagered: true,
      seatIndex: 0,
    } as const;
    expect(canJoinLadyLuckTable(makeState({ phase: 'WAGER', players: [player] }), player.id, 0)).toBe(true);
    expect(canJoinLadyLuckTable(makeState({ phase: 'LOBBY', players: [player] }), player.id, 0)).toBe(false);
    expect(canJoinLadyLuckTable(makeState({ phase: 'RACE', players: [player] }), player.id, 0)).toBe(true);
    expect(canJoinLadyLuckTable(makeState({ phase: 'RESULTS', players: [player] }), player.id, 0)).toBe(true);
  });

  it('rejects zero and negative wagers through the production amount validators', () => {
    const limits = { minWager: 100, maxWager: 10_000, maxSideBet: 5_000 };
    expect(validateLadyLuckWagerAmount(0, limits.minWager, limits.maxWager)).toBe('below_min');
    expect(isValidLadyLuckSideBetAmount(0, limits.maxSideBet)).toBe(false);
    expect(validateLadyLuckWagerAmount(-100, limits.minWager, limits.maxWager)).toBe('below_min');
    expect(isValidLadyLuckSideBetAmount(-1, limits.maxSideBet)).toBe(false);
  });
});