import { beforeEach, describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import {
  createLLTable, handleLLJoin, handleLLSelect, handleLLWager,
  handleLLSideBet, handleLLStart, handleLLDisconnect, handleLLSpectate,
  handleLLSpectatorSideBet, handleLLSpectatorLeave, resolveRace, startNextRound,
} from '../server/ladyluckEngine';
import { storage, LADY_LUCK_HOUSE_ID, LADY_LUCK_BOT_STACK } from '../server/storage';

vi.mock('../server/ladyluckPersistence', () => ({ scheduleLLSave: vi.fn(), flushLLFinancialState: vi.fn(), deleteLLPersistedTable: vi.fn() }));
vi.mock('../server/storage', () => ({
  LADY_LUCK_HOUSE_ID: '__ladyluck_house__',
  LADY_LUCK_BOT_STACK: 10_000,
  storage: {
    ensureLadyLuckHouse: vi.fn(), fundLadyLuckBot: vi.fn(),
    rebalanceLadyLuckBot: vi.fn(), releaseLadyLuckBot: vi.fn(),
    transferLadyLuckChips: vi.fn(), debitLadyLuckWager: vi.fn(), getLadyLuckOpenStakes: vi.fn(),
    settleLadyLuckRace: vi.fn(), addChipsToPlayer: vi.fn(),
    logHouseRake: vi.fn(), logLadyLuckRace: vi.fn(), getPlayerProfile: vi.fn(),
  },
}));

type LedgerRow = { id: string; amount: number; source: string };
const balances = new Map<string, number>();
const ledger: LedgerRow[] = [];
const house = '__ladyluck_house__';

function move(from: string, to: string, amount: number, source: string): boolean {
  if ((balances.get(from) ?? -1) < amount) return false;
  balances.set(from, balances.get(from)! - amount);
  balances.set(to, (balances.get(to) ?? 0) + amount);
  ledger.push({ id: from, amount: -amount, source }, { id: to, amount, source });
  return true;
}

function total(): number {
  return [...balances.values()].reduce((sum, n) => sum + n, 0);
}

function socket() {
  const messages: any[] = [];
  return { readyState: 1, send: (raw: string) => messages.push(JSON.parse(raw)), messages };
}

beforeEach(() => {
  vi.clearAllMocks();
  balances.clear();
  ledger.length = 0;
  balances.set(house, 1_000_000);
  balances.set('p1', 10_000);
  balances.set('p2', 10_000);
  vi.mocked(storage.ensureLadyLuckHouse).mockResolvedValue();
  vi.mocked(storage.fundLadyLuckBot).mockImplementation(async id => {
    balances.set(id, 0);
    if (!move(house, id, LADY_LUCK_BOT_STACK, 'ladyluck_bot_rebuy')) throw Error('insufficient house funds');
    return LADY_LUCK_BOT_STACK;
  });
  vi.mocked(storage.releaseLadyLuckBot).mockImplementation(async id => {
    const amount = balances.get(id) ?? 0;
    if (amount) move(id, house, amount, 'ladyluck_bot_return');
  });
  vi.mocked(storage.transferLadyLuckChips).mockImplementation(async (from, to, amount, source) =>
    move(from, to, amount, source),
  );
  vi.mocked(storage.debitLadyLuckWager).mockImplementation(async (id, amount) => {
    if ((balances.get(id) ?? -1) < amount) return false;
    balances.set(id, balances.get(id)! - amount);
    ledger.push({ id, amount: -amount, source: 'buy_in' });
    return true;
  });
  vi.mocked(storage.settleLadyLuckRace).mockImplementation(async ({ winnerId: winner, grossPot: pot, winningSuit, seatedBets, spectatorBets }) => {
    const rake = Math.floor(pot * 0.05);
    const winnerPot = pot - rake;
    balances.set(house, balances.get(house)! + rake);
    balances.set(winner, balances.get(winner)! + winnerPot);
    ledger.push({ id: house, amount: rake, source: 'ladyluck_main_rake' });
    ledger.push({ id: winner, amount: winnerPot, source: 'ladyluck_win' });
    const seatedPayouts = seatedBets.filter(b => b.suit === winningSuit).map(b => {
      const gross = Math.floor(b.amount * 2.5);
      const net = gross - Math.floor(gross * 0.05);
      if (!move(house, b.playerId, net, 'ladyluck_sidebet')) throw Error('insufficient house funds');
      return { playerId: b.playerId, net };
    });
    const spectatorPayouts = spectatorBets.filter(b => b.suit === winningSuit).map(b => {
      const gross = Math.floor(b.amount * 2.5);
      const net = gross - Math.floor(gross * 0.05);
      if (!move(house, b.userId, net, 'ladyluck_spectator_win')) throw Error('insufficient house funds');
      return { userId: b.userId, net, gross };
    });
    return { winnerPot, rake, seatedPayouts, spectatorPayouts };
  });
  vi.mocked(storage.logHouseRake).mockResolvedValue();
  vi.mocked(storage.logLadyLuckRace).mockResolvedValue();
  vi.mocked(storage.getPlayerProfile).mockImplementation(async id =>
    ({ chipBalance: balances.get(id) ?? 0 }) as Awaited<ReturnType<typeof storage.getPlayerProfile>>,
  );
});

async function setup() {
  const id = `bot-accounting-${Math.random()}`;
  const ws = socket();
  createLLTable(id, 'pony', 'p1');
  handleLLJoin(id, 'p1', 'One', 10_000, ws as unknown as WebSocket);
  handleLLJoin(id, 'p2', 'Two', 10_000, ws as unknown as WebSocket);
  handleLLStart(id, 'p1');
  await vi.waitFor(() => expect(ws.messages.at(-1).state.phase).toBe('SELECT'));
  const suits = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
  for (const suit of suits) {
    const state = ws.messages.at(-1).state;
    if (state.phase === 'WAGER') break;
    expect(handleLLSelect(id, state.players[state.currentPickIndex].id, suit).ok).toBe(true);
  }
  expect(ws.messages.at(-1).state.phase).toBe('WAGER');
  return { id, ws, state: () => ws.messages.at(-1).state };
}

describe('Lady Luck house-backed bots', () => {
  it('debits a bot wager, pays its raked win to its balance, and conserves chips over two hands', async () => {
    const { id, state } = await setup();
    const initialTotal = total();
    const firstBots = state().players.filter((p: any) => p.presence === 'bot');
    expect(firstBots).toHaveLength(2);
    expect(balances.get(house)).toBe(1_000_000 - 2 * LADY_LUCK_BOT_STACK);
    expect(firstBots.every((p: any) => balances.get(p.id) === LADY_LUCK_BOT_STACK)).toBe(true);
    expect(ledger.filter(row => row.source === 'ladyluck_bot_rebuy')).toHaveLength(4);

    // Side-bet stakes transfer to the house rather than disappearing from the
    // ledger; a winning side bet transfers its net payout back out.
    expect((await handleLLSideBet(id, 'p1', firstBots[0].suit, 100)).ok).toBe(true);
    expect(total()).toBe(initialTotal);

    for (const p of state().players) {
      const before = balances.get(p.id)!;
      expect((await handleLLWager(id, p.id, 100)).ok).toBe(true);
      expect(balances.get(p.id)).toBe(before - 100);
    }
    expect(state().pot).toBe(400);
    expect(total() + state().pot).toBe(initialTotal);
    const winnerId = firstBots[0].id;
    await resolveRace(id, firstBots[0].suit);
    expect(balances.get(winnerId)).toBe(LADY_LUCK_BOT_STACK - 100 + 380);
    expect(ledger).toContainEqual({ id: house, amount: 20, source: 'ladyluck_main_rake' });
    expect(total()).toBe(initialTotal);

    // One human leaves during RESULTS, so the next hand replenishes the
    // vacated seat with another house-funded bot.
    handleLLDisconnect(id, 'p2');
    await startNextRound(id);
    expect(state().phase).toBe('BET');
    expect(state().pot).toBe(0);
    expect(balances.get(winnerId)).toBe(0); // remaining stack returned to house
    expect(state().players.filter((p: any) => p.presence === 'bot')).toHaveLength(3);
    expect(total()).toBe(initialTotal);

    // Second hand: a human wins a pot partly funded by bot wagers.
    const secondPlayers = state().players;
    for (const p of secondPlayers) {
      if (!p.suit) {
        const available = (['spades', 'hearts', 'diamonds', 'clubs'] as const)
          .find(suit => !state().claimedSuits.includes(suit))!;
        expect(handleLLSelect(id, p.id, available).ok).toBe(true);
      }
      expect((await handleLLWager(id, p.id, 100)).ok).toBe(true);
    }
    expect(total() + state().pot).toBe(initialTotal);
    const humanSuit = state().players.find((p: any) => p.id === 'p1').suit;
    await resolveRace(id, humanSuit);
    expect(total()).toBe(initialTotal);
    expect(balances.get('p1')).toBe(10_000 - 100 - 100 + 238 - 100 + 380);
    expect(ledger.filter(row => row.source === 'buy_in' && row.id.startsWith('bot_'))).toHaveLength(5);
    expect(storage.settleLadyLuckRace).toHaveBeenCalledTimes(2);
  });

  it('keeps a paid seat eligible after its owner disconnects during BET', async () => {
    const { id, state } = await setup();
    const initialTotal = total();
    const suit = state().players.find((p: any) => p.id === 'p1').suit;
    expect((await handleLLWager(id, 'p1', 100)).ok).toBe(true);
    handleLLDisconnect(id, 'p1');
    expect(state().players.find((p: any) => p.id === 'p1').suit).toBe(suit);
    for (const p of state().players.filter((p: any) => p.id !== 'p1')) {
      expect((await handleLLWager(id, p.id, 100)).ok).toBe(true);
    }
    await resolveRace(id, suit);
    expect(balances.get('p1')).toBe(10_280);
    expect(total()).toBe(initialTotal);
  });

  it('pays a spectator bet after the spectator leaves the table', async () => {
    const { id, state } = await setup();
    balances.set('spectator', 1_000);
    const initialTotal = total();
    const suit = state().players[0].suit;
    const ws = socket();
    handleLLSpectate(id, 'spectator', 'Watcher', '', ws as unknown as WebSocket);
    await handleLLSpectatorSideBet(id, 'spectator', suit, 100, ws as unknown as WebSocket);
    handleLLSpectatorLeave(id, 'spectator');
    for (const p of state().players) {
      expect((await handleLLWager(id, p.id, 100)).ok).toBe(true);
    }
    await resolveRace(id, suit);
    expect(balances.get('spectator')).toBe(1_138);
    expect(total()).toBe(initialTotal);
  });

  it('does not settle the same race twice while its first payout is pending', async () => {
    const { id, state } = await setup();
    const initialTotal = total();
    for (const p of state().players) {
      expect((await handleLLWager(id, p.id, 100)).ok).toBe(true);
    }
    const settle = vi.mocked(storage.settleLadyLuckRace);
    const actualSettlement = settle.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    settle.mockImplementation(async params => {
      await gate;
      return actualSettlement(params);
    });
    const suit = state().players[0].suit;
    const first = resolveRace(id, suit);
    const second = resolveRace(id, suit);
    expect(settle).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(total()).toBe(initialTotal);
  });
});