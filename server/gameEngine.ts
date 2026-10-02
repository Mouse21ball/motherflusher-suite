// ─── Server-authoritative Badugi engine ──────────────────────────────────────
// Owns the canonical game state for every authoritative Badugi table.
// Clients send action intent; this engine validates, mutates, and broadcasts
// full state snapshots masked per recipient.
//
// Feature-flagged: tables only become authoritative when
// FEATURES.SERVER_AUTHORITATIVE_BADUGI is true OR
// BADUGI_ALPHA_ENABLED=true is set in the environment.

import type { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { GameState, Player, CardType, GamePhase, PlayerStatus, Declaration, ChatMessage, ReactionEvent } from '../shared/gameTypes';
import { BadugiMode, evaluateBadugi } from '../shared/modes/badugi';
import { engineLog } from './engineLog';
import { applyRake } from './utils/rake';
import { applyBadugiDraw } from './utils/badugiDraw';
import { takeAnte } from '../shared/engine/botUtils';
import { canStartNextHand, hasFundedHuman } from '../shared/tableStartEligibility';
import { scheduleSave, loadPersistedTables, deletePersistedTable } from './tablePersistence';
import { availableStreakSeat, claimSeatStreak, confirmedWinStreaks, releaseSeatStreak } from './utils/tableWinStreaks';
import { storage } from './storage';
import { getBotThinkDelay, getBotName, botTier } from '../shared/engine/botUtils';
import { filterChatMessage } from './chatFilter';
import { secureShuffleInPlace } from './utils/secureShuffle';
import { makeBotPlayer } from './utils/botPlayer';
import { scheduleBotBanter } from './utils/botBanter';
import { DEFAULT_STAKE_TIER_ID, clampBuyIn, getBuyInBounds, getStakeTier, getStakeTierId, meetsMinimumBet, type StakeTierId } from '../shared/stakeTiers';
import { resolveGiftSeats } from './personalChipGifts';
import {
  getTableRebuyBustEvent,
  markTableRebuyEventClaimed,
  markTableRebuyEventFunded,
  resolveLegacyTableRebuy,
  runIdempotentTableRebuyRequest,
  type TableRebuyBustEvent,
} from './tableRebuyRequests';

// ─── Pure helpers (no browser APIs, ported from client/engine/core.ts) ────────

function createDeck(): CardType[] {
  const suits: CardType['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: CardType['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: CardType[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, isHidden: false });
    }
  }
  return secureShuffleInPlace(deck);
}

function getDealerIndex(players: Player[]): number {
  const idx = players.findIndex(p => p.isDealer);
  return idx === -1 ? 0 : idx;
}

function getNextActivePlayerIndex(players: Player[], currentIndex: number, skipAllIn = true): number {
  let nextIdx = (currentIndex + 1) % players.length;
  let count = 0;
  while (count < players.length) {
    const p = players[nextIdx];
    if (p.status === 'active' && (!skipAllIn || p.chips > 0)) break;
    nextIdx = (nextIdx + 1) % players.length;
    count++;
  }
  // Exhausted all slots with skipAllIn=true: relax the all-in constraint and
  // try again so we never assign activePlayerId to a folded/sitting_out player.
  if (count >= players.length && skipAllIn) {
    nextIdx = (currentIndex + 1) % players.length;
    for (let i = 0; i < players.length; i++) {
      if (players[nextIdx].status === 'active') break;
      nextIdx = (nextIdx + 1) % players.length;
    }
  }
  return nextIdx;
}

