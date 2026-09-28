import { describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import { createLLTable, handleLLJoin, handleLLSideBet, handleLLSpectate, handleLLSpectatorSideBet, handleLLStart } from '../server/ladyluckEngine';
import { storage } from '../server/storage';

vi.mock('../server/ladyluckPersistence', () => ({ scheduleLLSave: vi.fn() }));
vi.mock('../server/storage', () => ({
  storage: { debitChipsForBuyin: vi.fn(), addChipsToPlayer: vi.fn(), logHouseRake: vi.fn() },
}));

function socket() {
  const messages: any[] = [];
  return {
    readyState: 1,
    send: (data: string) => messages.push(JSON.parse(data)),
    messages,
  };
}

function setup() {
  const id = `sidebet-${Math.random()}`;
  const ws = socket();
  createLLTable(id, 'pony', 'p1');
  handleLLJoin(id, 'p1', 'One', 1000, ws as unknown as WebSocket);
  handleLLJoin(id, 'p2', 'Two', 1000, ws as unknown as WebSocket);
  handleLLStart(id, 'p1');
  // Start selects a dealer but does not schedule bot timers for the current
  // player unless the selected seat belongs to a bot.
  const state = ws.messages.at(-1).state;
  expect(state.phase).toBe('SELECT');
  // All four suits can be selected in turn; the seated side-bet phase is WAGER.
  return { id, ws };
}

describe('Lady Luck side-bet amounts', () => {
  it('rejects NaN for a seated player and for a spectator before any debit', async () => {
    const { id, ws } = setup();
    // Two bot seats are auto-filled; choosing suits in seat order reaches WAGER.
    const { handleLLSelect } = await import('../server/ladyluckEngine');
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
    for (const suit of suits) {
      const state = ws.messages.at(-1).state;
      if (state.phase === 'WAGER') break; // bot dealer auto-claims the last suit
      const player = state.players[state.currentPickIndex];
      expect(handleLLSelect(id, player.id, suit).ok).toBe(true);
    }
    expect(ws.messages.at(-1).state.phase).toBe('WAGER');
    expect((await handleLLSideBet(id, 'p1', 'spades', NaN))).toEqual({ ok: false, error: 'invalid_amount' });
    const spectatorWs = socket();
    handleLLSpectate(id, 'spectator', 'Watcher', '', spectatorWs as unknown as WebSocket);
    await handleLLSpectatorSideBet(id, 'spectator', 'spades', NaN, spectatorWs as unknown as WebSocket);
    expect(spectatorWs.messages.at(-1)).toEqual({ type: 'll:error', message: 'invalid_amount' });
    expect(storage.debitChipsForBuyin).not.toHaveBeenCalled();
  });
});