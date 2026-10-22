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
import { getOrCreateTable, handleGenericAction, resetToAnte } from '../server/genericEngine';
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

  it('reactivates a folded BOT participant too (stabilization participant rule)', async () => {
    // The first repair reactivated only the human, which silenced the
    // zero-active safety and stranded the table with one eligible
    // player (Detroit's Galaxy session, 2026-10-22). A bot that was
    // dealt into the hand is a participant, not a sit-out.
    vi.useFakeTimers();
    mockStorage();
    const table = makeTable([
      makePlayer('hero', 'human', 'active', 9975),
      makePlayer('botA', 'bot', 'active', 10000),
      makePlayer('botB', 'bot', 'folded', 10000),
    ], { pot: 500, funded: ['hero'] });
    await resetToAnte(table as never);
    expect(table.state.players.find(p => p.id === 'botB')!.status).toBe('active');
    expect(table.state.players.find(p => p.id === 'hero')!.status).toBe('active');
  });

  it("Detroit's exact case: hero + both bots folded in a 758 rollover — table continues to ANTE", async () => {
    vi.useFakeTimers();
    mockStorage();
    const table = makeTable([
      makePlayer('hero', 'human', 'folded', 9975),
      makePlayer('botA', 'bot', 'folded', 10000),
      makePlayer('botB', 'bot', 'folded', 10000),
    ], { pot: 758, funded: ['hero'] });
    await resetToAnte(table as never);
    expect(table.state.phase).toBe('ANTE');
    for (const p of table.state.players) expect(p.status).toBe('active');
  });

  it('a bot that SAT OUT the rollover hand stays parked', async () => {
    vi.useFakeTimers();
    mockStorage();
    const table = makeTable([
      makePlayer('hero', 'human', 'folded', 9975),
      makePlayer('botA', 'bot', 'folded', 10000),
      makePlayer('botB', 'bot', 'sitting_out', 10000),
    ], { pot: 500, funded: ['hero'] });
    await resetToAnte(table as never);
    expect(table.state.players.find(p => p.id === 'botB')!.status).toBe('sitting_out');
    expect(table.state.phase).toBe('ANTE');
  });

  it('a busted participant bot is restocked AND reactivated', async () => {
    vi.useFakeTimers();
    mockStorage();
    const table = makeTable([
      makePlayer('hero', 'human', 'folded', 9975),
      makePlayer('botA', 'bot', 'folded', 0),
      makePlayer('botB', 'bot', 'folded', 10000),
    ], { pot: 500, funded: ['hero'] });
    await resetToAnte(table as never);
    const botA = table.state.players.find(p => p.id === 'botA')!;
    expect(botA.chips).toBe(10000);
    expect(botA.status).toBe('active');
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

  it('zero-active safety no longer overrides an intentional sit-out (bots recover, human stays parked)', async () => {
    vi.useFakeTimers();
    mockStorage();
    const table = makeTable([
      makePlayer('hero', 'human', 'sitting_out', 9975),
      makePlayer('botA', 'bot', 'folded', 10000),
      makePlayer('botB', 'bot', 'folded', 10000),
    ], { pot: 500, funded: ['hero'] });
    await resetToAnte(table as never);
    expect(table.state.players.find(p => p.id === 'hero')!.status).toBe('sitting_out');
    expect(table.state.players.find(p => p.id === 'botA')!.status).toBe('active');
    // No funded human active → the table waits rather than dealing.
    expect(table.state.phase).toBe('WAITING');
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

describe('stranded WAITING table healing (start path)', () => {
  let seq = 0;
  function strandedTable(funded: string[]) {
    const tableId = `HEAL${(seq++).toString().padStart(2, '0')}X`;
    const t = getOrCreateTable('box_chevy', tableId, false, true, { maxPlayers: 5, botsEnabled: true })!;
    const players = [
      makePlayer('hero', 'human', 'sitting_out', 9975),
      makePlayer('b1', 'bot', 'sitting_out', 10000),
      makePlayer('b2', 'bot', 'sitting_out', 10000),
    ];
    (t as any).state = {
      tableId, phase: 'WAITING', pot: 758, currentBet: 0, minBet: 25, activePlayerId: null,
      players, communityCards: [], messages: [], chatMessages: [], deck: [], discardPile: [], raisesThisRound: 0, winStreaks: {},
    };
    (t as any).fundedSeats = new Set(funded);
    (t as any).seatToIdentityId = new Map([['hero', 'identity-hero']]);
    (t as any).humanSeats = new Set(['hero']);
    (t as any).sessionToSeat = new Map([['sess-hero', 'hero']]);
    return t;
  }

  it('a funded tapper heals the table (own seat + parked bots) and the hand starts', () => {
    vi.useFakeTimers();
    mockStorage();
    const t = strandedTable(['hero']);
    const r = handleGenericAction(t.tableId, 'sess-hero', 'start', undefined);
    expect(r).toBeUndefined();
    expect(t.state.phase).toBe('ANTE');
    for (const p of t.state.players) expect(p.status).toBe('active');
    expect(t.state.pot).toBe(758);
  });

  it('an UNFUNDED tapper is still refused — no healing without funding', () => {
    vi.useFakeTimers();
    mockStorage();
    const t = strandedTable([]);
    const r = handleGenericAction(t.tableId, 'sess-hero', 'start', undefined);
    expect(r).toBe('Rebuy before starting a new hand.');
    expect(t.state.phase).toBe('WAITING');
    expect(t.state.players.find(p => p.id === 'hero')!.status).toBe('sitting_out');
  });
});
