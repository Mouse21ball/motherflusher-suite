import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CardType, GameState, Player } from '../shared/gameTypes';
import { FlushedUpMode } from '../shared/modes/flushedUp';
import { FlushedUpEngine } from '../server/flushedUpEngine';
import { resolveByFold, resetToAnte } from '../server/genericEngine';
import { storage } from '../server/storage';

function card(rank: string, suit: string): CardType {
  return { rank: rank as CardType['rank'], suit: suit as CardType['suit'], isHidden: false };
}

function makePlayer(id: string, status: Player['status'], cards: CardType[]): Player {
  return {
    id,
    name: id,
    presence: 'bot',
    chips: 900,
    bet: 0,
    totalBet: 50,
    cards,
    status,
    hasActed: true,
    isDealer: id === 'sole',
    declaration: null,
  };
}

function makeTable(cards: CardType[]) {
  const players = [
    makePlayer('sole', 'active', cards),
    makePlayer('folded', 'folded', [card('A', 'spades'), card('K', 'spades')]),
  ];
  players[0].presence = 'human';
  const state: GameState = {
    tableId: 'flushed-fold-test',
    phase: 'BET_3',
    pot: 100,
    currentBet: 10,
    minBet: 2,
    activePlayerId: 'sole',
    players,
    communityCards: [],
    messages: [],
    chatMessages: [],
    deck: [],
    discardPile: [],
    raisesThisRound: 0,
    winStreaks: { sole: 2 },
  };
  return {
    tableId: state.tableId,
    modeId: 'flushed_up',
    mode: FlushedUpMode,
    engine: FlushedUpEngine,
    state,
    handId: 7,
    resolvedPot: undefined,
    botTimers: new Map(),
    connections: new Map(),
    spectators: new Map(),
    publicCardIndicesPerPlayer: {},
    seatToIdentityId: new Map([['sole', 'identity-sole']]),
    chipsAtHandStart: new Map([['sole', 900]]),
    sessionStats: new Map(),
    humanSeats: new Set(),
    actionLock: false,
    leavePromises: new Map(),
    leavingSeats: new Set(),
    sessionToSeat: new Map(),
    lastChipSyncHand: new Map(),
    disconnectTimers: new Map(),
    settlementPromise: undefined,
    showdownResolvePromise: undefined,
    seatBankroll: new Map(),
    seatLeaveIds: new Map(),
    pendingFundingSeats: new Set(),
    fundedSeats: new Set(['sole']),
    fundingPromises: new Map(),
    seatTimeBankSessionUsed: new Map(),
    seatTimeBankLastTurnKey: new Map(),
  };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Flushed Up generic-engine fold resolution', () => {
  it('rolls over a lone non-flush after rake and preserves rollover at reset', async () => {
    vi.useFakeTimers();
    const table = makeTable([
      card('A', 'clubs'), card('K', 'clubs'), card('Q', 'clubs'), card('J', 'clubs'),
    ]);
    const rakeLog = vi.spyOn(storage, 'logHouseRake').mockResolvedValue(undefined);
    vi.spyOn(storage, 'syncPlayerChips').mockResolvedValue(undefined);

    expect(resolveByFold(table as never)).toBe(true);

    expect(table.state.phase).toBe('SHOWDOWN');
    expect(table.resolvedPot).toBe(100);
    expect(table.state.pot).toBe(95);
    expect(table.state.players.find(player => player.id === 'sole')?.isWinner).toBeFalsy();
    expect(table.state.players.find(player => player.id === 'sole')?.isLoser).toBe(true);
    expect(table.state.winStreaks).toEqual({ sole: 2 });
    expect(rakeLog).toHaveBeenCalledWith(expect.objectContaining({
      gameMode: 'flushed_up',
      grossPot: 100,
      rakeAmount: 5,
      netPot: 95,
    }));

    // The prior hand's fold is resolved; this reset fixture has the funded
    // human plus an active bot eligible for the next hand.
    table.state.players = table.state.players.map(player => player.id === 'folded'
      ? { ...player, status: 'active' }
      : player);
    await resetToAnte(table as never);
    expect(table.state.phase).toBe('ANTE');
    expect(table.state.pot).toBe(95);
    expect(table.state.players.find(player => player.id === 'sole')?.isWinner).toBeUndefined();
  });

  it('still awards the full pot to a qualifying flush that survives by fold', () => {
    vi.useFakeTimers();
    const table = makeTable([
      card('2', 'hearts'), card('4', 'hearts'), card('6', 'hearts'),
      card('8', 'hearts'), card('10', 'hearts'),
    ]);

    expect(resolveByFold(table as never)).toBe(true);
    expect(table.state.players.find(player => player.id === 'sole')?.chips).toBe(995);
    expect(table.state.players.find(player => player.id === 'sole')?.isWinner).toBe(true);
    expect(table.state.pot).toBe(0);
  });
});