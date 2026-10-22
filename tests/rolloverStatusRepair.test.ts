// Rollover status repair — deterministic reproduction (Detroit 2026-10-22).
// Before the fix, settleAndResetToAnte's rollover branch parked EVERY
// non-active player as 'sitting_out' — including a funded human who
// merely folded. With no other funded human active the table then sat
// in WAITING and 'start' was rejected with "Rebuy before starting a
// new hand." at a healthy stack (observed live at 9,975 chips).
// This test drives the REAL settle path with a no-winner (rollover)
// showdown state. On the pre-fix engine, case 1 fails exactly as
// observed live; on the fixed engine all cases pass.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CardType, GameState, Player } from '../shared/gameTypes';
import { BoxChevyMode } from '../shared/modes/boxchevy';
import { BoxChevyEngine } from '../server/boxChevyEngine';
import { resetToAnte } from '../server/genericEngine';
import { storage } from '../server/storage';

function card(rank: string, suit: string): CardType {
  return { rank: rank as CardType['rank'], suit: suit as CardType['suit'], isHidden: false };
}
const COMM = [card('2', 'clubs'), card('4', 'diamonds'), card('6', 'spades'), card('8', 'hearts'), card('10', 'clubs')];

function makePlayer(id: string, presence: Player['presence'], status: Player['status'], chips: number): Player {
  return {
    id, name: id, presence, chips, bet: 0, totalBet: 25,
    cards: [], status, hasActed: true, isDealer: false, declaration: null,
  } as Player;
}

function makeTable(players: Player[], opts: { pot: number; funded: string[]; winnerId?: string }) {
  if (opts.winnerId) {
    const w = players.find(p => p.id === opts.winnerId)!;
    (w as any).isWinner = true;
  }
  const state: GameState = {
    tableId: 'rollover-repair-test',
    phase: 'SHOWDOWN',
    pot: opts.pot,
    currentBet: 0,
    minBet: 25,
    activePlayerId: null,
    players,
    communityCards: COMM,
    messages: [],
    chatMessages: [],
    deck: [],
    discardPile: [],
    raisesThisRound: 0,
    winStreaks: {},
  };
  return {
    tableId: state.tableId,
    modeId: 'box_chevy',
    mode: BoxChevyMode,
    engine: BoxChevyEngine,
    state,
    handId: 11,
    resolvedPot: undefined,
    botTimers: new Map(),
    connections: new Map(),
    spectators: new Map(),
    publicCardIndicesPerPlayer: {},
    seatToIdentityId: new Map(players.filter(p => p.presence === 'human').map(p => [p.id, `identity-${p.id}`])),
    chipsAtHandStart: new Map(players.map(p => [p.id, p.chips])),
    sessionStats: new Map(),
    humanSeats: new Set(players.filter(p => p.presence === 'human').map(p => p.id)),
    actionLock: false,
    leavePromises: new Map(),
    leavingSeats: new Set(),
    sessionToSeat: new Map(),
    lastChipSyncHand: new Map(),
    disconnectTimers: new Map(),
    settlementPromise: undefined,
    showdownResolvePromise: undefined,
    seatBankroll: new Map(),
    seatLeaveIds: new Map(),
    pendingFundingSeats: new Set(),
    fundedSeats: new Set(opts.funded),
    fundingPromises: new Map(),
    seatTimeBankSessionUsed: new Map(),
    seatTimeBankLastTurnKey: new Map(),
  };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mockStorage() {
  vi.spyOn(storage, 'logHouseRake').mockResolvedValue(undefined);
  vi.spyOn(storage, 'syncPlayerChips').mockResolvedValue(undefined);
}

describe('rollover settle status repair', () => {
  it('reactivates a folded FUNDED human (9,975 chips) so the next hand can start', async () => {
    vi.useFakeTimers();
    mockStorage();
    const table = makeTable([
      makePlayer('hero', 'human', 'folded', 9975),
      makePlayer('botA', 'bot', 'active', 10000),
      makePlayer('botB', 'bot', 'folded', 10000),
    ], { pot: 500, funded: ['hero'] });
    await resetToAnte(table as never);
    const hero = table.state.players.find(p => p.id === 'hero')!;
    expect(hero.status).toBe('active');
    expect(hero.chips).toBe(9975);
    expect(table.state.phase).toBe('ANTE');
    expect((table.state.messages ?? []).some(m => /Rebuy before starting/.test(m.text))).toBe(false);
  });

  it('leaves a folded BOT parked (bot behavior unchanged)', async () => {
    vi.useFakeTimers();
    mockStorage();
    const table = makeTable([
      makePlayer('hero', 'human', 'active', 9975),
      makePlayer('botA', 'bot', 'active', 10000),
      makePlayer('botB', 'bot', 'folded', 10000),
    ], { pot: 500, funded: ['hero'] });
    await resetToAnte(table as never);
    expect(table.state.players.find(p => p.id === 'botB')!.status).toBe('sitting_out');
    expect(table.state.players.find(p => p.id === 'hero')!.status).toBe('active');
  });

  it('leaves a human who SAT OUT the hand parked (intentional sit-out respected)', async () => {
    vi.useFakeTimers();
    mockStorage();
    const table = makeTable([
      makePlayer('hero', 'human', 'sitting_out', 9975),
      makePlayer('botA', 'bot', 'active', 10000),
      makePlayer('botB', 'bot', 'active', 10000),
    ], { pot: 500, funded: ['hero'] });
    await resetToAnte(table as never);
    expect(table.state.players.find(p => p.id === 'hero')!.status).toBe('sitting_out');
  });

  it('leaves a folded human who is NOT funded parked (ineligible stays ineligible)', async () => {
    vi.useFakeTimers();
    mockStorage();
    const table = makeTable([
      makePlayer('hero', 'human', 'folded', 9975),
      makePlayer('botA', 'bot', 'active', 10000),
      makePlayer('botB', 'bot', 'active', 10000),
    ], { pot: 500, funded: [] });
    await resetToAnte(table as never);
    expect(table.state.players.find(p => p.id === 'hero')!.status).toBe('sitting_out');
  });

  it('normal (winner) settle behavior is unchanged: folded players reactivate', async () => {
    vi.useFakeTimers();
    mockStorage();
    const table = makeTable([
      makePlayer('hero', 'human', 'folded', 9975),
      makePlayer('botA', 'bot', 'active', 10500),
      makePlayer('botB', 'bot', 'folded', 10000),
    ], { pot: 0, funded: ['hero'], winnerId: 'botA' });
    await resetToAnte(table as never);
    expect(table.state.players.find(p => p.id === 'hero')!.status).toBe('active');
    expect(table.state.players.find(p => p.id === 'botB')!.status).toBe('active');
  });
});
