import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CardType, GameState, Player } from '../shared/gameTypes';
import { FlushedUpMode } from '../shared/modes/flushedUp';
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
    state,
    handId: 7,
    resolvedPot: undefined,
    botTimers: new Map(),
    connections: new Map(),
    spectators: new Map(),
    publicCardIndicesPerPlayer: {},
    seatToIdentityId: new Map(),
    chipsAtHandStart: new Map(),
    sessionStats: new Map(),
    humanSeats: new Set(),
    settlementPromise: undefined,
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