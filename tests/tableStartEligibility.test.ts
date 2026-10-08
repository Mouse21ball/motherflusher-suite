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

  it.each(['fold', 'check', 'call', 'raise'] as const)(
    'rejects a zero-stack Badugi betting action (%s) while keeping the all-in in the hand',
    (action) => {
      const allIn = {
        id: 'p1', presence: 'human', status: 'active', chips: 0, bet: 50,
        totalBet: 50, cards: [], hasActed: false, isDealer: false, declaration: null,
      } as Player;
      const opponent = {
        ...allIn, id: 'p2', presence: 'human', chips: 1_000, bet: 50, totalBet: 50, hasActed: false,
      } as Player;
      expect(canStartNextHand([allIn, opponent], new Set(['p1']))).toBe(false);

      const tableId = id(`badugi-all-in-${action}`);
      const table = getOrCreateBadugiTable(tableId, true, false, { botsEnabled: false });
      table.fundedSeats.add('p1');
      table.state = {
        ...table.state,
        phase: 'BET_1',
        activePlayerId: 'p1',
        currentBet: 50,
        players: [allIn, opponent],
      };
      const messageCount = table.state.messages.length;

      handleBadugiAction(tableId, 'p1', action, action === 'raise' ? 100 : null);

      expect(table.state.messages).toHaveLength(messageCount);
      expect(table.state.players.find(player => player.id === 'p1')).toMatchObject({
        chips: 0,
        status: 'active',
        hasActed: true,
        bet: 50,
      });
      expect(table.state.activePlayerId).toBe('p2');
    },
  );

  it.each(['fold', 'check', 'call', 'raise'] as const)(
    'rejects a zero-stack Box Chevy betting action (%s) while keeping the all-in in the hand',
    (action) => {
      const allIn = {
        id: 'p1', presence: 'human', status: 'active', chips: 0, bet: 50,
        totalBet: 50, cards: [], hasActed: false, isDealer: false, declaration: null,
      } as Player;
      const opponent = {
        ...allIn, id: 'p2', chips: 1_000, bet: 50, totalBet: 50, hasActed: false,
      } as Player;
      const tableId = id(`box_chevy-all-in-${action}`);
      const table = getOrCreateTable('box_chevy', tableId, true, false, { botsEnabled: false })!;
      table.connections.set('p1', socket());
      table.state = {
        ...table.state,
        phase: 'BET_1',
        activePlayerId: 'p1',
        currentBet: 50,
        players: [allIn, opponent],
      };
      const messageCount = table.state.messages.length;

      handleGenericAction(tableId, 'p1', action, action === 'raise' ? 100 : null);

      expect(table.state.messages).toHaveLength(messageCount);
      expect(table.state.players.find(player => player.id === 'p1')).toMatchObject({
        chips: 0,
        status: 'active',
        hasActed: true,
        bet: 50,
      });
      expect(table.state.activePlayerId).toBe('p2');
    },
  );

  it('does not let an out-of-turn zero-stack Badugi action advance the turn', () => {
    const tableId = id('badugi-out-of-turn-all-in');
    const table = getOrCreateBadugiTable(tableId, true, false, { botsEnabled: false });
    table.state = {
      ...table.state,
      phase: 'BET_1',
      activePlayerId: 'p2',
      currentBet: 50,
      players: [
        { ...table.state.players[0], id: 'p1', presence: 'human', status: 'active', chips: 0, bet: 50, hasActed: false },
        { ...table.state.players[1], id: 'p2', presence: 'human', status: 'active', chips: 1_000, bet: 50, hasActed: false },
      ],
    };
    const before = table.state;

    handleBadugiAction(tableId, 'p1', 'check', null);

    expect(table.state).toBe(before);
    expect(table.state.activePlayerId).toBe('p2');
  });

  it('does not let an out-of-turn zero-stack generic action advance the turn', () => {
    const tableId = id('box_chevy-out-of-turn-all-in');
    const table = getOrCreateTable('box_chevy', tableId, true, false, { botsEnabled: false })!;
    table.connections.set('p1', socket());
    table.state = {
      ...table.state,
      phase: 'BET_1',
      activePlayerId: 'p2',
      currentBet: 50,
      players: [
        { ...table.state.players[0], id: 'p1', presence: 'human', status: 'active', chips: 0, bet: 50, hasActed: false },
        { ...table.state.players[1], id: 'p2', presence: 'human', status: 'active', chips: 1_000, bet: 50, hasActed: false },
      ],
    };
    const before = table.state;

    handleGenericAction(tableId, 'p1', 'check', null);

    expect(table.state).toBe(before);
    expect(table.state.activePlayerId).toBe('p2');
  });

  it('keeps a zero-stack Badugi player eligible to complete a non-betting declaration', () => {
    const tableId = id('badugi-all-in-declare');
    const table = getOrCreateBadugiTable(tableId, true, false, { botsEnabled: false });
    table.state = {
      ...table.state,
      phase: 'DECLARE',
      activePlayerId: 'p2',
      players: [
        { ...table.state.players[0], id: 'p1', presence: 'human', status: 'active', chips: 0, hasActed: false },
        { ...table.state.players[1], id: 'p2', presence: 'human', status: 'active', chips: 1_000, hasActed: false },
      ],
    };

    handleBadugiAction(tableId, 'p1', 'declare', { declaration: 'LOW' });

    expect(table.state.players[0]).toMatchObject({
      chips: 0,
      status: 'active',
      declaration: 'LOW',
      hasActed: true,
    });
  });





  it.each([
    ['Badugi', id('badugi-start')],
    ['Box Chevy', id('box_chevy-start')],
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
      const table = getOrCreateTable('box_chevy', tableId, true, false, { botsEnabled: false })!;
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
    ['Box Chevy', id('funded-box_chevy-start')],
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
      const table = getOrCreateTable('box_chevy', tableId, true, false, { botsEnabled: false })!;
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

  it('routes fresh zero-balance joins to spectators without an active human seat', async () => {
    vi.spyOn(storage, 'getOrCreatePlayer').mockResolvedValue({ chipBalance: 0 } as any);

    const badugiId = id('badugi-zero-join');
    const badugi = getOrCreateBadugiTable(badugiId, true, false, { botsEnabled: false });
    const badugiSocket = socket();
    await expect(addBadugiConnection(
      badugiId, id('badugi-session'), badugiSocket, 'Zero', true, false,
      id('badugi-identity'), { botsEnabled: false },
    )).resolves.toBe('__spectator__');
    expect(badugi.state.players.some(player => player.presence === 'human')).toBe(false);
    expect(badugi.fundedSeats.size).toBe(0);
    expect(badugiSocket.close).not.toHaveBeenCalled();
    expect(badugiSocket.send).toHaveBeenCalledWith(expect.stringContaining('"role":"spectator"'));

    const genericId = id('box_chevy-zero-join');
    const generic = getOrCreateTable('box_chevy', genericId, true, false, { botsEnabled: false })!;
    const genericSocket = socket();
    await expect(addGenericConnection(
      genericId, 'box_chevy', id('box_chevy-session'), genericSocket, 'Zero', true, false,
      id('box_chevy-identity'), { botsEnabled: false },
    )).resolves.toBe('__spectator__');
    expect(generic.state.players.some(player => player.presence === 'human')).toBe(false);
    expect(generic.fundedSeats.size).toBe(0);
    expect(genericSocket.close).not.toHaveBeenCalled();
    expect(genericSocket.send).toHaveBeenCalledWith(expect.stringContaining('"role":"spectator"'));
  });
});
