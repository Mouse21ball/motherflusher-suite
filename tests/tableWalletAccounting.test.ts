import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { getBuyInBounds } from '../shared/stakeTiers';
import { storage } from '../server/storage';
import {
  addBadugiConnection,
  getOrCreateBadugiTable,
  handleBadugiAction,
  rebuyBadugiSeat,
  removeBadugiConnection,
} from '../server/gameEngine';
import {
  addGenericConnection,
  getOrCreateTable,
  handleGenericAction,
  rebuyGenericSeat,
  removeGenericConnection,
} from '../server/genericEngine';

type Mode = 'badugi' | 'dead7' | 'flushed_up';
let wallet = 30_000;
let appliedLeaves: Set<string>;
let appliedFreeRebuys: Set<string>;
let appliedTableLoans: Set<string>;

function mockWalletStorage() {
  appliedLeaves = new Set();
  appliedFreeRebuys = new Set();
  appliedTableLoans = new Set();
  vi.spyOn(storage, 'getOrCreatePlayer').mockImplementation(async () => ({
    chipBalance: wallet,
    activeSubscriptionTier: null,
  } as any));
  vi.spyOn(storage, 'getPlayerProfile').mockImplementation(async () => ({
    chipBalance: wallet,
    activeSubscriptionTier: null,
  } as any));
  vi.spyOn(storage, 'setPlayerActiveTable').mockResolvedValue();
  vi.spyOn(storage, 'clearPlayerActiveTable').mockResolvedValue();
  vi.spyOn(storage, 'syncPlayerChips').mockImplementation(async (_id, delta) => {
    wallet += delta;
  });
  vi.spyOn(storage, 'syncPlayerLeaveDelta').mockImplementation(async (_id, _gameId, leaveId, delta) => {
    if (appliedLeaves.has(leaveId)) return;
    appliedLeaves.add(leaveId);
    wallet += delta;
  });
  vi.spyOn(storage, 'claimFreeTableRebuy').mockImplementation(async (_id, gameId, bustEventId) => {
    const key = `${_id}:${gameId}:${bustEventId}`;
    if (appliedFreeRebuys.has(key)) return { granted: false, chipBalance: wallet };
    appliedFreeRebuys.add(key);
    wallet += 1000;
    return { granted: true, chipBalance: wallet };
  });
  vi.spyOn(storage, 'grantTableChipLoan').mockImplementation(async (_id, gameId, requestId) => {
    const key = `${_id}:${gameId}:${requestId}`;
    if (appliedTableLoans.has(key)) return { success: true, newBalance: wallet };
    if (wallet > 500) return { success: false, error: 'not_broke' };
    appliedTableLoans.add(key);
    wallet += 1000;
    return { success: true, newBalance: wallet };
  });
}

