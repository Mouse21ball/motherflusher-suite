import { beforeEach, describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import { createLLTable, handleLLJoin, handleLLSideBet, handleLLSpectate, handleLLSpectatorSideBet, handleLLStart, handleLLSelect, resolveRace } from '../server/ladyluckEngine';
import { storage } from '../server/storage';

vi.mock('../server/ladyluckPersistence', () => ({ scheduleLLSave: vi.fn(), flushLLFinancialState: vi.fn(), deleteLLPersistedTable: vi.fn() }));
vi.mock('../server/storage', () => ({
  LADY_LUCK_HOUSE_ID: '__ladyluck_house__',
  LADY_LUCK_BOT_STACK: 10_000,
  storage: {
    debitLadyLuckWager: vi.fn(), addChipsToPlayer: vi.fn(), logHouseRake: vi.fn(),
    logLadyLuckRace: vi.fn(), getPlayerProfile: vi.fn(), ensureLadyLuckHouse: vi.fn(),
    transferLadyLuckChips: vi.fn(), fundLadyLuckBot: vi.fn(), releaseLadyLuckBot: vi.fn(),
    settleLadyLuckRace: vi.fn(),
  },
}));

function socket() {
  const messages: any[] = [];
  return {
    readyState: 1,
    send: (data: string) => messages.push(JSON.parse(data)),
    messages,
  };
}

async function setup() {
  const id = `sidebet-${Math.random()}`;
  const ws = socket();
  createLLTable(id, 'pony', 'p1');
  handleLLJoin(id, 'p1', 'One', 1000, ws as unknown as WebSocket);
  handleLLJoin(id, 'p2', 'Two', 1000, ws as unknown as WebSocket);
  handleLLStart(id, 'p1');
  await vi.waitFor(() => expect(ws.messages.at(-1).state.phase).toBe('SELECT'));
  const suits = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
  for (const suit of suits) {
    const state = ws.messages.at(-1).state;
    if (state.phase === 'WAGER') break;
    const player = state.players[state.currentPickIndex];
    expect(handleLLSelect(id, player.id, suit).ok).toBe(true);
  }
  expect(ws.messages.at(-1).state.phase).toBe('WAGER');
  return { id, ws };
}

describe('Lady Luck side-bet amounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.debitLadyLuckWager).mockResolvedValue(true);
    vi.mocked(storage.addChipsToPlayer).mockResolvedValue();
    vi.mocked(storage.logHouseRake).mockResolvedValue();
    vi.mocked(storage.logLadyLuckRace).mockResolvedValue();
    vi.mocked(storage.ensureLadyLuckHouse).mockResolvedValue();
    vi.mocked(storage.fundLadyLuckBot).mockResolvedValue(10_000);
    vi.mocked(storage.releaseLadyLuckBot).mockResolvedValue();
    vi.mocked(storage.transferLadyLuckChips).mockResolvedValue(true);
    vi.mocked(storage.settleLadyLuckRace).mockResolvedValue({
      winnerPot: 0, rake: 0, seatedPayouts: [{ playerId: 'p1', net: 475 }], spectatorPayouts: [],
    });
  });

  it('rejects NaN for a seated player and for a spectator before any debit', async () => {
    const { id } = await setup();
    expect((await handleLLSideBet(id, 'p1', 'spades', NaN))).toEqual({ ok: false, error: 'invalid_amount' });
    const spectatorWs = socket();
    handleLLSpectate(id, 'spectator', 'Watcher', '', spectatorWs as unknown as WebSocket);
    await handleLLSpectatorSideBet(id, 'spectator', 'spades', NaN, spectatorWs as unknown as WebSocket);
    expect(spectatorWs.messages.at(-1)).toEqual({ type: 'll:error', message: 'invalid_amount' });
    expect(storage.debitLadyLuckWager).not.toHaveBeenCalled();
  });

  it('credits a seated side-bet winner the same raked net as a spectator', async () => {
    const { id } = await setup();
    expect((await handleLLSideBet(id, 'p1', 'spades', 200)).ok).toBe(true);
    await resolveRace(id, 'spades');
    expect(storage.settleLadyLuckRace).toHaveBeenCalledWith(expect.objectContaining({
      seatedBets: [expect.objectContaining({ playerId: 'p1', suit: 'spades', amount: 200 })],
    }));
  });
});