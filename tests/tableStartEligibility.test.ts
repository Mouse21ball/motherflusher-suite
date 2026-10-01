import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { addBadugiConnection, getOrCreateBadugiTable, handleBadugiAction } from '../server/gameEngine';
import { addGenericConnection, getOrCreateTable, handleGenericAction } from '../server/genericEngine';
import { db } from '../server/db';
import { storage } from '../server/storage';
import { canStartNextHand, hasFundedHuman } from '../shared/tableStartEligibility';
import type { Player } from '../shared/gameTypes';

const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const socket = () => ({
  readyState: 1,
  send: vi.fn(),
  close: vi.fn(),
}) as any;

afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(db, 'insert').mockReturnValue({
    values: () => ({ onConflictDoUpdate: () => Promise.resolve() }),
  } as any);
});

describe('funded table hand-start eligibility', () => {
  it('ignores stale, inactive, and zero-stack human placeholders', () => {
    const placeholder = {
      id: 'p1', presence: 'human', status: 'active', chips: 10_000,
    } as Player;
    expect(hasFundedHuman([placeholder], new Set())).toBe(false);
    expect(canStartNextHand([placeholder], new Set())).toBe(false);
    expect(hasFundedHuman(
      [{ ...placeholder, chips: 0 }],
      new Set(['p1']),
    )).toBe(false);
    expect(hasFundedHuman(
      [{ ...placeholder, status: 'sitting_out' }],
      new Set(['p1']),
    )).toBe(false);
  });

  it('allows funded humans with active opponents and leaves in-hand all-ins eligible for actions', () => {
    const allIn = {
      id: 'p1', presence: 'human', status: 'active', chips: 0, bet: 50,
      totalBet: 50, cards: [], hasActed: false, isDealer: false, declaration: null,
    } as Player;
    const opponent = { ...allIn, id: 'p2', presence: 'bot', chips: 1_000, bet: 0, totalBet: 0 } as Player;
    expect(canStartNextHand([allIn, opponent], new Set(['p1']))).toBe(false);

    const tableId = id('all-in-action');
    const table = getOrCreateBadugiTable(tableId, true, false, { botsEnabled: false });
    table.fundedSeats.add('p1');
    table.state = {
      ...table.state,
      phase: 'BET_1',
      activePlayerId: 'p1',
      currentBet: 50,
      players: [allIn, opponent],
    };
    handleBadugiAction(tableId, 'p1', 'check', null);
    expect(table.state.messages.at(-1)?.text).toBe('You checked');
    expect(table.state.players.find(player => player.id === 'p1')?.status).toBe('active');
  });

  it.each([
    ['Badugi', id('badugi-start')],
    ['Dead 7', id('dead7-start')],
  ])('does not start a fresh table without a funded human (%s)', (mode, tableId) => {
    if (mode === 'Badugi') {
      const table = getOrCreateBadugiTable(tableId, true, false, { botsEnabled: false });
      expect(table.state.players.find(player => player.id === 'p1')).toMatchObject({
        presence: 'reserved',
        chips: 0,
        status: 'sitting_out',
      });
      expect(handleBadugiAction(tableId, 'p1', 'start', null)).toBe('Rebuy before starting a new hand.');
      expect(table.state.phase).toBe('WAITING');
      expect(table.handId).toBe(0);
    } else {
      const table = getOrCreateTable('dead7', tableId, true, false, { botsEnabled: false })!;
      table.connections.set('p1', socket());
      expect(table.state.players.find(player => player.id === 'p1')).toMatchObject({
        presence: 'reserved',
        chips: 0,
        status: 'sitting_out',
      });
      expect(handleGenericAction(tableId, 'p1', 'start', null)).toBe('Rebuy before starting a new hand.');
      expect(table.state.phase).toBe('WAITING');
      expect(table.handId).toBe(0);
    }
  });

  it.each([
    ['Badugi', id('funded-badugi-start')],
    ['Dead 7', id('funded-dead7-start')],
  ])('starts when a funded human and a second eligible player are present (%s)', (mode, tableId) => {
    if (mode === 'Badugi') {
      const table = getOrCreateBadugiTable(tableId, true, false, { botsEnabled: false });
      table.state = {
        ...table.state,
        players: table.state.players.map(player => player.id === 'p1'
          ? { ...player, presence: 'human', status: 'active', chips: 1_000 }
          : player.id === 'p2'
            ? { ...player, presence: 'bot', status: 'active', chips: 1_000 }
            : player),
      };
      table.fundedSeats.add('p1');
      handleBadugiAction(tableId, 'p1', 'start', null);
      expect(table.state.phase).toBe('ANTE');
      expect(table.handId).toBe(1);
    } else {
      const table = getOrCreateTable('dead7', tableId, true, false, { botsEnabled: false })!;
      table.connections.set('p1', socket());
      table.state = {
        ...table.state,
        players: table.state.players.map(player => player.id === 'p1'
          ? { ...player, presence: 'human', status: 'active', chips: 1_000 }
          : player.id === 'p2'
            ? { ...player, presence: 'bot', status: 'active', chips: 1_000 }
            : player),
      };
      table.fundedSeats.add('p1');
      handleGenericAction(tableId, 'p1', 'start', null);
      expect(table.state.phase).toBe('ANTE');
      expect(table.handId).toBe(1);
    }
  });

  it('rejects fresh zero-balance joins before they obtain an active human seat', async () => {
    vi.spyOn(storage, 'getOrCreatePlayer').mockResolvedValue({ chipBalance: 0 } as any);

    const badugiId = id('badugi-zero-join');
    const badugi = getOrCreateBadugiTable(badugiId, true, false, { botsEnabled: false });
    const badugiSocket = socket();
    await expect(addBadugiConnection(
      badugiId, id('badugi-session'), badugiSocket, 'Zero', true, false,
      id('badugi-identity'), { botsEnabled: false },
    )).resolves.toBeNull();
    expect(badugi.state.players.some(player => player.presence === 'human')).toBe(false);
    expect(badugi.fundedSeats.size).toBe(0);

    const genericId = id('dead7-zero-join');
    const generic = getOrCreateTable('dead7', genericId, true, false, { botsEnabled: false })!;
    const genericSocket = socket();
    await expect(addGenericConnection(
      genericId, 'dead7', id('dead7-session'), genericSocket, 'Zero', true, false,
      id('dead7-identity'), { botsEnabled: false },
    )).resolves.toBeNull();
    expect(generic.state.players.some(player => player.presence === 'human')).toBe(false);
    expect(generic.fundedSeats.size).toBe(0);
  });
});