import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Player } from '../shared/gameTypes';
import { actionableBettingPlayerId } from '../shared/engine/bettingTurns';
import { addBadugiConnection, getOrCreateBadugiTable, handleBadugiAction, hasBadugiRewardedAdBust } from '../server/gameEngine';
import { addGenericConnection, getOrCreateTable, handleGenericAction, hasGenericRewardedAdBust } from '../server/genericEngine';
import { storage } from '../server/storage';
import { db } from '../server/db';

const modes = ['badugi', 'flushed_up', 'box_chevy'] as const;
const cards = [
  { rank: 'A', suit: 'spades', isHidden: false },
  { rank: '2', suit: 'hearts', isHidden: false },
  { rank: '3', suit: 'clubs', isHidden: false },
  { rank: '4', suit: 'diamonds', isHidden: false },
] as Player['cards'];
const player = (id: string, chips = 0): Player => ({
  id, name: id, chips, cards, status: 'active', presence: 'human', bet: 50,
  totalBet: 50, isDealer: id === 'p2', hasActed: false, declaration: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(db, 'insert').mockReturnValue({
    values: () => ({ onConflictDoUpdate: () => Promise.resolve() }),
  } as any);
  vi.spyOn(storage, 'getOrCreatePlayer').mockResolvedValue({ chipBalance: 1000 } as any);
  vi.spyOn(storage, 'setPlayerActiveTable').mockResolvedValue();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function tableFor(mode: typeof modes[number]) {
  const tableId = `instant-all-in-${mode}-${randomUUID()}`;
  const table: any = mode === 'badugi'
    ? getOrCreateBadugiTable(tableId, true, false, { botsEnabled: false })
    : getOrCreateTable(mode, tableId, true, false, { botsEnabled: false })!;
  table.state = { ...table.state, phase: 'BET_1', activePlayerId: 'p1',
    currentBet: 50, pot: 100, players: [player('p1'), player('p2')] };
  table.humanSeats.add('p1');
  table.fundedSeats.add('p1');
  table.sessionToSeat.set('reconnect', 'p1');
  table.seatToIdentityId.set('p1', 'identity');
  table.chipsAtHandStart.set('p1', 1000);
  table.connections.set('p1', { readyState: 1, send: vi.fn(), close: vi.fn() });
  return { tableId, table };
}

async function reconnect(mode: typeof modes[number], tableId: string) {
  const socket = { readyState: 1, send: vi.fn(), close: vi.fn() } as any;
  if (mode === 'badugi') await addBadugiConnection(tableId, 'reconnect', socket, 'p1', true, false, 'identity');
  else await addGenericConnection(tableId, mode, 'reconnect', socket, 'p1', true, false, 'identity');
  return socket;
}

describe('actionable betting cursor', () => {
  it('skips all-ins, folded seats, and finished seats but retains an outstanding caller', () => {
    const players = [player('p1'), { ...player('p2', 100), status: 'folded' as const },
      { ...player('p3', 100), hasActed: true }, { ...player('p4', 100), hasActed: true, bet: 20 }];
    expect(actionableBettingPlayerId(players, 50, 'p1')).toBe('p4');
    expect(actionableBettingPlayerId(players.slice(0, 3), 50, 'p1')).toBeNull();
  });
});

describe.each(modes)('%s instant all-in betting skip', mode => {
  it('allows rewarded ads only for a connected, funded, settled bust, never for all-ins or spectators', () => {
    const { tableId, table } = tableFor(mode);
    const eligible = () => mode === 'badugi'
      ? hasBadugiRewardedAdBust(tableId, 'identity')
      : hasGenericRewardedAdBust(mode, tableId, 'identity');
    expect(eligible()).toBe(false); // zero-chip all-in is still an active hand
    table.state.phase = 'WAITING';
    table.state.players[0].status = 'sitting_out';
    expect(eligible()).toBe(true);
    table.fundedSeats.delete('p1');
    expect(eligible()).toBe(false);
    table.fundedSeats.add('p1');
    table.pendingFundingSeats.add('p1');
    expect(eligible()).toBe(false);
    table.pendingFundingSeats.delete('p1');
    table.connections.delete('p1');
    expect(eligible()).toBe(false);
  });

  it('reconnects an all-in betting cursor directly into the next phase without advancing the clock', async () => {
    const { tableId, table } = tableFor(mode);
    const before = Date.now();
    const socket = await reconnect(mode, tableId);
    expect(Date.now()).toBe(before);
    expect(table.state.phase).not.toBe('BET_1');
    expect(table.state.players.every((p: Player) => p.status === 'active')).toBe(true);
    expect(table.state.pot).toBe(100);
    const snapshots = socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw));
    expect(snapshots.some((message: any) => message.type.endsWith(':snapshot') && message.state.phase !== 'BET_1')).toBe(true);
  });

  it('passes the all-in cursor immediately to a funded player who still owes a call', async () => {
    const { tableId, table } = tableFor(mode);
    table.state.players[1] = { ...player('p2', 100), bet: 20, hasActed: true };
    await reconnect(mode, tableId);
    expect(table.state.phase).toBe('BET_1');
    expect(table.state.activePlayerId).toBe('p2');
    expect(table.state.turnDeadline).toBe(Date.now() + 30_000);
    expect(table.state.players[0]).toMatchObject({ chips: 0, status: 'active', bet: 50, totalBet: 50 });
  });

  it('advances immediately when the last funded player calls all-in, with no animation or timeout wait', () => {
    const { tableId, table } = tableFor(mode);
    table.state.players[0] = { ...player('p1', 25), bet: 25, totalBet: 25 };
    table.state.players[1].hasActed = true;
    const before = Date.now();
    if (mode === 'badugi') handleBadugiAction(tableId, 'p1', 'call', null);
    else handleGenericAction(tableId, 'p1', 'call', null);
    expect(Date.now()).toBe(before);
    expect(table.state.phase).not.toBe('BET_1');
    expect(table.state.players[0]).toMatchObject({ chips: 0, status: 'active', totalBet: 50 });
    expect(table.state.pot).toBe(125);
  });

  it('times out the actual outstanding caller, never the skipped all-in seat', async () => {
    const { tableId, table } = tableFor(mode);
    table.state.players[1] = { ...player('p2', 100), bet: 20, hasActed: true };
    table.state.players.push(player('p3', 100));
    await reconnect(mode, tableId);
    vi.advanceTimersByTime(30_000);
    expect(table.state.players[0].status).toBe('active');
    expect(table.state.players[1].status).toBe('folded');
    expect(table.state.activePlayerId).toBe('p3');
    expect(table.state.turnDeadline).toBe(Date.now() + 30_000);
  });
});