function makeSocket() {
  return { readyState: 1, send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
}

function getTable(
  mode: Mode,
  tableId: string,
  stakeTier: 'low' | 'high' = 'low',
  botsEnabled = false,
  isPrivate = true,
): any {
  return mode === 'badugi'
    ? getOrCreateBadugiTable(tableId, isPrivate, false, { maxPlayers: 5, botsEnabled, stakeTier })
    : getOrCreateTable(mode, tableId, isPrivate, false, { maxPlayers: 5, botsEnabled, stakeTier });
}

async function join(
  mode: Mode,
  tableId: string,
  sessionId: string,
  buyinChips?: number,
  stakeTier: 'low' | 'high' = 'low',
  botsEnabled = false,
  identityId = `identity-${tableId}`,
  isPrivate = true,
) {
  const ws = makeSocket();
  const settings = { maxPlayers: 5, botsEnabled, stakeTier };
  const seat = mode === 'badugi'
    ? await addBadugiConnection(tableId, sessionId, ws, 'Tester', isPrivate, false, identityId, settings, buyinChips)
    : await addGenericConnection(tableId, mode, sessionId, ws, 'Tester', isPrivate, false, identityId, settings, buyinChips);
  return { seat, ws, identityId, table: getTable(mode, tableId, stakeTier, botsEnabled, isPrivate) };
}

function markBusted(table: any, seat: string) {
  table.state = {
    ...table.state,
    phase: 'WAITING',
    activePlayerId: null,
    players: table.state.players.map((player: any) => player.id === seat
      ? { ...player, chips: 0, status: 'sitting_out' }
      : player),
  };
}

function requestRebuy(mode: Mode, tableId: string, seat: string, identityId: string, requestId: string, kind: 'free' | 'reserve' | 'borrow', amount?: number) {
  return mode === 'badugi'
    ? rebuyBadugiSeat(tableId, seat, identityId, requestId, kind, amount)
    : rebuyGenericSeat(mode, tableId, seat, identityId, requestId, kind, amount);
}

function leave(mode: Mode, tableId: string, sessionId: string) {
  return mode === 'badugi'
    ? removeBadugiConnection(tableId, sessionId, true)
    : removeGenericConnection(tableId, sessionId, true);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each<Mode>(['badugi', 'dead7'])('%s wallet funding and intentional leave', mode => {
  it('allocates a partial p1 stack without debiting/refunding principal', async () => {
    wallet = 30_000;
    mockWalletStorage();
    const tableId = `${mode}-partial-${Math.random().toString(36).slice(2, 8)}`;
    const table = getTable(mode, tableId);
    const { minBuyin } = getBuyInBounds(table.state.minBet);
    const requested = minBuyin * 2;
    const sessionId = `session-${tableId}`;
    const joined = await join(mode, tableId, sessionId, requested);

    expect(joined.seat).toBe('p1');
    expect(table.state.players.find((p: any) => p.id === 'p1')?.chips).toBe(requested);
    expect(table.seatBankroll.get('p1')).toBe(wallet - requested);
    expect(wallet).toBe(30_000);
    await leave(mode, tableId, sessionId);
    expect(wallet).toBe(30_000);
    expect(storage.syncPlayerLeaveDelta).toHaveBeenCalledWith(
      joined.identityId, tableId, expect.any(String), 0,
    );
  });

  it('uses the full stack cap when no partial amount is requested', async () => {
    wallet = 30_000;
    mockWalletStorage();
    const tableId = `${mode}-full-${Math.random().toString(36).slice(2, 8)}`;
    const table = getTable(mode, tableId);
    const { maxBuyin } = getBuyInBounds(table.state.minBet);
    const sessionId = `session-${tableId}`;
    await join(mode, tableId, sessionId);

    expect(table.state.players.find((p: any) => p.id === 'p1')?.chips).toBe(Math.min(wallet, maxBuyin));
    await leave(mode, tableId, sessionId);
    expect(wallet).toBe(30_000);
  });

  it('caps an untrusted requested stack at the live wallet total', async () => {
    wallet = 1_000;
    mockWalletStorage();
    const tableId = `${mode}-cap-${Math.random().toString(36).slice(2, 8)}`;
    const table = getTable(mode, tableId);
    const sessionId = `session-${tableId}`;
    const joined = await join(mode, tableId, sessionId, 1_000_000);

    expect(joined.seat).toBe('p1');
    expect(table.state.players.find((p: any) => p.id === 'p1')?.chips).toBe(1_000);
    expect(table.seatBankroll.get('p1')).toBe(0);
    await leave(mode, tableId, sessionId);
    expect(wallet).toBe(1_000);
  });

  it('preserves external wallet credits while syncing only the unsaved table delta', async () => {
    wallet = 30_000;
    mockWalletStorage();
    const tableId = `${mode}-credit-${Math.random().toString(36).slice(2, 8)}`;
    const sessionId = `session-${tableId}`;
    const joined = await join(mode, tableId, sessionId, 2_000);
    wallet += 1_000;
    joined.table.state = {
      ...joined.table.state,
      phase: 'BETTING',
      players: joined.table.state.players.map((p: any) => p.id === 'p1' ? { ...p, chips: p.chips - 150 } : p),
    };

    await leave(mode, tableId, sessionId);
    expect(wallet).toBe(30_850);
    expect(storage.syncPlayerLeaveDelta).toHaveBeenCalledWith(
      joined.identityId, tableId, expect.any(String), -150,
    );
  });

  it('persists mid-hand losses even when handId matches and makes no later writes', async () => {
    wallet = 30_000;
    mockWalletStorage();
    const tableId = `${mode}-midhand-${Math.random().toString(36).slice(2, 8)}`;
    const sessionId = `session-${tableId}`;
    const joined = await join(mode, tableId, sessionId);
    const table = joined.table;
    table.state = {
      ...table.state,
      phase: 'BETTING',
      players: table.state.players.map((p: any) => p.id === 'p1' ? { ...p, chips: p.chips - 100 } : p),
    };
    expect(table.lastChipSyncHand.get('p1')).toBe(table.handId);

    await leave(mode, tableId, sessionId);
    expect(storage.syncPlayerLeaveDelta).toHaveBeenCalledWith(
      joined.identityId, tableId, expect.any(String), -100,
    );
    expect(wallet).toBe(29_900);
    expect(table.seatToIdentityId.has('p1')).toBe(false);
    table.state = {
      ...table.state,
      players: table.state.players.map((p: any) => p.id === 'p1' ? { ...p, chips: p.chips + 500 } : p),
    };
    await leave(mode, tableId, sessionId);
    expect(storage.syncPlayerLeaveDelta).toHaveBeenCalledTimes(1);
    expect(wallet).toBe(29_900);
  });

  it('serializes duplicate leaves and retries safely after persistence failure', async () => {
    wallet = 30_000;
    mockWalletStorage();
    const tableId = `${mode}-retry-${Math.random().toString(36).slice(2, 8)}`;
    const sessionId = `session-${tableId}`;
    const joined = await join(mode, tableId, sessionId);
    const table = joined.table;
    table.state = {
      ...table.state,
      phase: 'BETTING',
      players: table.state.players.map((p: any) => p.id === 'p1' ? { ...p, chips: p.chips - 50 } : p),
    };
    vi.mocked(storage.syncPlayerLeaveDelta).mockRejectedValueOnce(new Error('temporary database failure'));

    await expect(leave(mode, tableId, sessionId)).rejects.toThrow('temporary database failure');
    expect(table.sessionToSeat.get(sessionId)).toBe('p1');
    await Promise.resolve();
    await Promise.all([leave(mode, tableId, sessionId), leave(mode, tableId, sessionId)]);
    expect(wallet).toBe(29_950);
    const successfulWrites = vi.mocked(storage.syncPlayerLeaveDelta).mock.calls.length;
    await leave(mode, tableId, sessionId);
    expect(vi.mocked(storage.syncPlayerLeaveDelta).mock.calls.length).toBe(successfulWrites);
  });

  it('blocks actions and withholds init until canonical funding resolves', async () => {
    wallet = 30_000;
    mockWalletStorage();
    let finishFunding!: (profile: any) => void;
    vi.mocked(storage.getOrCreatePlayer).mockImplementationOnce(() => new Promise(resolve => {
      finishFunding = resolve;
    }));
    const tableId = `${mode}-pending-${Math.random().toString(36).slice(2, 8)}`;
    const table = getTable(mode, tableId);
    const ws = makeSocket();
    const identityId = `identity-${tableId}`;
    const sessionId = `session-${tableId}`;
    const joinPromise = mode === 'badugi'
      ? addBadugiConnection(tableId, sessionId, ws, 'Tester', true, false, identityId, { botsEnabled: false }, 2_000)
      : addGenericConnection(tableId, 'dead7', sessionId, ws, 'Tester', true, false, identityId, { botsEnabled: false }, 2_000);

    expect(ws.send).not.toHaveBeenCalledWith(expect.stringContaining(':init'));
    const actionResult = mode === 'badugi'
      ? handleBadugiAction(tableId, 'p1', 'start', null)
      : handleGenericAction(tableId, 'p1', 'start', null);
    expect(actionResult).toBe('Wallet funding is still in progress.');
    finishFunding({ chipBalance: wallet, activeSubscriptionTier: null });
    await joinPromise;
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining(':init'));
    await leave(mode, tableId, sessionId);
  });

  it('rejects a seated join without a verified identity before wallet access', async () => {
    wallet = 30_000;
    mockWalletStorage();
    const tableId = `${mode}-no-identity-${Math.random().toString(36).slice(2, 8)}`;
    const table = getTable(mode, tableId);
    const ws = makeSocket();
    const seat = mode === 'badugi'
      ? await addBadugiConnection(tableId, 'unauthenticated-session', ws, 'Tester', true, false, undefined, { botsEnabled: false })
      : await addGenericConnection(tableId, 'dead7', 'unauthenticated-session', ws, 'Tester', true, false, undefined, { botsEnabled: false });

    expect(seat).toBeNull();
    expect(storage.getOrCreatePlayer).not.toHaveBeenCalled();
    expect(table.humanSeats.size).toBe(0);
    expect(ws.send).not.toHaveBeenCalledWith(expect.stringContaining(':init'));
  });

  it('shares pending funding across takeover and initializes only the current connection', async () => {
    wallet = 30_000;
    mockWalletStorage();
    let finishFunding!: (profile: any) => void;
    vi.mocked(storage.getOrCreatePlayer).mockImplementationOnce(() => new Promise(resolve => {
      finishFunding = resolve;
    }));
    const tableId = `${mode}-takeover-${Math.random().toString(36).slice(2, 8)}`;
    const table = getTable(mode, tableId);
    const identityId = `identity-${tableId}`;
    const firstWs = makeSocket();
    const secondWs = makeSocket();
    const firstJoin = mode === 'badugi'
      ? addBadugiConnection(tableId, 'first-session', firstWs, 'Tester', true, false, identityId, { botsEnabled: false }, 2_000)
      : addGenericConnection(tableId, 'dead7', 'first-session', firstWs, 'Tester', true, false, identityId, { botsEnabled: false }, 2_000);
    const secondJoin = mode === 'badugi'
      ? addBadugiConnection(tableId, 'takeover-session', secondWs, 'Tester', true, false, identityId, { botsEnabled: false }, 2_000)
      : addGenericConnection(tableId, 'dead7', 'takeover-session', secondWs, 'Tester', true, false, identityId, { botsEnabled: false }, 2_000);

    expect(storage.getOrCreatePlayer).toHaveBeenCalledTimes(1);
    expect(table.pendingFundingSeats.has('p1')).toBe(true);
    expect(secondWs.send).not.toHaveBeenCalledWith(expect.stringContaining(':init'));

    finishFunding({ chipBalance: wallet, activeSubscriptionTier: null });
    const [firstSeat, secondSeat] = await Promise.all([firstJoin, secondJoin]);

    expect(firstSeat).toBeNull();
    expect(secondSeat).toBe('p1');
    expect(table.state.players.find((p: any) => p.id === 'p1')?.chips).toBe(2_000);
    expect(table.fundedSeats.has('p1')).toBe(true);
    expect(table.pendingFundingSeats.has('p1')).toBe(false);
    expect(firstWs.send).not.toHaveBeenCalledWith(expect.stringContaining(':init'));
    expect(secondWs.send).toHaveBeenCalledWith(expect.stringContaining(':init'));
    await leave(mode, tableId, 'takeover-session');
  });

  it('keeps a failed atomic leave retryable without a second active-table clear', async () => {
    wallet = 30_000;
    mockWalletStorage();
    const tableId = `${mode}-atomic-leave-${Math.random().toString(36).slice(2, 8)}`;
    const sessionId = `session-${tableId}`;
    const joined = await join(mode, tableId, sessionId);
    const table = joined.table;
    table.state = {
      ...table.state,
      phase: 'BETTING',
      players: table.state.players.map((p: any) => p.id === 'p1' ? { ...p, chips: p.chips - 100 } : p),
    };
    vi.mocked(storage.syncPlayerLeaveDelta).mockRejectedValueOnce(new Error('atomic leave transaction failed'));

    await expect(leave(mode, tableId, sessionId)).rejects.toThrow('atomic leave transaction failed');
    expect(wallet).toBe(30_000);
    expect(table.sessionToSeat.get(sessionId)).toBe('p1');
    expect(table.seatToIdentityId.get('p1')).toBe(joined.identityId);
    expect(storage.clearPlayerActiveTable).not.toHaveBeenCalled();

    await leave(mode, tableId, sessionId);
    expect(wallet).toBe(29_900);
    expect(storage.syncPlayerLeaveDelta).toHaveBeenCalledTimes(2);
    expect(storage.clearPlayerActiveTable).not.toHaveBeenCalled();
    expect(table.seatToIdentityId.has('p1')).toBe(false);
  });
});

describe.each<Mode>(['badugi', 'dead7'])('%s showdown/leave ordering', mode => {
  it('waits for showdown resolution before persisting or acknowledging leave', async () => {
    wallet = 30_000;
    mockWalletStorage();
    const tableId = `${mode}-showdown-${Math.random().toString(36).slice(2, 8)}`;
    const sessionId = `session-${tableId}`;
    const joined = await join(mode, tableId, sessionId);
    const table = joined.table;
    let finishResolution!: () => void;
    table.state = { ...table.state, phase: 'SHOWDOWN', pot: 0 };
    table.showdownResolvePromise = new Promise<void>(resolve => { finishResolution = resolve; });

    let complete = false;
    const leavePromise = leave(mode, tableId, sessionId).then(() => { complete = true; });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(complete).toBe(false);
    expect(storage.syncPlayerLeaveDelta).not.toHaveBeenCalled();

    finishResolution();
    await leavePromise;
    expect(complete).toBe(true);
    expect(storage.syncPlayerLeaveDelta).toHaveBeenCalledTimes(1);
  });
});

describe.each<Mode>(['badugi', 'dead7'])('%s confirmed bust rebuys', mode => {
  it('transfers only the latest persisted reserve and adds no phantom settlement profit', async () => {
    wallet = 1_000;
    mockWalletStorage();
    const tableId = `${mode}-reserve-rebuy-${Math.random().toString(36).slice(2, 8)}`;
    const sessionId = `session-${tableId}`;
    const joined = await join(mode, tableId, sessionId, 1_000);
    expect(joined.table.seatBankroll.get(joined.seat!)).toBe(0);

    // This out-of-band credit happened after the seat's cached reserve snapshot.
    wallet += 2_000;
    markBusted(joined.table, joined.seat!);
    const result = await requestRebuy(mode, tableId, joined.seat!, joined.identityId, 'reserve-request-0001', 'reserve', 2_000);

    expect(result.chips).toBe(2_000);
    expect(joined.table.state.players.find((player: any) => player.id === joined.seat)?.chips).toBe(2_000);
    expect(joined.table.chipsAtHandStart.get(joined.seat!)).toBe(3_000);
    expect(joined.table.seatBankroll.get(joined.seat!)).toBe(0);
    expect(wallet).toBe(3_000);
    expect(await requestRebuy(mode, tableId, joined.seat!, joined.identityId, 'reserve-request-0001', 'reserve', 2_000)).toEqual(result);
    expect(joined.table.state.players.find((player: any) => player.id === joined.seat)?.chips).toBe(2_000);

    await leave(mode, tableId, sessionId);
    // The original 1,000-stack bust was a 1,000 loss; the 2,000 reserve transfer
    // itself contributes zero profit when the 2,000 table stack settles.
    expect(wallet).toBe(2_000);
  });

  it('grants a free 1,000 stack below the table minimum only once per hand event', async () => {
    wallet = 30_000;
    mockWalletStorage();
    const tableId = `${mode}-free-rebuy-${Math.random().toString(36).slice(2, 8)}`;
    const sessionId = `session-${tableId}`;
    const minimum = getBuyInBounds(1_000).minBuyin;
    const joined = await join(mode, tableId, sessionId, minimum, 'high');
    expect(minimum).toBe(20_000);
    markBusted(joined.table, joined.seat!);

    const result = await requestRebuy(mode, tableId, joined.seat!, joined.identityId, 'free-request-0001', 'free');
    expect(result.chips).toBe(1_000);
    expect(result.chips).toBeLessThan(minimum);
    expect(joined.table.chipsAtHandStart.get(joined.seat!)).toBe(minimum + 1_000);
    expect(wallet).toBe(31_000);
    expect(await requestRebuy(mode, tableId, joined.seat!, joined.identityId, 'free-request-0001', 'free')).toEqual(result);
    expect(storage.claimFreeTableRebuy).toHaveBeenCalledTimes(1);

    // A distinct request ID cannot mint a second grant for the same table/hand/seat.
    markBusted(joined.table, joined.seat!);
    await expect(requestRebuy(mode, tableId, joined.seat!, joined.identityId, 'free-request-0002', 'free'))
      .rejects.toThrow('already been used');
    expect(wallet).toBe(31_000);
    expect(joined.table.state.players.find((player: any) => player.id === joined.seat)?.chips).toBe(0);
  });
});

describe.each<Mode>(['badugi', 'dead7'])('%s atomic table loan', mode => {
  it('credits the exact borrowed 1,000 chips to high-stakes tables below the buy-in minimum', async () => {
    wallet = 400;
    mockWalletStorage();
    const tableId = `${mode}-borrow-high-${Math.random().toString(36).slice(2, 8)}`;
    const joined = await join(mode, tableId, `session-${tableId}`, undefined, 'high');
    expect(joined.table.state.minBet).toBe(1_000);
    markBusted(joined.table, joined.seat!);

    const result = await requestRebuy(
      mode, tableId, joined.seat!, joined.identityId, 'borrow-request-0001', 'borrow', 1_000,
    );

    expect(result).toEqual({ chips: 1_000, walletBalance: 1_400 });
    expect(joined.table.state.players.find((player: any) => player.id === joined.seat)?.chips).toBe(1_000);
    expect(joined.table.chipsAtHandStart.get(joined.seat!)).toBe(1_400);
    expect(joined.table.seatBankroll.get(joined.seat!)).toBe(0);
    expect(wallet).toBe(1_400);
    expect(storage.grantTableChipLoan).toHaveBeenCalledOnce();
  });

  it('rejects arbitrary borrow amounts without requesting a loan or changing the stack', async () => {
    wallet = 400;
    mockWalletStorage();
    const tableId = `${mode}-borrow-fixed-${Math.random().toString(36).slice(2, 8)}`;
    const joined = await join(mode, tableId, `session-${tableId}`);
    markBusted(joined.table, joined.seat!);

    await expect(requestRebuy(
      mode, tableId, joined.seat!, joined.identityId, 'borrow-request-0002', 'borrow', 2_000,
    )).rejects.toThrow('Borrowing always adds exactly 1,000 chips.');

    expect(storage.grantTableChipLoan).not.toHaveBeenCalled();
    expect(wallet).toBe(400);
    expect(joined.table.state.players.find((player: any) => player.id === joined.seat)?.chips).toBe(0);
  });
});

describe.each([
  { mode: 'badugi' as const, autoStartAfterMs: 10_000 },
  { mode: 'flushed_up' as const, autoStartAfterMs: 13_000 },
])('$mode free rebuy and queued auto-start ordering', ({ mode, autoStartAfterMs }) => {
  it('defers auto-start during a durable free grant and credits exactly one stack', async () => {
    wallet = 30_000;
    mockWalletStorage();
    vi.useFakeTimers();
    const tableId = `${mode}-delayed-free-${Math.random().toString(36).slice(2, 8)}`;
    const first = await join(mode, tableId, `first-${tableId}`, undefined, 'low', true, `identity-${tableId}`, false);
    const second = await join(mode, tableId, `second-${tableId}`, undefined, 'low', true, `identity-${tableId}-second`, false);
    expect(first.seat).toBe('p1');
    expect(second.seat).toBe('p2');
    markBusted(first.table, first.seat!);

    let resolveGrant!: (result: { granted: boolean; chipBalance: number }) => void;
    let signalGrantStarted!: () => void;
    const grantStarted = new Promise<void>(resolve => { signalGrantStarted = resolve; });
    const delayedGrant = new Promise<{ granted: boolean; chipBalance: number }>(resolve => {
      resolveGrant = resolve;
    });
    let grantCalls = 0;
    vi.mocked(storage.claimFreeTableRebuy).mockImplementation(async () => {
      grantCalls++;
      signalGrantStarted();
      return delayedGrant;
    });

    const rebuyPromise = requestRebuy(
      mode, tableId, first.seat!, first.identityId, 'delayed-free-request-0001', 'free',
    );
    await grantStarted;
    expect(first.table.actionLock).toBe(true);

    // Fire the already-queued auto-start while the durable wallet grant is pending.
    await vi.advanceTimersByTimeAsync(autoStartAfterMs);
    expect(first.table.handId).toBe(0);
    expect(first.table.state.phase).toBe('WAITING');

    wallet += 1_000;
    resolveGrant({ granted: true, chipBalance: wallet });
    await expect(rebuyPromise).resolves.toMatchObject({ chips: 1_000, walletBalance: 31_000 });
    expect(grantCalls).toBe(1);
    expect(wallet).toBe(31_000);

    // The bounded rearm starts the queued hand after the grant/stack transaction releases its lock.
    await vi.advanceTimersByTimeAsync(100);
    expect(first.table.handId).toBe(1);
    expect(first.table.state.players.find((player: any) => player.id === first.seat)?.chips).toBe(1_000);
    expect(grantCalls).toBe(1);
    expect(wallet).toBe(31_000);
  });
});