function moveDealer(players: Player[]): Player[] {
  const cur = getDealerIndex(players);
  const next = getNextActivePlayerIndex(players, cur);
  return players.map((p, i) => ({ ...p, isDealer: i === next }));
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Sole-survivor helper (Parts 1/5) ────────────────────────────────────────
function checkSoleSurvivor(players: Player[]): Player | null {
  const active = players.filter(p => p.status === 'active');
  return active.length === 1 ? active[0] : null;
}

function addMsg(state: GameState, text: string, isResolution = false): GameState {
  return {
    ...state,
    messages: [...state.messages, { id: makeId(), text, time: Date.now(), isResolution }].slice(-10),
  };
}

// ─── Turn timer ───────────────────────────────────────────────────────────────
// Phases in which the server arms a per-player countdown.  Bot turns and
// non-interactive phases (WAITING / SHOWDOWN / ANTE / DEAL) are excluded.
const BADUGI_TURN_TIMEOUT_MS = 30_000;

const BADUGI_INTERACTIVE_PHASES = new Set<GamePhase>([
  'BET_1', 'BET_2', 'BET_3', 'BET_4',
  'DRAW_1', 'DRAW_2', 'DRAW_3',
  'DECLARE',
]);

// ─── Join window ──────────────────────────────────────────────────────────────
// How long (ms) seats p2-p5 are held open for real players before bots fill them.
const JOIN_WINDOW_MS = 30_000;

// How long (ms) a disconnected seat is held before it is released (bot mid-hand,
// 'reserved' between hands). 90 seconds is long enough for a page refresh or
// network blip, short enough to prevent ghost seats from blocking the table.
const RECONNECT_TIMEOUT_MS = 90_000;

// Bot names: per-table, derived from tableId+seatId via getBotName().

// ─── Initial table roster ─────────────────────────────────────────────────────
// p4 is initial dealer → p1 (human) is always first-to-act in hand 1.
// p2-p5 start as 'reserved'/sitting_out: open seats for real players to claim.

function makeInitialPlayers(isClubTable = false): Player[] {
  const empty = isClubTable ? 'open' as const : 'reserved' as const;
  return [
    { id: 'p1', name: 'Open', presence: empty,   chips: 0, bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: false, declaration: null, hasActed: false },
    { id: 'p2', name: 'Open', presence: empty,   chips: 10000,     bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: false, declaration: null, hasActed: false },
    { id: 'p3', name: 'Open', presence: empty,   chips: 10000,     bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: false, declaration: null, hasActed: false },
    { id: 'p4', name: 'Open', presence: empty,   chips: 10000,     bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: true,  declaration: null, hasActed: false },
    { id: 'p5', name: 'Open', presence: empty,   chips: 10000,     bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: false, declaration: null, hasActed: false },
  ];
}

// Convert ALL remaining reserved seats to active bots at once.
// Called on hand start (early fill) or when the creator starts.
// Sets joinWindowEndsAt = 0 so staged-fill timers abort.
function convertReservedToBots(table: AuthTable): void {
  if (table.crewId) return;
  if (!table.botsEnabled) return;
  const hasReserved = table.state.players.some(p => p.presence === 'reserved');
  if (!hasReserved) return;
  table.state = {
    ...table.state,
    players: table.state.players.map(p =>
      p.presence === 'reserved'
        ? makeBotPlayer(p, getBotName(table.tableId, p.id), 'active')
        : p
    ),
  };
  table.joinWindowEndsAt = 0;
}

// Quick-fill: immediately seat bots up to the human-count-aware cap.
// 1 human → 2 bots; 2 humans → 1 bot; 3+ humans → 0 bots.
// Remaining reserved seats stay open so real players can join at any time.
function quickFillBots(table: AuthTable): void {
  console.log(`[quickFillBots] tableId: ${table.tableId} crewId: ${table.crewId ?? 'none'} botsEnabled: ${table.botsEnabled}`);
  if (table.crewId) return;
  if (!table.botsEnabled) return;
  const reserved = table.state.players.filter(p => p.presence === 'reserved');
  if (reserved.length === 0) return;
  const humanCount = table.state.players.filter(p => p.presence === 'human').length;
  const botCount   = table.state.players.filter(p => p.presence === 'bot').length;
  const maxBots    = humanCount >= 3 ? 0 : humanCount >= 2 ? 1 : 2;
  const allowedBots = Math.min(maxBots, Math.max(0, table.maxPlayers - humanCount - botCount));
  const toFill     = reserved.slice(0, allowedBots);
  if (toFill.length === 0) return;
  const fillIds = new Set(toFill.map(p => p.id));
  table.state = {
    ...table.state,
    players: table.state.players.map(p => {
      if (p.presence !== 'reserved' || !fillIds.has(p.id)) return p;
      return makeBotPlayer(p, getBotName(table.tableId, p.id), 'active');
    }),
  };
  table.joinWindowEndsAt = 0;
}

// Convert exactly ONE reserved seat (lowest id) to a bot.
// Used by staged fill — does NOT close the join window, leaving later
// stages and human claims still valid.
// Bot ceiling: 1 human → max 2 bots; 2 humans → max 1 bot; 3+ humans → 0 bots.
// Also respects botsEnabled and maxPlayers from host settings.
function convertOneReservedToBot(table: AuthTable): boolean {
  if (table.crewId) return false;
  if (!table.botsEnabled) return false;
  const reserved = table.state.players.filter(p => p.presence === 'reserved');
  if (reserved.length === 0) return false;
  const humanCount = table.state.players.filter(p => p.presence === 'human').length;
  const botCount   = table.state.players.filter(p => p.presence === 'bot').length;
  if (humanCount + botCount >= table.maxPlayers) return false;
  const maxBots    = humanCount >= 3 ? 0 : humanCount >= 2 ? 1 : 2;
  if (botCount >= maxBots) return false;
  const first = reserved[0];
  if (!first) return false;
  table.state = {
    ...table.state,
    players: table.state.players.map(p =>
      p.id === first.id
        ? makeBotPlayer(p, getBotName(table.tableId, p.id), 'active')
        : p
    ),
  };
  return true;
}

// ─── Auto-start helper (mirrors the 'start' action handler) ──────────────────
// Called by the bot-fill timer after enough players are seated.
function autoStartBadugiHand(table: AuthTable): void {
  if (table.state.phase !== 'WAITING') return;
  if (table.actionLock || table.pendingFundingSeats.size > 0) {
    table.botFillTimer = setTimeout(() => {
      table.botFillTimer = undefined;
      autoStartBadugiHand(table);
    }, 100);
    return;
  }
  if (!hasFundedHuman(table.state.players, table.fundedSeats)) return;
  convertReservedToBots(table);
  const freshPlayers = table.state.players;
  if (!canStartNextHand(freshPlayers, table.fundedSeats)) return;
  table.handId += 1;
  const dealerIdx   = getDealerIndex(freshPlayers);
  const firstActIdx = getNextActivePlayerIndex(freshPlayers, dealerIdx);
  table.state = addMsg({
    ...table.state,
    phase: 'ANTE',
    activePlayerId: freshPlayers[firstActIdx].id,
  }, 'Ante up!');
  console.log(`[badugi] autoStartBadugiHand tableId=${table.tableId} handId=${table.handId}`);
  broadcastState(table);
  scheduleNextBot(table);
  armTurnTimerBadugi(table);
}

// ─── Bot fill + auto-start ─────────────────────────────────────────────────────
// 8 s → seat first bot (or auto-start if 2+ players already present)
// every 1.5 s → seat next bot until human-count cap is reached
// 2 s after cap → autoStartBadugiHand (which fills any remaining reserved seats)
// Uses table.botFillTimer so the human "Start" click can cancel it cleanly.
function scheduleBadugiBotFill(tableId: string): void {
  const t0 = tables.get(tableId);
  if (!t0) return;
  if (t0.botFillTimer) { clearTimeout(t0.botFillTimer); t0.botFillTimer = undefined; }

  const scheduleAutoStart = (t: AuthTable) => {
    const active = t.state.players.filter(p => p.presence === 'bot' || p.presence === 'human');
    if (active.length < 2) {
      // Not enough active players yet — try one more fill pass before giving up.
      const hasReserved = t.state.players.some(p => p.presence === 'reserved');
      if (hasReserved && t.botsEnabled && !t.crewId) {
        t.botFillTimer = setTimeout(fillOne, 1_500);
      }
      return;
    }
    t.botFillTimer = setTimeout(() => {
      const t2 = tables.get(tableId);
      if (!t2 || t2.state.phase !== 'WAITING') return;
      t2.botFillTimer = undefined;
      autoStartBadugiHand(t2);
    }, 2_000);
  };

  const fillOne = () => {
    const t = tables.get(tableId);
    if (!t || t.state.phase !== 'WAITING' || t.crewId || !t.botsEnabled) return;

    const added = convertOneReservedToBot(t);
    if (added) broadcastState(t);

    const reserved   = t.state.players.filter(p => p.presence === 'reserved');
    const humanCount = t.state.players.filter(p => p.presence === 'human').length;
    const botCount   = t.state.players.filter(p => p.presence === 'bot').length;
    const maxBots    = humanCount >= 3 ? 0 : humanCount >= 2 ? 1 : 2;
    const canAddMore = reserved.length > 0 && botCount < maxBots;

    if (canAddMore) {
      t.botFillTimer = setTimeout(fillOne, 1_500);
    } else {
      scheduleAutoStart(t);
    }
  };

  t0.botFillTimer = setTimeout(() => {
    const t = tables.get(tableId);
    if (!t || t.state.phase !== 'WAITING') return;
    const active = t.state.players.filter(p => p.presence === 'bot' || p.presence === 'human');
    if (active.length >= 2) {
      scheduleAutoStart(t);
    } else {
      fillOne();
    }
  }, 8_000);
}

function makeInitialState(tableId: string, isClubTable = false, minBet = 50): GameState {
  return {
    tableId,
    phase: 'WAITING',
    winStreaks: {},
    seatStreakOwners: {},
    pot: 0,
    currentBet: 0,
    minBet,
    raisesThisRound: 0,
    activePlayerId: 'p1',
    players: makeInitialPlayers(isClubTable),
    communityCards: [],
    messages: [{ id: makeId(), text: 'Game ready. Press start.', time: Date.now() }],
    chatMessages: [],
    deck: [],
    discardPile: [],
  };
}

// ─── State masking ────────────────────────────────────────────────────────────
// Canonical state has all cards face-up (server sees everything).
// When broadcasting to a player, hide all opponents' cards except at SHOWDOWN.

export function maskStateForPlayer(state: GameState, forPlayerId: string): GameState {
  const isShowdown = state.phase === 'SHOWDOWN';
  const publicState = { ...state };
  delete publicState.seatStreakOwners;
  return {
    ...publicState,
    deck: [],                // never expose the deck to clients
    // Discards have no owner metadata. Keep their count, but never send their
    // identities, even at showdown: discarded cards are not revealed there.
    discardPile: state.discardPile.map(() => ({ isHidden: true } as CardType)),
    players: state.players.map(p => {
      if (p.id === forPlayerId) return p;
      if (isShowdown) return p; // all hands revealed at resolution
      return { ...p, cards: p.cards.map(() => ({ isHidden: true } as CardType)) };
    }),
  };
}

// ─── Seat order ───────────────────────────────────────────────────────────────
// All four slots can be claimed by live humans. Bots fill unclaimed slots.
// This is the order in which seats are assigned to connecting browsers.

const SEAT_ORDER = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;
type SeatId = typeof SEAT_ORDER[number];

// ─── Table record ─────────────────────────────────────────────────────────────

// Per-seat in-session statistics, initialized on join and updated at hand end.
interface SessionStat {
  startChips:        number;
  handsPlayed:       number;
  biggestPotWon:     number;
  winStreak:         number;
  lossStreak:        number;
  sessionHighProfit: number; // highest netProfit this session (never DB)
  sessionLowProfit:  number; // lowest netProfit this session (never DB)
  recentDeltas:      number[]; // last 3 per-hand chip deltas
}

interface AuthTable {
  resolvedPot?: number;
  tableId: string;
  state: GameState;
  // Increments on each new hand. Bot timers capture this value at creation;
  // if it has changed when the timer fires, the action is silently dropped.
  handId: number;
  // Prevents re-entrant mutations.
  actionLock: boolean;
  settlementPromise?: Promise<void>;
  showdownResolvePromise?: Promise<void>;
  leavePromises: Map<string, Promise<void>>;
  leavingSeats: Set<string>;
  settlementRetryTimer?: ReturnType<typeof setTimeout>;
  botTimers: Map<string, ReturnType<typeof setTimeout>>;
  // connections keyed by game seat id (p1/p2/p3/p4/p5)
  connections: Map<string, WebSocket>;
  // Which game seats are held by live human WebSocket connections.
  // Bot scheduling skips any seat in this set.
  humanSeats: Set<string>;
  // Maps a client's opaque session id → assigned game seat.
  // Kept across disconnects so a page-refresh gets the same seat back.
  sessionToSeat: Map<string, string>;
  // Maps game seat id → stable PlayerIdentity UUID (from client localStorage).
  // Used to persist chip balance to the player_profiles DB table.
  seatToIdentityId: Map<string, string>;
  // Monotonic guard against stale late-disconnect writes overwriting hand-end syncs.
  // Stores the handId after increment for each seat that had a hand-end chip sync.
  // Disconnect sync skips the chip write if handId matches (hand-end already ran).
  lastChipSyncHand: Map<string, number>;
  // Chip balance at the start of the current hand — used to compute deltaChips.
  chipsAtHandStart: Map<string, number>;
  /** One stable, server-owned rebuy claim per zero-stack bust episode. */
  rebuyBustEvents: Map<string, TableRebuyBustEvent>;
  // Per-seat in-session stats (init on join, updated at each hand end).
  sessionStats: Map<string, SessionStat>;
  // Spectators: sessions watching but not seated (table full).
  spectators: Map<string, { ws: WebSocket; name: string }>;
  // Per-seat reconnect timers. Fired when a disconnected player has not returned
  // within RECONNECT_TIMEOUT_MS. On expiry the seat is released (converted to bot
  // mid-hand or to 'reserved' between hands) so the game can continue.
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  // Unix timestamp after which reserved seats convert to bots. 0 = window closed.
  joinWindowEndsAt: number;
  // Private tables are excluded from the live table listing and never auto-fill bots.
  isPrivate: boolean;
  // Host-configurable settings (stored at creation, respected by all bot/seat logic)
  maxPlayers: number;   // 2-5: how many human seats are open
  botsEnabled: boolean; // false = no bots ever fill empty seats
  crewId?: string;      // club table — bots suppressed regardless of botsEnabled
  stakeTier: StakeTierId;
  // Turn-timer support: monotonic generation counter + active handle.
  // Increments whenever armTurnTimer or clearTurnTimer is called so that
  // a late-firing timeout can detect it is stale and abort cleanly.
  turnTimerGen: number;
  turnTimer: ReturnType<typeof setTimeout> | null;
  // Bot fill + auto-start timer handle. Cleared when a human presses Start.
  botFillTimer?: ReturnType<typeof setTimeout>;
  // ── Buy-in Slider ─────────────────────────────────────────────────────────
  seatBankroll: Map<string, number>;
  seatLeaveIds: Map<string, string>;
  pendingFundingSeats: Set<string>;
  fundedSeats: Set<string>;
  fundingPromises: Map<string, Promise<boolean>>;
  // ── Time Bank ─────────────────────────────────────────────────────────────
  seatTimeBankSessionUsed: Map<string, number>;
  seatTimeBankLastTurnKey: Map<string, string>;
}

const tables = new Map<string, AuthTable>();

// ─── Seat assignment ──────────────────────────────────────────────────────────

function assignSeat(table: AuthTable, sessionId: string, identityId?: string): SeatId | null {
  // Reconnect: session already has a seat — reuse it.
  const existing = table.sessionToSeat.get(sessionId);
  if (existing && SEAT_ORDER.includes(existing as SeatId)) return existing as SeatId;

  // Enforce host-configured maxPlayers — don't seat more humans than allowed.
  if (table.humanSeats.size >= table.maxPlayers) return null;

  return availableStreakSeat(table.state, SEAT_ORDER, table.connections, identityId) as SeatId | null;
}

// ─── Session stats helper ─────────────────────────────────────────────────────
// Always returns a fully-populated stats object for a seat.
// Falls back to safe defaults when stats are not yet initialized (should not
// happen after the synchronous init added in addBadugiConnection, but provides
// safety for spectators and edge cases).

function buildBadugiSessionStats(table: AuthTable, seatId: string): {
  startChips: number; currentChips: number; netProfit: number;
  handsPlayed: number; biggestPotWon: number; winStreak: number; lossStreak: number;
  sessionHighProfit: number; sessionLowProfit: number;
  isHeater: boolean; isCold: boolean; isNearEven: boolean;
  comebackActive: boolean; momentum: 'up' | 'down' | 'flat';
  bankrollTier: 'LOW' | 'MID' | 'HIGH';
  tableStakes: 'LOW' | 'MID' | 'HIGH';
  dangerZone: boolean; lastStand: boolean;
  protectingLead: boolean; peakDrop: number;
  shouldLeaveSignal: boolean; shouldContinueSignal: boolean;
} {
  const ss = table.sessionStats.get(seatId);
  const currentChips  = table.state.players.find(p => p.id === seatId)?.chips
    ?? ss?.startChips ?? 0;
  const startChips    = ss?.startChips ?? currentChips;
  const netProfit     = currentChips - startChips;
  const winStreak     = table.state.winStreaks?.[seatId] ?? 0;
  const lossStreak    = ss?.lossStreak   ?? 0;
  const handsPlayed   = ss?.handsPlayed  ?? 0;

  const sessionHighProfit = ss?.sessionHighProfit ?? 0;
  const sessionLowProfit  = ss?.sessionLowProfit  ?? 0;
  const recentDeltas      = ss?.recentDeltas ?? [];

  const isHeater = winStreak >= 3;
  const isCold   = lossStreak >= 3;

  const nearEvenBand = Math.max(1, Math.round(startChips * 0.05));
  const isNearEven   = handsPlayed > 0 && netProfit >= -nearEvenBand && netProfit <= nearEvenBand;

  const comebackThreshold = Math.max(5, Math.round(startChips * 0.05));
  const lastTwoPositive   = recentDeltas.length >= 2 && recentDeltas.slice(-2).every(d => d > 0);
  const comebackActive    = sessionLowProfit < -comebackThreshold
    && netProfit > sessionLowProfit
    && lastTwoPositive;

  const momentum: 'up' | 'down' | 'flat' =
    recentDeltas.length < 2 ? 'flat'
    : recentDeltas.slice(-2).every(d => d > 0) ? 'up'
    : recentDeltas.slice(-2).every(d => d < 0) ? 'down'
    : 'flat';

  // ── Stakes + pressure signals ─────────────────────────────────────────────
  const bankrollTier: 'LOW' | 'MID' | 'HIGH' =
    currentChips < 3000 ? 'LOW' : currentChips <= 10000 ? 'MID' : 'HIGH';

  const allChips = table.state.players
    .filter(p => p.chips > 0)
    .map(p => p.chips);
  const avgTableChips = allChips.length > 0
    ? Math.round(allChips.reduce((a, b) => a + b, 0) / allChips.length) : 10000;
  const tableStakes: 'LOW' | 'MID' | 'HIGH' =
    avgTableChips < 3000 ? 'LOW' : avgTableChips <= 10000 ? 'MID' : 'HIGH';

  const dangerZone = netProfit < -(startChips * 0.20) || currentChips < 3000;
  const lastStand  = currentChips < 1500;

  const protectingLead = netProfit > 0 && momentum !== 'down';
  const peakDrop       = Math.max(0, sessionHighProfit - netProfit);

  const shouldLeaveSignal =
    netProfit > startChips * 0.30
    || (dangerZone && lossStreak >= 3);

  const shouldContinueSignal = comebackActive || isNearEven || isHeater;

  return {
    startChips,
    currentChips,
    netProfit,
    handsPlayed,
    biggestPotWon:  ss?.biggestPotWon ?? 0,
    winStreak,
    lossStreak,
    sessionHighProfit,
    sessionLowProfit,
    isHeater,
    isCold,
    isNearEven,
    comebackActive,
    momentum,
    bankrollTier,
    tableStakes,
    dangerZone,
    lastStand,
    protectingLead,
    peakDrop,
    shouldLeaveSignal,
    shouldContinueSignal,
  };
}

// ─── Broadcast + persist ──────────────────────────────────────────────────────

function broadcastState(table: AuthTable): void {
  const spectatorCount = table.spectators.size;
  const stateWithMeta = spectatorCount > 0
    ? { ...table.state, spectatorCount }
    : table.state;

  for (const [playerId, ws] of Array.from(table.connections.entries())) {
    if (ws.readyState !== 1 /* OPEN */) continue;
    try {
      let personalState = maskStateForPlayer(stateWithMeta, playerId);
      if (table.state.phase === 'SHOWDOWN') {
        const prevChips = table.chipsAtHandStart.get(playerId);
        if (prevChips !== undefined) {
          const nowChips = table.state.players.find(p => p.id === playerId)?.chips ?? prevChips;
          personalState = { ...personalState, heroChipChange: nowChips - prevChips };
        }
      }
      // Enrich players with identityId so client can resolve seat→UUID for block feature
      const enrichedState = {
        ...personalState,
        players: personalState.players.map(p => {
          const iid = table.seatToIdentityId.get(p.id);
          return iid ? { ...p, identityId: iid } : p;
        }),
      };
      ws.send(JSON.stringify({
        type: 'badugi:snapshot',
        state: enrichedState,
        sessionStats: buildBadugiSessionStats(table, playerId),
      }));
    } catch { /* ignore closed socket race */ }
  }
  // Also send to spectators (all cards hidden, no sessionStats)
  for (const [, spec] of Array.from(table.spectators.entries())) {
    if (spec.ws.readyState !== 1) continue;
    try {
      const spectatorView = maskStateForPlayer(stateWithMeta, '__spectator__');
      spec.ws.send(JSON.stringify({ type: 'badugi:snapshot', state: spectatorView }));
    } catch {}
  }
  // Debounced persistence: write state ~2 s after last mutation
  scheduleSave(table.tableId, table.state, table.handId);
}

// ─── Round-over check ─────────────────────────────────────────────────────────

export async function rebuyBadugiSeat(
  tableId: string,
  seat: string,
  identityId: string,
  requestId: string,
  kind: 'free' | 'reserve' | 'borrow' | 'legacy',
  amount?: number,
): Promise<{ chips: number; walletBalance: number }> {
  const requestKey = `badugi:${identityId}:${tableId}:${seat}:${requestId}`;
  return runIdempotentTableRebuyRequest(requestKey, async () => {
    const table = tables.get(tableId);
    if (!table) throw new Error('This table is no longer available.');

    let acquiredLock = false;
    for (let attempt = 0; attempt < 400; attempt++) {
      if (table.leavingSeats.has(seat)) throw new Error('You are leaving this table.');
      const funding = table.fundingPromises.get(seat);
      if (funding) {
        if (!await funding) throw new Error('Your table buy-in could not be confirmed.');
        continue;
      }
      if (table.pendingFundingSeats.has(seat) || !table.fundedSeats.has(seat)) {
        throw new Error('Your table buy-in is not confirmed. Please reconnect.');
      }
      if (table.showdownResolvePromise) {
        await table.showdownResolvePromise;
        continue;
      }
      if (table.settlementPromise) {
        await table.settlementPromise;
        continue;
      }
      if (table.state.phase === 'SHOWDOWN') {
        await resetToAnte(table);
        continue;
      }
      if (table.actionLock) {
        await new Promise(resolve => setTimeout(resolve, 5));
        continue;
      }
      table.actionLock = true;
      acquiredLock = true;
      break;
    }
    if (!acquiredLock) throw new Error('The table is busy. Please try again.');
    try {
      if (table.leavingSeats.has(seat) || table.connections.get(seat)?.readyState !== 1 ||
          table.seatToIdentityId.get(seat) !== identityId || !table.fundedSeats.has(seat)) {
        throw new Error('Your player seat is no longer available.');
      }
      if (table.state.phase !== 'WAITING' && table.state.phase !== 'ANTE') {
        throw new Error('Wait until the current hand finishes before rebuying.');
      }
      const player = table.state.players.find(p => p.id === seat);
      if (!player || player.presence !== 'human' || player.status === 'active' || player.chips !== 0) {
        throw new Error('A rebuy is only available to your busted table seat.');
      }

      const handId = table.handId;
      const bustEvent = getTableRebuyBustEvent(table.rebuyBustEvents, seat, identityId);
      if (bustEvent.claimed) {
        throw new Error('A rebuy has already been used for this bust event.');
      }
      const eventId = bustEvent.eventId;
      const baseline = table.chipsAtHandStart.get(seat) ?? 0;
      const { minBuyin, maxBuyin } = getBuyInBounds(table.state.minBet);
      const profile = await storage.getPlayerProfile(identityId);
      if (!profile) throw new Error('Your chip balance could not be loaded.');

      const availableReserve = Math.max(0, profile.chipBalance - baseline);
      const maxTransfer = Math.min(maxBuyin - player.chips, availableReserve);
      let rebuyKind = kind;
      let rebuyAmount = amount;
      if (kind === 'legacy') {
        const resolved = resolveLegacyTableRebuy(
          amount,
          availableReserve,
          maxTransfer,
          minBuyin,
          table.state.minBet * 100,
          (profile.chipLoanBalance ?? 0) > 0,
        );
        rebuyKind = resolved.kind;
        rebuyAmount = resolved.amount;
      }

      let creditAmount: number;
      let walletBalance = profile.chipBalance;
      if (rebuyKind === 'free') {
        creditAmount = 1000;
        if (creditAmount > maxBuyin) throw new Error('This free rebuy exceeds the table stack limit.');
        const grant = await storage.claimFreeTableRebuy(identityId, tableId, eventId);
        if (!grant.granted) throw new Error('The free rebuy for this hand has already been used.');
        markTableRebuyEventClaimed(bustEvent);
        walletBalance = grant.chipBalance;
      } else if (rebuyKind === 'borrow') {
        if (rebuyAmount !== undefined && rebuyAmount !== 1000) throw new Error('Borrowing always adds exactly 1,000 chips.');
        creditAmount = 1000;
        if (creditAmount > maxBuyin) throw new Error('This borrowed rebuy exceeds the table stack limit.');
        const grant = await storage.grantTableChipLoan(identityId, `badugi:${tableId}`, eventId);
        if (!grant.success || grant.newBalance === undefined) {
          const messages: Record<string, string> = {
            existing_loan: 'Repay your current chip loan before borrowing again.',
            not_broke: 'Borrowing is only available when your wallet has 500 chips or less.',
            player_not_found: 'Your chip balance could not be loaded.',
          };
          throw new Error(messages[grant.error ?? ''] ?? 'The chip loan could not be granted.');
        }
        markTableRebuyEventClaimed(bustEvent);
        walletBalance = grant.newBalance;
      } else {
        creditAmount = rebuyAmount == null
          ? Math.min(Math.max(minBuyin, table.state.minBet * 100), maxTransfer)
          : rebuyAmount;
        if (!Number.isSafeInteger(creditAmount) || creditAmount < minBuyin) {
          throw new Error(`Choose at least ${minBuyin.toLocaleString()} available chips to rebuy.`);
        }
        if (creditAmount > maxTransfer) throw new Error('That rebuy exceeds your available wallet reserve or table stack limit.');
      }

      if (table.handId !== handId) throw new Error('The hand changed before your rebuy completed.');
      const startChips = table.chipsAtHandStart.get(seat) ?? player.chips;
      const newChips = player.chips + creditAmount;
      // Moves/credits a wallet allocation, not table profit.
      table.chipsAtHandStart.set(seat, startChips + creditAmount);
      table.seatBankroll.set(seat, Math.max(0, walletBalance - (startChips + creditAmount)));
      markTableRebuyEventFunded(bustEvent);
      table.state = addMsg({
        ...table.state,
        players: table.state.players.map(p => p.id === seat ? {
          ...p, chips: newChips, status: table.state.phase === 'WAITING' ? 'active' : p.status, hasActed: false,
        } : p),
      }, `${player.name} rebuys ${creditAmount.toLocaleString()} chips`);
      const result = { chips: newChips, walletBalance };
      broadcastState(table);
      return result;
    } finally {
      table.actionLock = false;
      scheduleNextBot(table);
      armTurnTimerBadugi(table);
    }
  });
}

function isRoundOver(state: GameState): boolean {
  const { phase } = state;

  if (phase === 'ANTE') {
    return state.players.filter(p => p.status === 'active').every(p => p.hasActed);
  }

  if (phase.startsWith('DRAW') || phase === 'DECLARE') {
    return state.players.filter(p => p.status === 'active').every(p => p.hasActed);
  }

  if (phase.startsWith('BET')) {
    const active = state.players.filter(p => p.status === 'active' && p.chips > 0);
    return active.every(p => p.hasActed) && active.every(p => p.bet === state.currentBet);
  }

  return false;
}

// ─── Phase advancement ────────────────────────────────────────────────────────

function advanceToNextPhase(table: AuthTable): void {
  const { state } = table;
  const phases = BadugiMode.phases;
  const idx = phases.indexOf(state.phase);
  if (idx === -1 || state.phase === 'SHOWDOWN') return;

  // Part 5: belt-and-suspenders sole-survivor guard — catches any edge case where
  // a fold reduced the table to one active player between the setTimeout scheduling
  // this call and the call actually firing.
  if (resolveByFoldBadugi(table)) return;

  const nextPhase = phases[(idx + 1) % phases.length] as GamePhase;

  const isBetRound  = nextPhase.startsWith('BET');
  const isDrawRound = nextPhase.startsWith('DRAW');
  const isDeclare   = nextPhase === 'DECLARE';
  const skipAllIn   = !isDeclare && !isDrawRound;

  const dealerIdx   = getDealerIndex(state.players);
  const firstActIdx = getNextActivePlayerIndex(state.players, dealerIdx, skipAllIn);

  const nextPlayers: Player[] = state.players.map(p => ({
    ...p,
    hasActed: false,
    bet: (isBetRound || isDrawRound) ? 0 : p.bet,
  }));

  const prevPhase = state.phase;
  table.state = addMsg({
    ...state,
    phase: nextPhase,
    currentBet: isBetRound ? 0 : state.currentBet,
    raisesThisRound: isBetRound ? 0 : (state.raisesThisRound ?? 0),
    activePlayerId: nextPlayers[firstActIdx].id,
    players: nextPlayers,
  }, nextPhase.replace(/_/g, ' '));

  engineLog('PHASE', table.tableId, {
    from: prevPhase,
    to: nextPhase,
    pot: table.state.pot,
    active: table.state.activePlayerId ?? undefined,
  });

  // ── DECLARE: auto-fold any active player who does not hold a valid Badugi ───
  // Bots handle this themselves in botAction; here we catch human players so
  // they are never shown a declaration prompt with a dead hand.
  if (nextPhase === 'DECLARE') {
    const declPlayers = [...table.state.players];
    const foldMsgs: string[] = [];
    let anyAutoFolded = false;
    for (let i = 0; i < declPlayers.length; i++) {
      const p = declPlayers[i];
      if (p.status !== 'active') continue;
      const ev = evaluateBadugi(p.cards);
      if (!ev?.isValidBadugi) {
        declPlayers[i] = { ...p, status: 'folded', declaration: null, hasActed: true };
        foldMsgs.push(`${p.name} has no Badugi — auto-folded`);
        anyAutoFolded = true;
      }
    }
    if (anyAutoFolded) {
      let st = { ...table.state, players: declPlayers };
      for (const msg of foldMsgs) st = addMsg(st, msg);
      // Update activePlayerId to next un-acted active player after auto-folds
      const nextUnacted = declPlayers.findIndex(p => p.status === 'active' && !p.hasActed);
      if (nextUnacted !== -1) st = { ...st, activePlayerId: declPlayers[nextUnacted].id };
      table.state = st;
      // If all were auto-folded, schedule phase advance explicitly
      if (isRoundOver(table.state)) {
        const fenced = table.handId;
        const fencedPhase = table.state.phase;
        setTimeout(() => {
          if (table.handId !== fenced || table.state.phase !== fencedPhase) return;
          advanceToNextPhase(table);
          broadcastState(table);
          scheduleNextBot(table);
        }, 450);
      }
    }
  }

  // ── DEAL is automatic: deal cards, then advance to DRAW_1 after 400ms ──────
  if (nextPhase === 'DEAL') {
    dealCards(table);
    const fenced = table.handId;
    broadcastState(table);
    setTimeout(() => {
      if (table.handId !== fenced) return;
      advanceToNextPhase(table);
      broadcastState(table);
      scheduleNextBot(table);
    }, 250);
    return;
  }

  // ── SHOWDOWN: resolve after a brief pause ─────────────────────────────────
  if (nextPhase === 'SHOWDOWN') {
    clearTurnTimerBadugi(table);
    resolveShowdown(table);
    return;
  }

  // Arm turn timer for the first human to act in the new phase
  armTurnTimerBadugi(table);
}

// ─── Card dealing (server canonical: all isHidden = false) ───────────────────

function dealCards(table: AuthTable): void {
  table.handId += 1;
  const deck = createDeck();

  // mode.deal expects a myId to reveal cards for; '__server__' matches no player
  // so all cards come back isHidden:true from the mode perspective. We then
  // override to isHidden:false — the server's canonical state exposes all cards.
  const dealt = BadugiMode.deal(deck, table.state.players, '__server__');

  table.state = {
    ...table.state,
    players: dealt.players.map(p => ({
      ...p,
      cards: p.cards.map(c => ({ ...c, isHidden: false })),
    })),
    deck: dealt.deck.map(c => ({ ...c, isHidden: false })),
    discardPile: [],
  };
}

// ─── Showdown resolution ──────────────────────────────────────────────────────

function resolveShowdown(table: AuthTable): void {
  const fenced = table.handId;

  let resolvePending!: () => void;
  const pending = new Promise<void>(resolve => { resolvePending = resolve; });
  table.showdownResolvePromise = pending;
  setTimeout(() => {
    try {
    // A manual restart can resolve this hand while its settlement is pending.
    if (table.handId !== fenced || table.state.phase !== 'SHOWDOWN' || table.resolvedPot !== undefined) return;

    const s = table.state;
    const grossPot = s.pot;
    table.resolvedPot = grossPot;
    const { winnerPot, rake } = applyRake(grossPot);
    if (rake > 0) {
      storage.logHouseRake({
        tableId:      table.tableId,
        gameMode:     'badugi',
        handOrRaceId: String(table.handId),
        grossPot,
        rakeAmount:   rake,
        netPot:       winnerPot,
      }).catch(console.error);
    }
    const result = BadugiMode.resolveShowdown(s.players, winnerPot, '__server__');

    const winner = result.players.find(p => p.isWinner)?.id ?? 'unknown';
    engineLog('PHASE', table.tableId, {
      from: 'SHOWDOWN',
      to: 'RESOLVE',
      pot: winnerPot,
      winner,
    });

    table.state = {
      ...s,
      players: result.players,
      winStreaks: confirmedWinStreaks(s, result.players),
      pot: result.pot,
      messages: [
        ...s.messages,
        ...result.messages.map(text => ({ id: makeId(), text, time: Date.now(), isResolution: true })),
      ].slice(-10),
    };

    broadcastState(table);

    const winnerIds = result.players.filter(p => p.isWinner).map(p => p.id);
    scheduleBotBanter(table, winnerIds, () => broadcastState(table));

    // Auto-advance to next hand after 2.5 seconds
    const fenced2 = table.handId;
    setTimeout(() => {
      if (table.handId !== fenced2 || table.state.phase !== 'SHOWDOWN') return;
      advanceAfterSettlement(table);
    }, 2500);
    } finally {
      resolvePending();
      if (table.showdownResolvePromise === pending) table.showdownResolvePromise = undefined;
    }
  }, 650);
}

// ─── Terminal-state guard (win-by-fold / no-actors) ──────────────────────────
// Mirror of resolveByFold in genericEngine.ts, scoped to the Badugi engine.
// If the hand is mid-flight and only one (or zero) non-folded players remain,
// award the pot to the survivor (or close the hand) and reset, instead of
// stalling in BET_*/DRAW_*/DECLARE with no legal actor.

function resolveByFoldBadugi(table: AuthTable): boolean {
  const s = table.state;
  if (s.phase === 'WAITING' || s.phase === 'SHOWDOWN' || s.phase === 'ANTE' || s.phase === 'DEAL') {
    return false;
  }

  const nonFolded = s.players.filter(p => p.status === 'active');

  if (nonFolded.length === 1) {
    const winner = nonFolded[0];
    const pot = s.pot;
    table.resolvedPot = pot;
    const { winnerPot, rake } = applyRake(pot);
    if (rake > 0) {
      storage.logHouseRake({
        tableId:      table.tableId,
        gameMode:     'badugi',
        handOrRaceId: String(table.handId),
        grossPot:     pot,
        rakeAmount:   rake,
        netPot:       winnerPot,
      }).catch(console.error);
    }
    const newPlayers = s.players.map(p =>
      p.id === winner.id
        ? { ...p, chips: p.chips + winnerPot, isWinner: true, hasActed: true }
        : { ...p, isWinner: false }
    );
    const winMsg = `${winner.name} wins $${winnerPot} (all opponents folded)`;
    table.state = {
      ...s,
      players: newPlayers,
      winStreaks: confirmedWinStreaks(s, newPlayers),
      pot: 0,
      phase: 'SHOWDOWN' as GamePhase,
      activePlayerId: winner.id,
      currentBet: 0,
      messages: [
        ...s.messages,
        { id: makeId(), text: winMsg, time: Date.now(), isResolution: true },
      ].slice(-10),
    };
    engineLog('PHASE', table.tableId, {
      from: s.phase, to: 'SHOWDOWN', reason: 'win-by-fold', winner: winner.id, pot: winnerPot,
    });
    console.log(`[CGP][server] win-by-fold badugi:${table.tableId} winner=${winner.id} pot=$${winnerPot} (rake=$${rake}) from=${s.phase}`);

    for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
    table.botTimers.clear();
    broadcastState(table);

    const fenced = table.handId;
    setTimeout(() => {
      if (table.handId !== fenced || table.state.phase !== 'SHOWDOWN') return;
      advanceAfterSettlement(table);
    }, 2500);
    return true;
  }

  if (nonFolded.length === 0) {
    console.log(`[CGP][server] no-active-players badugi:${table.tableId} pot=$${s.pot} from=${s.phase} — closing hand`);
    engineLog('PHASE', table.tableId, {
      from: s.phase, to: 'SHOWDOWN', reason: 'no-active-players', pot: s.pot,
    });
    table.state = addMsg({
      ...s,
      phase: 'SHOWDOWN' as GamePhase,
      currentBet: 0,
    }, 'Hand closed — no eligible players');

    for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
    table.botTimers.clear();
    broadcastState(table);

    const fenced = table.handId;
    setTimeout(() => {
      if (table.handId !== fenced || table.state.phase !== 'SHOWDOWN') return;
      advanceAfterSettlement(table);
    }, 1500);
    return true;
  }

  return false;
}

// ─── Reset after showdown ─────────────────────────────────────────────────────

function advanceAfterSettlement(table: AuthTable): void {
  const handId = table.handId;
  void resetToAnte(table).then(() => {
    if (table.settlementRetryTimer) clearTimeout(table.settlementRetryTimer);
    table.settlementRetryTimer = undefined;
    broadcastState(table);
  }).catch(err => {
    console.error(`[gameEngine] hand settlement failed table=${table.tableId} hand=${handId}`, err);
    engineLog('ERROR', table.tableId, { msg: 'hand-settlement-failed', handId });
    if (!table.settlementRetryTimer) {
      table.settlementRetryTimer = setTimeout(() => {
        table.settlementRetryTimer = undefined;
        if (table.handId === handId && table.state.phase === 'SHOWDOWN') advanceAfterSettlement(table);
      }, 2000);
    }
  });
}

export function resetToAnte(table: AuthTable): Promise<void> {
  if (table.settlementPromise) return table.settlementPromise;
  const pending = settleAndResetToAnte(table);
  table.settlementPromise = pending;
  const clearPending = () => {
    if (table.settlementPromise === pending) table.settlementPromise = undefined;
  };
  void pending.then(clearPending, clearPending); // Preserve rejection for the caller's logged retry.
  return pending;
}

async function settleAndResetToAnte(table: AuthTable): Promise<void> {
  const s = table.state;
  /* A real rollover = pot carried forward because nobody qualified.
     If there was a winner, pot was already distributed (s.pot === 0). */
  const hadWinner  = s.players.some(p => p.isWinner);
  const isRollover = s.pot > 0 && !hadWinner;
  const basePlayers = isRollover ? s.players : moveDealer(s.players);

  let nextPlayers: Player[] = basePlayers.map(p => {
    const isBotBusted = p.presence === 'bot' && p.chips === 0;
    const newChips = isBotBusted ? 10000 : p.chips;
    return {
      ...p,
      cards: [],
      bet: 0,
      totalBet: 0,
      chips: newChips,
      hasActed: false,
      declaration: null as Declaration,
      isWinner: undefined,
      isLoser: undefined,
      score: undefined,
      status: (isRollover
        ? (p.status === 'active' && newChips > 0 ? 'active' : 'sitting_out')
        : (newChips > 0 ? 'active' : 'sitting_out')) as PlayerStatus,
    };
  });

  // ── Safety: rollover with zero active players (no-actors close-out) ──────
  // Mirror of genericEngine: if everyone folded last hand, reactivate eligible
  // seats so the next hand can begin instead of stalling in ANTE.
  if (isRollover && !nextPlayers.some(p => p.status === 'active')) {
    console.log(`[CGP][server] reset:no-active-after-rollover badugi:${table.tableId} — reactivating eligible seats`);
    nextPlayers = nextPlayers.map(p => ({
      ...p,
      status: (p.chips > 0 ? 'active' : 'sitting_out') as PlayerStatus,
    }));
  }

  const dealerIdx   = getDealerIndex(nextPlayers);
  const firstActIdx = getNextActivePlayerIndex(nextPlayers, dealerIdx);

  // ── Sync human chip balances to player profiles ────────────────────────────
  // Leave the resolved SHOWDOWN intact until all idempotent DB writes succeed.
  //
  // IMPORTANT: nextPlayers.map() already set isWinner: undefined on all players.
  // Winner status must be resolved from s.players (SHOWDOWN snapshot) BEFORE
  // iterating nextPlayers — otherwise `won` is always false and handsWon /
  // winStreak / biggestPotWon / lifetimeProfit are never updated.
  const potWon = table.resolvedPot ?? s.pot;
  const completedHandId = String(table.handId);
  const winnerSeatIds = new Set(s.players.filter(p => p.isWinner).map(p => p.id));

  const settlements: Array<{ player: Player; identityId: string; isWinner: boolean; deltaChips: number }> = [];
  for (const p of nextPlayers) {
    if (p.presence !== 'human' || table.leavingSeats.has(p.id)) continue;
    const identityId = table.seatToIdentityId.get(p.id);
    if (!identityId) continue;

    const isWinner = winnerSeatIds.has(p.id);

    // Per-hand profit delta: end-of-hand chips minus recorded hand-start chips.
    const prevChips = table.chipsAtHandStart.get(p.id) ?? p.chips;
    const deltaChips = p.chips - prevChips;
    settlements.push({ player: p, identityId, isWinner, deltaChips });
    await storage.syncPlayerChips(identityId, deltaChips, { won: isWinner, deltaChips, gameId: table.tableId, handId: completedHandId, modeId: 'badugi', potSize: potWon });
  }

  // On failure, the hand stays in SHOWDOWN and can be safely retried.
  for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
  table.botTimers.clear();
  table.handId += 1;
  table.resolvedPot = undefined;

  for (const { player: p, identityId, isWinner, deltaChips } of settlements) {
    // Update in-memory session stats.
    const ss = table.sessionStats.get(p.id);
    if (ss) {
      ss.handsPlayed++;
      ss.winStreak = s.winStreaks?.[p.id] ?? 0;
      if (isWinner) {
        ss.lossStreak = 0;
        if (potWon > ss.biggestPotWon) ss.biggestPotWon = potWon;
      } else {
        ss.lossStreak++;
      }
      // Session pressure fields — never stored in DB.
      const netProfit = p.chips - ss.startChips;
      if (netProfit > ss.sessionHighProfit) ss.sessionHighProfit = netProfit;
      if (netProfit < ss.sessionLowProfit)  ss.sessionLowProfit  = netProfit;
      ss.recentDeltas.push(deltaChips);
      if (ss.recentDeltas.length > 3) ss.recentDeltas.shift();
    }

    // Record starting chips for the NEXT hand.
    table.chipsAtHandStart.set(p.id, p.chips);

    table.lastChipSyncHand.set(p.id, table.handId);
    if (isWinner) storage.awardWinStripes(identityId).catch(() => {});
  }

  const canStartHand = canStartNextHand(nextPlayers, table.fundedSeats);
  table.state = {
    ...s,
    phase: canStartHand ? 'ANTE' : 'WAITING',
    currentBet: 0,
    raisesThisRound: 0,
    heroChipChange: undefined,
    activePlayerId: canStartHand ? nextPlayers[firstActIdx].id : null,
    players: nextPlayers,
    deck: [],
    discardPile: [],
    turnDeadline: null,
    messages: [{
      id: makeId(),
      text: canStartHand ? 'New hand.' : 'Hand settled. Rebuy before starting another hand.',
      time: Date.now(),
    }],
  };

  engineLog('PHASE', table.tableId, {
    from: 'SHOWDOWN', to: table.state.phase, pot: table.state.pot, active: table.state.activePlayerId ?? undefined,
  });

  if (canStartHand) scheduleNextBot(table);
}

// ─── Bot scheduling ───────────────────────────────────────────────────────────

function scheduleNextBot(table: AuthTable): void {
  const { state, handId } = table;
  if (!state.activePlayerId) return;

  const active = state.players.find(p => p.id === state.activePlayerId);
  if (!active || active.presence !== 'bot' || active.status !== 'active') return;
  // A human has claimed this seat — wait for their action instead of auto-playing.
  if (table.humanSeats.has(active.id)) return;

  const botId          = active.id;
  const capturedHandId = handId;
  const capturedPhase  = state.phase;

  const existing = table.botTimers.get(botId);
  if (existing) clearTimeout(existing);

  const decisionType = capturedPhase.startsWith('BET') ? 'medium' as const : 'easy' as const;
  const thinkMs      = getBotThinkDelay(botTier(botId), decisionType);

  const timer = setTimeout(() => {
    table.botTimers.delete(botId);
    if (table.handId !== capturedHandId || table.state.phase !== capturedPhase) return;
    executeBotAction(table, botId);
  }, thinkMs);

  table.botTimers.set(botId, timer);
}

// ─── Seat release ─────────────────────────────────────────────────────────────
// Called when a player intentionally leaves OR when the reconnect timeout expires.
//
// "Between hands" = WAITING (lobby) OR the very start of ANTE before this player
// has posted their ante (they have not yet committed a chip to the hand).
// In both cases the seat is freed back to 'reserved' (open for a new player).
//
// Mid-hand (any other state): converts the seat to a bot so the round completes
// cleanly. The bot placeholder is replaced when a new human joins the seat.

function releaseSeat(table: AuthTable, seat: string): void {
  const phase      = table.state.phase;
  const seatPlayer = table.state.players.find(p => p.id === seat);
  // Pre-ante leave: player has not yet committed a chip, treat as between-hands.
  const isBetweenHands = phase === 'WAITING' || (phase === 'ANTE' && !seatPlayer?.hasActed);

  table.state = {
    ...table.state,
    ...releaseSeatStreak(table.state, seat),
    players: table.state.players.map(p => {
      if (p.id !== seat) return p;
      if (isBetweenHands) {
        const emptyP = table.crewId ? 'open' as const : 'reserved' as const;
        return { ...p, presence: emptyP, status: 'sitting_out' as const, name: 'Open', cards: [], bet: 0, totalBet: 0 };
      }
      // Mid-hand: hand off to bot so the round completes cleanly.
      // Club tables have no bots — fold the seat instead so the hand advances.
      if (table.crewId) {
        return { ...p, presence: 'open' as const, status: 'folded' as const, name: 'Open', cards: [], bet: 0, totalBet: 0 };
      }
      return makeBotPlayer(p, getBotName(table.tableId, p.id));
    }),
  };

  if (!isBetweenHands) {
    if (table.crewId && table.state.activePlayerId === seat) {
      // Club table: the folded seat was the active player — advance past it.
      const myIdx  = table.state.players.findIndex(p => p.id === seat);
      const nextIdx = getNextActivePlayerIndex(table.state.players, myIdx, false);
      table.state = { ...table.state, activePlayerId: table.state.players[nextIdx].id };
    }
    broadcastState(table);
    scheduleNextBot(table);
  } else if (phase === 'ANTE' && table.state.activePlayerId === seat) {
    // Freed seat was the active ante player — advance to the next eligible player
    // so the ante round does not stall waiting for a now-empty seat.
    const myIdx  = table.state.players.findIndex(p => p.id === seat);
    const nextIdx = getNextActivePlayerIndex(table.state.players, myIdx, false);
    table.state = { ...table.state, activePlayerId: table.state.players[nextIdx].id };
    broadcastState(table);
    scheduleNextBot(table);
  } else {
    broadcastState(table);
  }
}

// ─── Bot action execution ─────────────────────────────────────────────────────

function executeBotAction(table: AuthTable, botId: string): void {
  // If a human claimed this seat since the timer was scheduled, drop silently.
  if (table.humanSeats.has(botId)) return;

  if (table.actionLock) {
    const capturedHandId = table.handId;
    const capturedPhase  = table.state.phase;
    setTimeout(() => {
      if (table.handId !== capturedHandId || table.state.phase !== capturedPhase) return;
      executeBotAction(table, botId);
    }, 200);
    return;
  }

  table.actionLock = true;

  try {
    const oldCurrentBet = table.state.currentBet;
    const result = BadugiMode.botAction(table.state, botId);
    if (!result) { table.actionLock = false; return; }

    const { stateUpdates, message, roundOver, nextPlayerId } = result;

    let newState: GameState = { ...table.state, ...stateUpdates };

    // Maintain totalBet accumulator
    if (stateUpdates.players) {
      newState.players = newState.players.map(p => {
        const old = table.state.players.find(op => op.id === p.id);
        if (!old) return p;
        const chipLoss = Math.max(0, old.chips - p.chips);
        return { ...p, totalBet: (old.totalBet || 0) + chipLoss };
      });
    }

    if (message) newState = addMsg(newState, message);

    const wasRaise = (newState.currentBet ?? 0) > oldCurrentBet;

    if (wasRaise) {
      newState.players = newState.players.map(p =>
        p.id !== botId && p.status === 'active' ? { ...p, hasActed: false } : p
      );
    }

    engineLog('BOT', table.tableId, {
      bot: botId,
      action: message ?? '?',
      phase: table.state.phase,
      roundOver: roundOver ? true : undefined,
    });

    table.state = newState;
    table.actionLock = false;
    broadcastState(table);

    // Terminal-state guard (post-bot-action): same as afterHumanAction.
    if (resolveByFoldBadugi(table)) return;

    if (roundOver) {
      const capturedHandId = table.handId;
      const capturedPhase  = table.state.phase;
      setTimeout(() => {
        if (table.handId !== capturedHandId || table.state.phase !== capturedPhase) return;
        advanceToNextPhase(table);
        broadcastState(table);
        scheduleNextBot(table);
      }, wasRaise ? 500 : 350);
    } else if (nextPlayerId) {
      table.state = { ...table.state, activePlayerId: nextPlayerId };
      broadcastState(table);
      scheduleNextBot(table);
      armTurnTimerBadugi(table);
    }
  } catch (err) {
    engineLog('ERROR', table.tableId, { msg: 'bot-action-threw', bot: botId, phase: table.state.phase });
    console.error('[badugi:ERROR] bot action error:', err);
    table.actionLock = false;
  }
}

// ─── Turn timer (Badugi engine) ───────────────────────────────────────────────

function clearTurnTimerBadugi(table: AuthTable): void {
  table.turnTimerGen += 1;
  if (table.turnTimer !== null) {
    clearTimeout(table.turnTimer);
    table.turnTimer = null;
  }
  if (table.state.turnDeadline != null) {
    table.state = { ...table.state, turnDeadline: null };
  }
}

function armTurnTimerBadugi(table: AuthTable): void {
  clearTurnTimerBadugi(table); // bumps gen, clears existing handle
  const s = table.state;
  const activeSeat = s.activePlayerId ? s.players.find(p => p.id === s.activePlayerId) : null;

  // Only arm for human seats in interactive phases
  if (!activeSeat || activeSeat.presence !== 'human' || !BADUGI_INTERACTIVE_PHASES.has(s.phase)) {
    if (s.turnDeadline != null) table.state = { ...s, turnDeadline: null };
    return;
  }

  const deadline = Date.now() + BADUGI_TURN_TIMEOUT_MS;
  const genAtArm = table.turnTimerGen;
  const seatAtArm = activeSeat.id;

  table.state = { ...table.state, turnDeadline: deadline };
  broadcastState(table); // push deadline to clients immediately

  table.turnTimer = setTimeout(() => {
    table.turnTimer = null;
    if (table.turnTimerGen !== genAtArm) return; // stale — a newer arm/clear ran
    if (table.state.activePlayerId !== seatAtArm) return; // player already acted
    autoActOnTimeoutBadugi(table, seatAtArm);
  }, BADUGI_TURN_TIMEOUT_MS);
}

function autoActOnTimeoutBadugi(table: AuthTable, seat: string): void {
  if (table.actionLock) {
    // Retry in 200 ms — lock will release shortly
    const genAtRetry = table.turnTimerGen;
    setTimeout(() => {
      if (table.turnTimerGen !== genAtRetry) return;
      autoActOnTimeoutBadugi(table, seat);
    }, 200);
    return;
  }

  table.actionLock = true;
  try {
    const s = table.state;
    if (s.activePlayerId !== seat) { table.actionLock = false; return; }

    const player = s.players.find(p => p.id === seat);
    if (!player || player.status !== 'active') { table.actionLock = false; return; }

    const phase = s.phase;
    engineLog('TURN_TIMEOUT', table.tableId, { seat, phase });

    if (phase.startsWith('BET')) {
      // Auto-check if no bet to call, otherwise auto-fold
      const canCheck = (s.currentBet - player.bet) === 0;
      if (canCheck) {
        table.state = addMsg({
          ...s,
          players: s.players.map(p => p.id === seat ? { ...p, hasActed: true } : p),
          turnDeadline: null,
        }, `${player.name} timed out — auto-check`);
      } else {
        table.state = addMsg({
          ...s,
          players: s.players.map(p => p.id === seat ? { ...p, status: 'folded', hasActed: true } : p),
          turnDeadline: null,
        }, `${player.name} timed out — auto-fold`);
      }
    } else if (phase.startsWith('DRAW')) {
      // Auto-stand-pat (discard nothing)
      table.state = addMsg({
        ...s,
        players: s.players.map(p => p.id === seat ? { ...p, hasActed: true } : p),
        turnDeadline: null,
      }, `${player.name} timed out — stood pat`);
    } else if (phase === 'DECLARE') {
      // Auto-fold on declare timeout
      table.state = addMsg({
        ...s,
        players: s.players.map(p => p.id === seat ? { ...p, status: 'folded', declaration: null, hasActed: true } : p),
        turnDeadline: null,
      }, `${player.name} timed out — auto-fold on declare`);
    } else if (phase === 'ANTE') {
      const ante = takeAnte(player.chips, 25);
      table.state = addMsg({
        ...s,
        pot: s.pot + ante.contribution,
        players: s.players.map(p =>
          p.id === seat ? { ...p, chips: ante.chips, hasActed: true, totalBet: (p.totalBet || 0) + ante.contribution } : p
        ),
        turnDeadline: null,
      }, `${player.name} timed out — auto-ante $${ante.contribution}`);
    } else {
      table.actionLock = false;
      return;
    }

    table.actionLock = false;
    afterHumanAction(table);
  } catch (err) {
    engineLog('ERROR', table.tableId, { msg: 'turn-timeout-threw', seat, phase: table.state.phase });
    console.error('[badugi:ERROR] turn timeout error:', err);
    table.actionLock = false;
  }
}

// ─── After-human-action plumbing ──────────────────────────────────────────────

function afterHumanAction(table: AuthTable, wasRaise = false): void {
  // Clear the timer — player acted in time (or timeout already fired).
  clearTurnTimerBadugi(table);
  broadcastState(table);

  // Terminal-state guard: lone survivor wins by fold, or zero actors → reset.
  if (resolveByFoldBadugi(table)) return;

  if (isRoundOver(table.state)) {
    const capturedHandId = table.handId;
    const capturedPhase  = table.state.phase;
    setTimeout(() => {
      if (table.handId !== capturedHandId || table.state.phase !== capturedPhase) return;
      advanceToNextPhase(table);
      broadcastState(table);
      scheduleNextBot(table);
    }, wasRaise ? 500 : 350);
  } else {
    const s = table.state;
    const isDrawPhase    = s.phase.startsWith('DRAW');
    const isDeclarePhase = s.phase === 'DECLARE';
    const skipAllIn      = !isDrawPhase && !isDeclarePhase;
    const myIdx   = s.players.findIndex(p => p.id === s.activePlayerId);
    let nextIdx: number;
    if (isDeclarePhase) {
      // Advance to the next active player who has NOT yet declared.
      // This correctly handles the case where humans declare out of strict
      // turn order (both clicking simultaneously) — the activePlayerId cursor
      // skips already-declared players so bots still get their scheduled turn.
      nextIdx = myIdx;
      for (let i = 1; i <= s.players.length; i++) {
        const idx = (myIdx + i) % s.players.length;
        if (s.players[idx].status === 'active' && !s.players[idx].hasActed) { nextIdx = idx; break; }
      }
    } else {
      nextIdx = getNextActivePlayerIndex(s.players, myIdx, skipAllIn);
    }
    table.state = { ...s, activePlayerId: s.players[nextIdx].id };
    broadcastState(table);
    scheduleNextBot(table);
    armTurnTimerBadugi(table);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Called once at server startup to restore persisted table states.
export async function initEngine(): Promise<void> {
  const restored = await loadPersistedTables();
  for (const { tableId, state, handId } of restored) {
    tables.set(tableId, {
      tableId,
      state,
      handId,
      actionLock: false,
      leavePromises: new Map(),
      leavingSeats: new Set(),
      botTimers: new Map(),
      connections: new Map(),
      humanSeats: new Set(),
      sessionToSeat: new Map(),
      seatToIdentityId: new Map(),
      lastChipSyncHand: new Map(),
      chipsAtHandStart: new Map(),
      rebuyBustEvents: new Map(),
      sessionStats: new Map(),
      spectators: new Map(),
      disconnectTimers: new Map(),
      joinWindowEndsAt: 0, // window already closed for restored tables
      isPrivate: false,
      maxPlayers: 5,
      botsEnabled: true,
      crewId: undefined,
      stakeTier: getStakeTierId(DEFAULT_STAKE_TIER_ID),
      turnTimerGen: 0,
      turnTimer: null,
      seatBankroll: new Map(),
      seatLeaveIds: new Map(),
      pendingFundingSeats: new Set(),
      fundedSeats: new Set(),
      fundingPromises: new Map(),
      seatTimeBankSessionUsed: new Map(),
      seatTimeBankLastTurnKey: new Map(),
    });
    engineLog('TABLE_CREATE', tableId, { source: 'restore', phase: state.phase, handId });
  }
  if (restored.length > 0) {
    console.log(`[badugi] Restored ${restored.length} table(s) from disk.`);
  }
}

// Returns summary info for all PUBLIC tables that currently have at least one
// active WebSocket connection. Private tables are excluded from the live listing.
export function getActiveBadugiTables(): { tableId: string; humanCount: number; phase: string; handId: number }[] {
  const result: { tableId: string; humanCount: number; phase: string; handId: number }[] = [];
  for (const [tableId, table] of Array.from(tables.entries())) {
    if (table.connections.size > 0 && !table.isPrivate) {
      result.push({
        tableId,
        humanCount: table.humanSeats.size,
        phase: table.state.phase,
        handId: table.handId,
      });
    }
  }
  return result;
}

export function getConnectedBadugiPlayers(): Array<{ playerId: string; tableId: string }> {
  const result: Array<{ playerId: string; tableId: string }> = [];
  for (const [tableId, table] of tables) {
    for (const seat of table.connections.keys()) {
      const playerId = table.seatToIdentityId.get(seat);
      if (playerId) result.push({ playerId, tableId });
    }
  }
  return result;
}

export function getPlayerBadugiTablePhases(playerId: string): Array<{ tableId: string; phase: string }> {
  const result: Array<{ tableId: string; phase: string }> = [];
  for (const [tableId, table] of tables) {
    if ([...table.seatToIdentityId.values()].includes(playerId)) {
      result.push({ tableId, phase: table.state.phase });
    }
  }
  return result;
}

export function getConnectedBadugiIdentityIds(tableId: string): string[] {
  const table = tables.get(tableId);
  if (!table) return [];
  return [...table.connections.keys()].map(seat => table.seatToIdentityId.get(seat)).filter((id): id is string => !!id);
}

export function getOrCreateBadugiTable(
  tableId: string,
  isPrivate = false,
  quickPlay = false,
  options: { maxPlayers?: number; botsEnabled?: boolean; crewId?: string; stakeTier?: StakeTierId } = {}
): AuthTable {
  if (!tables.has(tableId)) {
    const maxPlayers  = options.maxPlayers  ?? 5;
    const botsEnabled = options.botsEnabled ?? !isPrivate;
    const stakeTier = getStakeTierId(options.stakeTier);
    const joinWindowEndsAt = isPrivate || quickPlay ? 0 : Date.now() + JOIN_WINDOW_MS;
    const table: AuthTable = {
      tableId,
      state: makeInitialState(tableId, !!options.crewId, getStakeTier(stakeTier).minBet),
      handId: 0,
      actionLock: false,
      leavePromises: new Map(),
      leavingSeats: new Set(),
      botTimers: new Map(),
      connections: new Map(),
      humanSeats: new Set(),
      sessionToSeat: new Map(),
      seatToIdentityId: new Map(),
      lastChipSyncHand: new Map(),
      chipsAtHandStart: new Map(),
      rebuyBustEvents: new Map(),
      sessionStats: new Map(),
      spectators: new Map(),
      disconnectTimers: new Map(),
      joinWindowEndsAt,
      isPrivate,
      maxPlayers,
      botsEnabled,
      crewId: options.crewId,
      stakeTier,
      turnTimerGen: 0,
      turnTimer: null,
      seatBankroll: new Map(),
      seatLeaveIds: new Map(),
      pendingFundingSeats: new Set(),
      fundedSeats: new Set(),
      fundingPromises: new Map(),
      seatTimeBankSessionUsed: new Map(),
      seatTimeBankLastTurnKey: new Map(),
    };
    tables.set(tableId, table);
    engineLog('TABLE_CREATE', tableId, { source: 'new', joinWindowMs: JOIN_WINDOW_MS, isPrivate, quickPlay, maxPlayers, botsEnabled });
    if (!isPrivate && !quickPlay && botsEnabled) {
      scheduleBadugiBotFill(tableId);
    }
  } else {
    // Refresh crewId and botsEnabled from options so a restored table (which
    // defaults to crewId=undefined, botsEnabled=true) picks up the correct
    // values as soon as the first player reconnects after a server restart.
    const t = tables.get(tableId)!;
    if (options.crewId !== undefined)     t.crewId     = options.crewId;
    if (options.botsEnabled !== undefined) t.botsEnabled = options.botsEnabled;
    if (options.stakeTier !== undefined) {
      t.stakeTier = getStakeTierId(options.stakeTier);
      t.state = { ...t.state, minBet: getStakeTier(t.stakeTier).minBet };
    }
  }
  return tables.get(tableId)!;
}

function registerWalletSpectator(table: AuthTable, sessionId: string, ws: WebSocket, name?: string) {
  table.spectators.set(sessionId, { ws, name: name ?? 'Spectator' });
  try {
    ws.send(JSON.stringify({ type: 'badugi:init', playerId: '__spectator__', role: 'spectator',
      state: maskStateForPlayer(table.state, '__spectator__') }));
  } catch {}
  broadcastState(table);
}

async function ensureBadugiSeatFunded(
  table: AuthTable,
  seat: string,
  identityId: string,
  playerName: string | undefined,
  buyinChips: number | undefined,
  isReconnect: boolean,
  hadSessionStats: boolean,
): Promise<boolean> {
  if (table.fundedSeats.has(seat)) return true;

  let fundingPromise = table.fundingPromises.get(seat);
  if (!fundingPromise) {
    table.pendingFundingSeats.add(seat);
    fundingPromise = (async (): Promise<boolean> => {
      try {
        const profile = await storage.getOrCreatePlayer(identityId, playerName);
        if (!profile || !Number.isFinite(profile.chipBalance) ||
            tables.get(table.tableId) !== table ||
            table.seatToIdentityId.get(seat) !== identityId ||
            table.leavingSeats.has(seat)) return false;
        if (profile.chipBalance <= 0 && !isReconnect) {
          throw new Error('A positive wallet balance is required to join a table.');
        }

        const player = table.state.players.find(p => p.id === seat);
        if (!player || player.presence !== 'human') return false;
        const isBetweenHands = table.state.phase === 'WAITING' || table.state.phase === 'ANTE';
        const preserveRestoredStack = isReconnect && !hadSessionStats && !isBetweenHands;
        if (!preserveRestoredStack) {
          const requestedBuyin = !isReconnect ? buyinChips ?? profile.chipBalance : profile.chipBalance;
          const effectiveStack = Math.min(clampBuyIn(requestedBuyin, table.state.minBet), profile.chipBalance);
          table.state = {
            ...table.state,
            players: table.state.players.map(p => p.id === seat ? { ...p, chips: effectiveStack } : p),
          };
          table.seatBankroll.set(seat, Math.max(0, profile.chipBalance - effectiveStack));
          table.chipsAtHandStart.set(seat, effectiveStack);
          table.sessionStats.set(seat, {
            startChips: effectiveStack,
            handsPlayed: 0,
            biggestPotWon: 0,
            winStreak: table.state.winStreaks?.[seat] ?? 0,
            lossStreak: 0,
            sessionHighProfit: 0,
            sessionLowProfit: 0,
            recentDeltas: [],
          });
        }

        try {
          await storage.setPlayerActiveTable(identityId, table.tableId, seat, 'badugi');
        } catch (error) {
          console.error('[gameEngine] Failed to persist player active table:', error);
        }
        table.fundedSeats.add(seat);
        broadcastState(table);
        return true;
      } catch (error) {
        const rejectionMessage = error instanceof Error && error.message === 'A positive wallet balance is required to join a table.'
          ? error.message
          : 'Unable to load your wallet. Please try again.';
        if (table.seatToIdentityId.get(seat) === identityId && !table.fundedSeats.has(seat)) {
          const currentWs = table.connections.get(seat);
          const currentSession = Array.from(table.sessionToSeat.entries()).find(([, heldSeat]) => heldSeat === seat)?.[0];
          for (const [sid, heldSeat] of table.sessionToSeat) {
            if (heldSeat === seat) table.sessionToSeat.delete(sid);
          }
          table.connections.delete(seat);
          table.humanSeats.delete(seat);
          table.seatToIdentityId.delete(seat);
          table.seatLeaveIds.delete(seat);
          table.sessionStats.delete(seat);
          table.chipsAtHandStart.delete(seat);
          table.lastChipSyncHand.delete(seat);
          table.seatBankroll.delete(seat);
          table.fundedSeats.delete(seat);
          releaseSeat(table, seat);
          if (rejectionMessage === 'A positive wallet balance is required to join a table.' && currentWs && currentSession) {
            registerWalletSpectator(table, currentSession, currentWs, playerName);
            return false;
          }
          try {
            currentWs?.send(JSON.stringify({ type: 'error', message: rejectionMessage }));
            currentWs?.close();
          } catch {}
        }
        console.error('[gameEngine] Failed to load player wallet before seating:', error);
        return false;
      }
    })();
    table.fundingPromises.set(seat, fundingPromise);
  }

  let funded = false;
  try {
    funded = await fundingPromise;
  } finally {
    if (table.fundingPromises.get(seat) === fundingPromise) {
      table.fundingPromises.delete(seat);
      table.pendingFundingSeats.delete(seat);
    }
  }
  return funded && table.fundedSeats.has(seat);
}

// Assigns a seat to the connecting browser session and sends an atomic
// badugi:init message (seat + current state in one frame so the client
// never processes a snapshot before it knows its own seat).
// Returns the assigned seat id, or null if the table is full.
export async function addBadugiConnection(
  tableId: string,
  sessionId: string,
  ws: WebSocket,
  playerName?: string,
  isPrivate = false,
  quickPlay = false,
  identityId?: string,
  options: { maxPlayers?: number; botsEnabled?: boolean; crewId?: string; stakeTier?: StakeTierId; spectateOnly?: boolean } = {},
  buyinChips?: number
): Promise<string | null> {
  const isNew = !tables.has(tableId);
  const table = getOrCreateBadugiTable(tableId, isPrivate, quickPlay, options);
  if (isNew && quickPlay && !options.spectateOnly) {
    quickFillBots(table);
  }

  const watchOnly = options.spectateOnly === true;
  let seat = watchOnly ? null : assignSeat(table, sessionId, identityId);
  if (!seat) {
    // Table full — register as spectator
    table.spectators.set(sessionId, { ws, name: playerName ?? 'Spectator' });
    engineLog('SPECTATOR_JOIN', tableId, { count: table.spectators.size });
    try {
      ws.send(JSON.stringify({
        type: 'badugi:init',
        playerId: '__spectator__',
        role: 'spectator',
        state: maskStateForPlayer(table.state, '__spectator__'),
      }));
    } catch {}
    broadcastState(table);
    return '__spectator__';
  }
  if (!identityId) {
    try {
      ws.send(JSON.stringify({ type: 'error', message: 'An authenticated player identity is required to join.' }));
      ws.close();
    } catch {}
    return null;
  }
  if (table.leavingSeats.has(seat)) {
    try { ws.send(JSON.stringify({ type: 'error', message: 'This seat is currently leaving.' })); } catch {}
    return null;
  }

  // ── Multi-tab / duplicate identity guard ────────────────────────────────────
  // Check if this identity already occupies a different seat (second tab or second
  // device). We check BEFORE committing sessionToSeat so the seat assignment is
  // still tentative and no state has been mutated.
  if (identityId) {
    let foundSeat: string | null = null;
    for (const [s, id] of table.seatToIdentityId.entries()) {
      if (id === identityId && s !== seat) { foundSeat = s; break; }
    }
    if (foundSeat) {
      if (table.connections.has(foundSeat)) {
        // Second tab / device while first is still connected: take over the seat.
        // Send a supersede notice to the old connection so the first tab knows it
        // has been displaced. The game state is unaffected — same seat, same chips.
        let oldSessionId: string | null = null;
        for (const [sid, s] of table.sessionToSeat.entries()) {
          if (s === foundSeat) { oldSessionId = sid; break; }
        }
        if (oldSessionId) {
          const oldWs = table.connections.get(foundSeat);
          if (oldWs) {
            try { oldWs.send(JSON.stringify({ type: 'badugi:superseded', reason: 'seat_taken_over' })); } catch {}
          }
          table.sessionToSeat.delete(oldSessionId);
          table.connections.delete(foundSeat);
          table.humanSeats.delete(foundSeat);
          // Cancel any pending disconnect timeout on this seat
          const dt = table.disconnectTimers.get(foundSeat);
          if (dt) { clearTimeout(dt); table.disconnectTimers.delete(foundSeat); }
        }
        engineLog('SESSION_TAKEOVER', tableId, {
          seat: foundSeat,
        });
        seat = foundSeat as typeof seat;
      } else {
        // No active connection → reconnect from a new tab or device.
        // Cancel the reconnect-expiry timer that may have been set on disconnect.
        const dt = table.disconnectTimers.get(foundSeat);
        if (dt) { clearTimeout(dt); table.disconnectTimers.delete(foundSeat); }
        engineLog('RECONNECT_NEW_TAB', tableId, {
          reclaimedSeat: foundSeat,
        });
        seat = foundSeat as typeof seat;
      }
    }
  }

  // Cancel any pending reconnect-expiry timer for this seat (covers same-session
  // reconnects where the timer was set during the initial disconnect).
  const pendingDisconnect = table.disconnectTimers.get(seat);
  if (pendingDisconnect) { clearTimeout(pendingDisconnect); table.disconnectTimers.delete(seat); }

  const sameSession = table.sessionToSeat.get(sessionId) === seat;
  const mappedIdentity = table.seatToIdentityId.get(seat);
  if (identityId && mappedIdentity && mappedIdentity !== identityId) {
    try { ws.send(JSON.stringify({ type: 'error', message: 'This seat belongs to another account.' })); } catch {}
    return null;
  }
  const isReconnect = identityId
    ? mappedIdentity === identityId
    : sameSession && !mappedIdentity;
  const streakClaim = claimSeatStreak(table.state, seat, identityId, sameSession, mappedIdentity);
  if (!isReconnect) {
    for (const [oldSession, heldSeat] of table.sessionToSeat) {
      if (heldSeat === seat) table.sessionToSeat.delete(oldSession);
    }
  }
  table.sessionToSeat.set(sessionId, seat);
  table.connections.set(seat, ws);
  table.humanSeats.add(seat);

  // Update name, presence, and—if taking a reserved seat—activate it.
  const wasReserved = (p => p === 'reserved' || p === 'open')(table.state.players.find(p => p.id === seat)?.presence ?? '');
  table.state = {
    ...table.state,
    ...streakClaim,
    players: table.state.players.map(p => {
      if (p.id !== seat) return p;
      return {
        ...p,
        ...(playerName ? { name: playerName } : {}),
        presence: 'human' as const,
        ...(wasReserved ? { status: 'active' as const } : {}),
      };
    }),
  };

  // ── Persist identity and load chips ────────────────────────────────────────
  if (identityId) {
    table.seatToIdentityId.set(seat, identityId);
    const hadSessionStats = table.sessionStats.has(seat);
    if (!hadSessionStats) {
      const placeholder = table.state.players.find(p => p.id === seat)?.chips ?? 10000;
      table.sessionStats.set(seat, {
        startChips: placeholder,
        handsPlayed: 0,
        biggestPotWon: 0,
        winStreak: table.state.winStreaks?.[seat] ?? 0,
        lossStreak: 0,
        sessionHighProfit: 0,
        sessionLowProfit: 0,
        recentDeltas: [],
      });
      table.chipsAtHandStart.set(seat, placeholder);
      table.lastChipSyncHand.set(seat, table.handId);
    }

    if (!isReconnect || !table.seatLeaveIds.has(seat)) {
      table.seatLeaveIds.set(seat, randomUUID());
    }

    // A new seat always waits for the canonical wallet and applies its requested
    // partial buy-in before init/action dispatch. Restart recovery also waits for
    // the profile, but preserves live chips if the hand is already underway.
    if (!table.fundedSeats.has(seat) &&
        !await ensureBadugiSeatFunded(table, seat, identityId, playerName, buyinChips, isReconnect, hadSessionStats)) {
      if (table.spectators.has(sessionId)) {
        return '__spectator__';
      }
      return null;
    }
  }

  // Restart the bot-fill + auto-start timer whenever a human joins or reconnects
  // to a WAITING table that has no active fill timer.  Intentionally omits
  // !isReconnect so iOS Safari reconnects (which may generate new sessionIds)
  // and any other returning player also get bots scheduled.
  if (
    !isNew &&
    !table.botFillTimer && table.state.phase === 'WAITING' &&
    !table.crewId && table.botsEnabled && !isPrivate
  ) {
    console.log(`[botFill] re-scheduling badugi fill for ${tableId} isReconnect=${isReconnect}`);
    scheduleBadugiBotFill(tableId);
  }
  if (
    !table.botFillTimer && table.state.phase === 'WAITING' &&
    !table.crewId && table.botsEnabled && !isPrivate && !quickPlay
  ) {
    scheduleBadugiBotFill(tableId);
  }

  engineLog(isReconnect ? 'RECONNECT' : 'PLAYER_JOIN', tableId, {
    player: seat,
    phase: table.state.phase,
    connections: table.connections.size,
    wasReserved,
    hasIdentity: !!identityId,
  });

  if (
    table.sessionToSeat.get(sessionId) !== seat ||
    table.connections.get(seat) !== ws ||
    table.seatToIdentityId.get(seat) !== identityId ||
    !table.fundedSeats.has(seat)
  ) return null;

  // Atomic init: seat assignment + masked snapshot + sessionStats in one message.
  // Client must process seat before it can correctly display cards.
  try {
    ws.send(JSON.stringify({
      type: 'badugi:init',
      playerId: seat,
      state: maskStateForPlayer(table.state, seat),
      sessionStats: buildBadugiSessionStats(table, seat),
      crewId: table.crewId ?? null,
    }));
  } catch { /* ws may have already closed */ }

  return seat;
}

export function removeBadugiConnection(tableId: string, sessionId: string, intentional = false): Promise<void> {
  const table = tables.get(tableId);
  if (!table || !intentional) return removeBadugiDisconnect(tableId, sessionId, intentional);
  if (table.spectators.has(sessionId)) return removeBadugiDisconnect(tableId, sessionId, true);
  const seat = table.sessionToSeat.get(sessionId);
  if (!seat) return Promise.resolve();
  const existing = table.leavePromises.get(seat);
  if (existing) return existing;

  table.leavingSeats.add(seat);
  const pending = settleBadugiLeave(table, sessionId, seat);
  table.leavePromises.set(seat, pending);
  void pending.finally(() => {
    if (table.leavePromises.get(seat) === pending) table.leavePromises.delete(seat);
  }).catch(() => {});
  return pending;
}

async function settleBadugiLeave(table: AuthTable, sessionId: string, seat: string): Promise<void> {
  while (table.actionLock) await new Promise(resolve => setTimeout(resolve, 5));
  table.actionLock = true;
  try {
    while (table.pendingFundingSeats.has(seat)) await new Promise(resolve => setTimeout(resolve, 5));
    if (table.showdownResolvePromise) await table.showdownResolvePromise;
    if (table.settlementPromise) await table.settlementPromise;
    if (table.state.phase === 'SHOWDOWN') await resetToAnte(table);
    if (table.settlementPromise) await table.settlementPromise;

    const identityId = table.seatToIdentityId.get(seat);
    if (identityId) {
      const player = table.state.players.find(p => p.id === seat);
      const baseline = player ? table.chipsAtHandStart.get(seat) ?? player.chips : 0;
      await storage.syncPlayerLeaveDelta(
        identityId,
        table.tableId,
        table.seatLeaveIds.get(seat) ?? sessionId,
        player ? player.chips - baseline : 0,
      );
      table.seatToIdentityId.delete(seat);
      table.fundedSeats.delete(seat);
      table.lastChipSyncHand.delete(seat);
      table.sessionStats.delete(seat);
      table.chipsAtHandStart.delete(seat);
      table.seatBankroll.delete(seat);
      table.seatLeaveIds.delete(seat);
      table.seatTimeBankSessionUsed.delete(seat);
      table.seatTimeBankLastTurnKey.delete(seat);
    }

    table.sessionToSeat.delete(sessionId);
    table.connections.delete(seat);
    table.humanSeats.delete(seat);
    table.actionLock = false;
    releaseSeat(table, seat);
    table.leavingSeats.delete(seat);
    engineLog('PLAYER_LEAVE', table.tableId, {
      player: seat,
      phase: table.state.phase,
      remaining: table.connections.size,
      intentional: true,
    });
  } finally {
    table.actionLock = false;
  }
}

async function removeBadugiDisconnect(tableId: string, sessionId: string, intentional = false): Promise<void> {
  const table = tables.get(tableId);
  if (!table) return;

  // Handle spectator disconnect
  if (table.spectators.has(sessionId)) {
    table.spectators.delete(sessionId);
    engineLog('SPECTATOR_LEAVE', tableId, { remaining: table.spectators.size });
    broadcastState(table);
    return;
  }

  const seat = table.sessionToSeat.get(sessionId);
  if (!seat) return;

  // If the player leaves while a showdown is being settled, wait for the
  // idempotent hand write before taking the final unsynced chip delta.
  if (intentional && table.settlementPromise) await table.settlementPromise;

  table.connections.delete(seat);
  table.humanSeats.delete(seat);

  // ── sessionToSeat retention policy ─────────────────────────────────────────
  // On reconnectable disconnect (intentional=false): keep sessionToSeat entry so
  // a same-session refresh reclaims the same seat automatically.
  // On intentional leave: remove it so the seat can be reassigned to a new player.
  if (intentional) {
    table.sessionToSeat.delete(sessionId);
  }

  const identityId = table.seatToIdentityId.get(seat);
  if (identityId && intentional) {
    const player = table.state.players.find(p => p.id === seat);
    const baseline = player ? table.chipsAtHandStart.get(seat) ?? player.chips : 0;
    await storage.syncPlayerLeaveDelta(
      identityId,
      table.tableId,
      table.seatLeaveIds.get(seat) ?? sessionId,
      player ? player.chips - baseline : 0,
    );
    table.seatToIdentityId.delete(seat);
    table.fundedSeats.delete(seat);
    table.lastChipSyncHand.delete(seat);
    table.sessionStats.delete(seat);
    table.chipsAtHandStart.delete(seat);
    table.seatBankroll.delete(seat);
    table.seatTimeBankSessionUsed.delete(seat);
    table.seatTimeBankLastTurnKey.delete(seat);
  }

  if (intentional) {
    // Free the seat immediately so the game can continue without the player.
    // Between hands → 'reserved'. Mid-hand → bot finishes the round.
    releaseSeat(table, seat);
  } else {
    // ── Reconnect timeout ───────────────────────────────────────────────────
    // Give the player RECONNECT_TIMEOUT_MS to return before releasing the seat.
    // The timer is keyed by seat and cancelled in addBadugiConnection on reconnect.
    const capturedSession = sessionId;
    const timer = setTimeout(() => {
      const t = tables.get(tableId);
      if (!t) return;
      // If the player has already reconnected (same or new session), abort.
      if (t.connections.has(seat)) return;
      // Session mapping was replaced by new reconnect (RECONNECT_NEW_TAB path)?
      if (t.sessionToSeat.get(capturedSession) !== seat && !t.connections.has(seat)) {
        // Could have reconnected via new session — also safe, timer already cleared.
        // Only continue if seat is genuinely still unoccupied.
        if (t.connections.has(seat)) return;
      }

      engineLog('RECONNECT_EXPIRED', tableId, { player: seat });
      t.disconnectTimers.delete(seat);
      t.sessionToSeat.delete(capturedSession);

      const id = t.seatToIdentityId.get(seat);
      if (id) {
        t.seatToIdentityId.delete(seat);
        t.fundedSeats.delete(seat);
        t.lastChipSyncHand.delete(seat);
        t.sessionStats.delete(seat);
        t.chipsAtHandStart.delete(seat);
        t.seatBankroll.delete(seat);
        t.seatTimeBankSessionUsed.delete(seat);
        t.seatTimeBankLastTurnKey.delete(seat);
        storage.clearPlayerActiveTable(id).catch(() => {});
      }
      releaseSeat(t, seat);
    }, RECONNECT_TIMEOUT_MS);

    table.disconnectTimers.set(seat, timer);
  }

  engineLog(intentional ? 'PLAYER_LEAVE' : 'PLAYER_DISCONNECT', tableId, {
    player: seat,
    phase: table.state.phase,
    remaining: table.connections.size,
    intentional,
  });
}

// ─── Per-recipient chat broadcast (respects block lists) ─────────────────────
// Replaces broadcastState() for 'chat' actions.  For every human seat the
// sender's profile UUID is resolved via seatToIdentityId; if the recipient has
// blocked the sender, the new message is stripped from their snapshot.
// table.state.chatMessages is NOT mutated — filtering is presentation-only.
async function broadcastChatFiltered(table: AuthTable, senderSeat: string): Promise<void> {
  const senderProfileId = table.seatToIdentityId.get(senderSeat);
  const spectatorCount  = table.spectators.size;
  const stateWithMeta   = spectatorCount > 0
    ? { ...table.state, spectatorCount }
    : table.state;

  for (const [recipientSeat, ws] of Array.from(table.connections.entries())) {
    if (ws.readyState !== 1) continue;
    const recipientProfileId = table.seatToIdentityId.get(recipientSeat);

    let baseState = stateWithMeta;
    if (senderProfileId && recipientProfileId && senderProfileId !== recipientProfileId) {
      try {
        const blocked = await storage.isBlocked(recipientProfileId, senderProfileId);
        if (blocked) {
          baseState = {
            ...stateWithMeta,
            chatMessages: stateWithMeta.chatMessages.filter(m => m.senderId !== senderSeat),
          };
        }
      } catch { /* degrade to unfiltered delivery on DB error */ }
    }

    try {
      let personalState = maskStateForPlayer(baseState, recipientSeat);
      if (table.state.phase === 'SHOWDOWN') {
        const prevChips = table.chipsAtHandStart.get(recipientSeat);
        if (prevChips !== undefined) {
          const nowChips = table.state.players.find(p => p.id === recipientSeat)?.chips ?? prevChips;
          personalState = { ...personalState, heroChipChange: nowChips - prevChips };
        }
      }
      ws.send(JSON.stringify({
        type: 'badugi:snapshot',
        state: personalState,
        sessionStats: buildBadugiSessionStats(table, recipientSeat),
      }));
    } catch { /* ignore closed socket race */ }
  }

  // Spectators are observers — no block filtering applied
  for (const [, spec] of Array.from(table.spectators.entries())) {
    if (spec.ws.readyState !== 1) continue;
    try {
      const spectatorView = maskStateForPlayer(stateWithMeta, '__spectator__');
      spec.ws.send(JSON.stringify({ type: 'badugi:snapshot', state: spectatorView }));
    } catch {}
  }

  scheduleSave(table.tableId, table.state, table.handId);
}

export function handleBadugiAction(tableId: string, playerId: string, action: string, payload: unknown): string | void {
  const table = tables.get(tableId);
  if (!table) {
    console.warn('[CGP][server] handleBadugiAction: NO TABLE FOUND', { tableId, action });
    engineLog('ACTION', tableId, { action, accepted: false, reason: 'no-table' });
    return;
  }
  if (table.pendingFundingSeats.has(playerId)) return 'Wallet funding is still in progress.';
  if (table.leavingSeats.has(playerId)) return;

  if (table.actionLock) {
    console.warn('[CGP][server] handleBadugiAction: actionLock held — DROPPING', { tableId, action });
    engineLog('ACTION', tableId, { player: playerId, action, accepted: false, reason: 'locked' });
    return;
  }
  console.log('[CGP][server] handleBadugiAction enter', { tableId, action, playerId, phase: table.state.phase });

  table.actionLock = true;

  try {
    const s = table.state;

    // ── start: WAITING → ANTE ────────────────────────────────────────────────
    if (action === 'start' && s.phase === 'WAITING') {
      if (table.pendingFundingSeats.size > 0) {
        table.actionLock = false;
        return;
      }
      if (!hasFundedHuman(s.players, table.fundedSeats)) {
        table.actionLock = false;
        return 'Rebuy before starting a new hand.';
      }
      // Cancel any pending bot-fill / auto-start timer so it doesn't fire later.
      if (table.botFillTimer) { clearTimeout(table.botFillTimer); table.botFillTimer = undefined; }
      // Close join window — fill any still-open seats with bots before the hand starts.
      // Club tables keep reserved seats open; all starts still require a funded human
      // and at least one additional active participant.
      convertReservedToBots(table);
      const freshPlayers = table.state.players;
      if (!canStartNextHand(freshPlayers, table.fundedSeats)) {
        table.actionLock = false;
        return 'At least two active players are required to start.';
      }
      table.handId += 1;
      const dealerIdx   = getDealerIndex(freshPlayers);
      const firstActIdx = getNextActivePlayerIndex(freshPlayers, dealerIdx);
      table.state = addMsg({
        ...table.state,
        phase: 'ANTE',
        activePlayerId: freshPlayers[firstActIdx].id,
      }, 'Ante up!');
      engineLog('ACTION', tableId, { player: playerId, action: 'start', accepted: true, phase: 'ANTE' });
      console.log('[CGP][server] badugi start ACCEPTED', { tableId, nextPhase: 'ANTE', activePlayerId: freshPlayers[firstActIdx].id, handId: table.handId });
      table.actionLock = false;
      broadcastState(table);
      scheduleNextBot(table);
      armTurnTimerBadugi(table);
      return;
    }

    if (action === 'start') {
      console.warn('[CGP][server] badugi start REJECTED', { tableId, currentPhase: s.phase, reason: 'phase!=WAITING' });
    }

    // ── restart: SHOWDOWN → ANTE (manual, overrides 5 s auto-reset) ──────────
    if (action === 'restart' && s.phase === 'SHOWDOWN') {
      if (!hasFundedHuman(s.players, table.fundedSeats)) {
        table.actionLock = false;
        return 'Rebuy before starting a new hand.';
      }
      // Guard: if the player clicked restart within the 650ms resolve window,
      // resolveShowdown hasn't fired yet — pot is still undistributed and no
      // isWinner is set. Resolve synchronously now so resetToAnte sees the
      // correct winner/pot state and never shows a false rollover message.
      // Detection: resolveShowdown appends isResolution messages; absence means
      // it hasn't run.
      const resolved = s.messages.some(m => m.isResolution);
      if (!resolved && table.resolvedPot === undefined) {
        table.resolvedPot = s.pot;
        const result = BadugiMode.resolveShowdown(s.players, s.pot, '__server__');
        table.state = {
          ...table.state,
          players: result.players,
          winStreaks: confirmedWinStreaks(s, result.players),
          pot: result.pot,
        };
      }
      for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
      table.botTimers.clear();
      table.actionLock = false;
      engineLog('ACTION', tableId, { player: playerId, action: 'restart', accepted: true });
      advanceAfterSettlement(table);
      return;
    }

    // Rebuys must arrive through the authenticated, confirmed rebuy request path.
    if (action === 'rebuy') {
      table.actionLock = false;
      return 'Use the confirmed table rebuy request.';
    }

    // ── chat — no turn required, any seated player can message ─────────────
    if (action === 'chat') {
      const rawText = typeof payload === 'string' ? payload.trim().slice(0, 150) : '';
      if (!rawText) { table.actionLock = false; return; }
      const sender = s.players.find(p => p.id === playerId);
      if (!sender) { table.actionLock = false; return; }
      const { filtered: text, hadProfanity } = filterChatMessage(rawText);
      if (hadProfanity) console.log(`[CHAT_FILTER] player=${playerId} table=${tableId} hadProfanity=true`);
      const msg: ChatMessage = {
        id: makeId(),
        senderId: playerId,
        senderName: sender.name,
        text,
        time: Date.now(),
      };
      table.state = { ...s, chatMessages: [...s.chatMessages.slice(-49), msg] };
      engineLog('ACTION', tableId, { player: playerId, action: 'chat', accepted: true });
      table.actionLock = false;
      broadcastChatFiltered(table, playerId).catch(() => {});
      return;
    }

    // ── reaction — no turn required, broadcast emoji to all at table ─────────
    if (action === 'reaction') {
      const emoji = typeof payload === 'string' ? payload : '';
      if (!emoji) { table.actionLock = false; return; }
      const sender = s.players.find(p => p.id === playerId);
      if (!sender) { table.actionLock = false; return; }
      const now = Date.now();
      const event: ReactionEvent = { id: makeId(), playerId, playerName: sender.name, emoji, time: now };
      const liveReactions = [...(s.liveReactions ?? []).filter(r => now - r.time < 6000).slice(-14), event];
      table.state = { ...s, liveReactions };
      engineLog('ACTION', tableId, { player: playerId, action: 'reaction', emoji });
      table.actionLock = false;
      broadcastState(table);
      return;
    }

    // ── declare (simultaneous: any active not-yet-declared player may declare) ──
    // Badugi declaration is logically simultaneous. Placing this BEFORE the
    // activePlayerId turn guard means the server accepts a declaration from any
    // active player regardless of whose "turn" it currently is, preventing silent
    // drops when two humans click at the same time or out of network order.
    if (action === 'declare' && s.phase === 'DECLARE') {
      const me = s.players.find(p => p.id === playerId);
      if (!me || me.hasActed || me.status !== 'active') {
        table.actionLock = false;
        return;
      }
      const { declaration } = payload as { declaration: Declaration };
      if (declaration === 'FOLD') {
        table.state = addMsg({
          ...s,
          players: s.players.map(p =>
            p.id === playerId ? { ...p, status: 'folded', declaration: null, hasActed: true } : p
          ),
        }, `${me.name} declared FOLD`);
      } else {
        table.state = addMsg({
          ...s,
          players: s.players.map(p =>
            p.id === playerId ? { ...p, declaration, hasActed: true } : p
          ),
        }, `${me.name} declared ${declaration}`);
      }
      engineLog('ACTION', tableId, { player: playerId, action: 'declare', accepted: true, declaration: String(declaration) });
      table.actionLock = false;
      afterHumanAction(table);
      return;
    }

    // All remaining actions require it to be this player's turn
    if (s.activePlayerId !== playerId) {
      engineLog('ACTION', tableId, { player: playerId, action, accepted: false, reason: 'not-turn', active: s.activePlayerId ?? undefined });
      table.actionLock = false;
      return;
    }

    const bettingPhase = s.phase.startsWith('BET');
    const player = s.players.find(p => p.id === playerId);
    if (bettingPhase && player && player.chips <= 0 &&
        (action === 'fold' || action === 'check' || action === 'call' || action === 'raise')) {
      engineLog('ACTION', tableId, { player: playerId, action, accepted: false, reason: 'all-in-cannot-act', phase: s.phase });
      // Keep the all-in player in the hand and move the turn on. In particular,
      // never turn a zero-stack check into a fold or let a stale prompt stall play.
      table.state = {
        ...s,
        players: s.players.map(p => p.id === playerId ? { ...p, hasActed: true } : p),
      };
      table.actionLock = false;
      afterHumanAction(table);
      return;
    }

    // ── ante ─────────────────────────────────────────────────────────────────
    if (action === 'ante' && s.phase === 'ANTE') {
      const player = s.players.find(p => p.id === playerId);
      if (!player) {
        table.actionLock = false;
        return;
      }
      const ante = takeAnte(player.chips, 25);
      table.state = addMsg({
        ...s,
        pot: s.pot + ante.contribution,
        players: s.players.map(p =>
          p.id === playerId
            ? { ...p, chips: ante.chips, hasActed: true, totalBet: (p.totalBet || 0) + ante.contribution }
            : p
        ),
      }, `You paid $${ante.contribution} Ante`);
      engineLog('ACTION', tableId, { player: playerId, action: 'ante', accepted: true, pot: table.state.pot });
      table.actionLock = false;
      afterHumanAction(table);
      return;
    }

    // ── fold ─────────────────────────────────────────────────────────────────
    if (action === 'fold' && s.phase.startsWith('BET')) {
      table.state = addMsg({
        ...s,
        players: s.players.map(p => p.id === playerId ? { ...p, status: 'folded', hasActed: true } : p),
      }, 'You folded');
      engineLog('ACTION', tableId, { player: playerId, action: 'fold', accepted: true, phase: s.phase });
      table.actionLock = false;
      // Part 2: sole-survivor early exit — resolveByFoldBadugi handles award + broadcast
      if (resolveByFoldBadugi(table)) return;
      afterHumanAction(table);
      return;
    }

    // ── check / call ─────────────────────────────────────────────────────────
    if ((action === 'call' || action === 'check') && s.phase.startsWith('BET')) {
      const me = s.players.find(p => p.id === playerId)!;
      const callAmt = Math.min(s.currentBet - me.bet, me.chips);
      const msg = callAmt === 0 ? 'You checked' : `You called $${callAmt}`;
      table.state = addMsg({
        ...s,
        pot: s.pot + callAmt,
        players: s.players.map(p =>
          p.id === playerId
            ? { ...p, chips: p.chips - callAmt, bet: me.bet + callAmt, hasActed: true, totalBet: (p.totalBet || 0) + callAmt }
            : p
        ),
      }, msg);
      engineLog('ACTION', tableId, { player: playerId, action, accepted: true, callAmt, phase: s.phase });
      table.actionLock = false;
      afterHumanAction(table);
      return;
    }

    // ── raise ─────────────────────────────────────────────────────────────────
    if (action === 'raise' && s.phase.startsWith('BET') && typeof payload === 'number') {
      // Validate amount: must be finite, positive
      if (!Number.isFinite(payload) || payload <= 0) {
        engineLog('ACTION', tableId, { player: playerId, action: 'raise', accepted: false, reason: 'invalid_amount', amount: payload });
        table.actionLock = false; return;
      }
      const me = s.players.find(p => p.id === playerId)!;
      // Server-side raise cap (matches bot logic): 3 raises per round, 4 heads-up
      const activeCount = s.players.filter(p => p.status === 'active').length;
      const raiseCap = activeCount <= 2 ? 4 : 3;
      if ((s.raisesThisRound ?? 0) >= raiseCap) {
        engineLog('ACTION', tableId, { player: playerId, action: 'raise', accepted: false, reason: 'cap_reached', raisesThisRound: s.raisesThisRound, cap: raiseCap });
        table.actionLock = false; return;
      }
      const prevBet   = me.bet;
      // Cap raise at all-in
      const desired   = Math.min(payload, prevBet + me.chips);
      const isAllIn   = desired === prevBet + me.chips;
      // Must be a real raise above currentBet, unless going all-in
      if (desired <= s.currentBet && !isAllIn) {
        engineLog('ACTION', tableId, { player: playerId, action: 'raise', accepted: false, reason: 'below_current_bet', desired, currentBet: s.currentBet });
        table.actionLock = false; return;
      }
      if (!meetsMinimumBet(s.currentBet, desired, isAllIn, s.minBet)) {
        engineLog('ACTION', tableId, { player: playerId, action: 'raise', accepted: false, reason: 'below_min_bet', desired, currentBet: s.currentBet, minBet: s.minBet });
        table.actionLock = false; return;
      }
      const increment = desired - prevBet;
      if (increment <= 0) {
        engineLog('ACTION', tableId, { player: playerId, action: 'raise', accepted: false, reason: 'non_positive_increment', increment });
        table.actionLock = false; return;
      }
      const newBet    = desired;
      let newState: GameState = addMsg({
        ...s,
        currentBet: newBet,
        pot: s.pot + increment,
        raisesThisRound: (s.raisesThisRound ?? 0) + 1,
        players: s.players.map(p =>
          p.id === playerId
            ? { ...p, chips: p.chips - increment, bet: newBet, hasActed: true, totalBet: (p.totalBet || 0) + increment }
            : p
        ),
      }, `You raised to $${newBet}`);
      // Raise re-opens the betting; opponents that already acted must re-act
      newState = {
        ...newState,
        players: newState.players.map(p =>
          p.id !== playerId && p.status === 'active' ? { ...p, hasActed: false } : p
        ),
      };
      engineLog('ACTION', tableId, { player: playerId, action: 'raise', accepted: true, to: newBet, phase: s.phase });
      table.state = newState;
      table.actionLock = false;
      afterHumanAction(table, true);
      return;
    }

    // ── draw ──────────────────────────────────────────────────────────────────
    if (action === 'draw' && s.phase.startsWith('DRAW')) {
      const result = applyBadugiDraw(s, playerId, payload);
      if (!result.ok) {
        engineLog('ACTION', tableId, { player: playerId, action: 'draw', accepted: false, reason: result.reason, phase: s.phase });
        table.actionLock = false;
        return result.message;
      }
      const msg = result.count === 0 ? 'You stood pat' : `You discarded ${result.count} card${result.count > 1 ? 's' : ''}`;
      engineLog('ACTION', tableId, { player: playerId, action: 'draw', accepted: true, count: result.count, phase: s.phase });
      table.state = addMsg({ ...s, players: result.players, deck: result.deck, discardPile: result.discardPile }, msg);
      table.actionLock = false;
      afterHumanAction(table);
      return;
    }

    // Unknown or mismatched action — log and drop
    engineLog('ACTION', tableId, { player: playerId, action, accepted: false, reason: 'invalid', phase: s.phase });
    table.actionLock = false;
  } catch (err) {
    engineLog('ERROR', tableId, { msg: 'action-threw', player: playerId, action, phase: tables.get(tableId)?.state.phase ?? '?' });
    console.error('[badugi:ERROR] action failed');
    table.actionLock = false;
  }
}

export function getBadugiTablePhase(tableId: string): string | null {
  return tables.get(tableId)?.state.phase ?? null;
}

/** Resolve a gift recipient from the live Badugi human seat map. */
export function resolveBadugiGiftRecipient(tableId: string, senderIdentityId: string, recipientSeatId: string): string | null {
  const table = tables.get(tableId);
  if (!table || table.connections.size === 0) return null;
  return resolveGiftSeats(
    table.seatToIdentityId,
    table.humanSeats,
    new Set(table.connections.keys()),
    senderIdentityId,
    recipientSeatId,
  )?.recipientId ?? null;
}

// ─── Ticket-7 Public Exports ──────────────────────────────────────────────────

export function getBadugiTableMinBet(tableId: string): number | null {
  const t = tables.get(tableId);
  return t ? t.state.minBet : null;
}

export function extendBadugiTurnTimer(
  tableId: string,
  identityId: string,
  extraMs: number,
): { success: boolean; newDeadline?: number; reason?: string } {
  const t = tables.get(tableId);
  if (!t) return { success: false, reason: 'table_not_found' };
  const s = t.state;
  if (!BADUGI_INTERACTIVE_PHASES.has(s.phase)) return { success: false, reason: 'not_interactive_phase' };
  if (!s.turnDeadline || s.turnDeadline <= Date.now()) return { success: false, reason: 'timer_not_active' };

  let foundSeat: string | null = null;
  for (const [seat, id] of t.seatToIdentityId.entries()) {
    if (id === identityId) { foundSeat = seat; break; }
  }
  if (!foundSeat) return { success: false, reason: 'player_not_at_table' };
  if (s.activePlayerId !== foundSeat) return { success: false, reason: 'not_your_turn' };

  const turnKey = `${t.handId}:${s.phase}:${foundSeat}`;
  if (t.seatTimeBankLastTurnKey.get(foundSeat) === turnKey) {
    return { success: false, reason: 'already_used_this_turn' };
  }
  t.seatTimeBankLastTurnKey.set(foundSeat, turnKey);

  const newDeadline = s.turnDeadline + extraMs;
  t.state = { ...s, turnDeadline: newDeadline };

  // Clear existing timer then arm new one with remaining ms
  if (t.turnTimer) { clearTimeout(t.turnTimer); t.turnTimer = null; }
  t.turnTimerGen++;
  const genAtArm  = t.turnTimerGen;
  const seatAtArm = foundSeat;
  const remaining = newDeadline - Date.now();
  t.turnTimer = setTimeout(() => {
    t.turnTimer = null;
    if (t.turnTimerGen !== genAtArm) return;
    if (t.state.activePlayerId !== seatAtArm) return;
    autoActOnTimeoutBadugi(t, seatAtArm);
  }, Math.max(0, remaining));

  broadcastState(t);
  return { success: true, newDeadline };
}

export function getBadugiTimeBankSessionUsed(tableId: string, identityId: string): number {
  const t = tables.get(tableId);
  if (!t) return 0;
  for (const [seat, id] of t.seatToIdentityId.entries()) {
    if (id === identityId) return t.seatTimeBankSessionUsed.get(seat) ?? 0;
  }
  return 0;
}

export function incrementBadugiTimeBankSessionUsed(tableId: string, identityId: string): void {
  const t = tables.get(tableId);
  if (!t) return;
  for (const [seat, id] of t.seatToIdentityId.entries()) {
    if (id === identityId) {
      t.seatTimeBankSessionUsed.set(seat, (t.seatTimeBankSessionUsed.get(seat) ?? 0) + 1);
      return;
    }
  }
}

export function updateBadugiTableSettings(
  tableId: string,
  settings: { maxPlayers?: number; botsEnabled?: boolean }
): void {
  const table = tables.get(tableId);
  if (!table) return;
  if (settings.maxPlayers  !== undefined) table.maxPlayers  = settings.maxPlayers;
  if (settings.botsEnabled !== undefined) table.botsEnabled = settings.botsEnabled;
}

export function destroyBadugiTable(tableId: string): void {
  const table = tables.get(tableId);
  if (!table) return;
  for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
  for (const t of Array.from(table.disconnectTimers.values())) clearTimeout(t);
  clearTurnTimerBadugi(table);
  deletePersistedTable(tableId);
  tables.delete(tableId);
  engineLog('TABLE_CREATE', tableId, { source: 'destroy' });
}