describe('Badugi mandatory all-in actions', () => {
  it('skips the empty betting round immediately on entry but still requires the next draw', () => {
    const { tableId, table } = tableFor('badugi');
    table.state.phase = 'DRAW_1';
    table.state.players[1].hasActed = true;
    handleBadugiAction(tableId, 'p1', 'draw', []);
    vi.advanceTimersByTime(350); // existing draw completion animation delay only
    expect(table.state.phase).toBe('DRAW_2');
    expect(table.state.activePlayerId).toBe('p1');
    expect(table.state.turnDeadline).toBe(Date.now() + 30_000);
    expect(table.state.players[0].hasActed).toBe(false);
    handleBadugiAction(tableId, 'p1', 'draw', []);
    expect(table.state.players[0].hasActed).toBe(true);
    expect(table.state.phase).toBe('DRAW_2');
  });

  it('still gives an all-in player a required declaration turn', async () => {
    const { tableId, table } = tableFor('badugi');
    table.state.phase = 'DECLARE';
    await reconnect('badugi', tableId);
    expect(table.state.phase).toBe('DECLARE');
    expect(table.state.turnDeadline).toBe(Date.now() + 30_000);
    handleBadugiAction(tableId, 'p1', 'declare', { declaration: 'HIGH' });
    expect(table.state.players[0].declaration).toBe('HIGH');
  });
});

it.each([
  ['box_chevy', 'DECLARE'], ['flushed_up', 'DRAW_1'],
] as const)('%s retains the all-in player in mandatory %s rather than skipping the phase', async (mode, phase) => {
  const { tableId, table } = tableFor(mode);
  table.state.phase = phase;
  await reconnect(mode, tableId);
  expect(table.state.phase).toBe(phase);
  expect(table.state.activePlayerId).toBe('p1');
  expect(table.state.players[0].hasActed).toBe(false);
  expect(table.state.turnDeadline).toBe(Date.now() + 30_000);
});