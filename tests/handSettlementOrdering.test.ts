import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState, Player } from '../shared/gameTypes';
import { storage } from '../server/storage';
import { resetToAnte as resetGeneric } from '../server/genericEngine';
import { resetToAnte as resetBadugi } from '../server/gameEngine';

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
    seatToIdentityId: new Map([['p1', 'id1'], ['p2', 'id2']]),
    chipsAtHandStart: new Map([['p1', 1000], ['p2', 1000]]),
    lastChipSyncHand: new Map([['p1', 1], ['p2', 1]]),
    sessionStats: new Map(), botTimers: new Map(),
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