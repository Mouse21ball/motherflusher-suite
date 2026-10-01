import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState, Player } from '../shared/gameTypes';
import { storage } from '../server/storage';
import { resetToAnte as resetGeneric } from '../server/genericEngine';
import { resetToAnte as resetBadugi } from '../server/gameEngine';
import { BadugiMode } from '../shared/modes/badugi';
import { Fifteen35Mode } from '../shared/modes/fifteen35';

function makeTable() {
  const players: Player[] = ['p1', 'p2'].map((id, index) => ({
    id, name: id, presence: 'human', chips: index === 0 ? 1100 : 900,
    bet: 0, cards: [], status: 'active', isDealer: index === 0,
    declaration: null, isWinner: index === 0,
  }));
  const state: GameState = {
    tableId: 'settlement-test', phase: 'SHOWDOWN', players, pot: 0,
    currentBet: 0, minBet: 25, activePlayerId: null,
    communityCards: [], messages: [], chatMessages: [], deck: [], discardPile: [],
  };
  return {
    tableId: 'settlement-test', modeId: 'badugi', state, handId: 1, resolvedPot: 200,
    actionLock: false,
    settlementPromise: undefined,
    showdownResolvePromise: undefined,
    leavePromises: new Map(),
    leavingSeats: new Set(),
    settlementRetryTimer: undefined,
    seatToIdentityId: new Map([['p1', 'id1'], ['p2', 'id2']]),
    chipsAtHandStart: new Map([['p1', 1000], ['p2', 1000]]),
    lastChipSyncHand: new Map([['p1', 1], ['p2', 1]]),
    sessionStats: new Map(),
    botTimers: new Map(),
    connections: new Map(),
    humanSeats: new Set(),
    sessionToSeat: new Map(),
    spectators: new Map(),
    disconnectTimers: new Map(),
    seatBankroll: new Map(),
    seatLeaveIds: new Map(),
    pendingFundingSeats: new Set(),
    fundedSeats: new Set(['p1', 'p2']),
    fundingPromises: new Map(),
    seatTimeBankSessionUsed: new Map(),
    seatTimeBankLastTurnKey: new Map(),
    publicCardIndicesPerPlayer: {},
  };
}

afterEach(() => vi.restoreAllMocks());

describe.each([
  ['generic', resetGeneric],
  ['Badugi', resetBadugi],
])('%s hand finalization', (_name, reset) => {
  it('waits for the committed award before starting the next hand', async () => {
    const table = makeTable();
    let commitAward!: () => void;
    let awardApplied = false;
    const delayedWrite = new Promise<void>(resolve => {
      commitAward = () => { awardApplied = true; resolve(); };
    });
    const sync = vi.spyOn(storage, 'syncPlayerChips')
      .mockImplementationOnce(() => delayedWrite)
      .mockResolvedValue(undefined);

    const pending = reset(table as never);
    expect(reset(table as never)).toBe(pending);
    expect(table.state.phase).toBe('SHOWDOWN');
    expect(table.handId).toBe(1);
    expect(table.lastChipSyncHand.get('p1')).toBe(1);
    expect(sync).toHaveBeenCalledWith('id1', 100, expect.objectContaining({
      won: true, gameId: 'settlement-test', handId: '1', potSize: 200,
    }));

    commitAward();
    await pending;
    expect(awardApplied).toBe(true);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(table.state.phase).toBe('ANTE');
    expect(table.handId).toBe(2);
    expect(table.lastChipSyncHand.get('p1')).toBe(2);
  });

  it('keeps the hand unresolved after a failed write so it can retry', async () => {
    const table = makeTable();
    const sync = vi.spyOn(storage, 'syncPlayerChips')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(undefined);

    await expect(reset(table as never)).rejects.toThrow('database unavailable');
    expect(table.state.phase).toBe('SHOWDOWN');
    expect(table.handId).toBe(1);
    expect(table.resolvedPot).toBe(200);

    await reset(table as never);
    expect(sync).toHaveBeenCalledTimes(4); // first seat committed, then retry both using the same hand ID
    expect(sync.mock.calls.map(([, , result]) => result?.handId)).toEqual(['1', '1', '1', '1']);
    expect(table.state.phase).toBe('ANTE');
    expect(table.handId).toBe(2);
  });
});

it('pays a Badugi sole survivor the entire net pot and starts the next hand with zero', async () => {
  const table = makeTable();
  table.state.players[0].totalBet = 50;
  table.state.players[1].totalBet = 200;
  table.state.players[1].status = 'folded';
  const netPot = 240; // Gross contributions are 250; settlement receives the post-rake pot.
  const result = BadugiMode.resolveShowdown!(table.state.players, netPot, '__server__');
  expect(result.players[0].chips).toBe(1100 + netPot);
  expect(result.players[0].isWinner).toBe(true);
  expect(result.pot).toBe(0);

  table.state = { ...table.state, players: result.players, pot: result.pot };
  vi.spyOn(storage, 'syncPlayerChips').mockResolvedValue(undefined);
  await resetBadugi(table as never);
  expect(table.state.phase).toBe('ANTE');
  expect(table.state.pot).toBe(0);
});

it('pays a Fifteen-35 sole survivor the entire net pot and carries nothing into the next hand', async () => {
  const table = makeTable();
  table.modeId = 'fifteen35';
  table.state.players[0].cards = [{ rank: '8', suit: 'clubs' }, { rank: '7', suit: 'diamonds' }];
  table.state.players[0].chips = 950;
  table.state.players[0].totalBet = 50;
  table.state.players[1].cards = [{ rank: '9', suit: 'spades' }, { rank: '4', suit: 'hearts' }];
  table.state.players[1].chips = 800;
  table.state.players[1].totalBet = 200;
  table.state.players[1].status = 'folded';
  const netPot = 240; // Contributions total 250; showdown receives the post-rake amount.
  const result = Fifteen35Mode.resolveShowdown!(table.state.players, netPot);
  expect(result.players[0].chips).toBe(950 + netPot);
  expect(result.players[0].isWinner).toBe(true);
  expect(result.players[1].chips).toBe(800);
  expect(result.players.reduce((sum, p) => sum + p.chips, 0)).toBe(2000 - 10);
  expect(result.pot).toBe(0);

  table.state = { ...table.state, players: result.players, pot: result.pot };
  table.resolvedPot = netPot;
  const sync = vi.spyOn(storage, 'syncPlayerChips').mockResolvedValue(undefined);
  await resetGeneric(table as never);
  expect(table.state.phase).toBe('ANTE');
  expect(table.state.pot).toBe(0);
  expect(sync).toHaveBeenCalledWith('id1', 190, expect.objectContaining({
    won: true, gameId: 'settlement-test', handId: '1', potSize: netPot,
  }));
});