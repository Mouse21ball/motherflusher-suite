import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { getBuyInBounds } from '../shared/stakeTiers';
import { storage } from '../server/storage';
import {
  addBadugiConnection,
  getOrCreateBadugiTable,
  handleBadugiAction,
  removeBadugiConnection,
} from '../server/gameEngine';
import {
  addGenericConnection,
  getOrCreateTable,
  handleGenericAction,
  removeGenericConnection,
} from '../server/genericEngine';

type Mode = 'badugi' | 'dead7';
let wallet = 30_000;
let appliedLeaves: Set<string>;

function mockWalletStorage() {
  appliedLeaves = new Set();
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
}

function makeSocket() {
  return { readyState: 1, send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
}

function getTable(mode: Mode, tableId: string): any {
  return mode === 'badugi'
    ? getOrCreateBadugiTable(tableId, true, false, { maxPlayers: 5, botsEnabled: false })
    : getOrCreateTable('dead7', tableId, true, false, { maxPlayers: 5, botsEnabled: false });
}

async function join(mode: Mode, tableId: string, sessionId: string, buyinChips?: number) {
  const ws = makeSocket();
  const identityId = `identity-${tableId}`;
  const seat = mode === 'badugi'
    ? await addBadugiConnection(tableId, sessionId, ws, 'Tester', true, false, identityId, { maxPlayers: 5, botsEnabled: false }, buyinChips)
    : await addGenericConnection(tableId, 'dead7', sessionId, ws, 'Tester', true, false, identityId, { maxPlayers: 5, botsEnabled: false }, buyinChips);
  return { seat, ws, identityId, table: getTable(mode, tableId) };
}

function leave(mode: Mode, tableId: string, sessionId: string) {
  return mode === 'badugi'
    ? removeBadugiConnection(tableId, sessionId, true)
    : removeGenericConnection(tableId, sessionId, true);
}

afterEach(() => vi.restoreAllMocks());

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