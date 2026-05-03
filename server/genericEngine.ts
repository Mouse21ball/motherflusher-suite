// ─── Generic Server-Authoritative Game Engine ─────────────────────────────────
// Handles Dead7, Fifteen35, SuitsPoker in server-authoritative mode.
// Same seat/session model as the Badugi engine, parameterized by GameMode.

import type { WebSocket } from 'ws';
import type { GameState, Player, CardType, GamePhase, PlayerStatus, Declaration, ChatMessage, ReactionEvent, GameMode } from '../shared/gameTypes';
import { Dead7Mode, evaluateDead7 } from '../shared/modes/dead7';
import { Fifteen35Mode } from '../shared/modes/fifteen35';
import { SuitsPokerMode } from '../shared/modes/suitspoker';
import { engineLog } from './engineLog';
import {
  scheduleGenericSave,
  loadPersistedGenericTables,
  deletePersistedGenericTable,
} from './tablePersistence';
import { storage } from './storage';

// ─── Mode registry ────────────────────────────────────────────────────────────

const MODE_REGISTRY: Record<string, GameMode> = {
  dead7: Dead7Mode,
  fifteen35: Fifteen35Mode,
  suits_poker: SuitsPokerMode,
  // swing_poker removed — Mother Flusher is no longer an active game mode
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createDeck(): CardType[] {
  const suits: CardType['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: CardType['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: CardType[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, isHidden: false });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function addMsg(state: GameState, text: string, isResolution = false): GameState {
  return {
    ...state,
    messages: [...state.messages, { id: makeId(), text, time: Date.now(), isResolution }].slice(-10),
  };
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

// ─── Round-over check ─────────────────────────────────────────────────────────

function isPhaseRoundOver(state: GameState): boolean {
  const { phase, players, currentBet } = state;

  if (phase === 'ANTE') {
    return players.filter(p => p.status === 'active').every(p => p.hasActed);
  }

  // Draw phases, HIT phases, DECLARE phases
  if (phase.startsWith('DRAW') || phase.startsWith('HIT_') || phase === 'DECLARE') {
    const active = players.filter(p => p.status === 'active');
    // For fifteen35 hit phases: also done if all are STAY or BUST
    if (phase.startsWith('HIT_')) {
      return active.every(p => p.hasActed || p.declaration === 'STAY' || p.declaration === 'BUST');
    }
    return active.every(p => p.hasActed);
  }

  // Bet phases and DECLARE_AND_BET
  if (phase.startsWith('BET') || phase === 'DECLARE_AND_BET') {
    const active = players.filter(p => p.status === 'active' && p.chips > 0);
    return active.every(p => p.hasActed) && active.every(p => p.bet === currentBet);
  }

  return false;
}

// ─── Join window ──────────────────────────────────────────────────────────────
const JOIN_WINDOW_MS = 30_000;
const RECONNECT_TIMEOUT_MS = 90_000;
const BOT_PLAYERS: Record<string, string> = { p2: 'Alice', p3: 'Bob', p4: 'Charlie', p5: 'Daisy' };

// ─── Initial state ────────────────────────────────────────────────────────────

function makeInitialPlayers(): Player[] {
  return [
    { id: 'p1', name: 'You',  presence: 'human',    chips: 1000, bet: 0, totalBet: 0, cards: [], status: 'active',      isDealer: false, declaration: null, hasActed: false },
    { id: 'p2', name: 'Open', presence: 'reserved', chips: 1000, bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: false, declaration: null, hasActed: false },
    { id: 'p3', name: 'Open', presence: 'reserved', chips: 1000, bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: false, declaration: null, hasActed: false },
    { id: 'p4', name: 'Open', presence: 'reserved', chips: 1000, bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: true,  declaration: null, hasActed: false },
    { id: 'p5', name: 'Open', presence: 'reserved', chips: 1000, bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: false, declaration: null, hasActed: false },
  ];
}

function convertReservedToBots(table: GenericTable): void {
  const hasReserved = table.state.players.some(p => p.presence === 'reserved');
  if (!hasReserved) return;
  table.state = {
    ...table.state,
    players: table.state.players.map(p =>
      p.presence === 'reserved'
        ? { ...p, presence: 'bot' as const, status: 'active' as const, name: BOT_PLAYERS[p.id] ?? p.id }
        : p
    ),
  };
  table.joinWindowEndsAt = 0;
}

// Quick-fill: immediately seat bots up to the human-count-aware cap.
// 1 human → 2 bots; 2 humans → 1 bot; 3+ humans → 0 bots.
// Remaining reserved seats stay open so real players can join at any time.
function quickFillBots(table: GenericTable): void {
  const reserved = table.state.players.filter(p => p.presence === 'reserved');
  if (reserved.length === 0) return;
  const humanCount = table.state.players.filter(p => p.presence === 'human').length;
  const maxBots    = humanCount >= 3 ? 0 : humanCount >= 2 ? 1 : 2;
  const toFill     = reserved.slice(0, maxBots);
  if (toFill.length === 0) return;
  const fillIds = new Set(toFill.map(p => p.id));
  table.state = {
    ...table.state,
    players: table.state.players.map(p => {
      if (p.presence !== 'reserved' || !fillIds.has(p.id)) return p;
      return { ...p, presence: 'bot' as const, status: 'active' as const, name: BOT_PLAYERS[p.id] ?? p.id };
    }),
  };
  table.joinWindowEndsAt = 0;
}

// Convert exactly ONE reserved seat (lowest id) to a bot.
// Bot ceiling: 1 human → max 2 bots; 2 humans → max 1 bot; 3+ humans → 0 bots.
// Keeps seats open so real players can always find a table with room.
function convertOneReservedToBot(table: GenericTable): boolean {
  const reserved = table.state.players.filter(p => p.presence === 'reserved');
  if (reserved.length === 0) return false;
  const humanCount = table.state.players.filter(p => p.presence === 'human').length;
  const botCount   = table.state.players.filter(p => p.presence === 'bot').length;
  const maxBots    = humanCount >= 3 ? 0 : humanCount >= 2 ? 1 : 2;
  if (botCount >= maxBots) return false;
  const first = reserved[0];
  if (!first) return false;
  table.state = {
    ...table.state,
    players: table.state.players.map(p =>
      p.id === first.id
        ? { ...p, presence: 'bot' as const, status: 'active' as const, name: BOT_PLAYERS[p.id] ?? p.id }
        : p
    ),
  };
  return true;
}

function scheduleStagedBotFill(key: string, tableId: string, capturedJoinWindowEndsAt: number): void {
  setTimeout(() => {
    const t = tables.get(key);
    if (!t || t.joinWindowEndsAt !== capturedJoinWindowEndsAt || t.state.phase !== 'WAITING') return;
    if (convertOneReservedToBot(t)) broadcastState(t);

    setTimeout(() => {
      const t2 = tables.get(key);
      if (!t2 || t2.joinWindowEndsAt !== capturedJoinWindowEndsAt || t2.state.phase !== 'WAITING') return;
      if (convertOneReservedToBot(t2)) broadcastState(t2);

      setTimeout(() => {
        const t3 = tables.get(key);
        if (!t3 || t3.joinWindowEndsAt !== capturedJoinWindowEndsAt || t3.state.phase !== 'WAITING') return;
        if (convertOneReservedToBot(t3)) broadcastState(t3);
      }, 60_000);
    }, 30_000);
  }, 10_000);
}

function makeInitialState(tableId: string): GameState {
  return {
    tableId,
    phase: 'WAITING',
    pot: 0,
    currentBet: 0,
    minBet: 2,
    raisesThisRound: 0,
    activePlayerId: 'p1',
    players: makeInitialPlayers(),
    communityCards: [],
    messages: [{ id: makeId(), text: 'Game ready. Press start.', time: Date.now() }],
    chatMessages: [],
    deck: [],
    discardPile: [],
  };
}

// ─── State masking ────────────────────────────────────────────────────────────

// publicCardIndicesPerPlayer: maps playerId → card indices that are face-up for ALL players.
// Used by 15/35 where the first dealt card and all hit cards are public (blackjack-style).
// Swing/SuitsPoker have no public player cards (empty map → all opponent cards hidden).

function maskStateForPlayer(
  state: GameState,
  forPlayerId: string,
  publicCardIndicesPerPlayer: Record<string, number[]> = {},
): GameState {
  const isShowdown = state.phase === 'SHOWDOWN';
  return {
    ...state,
    deck: [],
    players: state.players.map(p => {
      if (p.id === forPlayerId) {
        // Hero always sees their own cards regardless of server-stored isHidden
        return { ...p, cards: p.cards.map(c => ({ ...c, isHidden: false })) };
      }
      if (isShowdown) return p;
      // Opponents: only show cards at public indices; hide everything else
      const publicIndices = publicCardIndicesPerPlayer[p.id] ?? [];
      return {
        ...p,
        cards: p.cards.map((c, i) => ({
          ...c,
          isHidden: !publicIndices.includes(i),
        })),
      };
    }),
  };
}

// ─── Table record ─────────────────────────────────────────────────────────────

const SEAT_ORDER = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;
type SeatId = typeof SEAT_ORDER[number];

interface SessionStat {
  startChips: number;        // chip balance when player joined this table session
  handsPlayed: number;       // hands played at this table in this session
  biggestPotWon: number;     // biggest pot the player won at this table
  winStreak: number;         // current consecutive-win streak at this table
  lossStreak: number;        // current consecutive-loss streak at this table
  sessionHighProfit: number; // highest netProfit reached this session (never DB)
  sessionLowProfit: number;  // lowest netProfit reached this session (never DB)
  recentDeltas: number[];    // last 3 per-hand chip deltas (for momentum/comeback)
}

interface GenericTable {
  tableId: string;
  modeId: string;
  mode: GameMode;
  state: GameState;
  handId: number;
  actionLock: boolean;
  botTimers: Map<string, ReturnType<typeof setTimeout>>;
  connections: Map<string, WebSocket>;
  humanSeats: Set<string>;
  sessionToSeat: Map<string, string>;
  spectators: Map<string, { ws: WebSocket; name: string }>;
  // Card indices (per player) that are face-up for ALL players (e.g. 15/35 public cards).
  // Empty object means all opponent cards are hidden (default for Swing/SP/Dead7).
  publicCardIndicesPerPlayer: Record<string, number[]>;
  // Maps game seat id → stable PlayerIdentity UUID (from client localStorage).
  seatToIdentityId: Map<string, string>;
  // Monotonic guard: stores handId (post-increment) at which each seat last had a
  // hand-end chip sync written. Disconnect syncs skip if handId matches.
  lastChipSyncHand: Map<string, number>;
  // Per-seat reconnect timers. Fired RECONNECT_TIMEOUT_MS after a disconnect if the
  // player has not returned. Releases the seat to bot/reserved so the table unblocks.
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  // Unix timestamp after which reserved seats convert to bots. 0 = window closed.
  joinWindowEndsAt: number;
  // Private tables are excluded from the live table listing and never auto-fill bots.
  isPrivate: boolean;
  // Per-seat chip balance at the START of the current hand (for profit delta calculation).
  // Initialized when player first loads chips from DB; updated after each hand sync.
  chipsAtHandStart: Map<string, number>;
  // Per-seat session stats (in-memory, this table session only).
  sessionStats: Map<string, SessionStat>;
}

// Indexed by `${modeId}:${tableId}`
const tables = new Map<string, GenericTable>();

function tableKey(modeId: string, tableId: string): string {
  return `${modeId}:${tableId}`;
}

// ─── Seat assignment ──────────────────────────────────────────────────────────

function assignSeat(table: GenericTable, sessionId: string): SeatId | null {
  const existing = table.sessionToSeat.get(sessionId);
  if (existing && SEAT_ORDER.includes(existing as SeatId)) return existing as SeatId;
  for (const seat of SEAT_ORDER) {
    if (!table.connections.has(seat)) return seat;
  }
  return null;
}

// ─── Session stats helper ─────────────────────────────────────────────────────
// Always returns a fully-populated stats object for a seat.
// Falls back to safe defaults if the seat has no stats yet (should not happen
// after the synchronous init added in addGenericConnection, but provides safety).

function buildSessionStats(table: GenericTable, seatId: string): {
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
  const currentChips = table.state.players.find(p => p.id === seatId)?.chips
    ?? ss?.startChips ?? 0;
  const startChips    = ss?.startChips ?? currentChips;
  const netProfit     = currentChips - startChips;
  const winStreak     = ss?.winStreak    ?? 0;
  const lossStreak    = ss?.lossStreak   ?? 0;
  const handsPlayed   = ss?.handsPlayed  ?? 0;

  const sessionHighProfit = ss?.sessionHighProfit ?? 0;
  const sessionLowProfit  = ss?.sessionLowProfit  ?? 0;
  const recentDeltas      = ss?.recentDeltas ?? [];

  // Streak pressure
  const isHeater = winStreak >= 3;
  const isCold   = lossStreak >= 3;

  // Near-even: netProfit within ±5% of startChips (requires at least 1 hand played)
  const nearEvenBand = Math.max(1, Math.round(startChips * 0.05));
  const isNearEven   = handsPlayed > 0 && netProfit >= -nearEvenBand && netProfit <= nearEvenBand;

  // Comeback: was significantly down AND last 2+ hands were profitable
  const comebackThreshold = Math.max(5, Math.round(startChips * 0.05));
  const lastTwoPositive   = recentDeltas.length >= 2 && recentDeltas.slice(-2).every(d => d > 0);
  const comebackActive    = sessionLowProfit < -comebackThreshold
    && netProfit > sessionLowProfit
    && lastTwoPositive;

  // Momentum: direction of last 2+ hand deltas
  const momentum: 'up' | 'down' | 'flat' =
    recentDeltas.length < 2 ? 'flat'
    : recentDeltas.slice(-2).every(d => d > 0) ? 'up'
    : recentDeltas.slice(-2).every(d => d < 0) ? 'down'
    : 'flat';

  // ── Stakes + pressure signals ─────────────────────────────────────────────
  // Bankroll tier: player's current chip balance relative to health thresholds.
  const bankrollTier: 'LOW' | 'MID' | 'HIGH' =
    currentChips < 300 ? 'LOW' : currentChips <= 1000 ? 'MID' : 'HIGH';

  // Table stakes: average chip balance of all seated (non-bot) players.
  const humanChips = table.state.players
    .filter(p => p.presence === 'human' && p.chips > 0)
    .map(p => p.chips);
  const avgTableChips = humanChips.length > 0
    ? Math.round(humanChips.reduce((a, b) => a + b, 0) / humanChips.length) : 1000;
  const tableStakes: 'LOW' | 'MID' | 'HIGH' =
    avgTableChips < 300 ? 'LOW' : avgTableChips <= 1000 ? 'MID' : 'HIGH';

  // Loss pressure: net loss > 20% of start OR below LOW tier threshold.
  const dangerZone = netProfit < -(startChips * 0.20) || currentChips < 300;

  // Last stand: chips are critically low — below hard floor.
  const lastStand = currentChips < 150;

  // Win protection: player is profitable and not in a downswing.
  const protectingLead = netProfit > 0 && momentum !== 'down';

  // Peak drop: how far below the session high the player currently sits.
  const peakDrop = Math.max(0, sessionHighProfit - netProfit);

  // Exit pressure: leave signal when a large win or deep loss is locked in.
  const shouldLeaveSignal =
    netProfit > startChips * 0.30
    || (dangerZone && lossStreak >= 3);

  // Continue pressure: signal to keep playing when recovery/momentum is live.
  const shouldContinueSignal = comebackActive || isNearEven || isHeater;

  return {
    startChips,
    currentChips,
    netProfit,
    handsPlayed,
    biggestPotWon:    ss?.biggestPotWon ?? 0,
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

// ─── Broadcast ────────────────────────────────────────────────────────────────

function broadcastState(table: GenericTable): void {
  const spectatorCount = table.spectators.size;
  const stateWithMeta = spectatorCount > 0
    ? { ...table.state, spectatorCount }
    : table.state;
  const pub = table.publicCardIndicesPerPlayer;

  for (const [playerId, ws] of Array.from(table.connections.entries())) {
    if (ws.readyState !== 1) continue;
    try {
      let personalState = maskStateForPlayer(stateWithMeta, playerId, pub);
      if (table.state.phase === 'SHOWDOWN') {
        const prevChips = table.chipsAtHandStart.get(playerId);
        if (prevChips !== undefined) {
          const nowChips = table.state.players.find(p => p.id === playerId)?.chips ?? prevChips;
          personalState = { ...personalState, heroChipChange: nowChips - prevChips };
        }
      }
      ws.send(JSON.stringify({
        type: 'mode:snapshot',
        state: personalState,
        sessionStats: buildSessionStats(table, playerId),
      }));
    } catch {}
  }
  // Spectators see only public face-up cards; all private hole cards hidden
  for (const [, spec] of Array.from(table.spectators.entries())) {
    if (spec.ws.readyState !== 1) continue;
    try {
      const spectatorView = maskStateForPlayer(stateWithMeta, '__spectator__', pub);
      spec.ws.send(JSON.stringify({ type: 'mode:snapshot', state: spectatorView }));
    } catch {}
  }
  // Debounced persistence: write state ~2 s after last mutation
  scheduleGenericSave(tableKey(table.modeId, table.tableId), table.state, table.handId);
}

// ─── Phase advancement ────────────────────────────────────────────────────────

function advanceToNextPhase(table: GenericTable): void {
  const { state, mode } = table;
  const phases = mode.phases;
  const idx = phases.indexOf(state.phase);
  if (idx === -1 || state.phase === 'SHOWDOWN') return;

  let nextPhase = phases[(idx + 1) % phases.length] as GamePhase;

  // Let mode override (e.g. Fifteen35 getNextPhase)
  if (mode.getNextPhase) {
    const modeNext = mode.getNextPhase(state.phase, state);
    if (modeNext) nextPhase = modeNext;
  }

  const isBetRound     = nextPhase.startsWith('BET') || nextPhase === 'DECLARE_AND_BET';
  const isDrawRound    = nextPhase.startsWith('DRAW') || nextPhase.startsWith('HIT_');
  const isDeclare      = nextPhase === 'DECLARE';
  const isRevealPhase  = nextPhase.startsWith('REVEAL_');
  const skipAllIn      = !isDeclare && !isDrawRound;

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

  engineLog('PHASE', `${table.modeId}:${table.tableId}`, { from: prevPhase, to: nextPhase });

  // ── DECLARE (Dead7 only): auto-fold any active player without a valid hand ───
  // In Dead7, a valid hand means qualifying high or qualifying low (no 7s, no dup ranks).
  // Bots handle this themselves via botAction; we intercept here for human players
  // so they are never shown a declaration prompt with a dead/invalid hand.
  if (nextPhase === 'DECLARE' && table.modeId === 'dead7') {
    const declPlayers = [...table.state.players];
    const foldMsgs: string[] = [];
    let anyAutoFolded = false;
    for (let i = 0; i < declPlayers.length; i++) {
      const p = declPlayers[i];
      if (p.status !== 'active') continue;
      const ev = evaluateDead7(p.cards.map(c => ({ ...c, isHidden: false })));
      if (!ev || !ev.isValidBadugi) {
        declPlayers[i] = { ...p, status: 'folded', declaration: null, hasActed: true };
        const reason = ev?.isDead ? 'holds a 7' : 'has no qualifying hand';
        foldMsgs.push(`${p.name} ${reason} — auto-folded`);
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
      if (isPhaseRoundOver(table.state)) {
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

  // ── DECLARE_AND_BET (SuitsPoker): auto-declare all-in active players ──────
  // Players with chips=0 see an "ALL IN" badge in the UI and are never shown a
  // declaration prompt, so their declaration remains null.  To keep them eligible
  // for the POKER half of the pot we auto-assign declaration='POKER' and mark
  // them as having acted.  activePlayerId is already pointing at a chips>0 player
  // (skipAllIn=true for DECLARE_AND_BET), so no scheduling stall results.
  if (nextPhase === 'DECLARE_AND_BET') {
    const declPlayers = table.state.players.map(p => {
      if (p.status !== 'active' || p.chips > 0 || p.declaration) return p;
      return { ...p, declaration: 'POKER' as Declaration, hasActed: true };
    });
    if (declPlayers.some((p, i) => p !== table.state.players[i])) {
      table.state = { ...table.state, players: declPlayers };
    }
  }

  // DEAL: auto-deal cards, then advance after brief pause
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

  // SHOWDOWN: resolve
  if (nextPhase === 'SHOWDOWN') {
    resolveShowdown(table);
    return;
  }

  // Auto-transition phases (REVEAL_*)
  if (isRevealPhase) {
    const autoTrans = mode.getAutoTransition ? mode.getAutoTransition(nextPhase as GamePhase) : null;
    if (autoTrans) {
      const fenced = table.handId;
      broadcastState(table);
      setTimeout(() => {
        if (table.handId !== fenced) return;
        const result = autoTrans.action(table.state);
        if (result.stateUpdates) {
          table.state = addMsg({ ...table.state, ...result.stateUpdates }, result.message || '');
        }
        if (result.advancePhase) {
          advanceToNextPhase(table);
        }
        broadcastState(table);
        scheduleNextBot(table);
      }, autoTrans.delay || 1000);
      return;
    }
  }

  // ── All-in bypass: BET phases ─────────────────────────────────────────────
  // When every active player is already all-in (chips=0) entering a BET phase,
  // nobody can act. getNextActivePlayerIndex falls back to a seat that may be the
  // human hero — scheduleNextBot then exits immediately (human, not bot) and the
  // engine freezes. Detect this on entry and auto-advance after a brief display
  // delay, matching the same pattern used for the DECLARE all-fold case above.
  if (isBetRound && isPhaseRoundOver(table.state)) {
    const fencedHand  = table.handId;
    const fencedPhase = table.state.phase;
    setTimeout(() => {
      if (table.handId !== fencedHand || table.state.phase !== fencedPhase) return;
      advanceToNextPhase(table);
      broadcastState(table);
      scheduleNextBot(table);
    }, 400);
  }
}

// ─── Deal cards ───────────────────────────────────────────────────────────────

function dealCards(table: GenericTable): void {
  table.handId += 1;
  const deck = createDeck();
  // Deal with '__server__' as myId: mode marks opponent private cards isHidden:true,
  // and any face-up-for-all cards (e.g. 15/35 card1) as isHidden:false.
  const dealt = table.mode.deal(deck, table.state.players, '__server__');

  // Capture which card indices are public (face-up for ALL players) based on
  // what the mode's deal() reported as isHidden:false with myId='__server__'.
  // These survive maskStateForPlayer so all observers can see them.
  const publicCardIndicesPerPlayer: Record<string, number[]> = {};
  for (const p of dealt.players) {
    const pub: number[] = [];
    p.cards.forEach((c, i) => { if (!c.isHidden) pub.push(i); });
    publicCardIndicesPerPlayer[p.id] = pub;
  }
  table.publicCardIndicesPerPlayer = publicCardIndicesPerPlayer;

  table.state = {
    ...table.state,
    players: dealt.players.map(p => ({
      ...p,
      // Server stores real card values (isHidden:false); masking is done per-player
      // at broadcast time via maskStateForPlayer + publicCardIndicesPerPlayer.
      cards: p.cards.map(c => ({ ...c, isHidden: false })),
    })),
    // Community cards: PRESERVE the mode's isHidden flags.
    // REVEAL_* phases later flip individual cards to isHidden:false.
    // Forcing false here was the bug that exposed MF/SP boards immediately.
    communityCards: dealt.communityCards || [],
    deck: dealt.deck.map(c => ({ ...c, isHidden: false })),
    discardPile: [],
  };
}

// ─── Bot banter ───────────────────────────────────────────────────────────────
// Psychology-driven chat after showdown. Reinforces loss aversion, competitive
// identity, and table atmosphere. Keeps sessions alive and drives re-entry.

const BOT_BANTER_WIN = [
  "That's what I'm talking about.",
  "Easy money.",
  "Next.",
  "You see that? Classic.",
  "Don't blink.",
  "Read 'em and weep.",
  "Prison rules pay off.",
];
const BOT_BANTER_LOSE = [
  "Shake it off.",
  "Variance is a beast.",
  "I'll get it back.",
  "Patience.",
  "That hurt. Moving on.",
  "One hand at a time.",
];
const BOT_BANTER_NEUTRAL = [
  "Eyes on the pot.",
  "Stay focused.",
  "It's a long game.",
  "No mercy out here.",
  "Ante up.",
  "Who's scared?",
  "Stack up or pack up.",
  "Prison rules. No mercy.",
];

function scheduleBotBanter(table: GenericTable, winnerIds: string[]): void {
  if (Math.random() > 0.55) return; // ~55% chance of banter each showdown

  const bots = table.state.players.filter(p => p.presence === 'bot' && p.status !== 'folded');
  if (bots.length === 0) return;

  const bot = bots[Math.floor(Math.random() * bots.length)];
  const isWinner = winnerIds.includes(bot.id);

  let pool: string[];
  if (isWinner) pool = BOT_BANTER_WIN;
  else if (Math.random() > 0.45) pool = BOT_BANTER_LOSE;
  else pool = BOT_BANTER_NEUTRAL;

  const text = pool[Math.floor(Math.random() * pool.length)];
  const delay = 400 + Math.random() * 700;

  setTimeout(() => {
    if (table.state.phase !== 'SHOWDOWN') return;
    const msg = { id: makeId(), senderId: bot.id, senderName: bot.name, text, time: Date.now() };
    table.state = { ...table.state, chatMessages: [...table.state.chatMessages.slice(-49), msg] };
    broadcastState(table);
  }, delay);
}

// ─── Showdown resolution ──────────────────────────────────────────────────────

function resolveShowdown(table: GenericTable): void {
  const fenced = table.handId;
  setTimeout(() => {
    if (table.handId !== fenced || table.state.phase !== 'SHOWDOWN') return;
    const s = table.state;
    const result = table.mode.resolveShowdown(s.players, s.pot, '__server__', s.communityCards);

    table.state = {
      ...s,
      players: result.players,
      pot: result.pot,
      messages: [
        ...s.messages,
        ...result.messages.map(text => ({ id: makeId(), text, time: Date.now(), isResolution: true })),
      ].slice(-10),
    };

    broadcastState(table);

    // Schedule bot banter after showdown
    const winnerIds = result.players.filter(p => p.isWinner).map(p => p.id);
    scheduleBotBanter(table, winnerIds);

    const fenced2 = table.handId;
    setTimeout(() => {
      if (table.handId !== fenced2 || table.state.phase !== 'SHOWDOWN') return;
      resetToAnte(table);
      broadcastState(table);
    }, 2500);
  }, 650);
}

// ─── Terminal-state guard (win-by-fold / no-actors) ──────────────────────────
// Called after every human/bot action. If the hand has effectively ended
// because every opponent folded (or busted out of `active` status), award the
// pot to the lone survivor and transition cleanly to SHOWDOWN → next hand.
// If zero players remain active, close the hand cleanly (rollover) and reset.
// Returns true if the hand was resolved here; callers should bail out of any
// further phase advancement when true.

function resolveByFold(table: GenericTable): boolean {
  const s = table.state;
  // Only fire mid-hand. WAITING/SHOWDOWN/ANTE/DEAL handle themselves.
  if (s.phase === 'WAITING' || s.phase === 'SHOWDOWN' || s.phase === 'ANTE' || s.phase === 'DEAL') {
    return false;
  }

  const nonFolded = s.players.filter(p => p.status === 'active');

  // ── Case A: lone survivor wins by fold ──────────────────────────────────
  if (nonFolded.length === 1) {
    const winner = nonFolded[0];
    const pot = s.pot;
    const newPlayers = s.players.map(p =>
      p.id === winner.id
        ? { ...p, chips: p.chips + pot, isWinner: true, hasActed: true }
        : { ...p, isWinner: false }
    );
    const winMsg = `${winner.name} wins $${pot} (all opponents folded)`;
    table.state = {
      ...s,
      players: newPlayers,
      pot: 0,
      phase: 'SHOWDOWN' as GamePhase,
      activePlayerId: winner.id,
      currentBet: 0,
      messages: [
        ...s.messages,
        { id: makeId(), text: winMsg, time: Date.now(), isResolution: true },
      ].slice(-10),
    };
    engineLog('PHASE', `${table.modeId}:${table.tableId}`, {
      from: s.phase, to: 'SHOWDOWN', reason: 'win-by-fold', winner: winner.id, pot,
    });
    console.log(`[CGP][server] win-by-fold ${table.modeId}:${table.tableId} winner=${winner.id} pot=$${pot} from=${s.phase}`);

    // Cancel any pending bot timers — they would early-return on phase mismatch
    // anyway, but clearing prevents leaked timers in long-running tables.
    for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
    table.botTimers.clear();

    broadcastState(table);

    const fenced = table.handId;
    setTimeout(() => {
      if (table.handId !== fenced || table.state.phase !== 'SHOWDOWN') return;
      resetToAnte(table);
      broadcastState(table);
    }, 2500);
    return true;
  }

  // ── Case B: no active players at all — close hand, rollover pot ─────────
  if (nonFolded.length === 0) {
    console.log(`[CGP][server] no-active-players ${table.modeId}:${table.tableId} pot=$${s.pot} from=${s.phase} — closing hand`);
    engineLog('PHASE', `${table.modeId}:${table.tableId}`, {
      from: s.phase, to: 'SHOWDOWN', reason: 'no-active-players', pot: s.pot,
    });
    table.state = addMsg({
      ...s,
      phase: 'SHOWDOWN' as GamePhase,
      currentBet: 0,
      // pot left as-is — resetToAnte detects pot>0 + no winner = rollover
    }, 'Hand closed — no eligible players');

    for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
    table.botTimers.clear();
    broadcastState(table);

    const fenced = table.handId;
    setTimeout(() => {
      if (table.handId !== fenced || table.state.phase !== 'SHOWDOWN') return;
      resetToAnte(table);
      broadcastState(table);
    }, 1500);
    return true;
  }

  return false;
}

// ─── Reset after showdown ─────────────────────────────────────────────────────

function resetToAnte(table: GenericTable): void {
  const s = table.state;
  const hadWinner  = s.players.some(p => p.isWinner);
  const isRollover = s.pot > 0 && !hadWinner;
  const basePlayers = isRollover ? s.players : moveDealer(s.players);

  let nextPlayers: Player[] = basePlayers.map(p => {
    const isBotBusted = p.presence === 'bot' && p.chips === 0;
    const newChips = isBotBusted ? 1000 : p.chips;
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
  // If the previous hand resolved with everyone folded, the rollover branch
  // above produces all `sitting_out` and the next hand would stall in ANTE.
  // Detect this and fall back to non-rollover semantics: any seat with chips
  // becomes active again so the table can deal a fresh hand.
  if (isRollover && !nextPlayers.some(p => p.status === 'active')) {
    console.log(`[CGP][server] reset:no-active-after-rollover ${table.modeId}:${table.tableId} — reactivating eligible seats`);
    nextPlayers = nextPlayers.map(p => ({
      ...p,
      status: (p.chips > 0 ? 'active' : 'sitting_out') as PlayerStatus,
    }));
  }

  const dealerIdx   = getDealerIndex(nextPlayers);
  const firstActIdx = getNextActivePlayerIndex(nextPlayers, dealerIdx);

  for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
  table.botTimers.clear();
  table.handId += 1;
  table.publicCardIndicesPerPlayer = {};

  // ── Sync human chip balances + update session stats ───────────────────────
  // Runs AFTER handId increments so lastChipSyncHand records the NEW handId.
  // Disconnect syncs skip the write if lastChipSyncHand matches current handId.
  //
  // IMPORTANT: nextPlayers.map() already cleared isWinner to undefined on all
  // players. We must resolve winner status from s.players (SHOWDOWN state) BEFORE
  // iterating nextPlayers — otherwise `won` is always false and handsWon / winStreak
  // are never updated.
  const potWon = s.pot; // capture pot BEFORE state is replaced
  const winnerSeatIds = new Set(s.players.filter(p => p.isWinner).map(p => p.id));

  for (const p of nextPlayers) {
    if (p.presence !== 'human') continue;
    const identityId = table.seatToIdentityId.get(p.id);
    if (!identityId) continue;

    const isWinner = winnerSeatIds.has(p.id);

    // Per-hand profit delta: compare end-of-hand chips to recorded hand-start chips.
    const prevChips = table.chipsAtHandStart.get(p.id) ?? p.chips;
    const deltaChips = p.chips - prevChips;

    // Update session stats (always present — initialized synchronously on join).
    const ss = table.sessionStats.get(p.id);
    if (ss) {
      ss.handsPlayed++;
      if (isWinner) {
        ss.winStreak++;
        ss.lossStreak = 0;
        if (potWon > ss.biggestPotWon) ss.biggestPotWon = potWon;
      } else {
        ss.winStreak = 0;
        ss.lossStreak++;
      }
      // Session pressure fields — never stored in DB, computed from live chip movement.
      const netProfit = p.chips - ss.startChips;
      if (netProfit > ss.sessionHighProfit) ss.sessionHighProfit = netProfit;
      if (netProfit < ss.sessionLowProfit)  ss.sessionLowProfit  = netProfit;
      ss.recentDeltas.push(deltaChips);
      if (ss.recentDeltas.length > 3) ss.recentDeltas.shift();
    }

    // Record starting chips for the NEXT hand.
    table.chipsAtHandStart.set(p.id, p.chips);

    table.lastChipSyncHand.set(p.id, table.handId);
    storage.syncPlayerChips(identityId, p.chips, { won: isWinner, deltaChips }).catch(() => {});
  }

  table.state = {
    ...s,
    phase: 'ANTE',
    currentBet: 0,
    raisesThisRound: 0,
    heroChipChange: undefined,
    activePlayerId: nextPlayers[firstActIdx].id,
    players: nextPlayers,
    deck: [],
    discardPile: [],
    communityCards: [],
    messages: [{
      id: makeId(),
      text: 'New hand.',
      time: Date.now(),
    }],
  };

  engineLog('PHASE', `${table.modeId}:${table.tableId}`, { from: 'SHOWDOWN', to: 'ANTE' });
  scheduleNextBot(table);
}

// ─── Bot scheduling ───────────────────────────────────────────────────────────

function scheduleNextBot(table: GenericTable): void {
  const { state, handId } = table;
  if (!state.activePlayerId) return;

  const active = state.players.find(p => p.id === state.activePlayerId);

  // Safety net: if a human player is marked active but cannot act (all-in, chips=0)
  // in a BET phase, the normal bot-scheduling path exits here and nothing runs.
  // Catch that stall and auto-advance if the round is already complete.
  if (active && active.presence !== 'bot' && active.chips === 0 &&
      (state.phase.startsWith('BET') || state.phase === 'DECLARE_AND_BET') &&
      isPhaseRoundOver(state)) {
    const fencedHand  = table.handId;
    const fencedPhase = table.state.phase;
    setTimeout(() => {
      if (table.handId !== fencedHand || table.state.phase !== fencedPhase) return;
      advanceToNextPhase(table);
      broadcastState(table);
      scheduleNextBot(table);
    }, 400);
    return;
  }

  if (!active || active.presence !== 'bot' || active.status !== 'active') return;
  if (table.humanSeats.has(active.id)) return;

  const botId          = active.id;
  const capturedHandId = handId;
  const capturedPhase  = state.phase;

  const existing = table.botTimers.get(botId);
  if (existing) clearTimeout(existing);

  // Bimodal think time: most decisions at normal pace, some with deliberation.
  // BET_3 (last-round decisions) get a higher deliberation rate.
  // 15/35 HIT_ phases get a longer base delay so players can read totals/actions.
  const isBet3            = capturedPhase === 'BET_3';
  const isFifteen35Hit    = capturedPhase.startsWith('HIT_') && table.modeId === 'fifteen35';
  const baseMs      = capturedPhase.startsWith('BET')
    ? (isBet3 ? 700 + Math.random() * 650 : 550 + Math.random() * 500)
    : isFifteen35Hit
      ? 800 + Math.random() * 700   // 800–1500ms: readable pacing for 15/35 hit rounds
      : 400 + Math.random() * 600;  // 400–1000ms: real-money pacing tension
  const pauseChance = isBet3 ? 0.30 : isFifteen35Hit ? 0.25 : 0.20;
  const pauseMs     = Math.random() < pauseChance
    ? (isBet3 ? 450 + Math.random() * 650 : isFifteen35Hit ? 400 + Math.random() * 500 : 380 + Math.random() * 520)
    : 0;
  // Per-bot timing personality: each seat has a stable fast/slow disposition
  // derived from its ID so different bots feel like different players.
  const botIdSum    = botId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const timingFactor = 0.75 + (botIdSum % 11) * 0.045; // 0.75 – 1.20×
  const thinkMs     = Math.floor((baseMs + pauseMs) * timingFactor);

  const timer = setTimeout(() => {
    table.botTimers.delete(botId);
    if (table.handId !== capturedHandId || table.state.phase !== capturedPhase) return;
    executeBotAction(table, botId);
  }, thinkMs);

  table.botTimers.set(botId, timer);
}

// ─── Seat release ─────────────────────────────────────────────────────────────
// "Between hands" = WAITING (lobby) OR the very start of ANTE before this player
// has posted their ante (they have not yet committed a chip to the hand).
// In both cases the seat is freed back to 'reserved' (open for a new player).
// Mid-hand: seat becomes a bot so the round completes cleanly.

function releaseSeat(table: GenericTable, seat: string): void {
  const phase      = table.state.phase;
  const seatPlayer = table.state.players.find(p => p.id === seat);
  const isBetweenHands = phase === 'WAITING' || (phase === 'ANTE' && !seatPlayer?.hasActed);

  table.state = {
    ...table.state,
    players: table.state.players.map(p => {
      if (p.id !== seat) return p;
      if (isBetweenHands) {
        return { ...p, presence: 'reserved' as const, status: 'sitting_out' as const, name: 'Open', cards: [], bet: 0, totalBet: 0 };
      }
      return { ...p, presence: 'bot' as const, name: BOT_PLAYERS[p.id] ?? p.id };
    }),
  };

  if (!isBetweenHands) {
    broadcastState(table);
    scheduleNextBot(table);
  } else if (phase === 'ANTE' && table.state.activePlayerId === seat) {
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

function executeBotAction(table: GenericTable, botId: string): void {
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
    const result = table.mode.botAction(table.state, botId);
    if (!result) { table.actionLock = false; return; }

    const { stateUpdates, message, roundOver, nextPlayerId } = result;
    let newState: GameState = { ...table.state, ...stateUpdates };

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

    engineLog('BOT', `${table.modeId}:${table.tableId}`, { bot: botId, action: message ?? '?', phase: table.state.phase });

    // Track public hit cards in 15/35 (all hit cards are face-up for everyone)
    if (table.state.phase.startsWith('HIT_') && stateUpdates.players) {
      const pub = { ...table.publicCardIndicesPerPlayer };
      for (const newP of (stateUpdates.players as Player[])) {
        const oldP = table.state.players.find(p => p.id === newP.id);
        if (!oldP || newP.cards.length <= oldP.cards.length) continue;
        const prevPub = pub[newP.id] ?? [];
        const newIndices: number[] = [];
        for (let i = oldP.cards.length; i < newP.cards.length; i++) newIndices.push(i);
        pub[newP.id] = [...prevPub, ...newIndices];
      }
      table.publicCardIndicesPerPlayer = pub;
    }

    table.state = newState;
    table.actionLock = false;
    broadcastState(table);

    // Terminal-state guard (post-bot-action): same as afterHumanAction.
    if (resolveByFold(table)) return;

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
    }
  } catch (err) {
    engineLog('ERROR', `${table.modeId}:${table.tableId}`, { msg: 'bot-action-threw', bot: botId });
    console.error('[genericEngine:ERROR] bot action error:', err);
    table.actionLock = false;
  }
}

// ─── After-human-action plumbing ──────────────────────────────────────────────

function afterHumanAction(table: GenericTable, wasRaise = false): void {
  broadcastState(table);

  // Terminal-state guard: lone survivor wins by fold, or zero actors → reset.
  // Must run BEFORE isPhaseRoundOver to short-circuit phase advancement.
  if (resolveByFold(table)) return;

  if (isPhaseRoundOver(table.state)) {
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
    const isDrawPhase    = s.phase.startsWith('DRAW') || s.phase.startsWith('HIT_');
    const isDeclarePhase = s.phase === 'DECLARE' || s.phase === 'DECLARE_AND_BET';
    const skipAllIn      = !isDrawPhase && !isDeclarePhase;
    const myIdx   = s.players.findIndex(p => p.id === s.activePlayerId);
    let nextIdx: number;
    if (s.phase === 'DECLARE') {
      // Advance to the next active player who has NOT yet declared.
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
  }
}

// ─── Get or create table ─────────────────────────────────────────────────────

function getOrCreateTable(modeId: string, tableId: string, isPrivate = false, quickPlay = false): GenericTable | null {
  const mode = MODE_REGISTRY[modeId];
  if (!mode) return null;

  const key = tableKey(modeId, tableId);
  if (!tables.has(key)) {
    const joinWindowEndsAt = isPrivate || quickPlay ? 0 : Date.now() + JOIN_WINDOW_MS;
    tables.set(key, {
      tableId,
      modeId,
      mode,
      state: makeInitialState(tableId),
      handId: 0,
      actionLock: false,
      botTimers: new Map(),
      connections: new Map(),
      humanSeats: new Set(),
      sessionToSeat: new Map(),
      seatToIdentityId: new Map(),
      lastChipSyncHand: new Map(),
      spectators: new Map(),
      disconnectTimers: new Map(),
      publicCardIndicesPerPlayer: {},
      joinWindowEndsAt,
      isPrivate,
      chipsAtHandStart: new Map(),
      sessionStats: new Map(),
    });
    engineLog('TABLE_CREATE', `${modeId}:${tableId}`, { source: 'new', mode: modeId, joinWindowMs: JOIN_WINDOW_MS, isPrivate, quickPlay });
    if (!isPrivate && !quickPlay) {
      scheduleStagedBotFill(key, tableId, joinWindowEndsAt);
    }
  }
  return tables.get(key)!;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function addGenericConnection(tableId: string, modeId: string, sessionId: string, ws: WebSocket, playerName?: string, isPrivate = false, quickPlay = false, identityId?: string): string | null {
  const key = tableKey(modeId, tableId);
  const isNew = !tables.has(key);
  const table = getOrCreateTable(modeId, tableId, isPrivate, quickPlay);
  if (!table) {
    try { ws.send(JSON.stringify({ type: 'mode:error', reason: 'unknown-mode' })); } catch {}
    return null;
  }
  if (isNew && quickPlay) {
    quickFillBots(table);
  }

  let seat = assignSeat(table, sessionId);
  if (!seat) {
    // Table full — register as spectator
    table.spectators.set(sessionId, { ws, name: playerName ?? 'Spectator' });
    engineLog('SPECTATOR_JOIN', `${modeId}:${tableId}`, { session: sessionId.slice(-8), count: table.spectators.size });
    try {
      ws.send(JSON.stringify({
        type: 'mode:init',
        playerId: '__spectator__',
        modeId,
        role: 'spectator',
        state: maskStateForPlayer(table.state, '__spectator__', table.publicCardIndicesPerPlayer),
      }));
    } catch {}
    broadcastState(table);
    return '__spectator__';
  }

  // ── Multi-tab / duplicate identity guard ────────────────────────────────────
  if (identityId) {
    let foundSeat: string | null = null;
    for (const [s, id] of table.seatToIdentityId.entries()) {
      if (id === identityId && s !== seat) { foundSeat = s; break; }
    }
    if (foundSeat) {
      if (table.connections.has(foundSeat)) {
        // Second tab / device while first is active: take over the seat.
        let oldSessionId: string | null = null;
        for (const [sid, s] of table.sessionToSeat.entries()) {
          if (s === foundSeat) { oldSessionId = sid; break; }
        }
        if (oldSessionId) {
          const oldWs = table.connections.get(foundSeat);
          if (oldWs) {
            try { oldWs.send(JSON.stringify({ type: 'mode:superseded', reason: 'seat_taken_over' })); } catch {}
          }
          table.sessionToSeat.delete(oldSessionId);
          table.connections.delete(foundSeat);
          table.humanSeats.delete(foundSeat);
          const dt = table.disconnectTimers.get(foundSeat);
          if (dt) { clearTimeout(dt); table.disconnectTimers.delete(foundSeat); }
        }
        engineLog('SESSION_TAKEOVER', `${modeId}:${tableId}`, {
          identity: identityId.slice(-8),
          seat: foundSeat,
          oldSession: (oldSessionId ?? '').slice(-8),
          newSession: sessionId.slice(-8),
        });
        seat = foundSeat as typeof seat;
      } else {
        // No active connection: reconnect from new tab/device.
        const dt = table.disconnectTimers.get(foundSeat);
        if (dt) { clearTimeout(dt); table.disconnectTimers.delete(foundSeat); }
        engineLog('RECONNECT_NEW_TAB', `${modeId}:${tableId}`, {
          identity: identityId.slice(-8),
          reclaimedSeat: foundSeat,
          newSession: sessionId.slice(-8),
        });
        seat = foundSeat as typeof seat;
      }
    }
  }

  // Cancel any pending reconnect-expiry timer for this seat.
  const pendingDisconnect = table.disconnectTimers.get(seat);
  if (pendingDisconnect) { clearTimeout(pendingDisconnect); table.disconnectTimers.delete(seat); }

  const isReconnect = table.sessionToSeat.has(sessionId) || (identityId ? !!table.seatToIdentityId.get(seat) : false);
  table.sessionToSeat.set(sessionId, seat);
  table.connections.set(seat, ws);
  table.humanSeats.add(seat);

  const wasReserved = table.state.players.find(p => p.id === seat)?.presence === 'reserved';
  table.state = {
    ...table.state,
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

    // ── Synchronous sessionStats init ────────────────────────────────────────
    // Ensures sessionStats ALWAYS exists when mode:init is sent (below), even
    // before the DB callback fires. Only initializes if no stats are present
    // (preserves existing stats on reconnect within the same session).
    if (!table.sessionStats.has(seat)) {
      const placeholder = table.state.players.find(p => p.id === seat)?.chips ?? 1000;
      table.sessionStats.set(seat, {
        startChips: placeholder,
        handsPlayed: 0,
        biggestPotWon: 0,
        winStreak: 0,
        lossStreak: 0,
        sessionHighProfit: 0,
        sessionLowProfit: 0,
        recentDeltas: [],
      });
      table.chipsAtHandStart.set(seat, placeholder);
    }

    if (wasReserved) {
      storage.getOrCreatePlayer(identityId, playerName).then(profile => {
        const t = tables.get(tableKey(modeId, tableId));
        if (!t) return;
        const player = t.state.players.find(pp => pp.id === seat);
        if (!player || player.presence !== 'human') return;
        t.state = {
          ...t.state,
          players: t.state.players.map(pp =>
            pp.id === seat ? { ...pp, chips: profile.chipBalance } : pp
          ),
        };
        // Update session tracking with the real DB chip balance (overwrites placeholder).
        t.chipsAtHandStart.set(seat, profile.chipBalance);
        t.sessionStats.set(seat, {
          startChips: profile.chipBalance,
          handsPlayed: 0,
          biggestPotWon: 0,
          winStreak: 0,
          lossStreak: 0,
          sessionHighProfit: 0,
          sessionLowProfit: 0,
          recentDeltas: [],
        });
        broadcastState(t);
        storage.setPlayerActiveTable(identityId, tableId, seat, modeId).catch(() => {});
      }).catch(() => {});
    }
  }

  engineLog(isReconnect ? 'RECONNECT' : 'PLAYER_JOIN', `${modeId}:${tableId}`, {
    player: seat,
    session: sessionId.slice(-8),
    phase: table.state.phase,
    wasReserved,
    hasIdentity: !!identityId,
  });

  try {
    ws.send(JSON.stringify({
      type: 'mode:init',
      playerId: seat,
      modeId,
      state: maskStateForPlayer(table.state, seat, table.publicCardIndicesPerPlayer),
      sessionStats: buildSessionStats(table, seat),
    }));
  } catch {}

  return seat;
}

export function removeGenericConnection(tableId: string, sessionId: string, intentional = false): void {
  // Try all registered modes to find the table
  for (const modeId of Object.keys(MODE_REGISTRY)) {
    const key = tableKey(modeId, tableId);
    const table = tables.get(key);
    if (!table) continue;

    // Handle spectator disconnect
    if (table.spectators.has(sessionId)) {
      table.spectators.delete(sessionId);
      engineLog('SPECTATOR_LEAVE', `${modeId}:${tableId}`, { session: sessionId.slice(-8), remaining: table.spectators.size });
      broadcastState(table);
      return;
    }

    const seat = table.sessionToSeat.get(sessionId);
    if (!seat) continue;

    table.connections.delete(seat);
    table.humanSeats.delete(seat);

    // On intentional leave: remove sessionToSeat so the seat can be reassigned.
    // On disconnect: keep it so a same-session refresh reclaims the same seat.
    if (intentional) {
      table.sessionToSeat.delete(sessionId);
    }

    const identityId = table.seatToIdentityId.get(seat);
    if (identityId) {
      const player = table.state.players.find(p => p.id === seat);
      if (player) {
        const lastSynced = table.lastChipSyncHand.get(seat) ?? -1;
        if (lastSynced !== table.handId) {
          storage.syncPlayerChips(identityId, player.chips).catch(() => {});
        }
      }

      if (intentional) {
        storage.clearPlayerActiveTable(identityId).catch(() => {});
        table.seatToIdentityId.delete(seat);
        table.lastChipSyncHand.delete(seat);
        table.sessionStats.delete(seat);
        table.chipsAtHandStart.delete(seat);
      }
    }

    if (intentional) {
      releaseSeat(table, seat);
    } else {
      const capturedSession = sessionId;
      const timer = setTimeout(() => {
        const t = tables.get(key);
        if (!t) return;
        if (t.connections.has(seat)) return;
        engineLog('RECONNECT_EXPIRED', `${modeId}:${tableId}`, { player: seat, session: capturedSession.slice(-8) });
        t.disconnectTimers.delete(seat);
        t.sessionToSeat.delete(capturedSession);
        const id = t.seatToIdentityId.get(seat);
        if (id) {
          t.seatToIdentityId.delete(seat);
          t.lastChipSyncHand.delete(seat);
          t.sessionStats.delete(seat);
          t.chipsAtHandStart.delete(seat);
          storage.clearPlayerActiveTable(id).catch(() => {});
        }
        releaseSeat(t, seat);
      }, RECONNECT_TIMEOUT_MS);
      table.disconnectTimers.set(seat, timer);
    }

    engineLog(intentional ? 'PLAYER_LEAVE' : 'PLAYER_DISCONNECT', `${modeId}:${tableId}`, {
      player: seat,
      session: sessionId.slice(-8),
      remaining: table.connections.size,
      intentional,
    });
    return;
  }
}

export function handleGenericAction(tableId: string, playerOrSessionId: string, action: string, payload: unknown): void {
  // Find which mode table this player belongs to.
  // `playerOrSessionId` is either:
  //   - A session UUID (used for join/leave via sessionToSeat map), OR
  //   - A seat ID (p1-p5) sent by the client in mode:action messages.
  // Both cases are handled below so the lookup succeeds either way.
  let table: GenericTable | undefined;
  for (const modeId of Object.keys(MODE_REGISTRY)) {
    const key = tableKey(modeId, tableId);
    const t = tables.get(key);
    if (!t) continue;
    if (t.sessionToSeat.has(playerOrSessionId) || t.connections.has(playerOrSessionId)) {
      table = t;
      break;
    }
  }

  if (!table) {
    console.warn('[CGP][server] handleGenericAction: NO TABLE FOUND', { tableId, playerOrSessionId, action });
    return;
  }
  if (table.actionLock) {
    console.warn('[CGP][server] handleGenericAction: actionLock held — DROPPING', { tableId, action });
    return;
  }

  table.actionLock = true;

  try {
    const s = table.state;
    // Resolve seat: if playerOrSessionId is a UUID, map via sessionToSeat;
    // if it's already a seatId (p1-p5), fall back to it directly.
    const playerId = table.sessionToSeat.get(playerOrSessionId) || playerOrSessionId;
    console.log('[CGP][server] handleGenericAction enter', { mode: table.modeId, tableId, action, playerId, phase: s.phase });

    // ── start: WAITING → ANTE ────────────────────────────────────────────────
    if (action === 'start' && s.phase === 'WAITING') {
      // Close join window — fill any still-open seats with bots before the hand starts.
      convertReservedToBots(table);
      const freshPlayers = table.state.players;
      table.handId += 1;
      const dealerIdx   = getDealerIndex(freshPlayers);
      const firstActIdx = getNextActivePlayerIndex(freshPlayers, dealerIdx);
      table.state = addMsg({ ...table.state, phase: 'ANTE', activePlayerId: freshPlayers[firstActIdx].id }, 'Ante up!');
      console.log('[CGP][server] start ACCEPTED', { mode: table.modeId, tableId, nextPhase: 'ANTE', activePlayerId: freshPlayers[firstActIdx].id, handId: table.handId });
      table.actionLock = false;
      broadcastState(table);
      scheduleNextBot(table);
      return;
    }

    // Log rejected start so we can see why
    if (action === 'start') {
      console.warn('[CGP][server] start REJECTED', { mode: table.modeId, tableId, currentPhase: s.phase, reason: 'phase!=WAITING' });
    }

    // ── restart: SHOWDOWN → ANTE ─────────────────────────────────────────────
    if (action === 'restart' && s.phase === 'SHOWDOWN') {
      // Guard: if restart fires within the 650ms resolve window, resolveShowdown
      // hasn't run yet — resolve synchronously so resetToAnte sees the correct
      // winner/pot state and never shows a false rollover message.
      const resolved = s.messages.some(m => m.isResolution);
      if (!resolved) {
        const result = table.mode.resolveShowdown(s.players, s.pot, '__server__', s.communityCards);
        table.state = { ...table.state, players: result.players, pot: result.pot };
      }
      for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
      table.botTimers.clear();
      table.actionLock = false;
      resetToAnte(table);
      broadcastState(table);
      return;
    }

    // ── rebuy: restore chips to 1000 when player is broke ────────────────────
    if (action === 'rebuy') {
      const playerIdx = s.players.findIndex(p => p.id === playerId);
      if (playerIdx === -1) { table.actionLock = false; return; }
      const player = s.players[playerIdx];
      if (player.chips > 0) { table.actionLock = false; return; } // only if truly broke
      table.state = addMsg({
        ...s,
        players: s.players.map(p =>
          p.id === playerId ? { ...p, chips: 1000 } : p
        ),
      }, `${player.name} rebuys $1000`);
      table.actionLock = false;
      broadcastState(table);
      return;
    }

    // ── chat ─────────────────────────────────────────────────────────────────
    if (action === 'chat') {
      const text = typeof payload === 'string' ? payload.trim().slice(0, 150) : '';
      if (!text) { table.actionLock = false; return; }
      const sender = s.players.find(p => p.id === playerId);
      if (!sender) { table.actionLock = false; return; }
      const msg: ChatMessage = { id: makeId(), senderId: playerId, senderName: sender.name, text, time: Date.now() };
      table.state = { ...s, chatMessages: [...s.chatMessages.slice(-49), msg] };
      table.actionLock = false;
      broadcastState(table);
      return;
    }

    // ── reaction ─────────────────────────────────────────────────────────────
    if (action === 'reaction') {
      const emoji = typeof payload === 'string' ? payload : '';
      if (!emoji) { table.actionLock = false; return; }
      const sender = s.players.find(p => p.id === playerId);
      if (!sender) { table.actionLock = false; return; }
      const now = Date.now();
      const event: ReactionEvent = { id: makeId(), playerId, playerName: sender.name, emoji, time: now };
      const liveReactions = [...(s.liveReactions ?? []).filter(r => now - r.time < 6000).slice(-14), event];
      table.state = { ...s, liveReactions };
      table.actionLock = false;
      broadcastState(table);
      return;
    }

    // ── declare (simultaneous: any active not-yet-declared player may declare) ──
    // DECLARE is logically simultaneous. Placing this BEFORE the activePlayerId
    // turn guard prevents silent drops when two humans click at the same time or
    // their messages arrive out of network order.
    if (action === 'declare' && s.phase === 'DECLARE') {
      const meIdx = s.players.findIndex(p => p.id === playerId);
      if (meIdx === -1) { table.actionLock = false; return; }
      const me = s.players[meIdx];
      if (me.hasActed || me.status !== 'active') { table.actionLock = false; return; }
      const dec = typeof payload === 'string'
        ? payload
        : (typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).declaration as string : null) ?? null;
      let newPlayers = [...s.players];
      let declMsg = '';
      if (dec === 'FOLD') {
        newPlayers[meIdx] = { ...me, status: 'folded', declaration: null, hasActed: true };
        declMsg = `${me.name} declared FOLD`;
      } else {
        newPlayers[meIdx] = { ...me, declaration: dec as Declaration, hasActed: true };
        declMsg = `${me.name} declared ${dec}`;
      }
      engineLog('ACTION', `${table.modeId}:${table.tableId}`, { player: playerId, action: 'declare', accepted: true, declaration: String(dec) });
      table.state = addMsg({ ...s, players: newPlayers }, declMsg);
      table.actionLock = false;
      afterHumanAction(table, false);
      return;
    }

    // ── validate it's the player's turn ──────────────────────────────────────
    if (s.activePlayerId !== playerId) {
      engineLog('ACTION', `${table.modeId}:${table.tableId}`, { player: playerId, action, accepted: false, reason: 'not-turn' });
      table.actionLock = false;
      return;
    }

    const playerIdx = s.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) { table.actionLock = false; return; }

    let newPlayers = [...s.players];
    let newPot = s.pot;
    let newCurrentBet = s.currentBet;
    let newRaisesThisRound = s.raisesThisRound ?? 0;
    let msg = '';
    let wasRaise = false;

    // ── ante ─────────────────────────────────────────────────────────────────
    if (action === 'ante' && s.phase === 'ANTE') {
      const player = newPlayers[playerIdx];
      newPlayers[playerIdx] = { ...player, chips: player.chips - 1, hasActed: true };
      newPot += 1;
      msg = `${player.name} pays $1 Ante`;
    }

    // ── fold ─────────────────────────────────────────────────────────────────
    else if (action === 'fold') {
      const player = newPlayers[playerIdx];
      newPlayers[playerIdx] = { ...player, status: 'folded', hasActed: true };
      msg = `${player.name} folds`;
    }

    // ── check ─────────────────────────────────────────────────────────────────
    else if (action === 'check') {
      const player = newPlayers[playerIdx];
      newPlayers[playerIdx] = { ...player, hasActed: true };
      msg = `${player.name} checks`;
    }

    // ── call ─────────────────────────────────────────────────────────────────
    else if (action === 'call') {
      const player = newPlayers[playerIdx];
      const callAmount = Math.min(newCurrentBet - player.bet, player.chips);
      newPlayers[playerIdx] = { ...player, chips: player.chips - callAmount, bet: player.bet + callAmount, hasActed: true };
      newPot += callAmount;
      msg = callAmount === 0 ? `${player.name} checks` : `${player.name} calls $${callAmount}`;
    }

    // ── raise/bet ─────────────────────────────────────────────────────────────
    else if (action === 'raise' || action === 'bet') {
      const player = newPlayers[playerIdx];
      const amount = typeof payload === 'number' ? payload : s.minBet;
      // Validate amount
      if (!Number.isFinite(amount) || amount <= 0) {
        table.actionLock = false; return;
      }
      // Server-side raise cap
      const activeCount = s.players.filter(p => p.status === 'active').length;
      const raiseCap = activeCount <= 2 ? 4 : 3;
      if (newRaisesThisRound >= raiseCap) {
        table.actionLock = false; return;
      }
      const raiseTotal = Math.min(amount, player.chips + player.bet);
      const isAllIn = raiseTotal === player.chips + player.bet;
      // Must be a real raise above currentBet (unless all-in)
      if (raiseTotal <= newCurrentBet && !isAllIn) {
        table.actionLock = false; return;
      }
      const chipCost = raiseTotal - player.bet;
      if (chipCost <= 0) {
        table.actionLock = false; return;
      }
      newPlayers[playerIdx] = { ...player, chips: player.chips - chipCost, bet: raiseTotal, hasActed: true };
      newPot += chipCost;
      newCurrentBet = raiseTotal;
      wasRaise = true;
      newRaisesThisRound = (newRaisesThisRound ?? 0) + 1;
      msg = `${player.name} raises to $${raiseTotal}`;
      // Re-open action for other players
      newPlayers = newPlayers.map(p =>
        p.id !== playerId && p.status === 'active' ? { ...p, hasActed: false } : p
      );
    }

    // ── draw ─────────────────────────────────────────────────────────────────
    else if (action === 'draw') {
      const indices: number[] = Array.isArray(payload) ? payload : [];
      const player = newPlayers[playerIdx];
      const newCards = [...player.cards];
      const newDiscard = [...(s.discardPile || [])];
      const newDeck = [...s.deck];
      for (const idx of indices) {
        if (idx >= 0 && idx < newCards.length) {
          newDiscard.push(newCards[idx]);
          if (newDeck.length === 0 && newDiscard.length > 0) {
            const reshuffled = [...newDiscard];
            newDiscard.length = 0;
            for (let ri = reshuffled.length - 1; ri > 0; ri--) {
              const rj = Math.floor(Math.random() * (ri + 1));
              [reshuffled[ri], reshuffled[rj]] = [reshuffled[rj], reshuffled[ri]];
            }
            newDeck.push(...reshuffled);
          }
          const drawn = newDeck.shift();
          if (drawn) newCards[idx] = { ...drawn, isHidden: false };
        }
      }
      newPlayers[playerIdx] = { ...player, cards: newCards, hasActed: true };
      const newState = {
        ...s,
        players: newPlayers,
        deck: newDeck,
        discardPile: newDiscard,
        pot: newPot,
        currentBet: newCurrentBet,
      };
      table.state = addMsg(newState, indices.length > 0 ? `${player.name} draws ${indices.length}` : `${player.name} stands pat`);
      table.actionLock = false;
      afterHumanAction(table, false);
      return;
    }

    // ── hit (fifteen35) ──────────────────────────────────────────────────────
    else if (action === 'hit') {
      const player = newPlayers[playerIdx];
      const newDeck = [...s.deck];
      const hitCard = newDeck.shift();
      if (hitCard) {
        const newCardIndex = player.cards.length;
        const newCards = [...player.cards, { ...hitCard, isHidden: false }];
        // Hit cards in 15/35 are face-up for all — add to public indices
        const prevPub = table.publicCardIndicesPerPlayer[playerId] ?? [];
        table.publicCardIndicesPerPlayer = {
          ...table.publicCardIndicesPerPlayer,
          [playerId]: [...prevPub, newCardIndex],
        };
        // Bust check: compute best total, reducing aces from 11→1 if needed
        const aceCount = newCards.filter(c => c.rank === 'A').length;
        let tot = newCards.reduce((sum, c) => {
          if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') return sum + 0.5;
          if (c.rank === 'A') return sum + 11;
          return sum + parseInt(c.rank, 10);
        }, 0);
        let acesFlipped = 0;
        while (tot > 35 && acesFlipped < aceCount) { tot -= 10; acesFlipped++; }
        if (tot > 35) {
          // Player busts — lock them out immediately
          newPlayers[playerIdx] = { ...player, cards: newCards, declaration: 'BUST', hasActed: true };
          table.state = addMsg({ ...s, players: newPlayers, deck: newDeck }, `${player.name} BUSTS (${Math.round(tot * 2) / 2})`);
          table.actionLock = false;
          afterHumanAction(table, false);
          return;
        }
        newPlayers[playerIdx] = { ...player, cards: newCards, hasActed: true };
        table.state = addMsg({ ...s, players: newPlayers, deck: newDeck }, `${player.name} hits (${Math.round(tot * 2) / 2})`);
      } else {
        newPlayers[playerIdx] = { ...player, declaration: 'STAY', hasActed: true };
        table.state = addMsg({ ...s, players: newPlayers }, `${player.name} stays`);
      }
      table.actionLock = false;
      afterHumanAction(table, false);
      return;
    }

    // ── stay (fifteen35) ─────────────────────────────────────────────────────
    else if (action === 'stay') {
      const player = newPlayers[playerIdx];
      newPlayers[playerIdx] = { ...player, declaration: 'STAY', hasActed: true };
      msg = `${player.name} stays`;
    }

    // ── declare_and_bet (suitspoker) ─────────────────────────────────────────
    // Combined declare+bet action. Payload: { declaration, action, amount? }
    else if (action === 'declare_and_bet') {
      const pl = (payload as { declaration?: string; action?: string; amount?: number }) ?? {};
      const declaration = pl.declaration;
      const betAction   = pl.action;
      const betAmount   = pl.amount;
      if (!declaration) { table.actionLock = false; return; }
      const player = newPlayers[playerIdx];
      if (betAction === 'fold') {
        newPlayers[playerIdx] = { ...player, declaration: declaration as Declaration, status: 'folded', hasActed: true };
        msg = `${player.name} declares ${declaration} and folds`;
      } else if (betAction === 'check') {
        newPlayers[playerIdx] = { ...player, declaration: declaration as Declaration, hasActed: true };
        msg = `${player.name} declares ${declaration} and checks`;
      } else if (betAction === 'call') {
        const callAmt = Math.min(newCurrentBet - player.bet, player.chips);
        newPlayers[playerIdx] = { ...player, declaration: declaration as Declaration, chips: player.chips - callAmt, bet: player.bet + callAmt, hasActed: true };
        newPot += callAmt;
        msg = callAmt === 0
          ? `${player.name} declares ${declaration} and checks`
          : `${player.name} declares ${declaration} and calls $${callAmt}`;
      } else if (betAction === 'raise' || betAction === 'bet') {
        const amt = typeof betAmount === 'number' ? betAmount : s.minBet;
        if (!Number.isFinite(amt) || amt <= 0) { table.actionLock = false; return; }
        const activeCount = s.players.filter(p => p.status === 'active').length;
        const raiseCap = activeCount <= 2 ? 4 : 3;
        if (newRaisesThisRound >= raiseCap) { table.actionLock = false; return; }
        const raiseTotal = Math.min(amt, player.chips + player.bet);
        const isAllIn = raiseTotal === player.chips + player.bet;
        if (raiseTotal <= newCurrentBet && !isAllIn) { table.actionLock = false; return; }
        const chipCost = raiseTotal - player.bet;
        if (chipCost <= 0) { table.actionLock = false; return; }
        newPlayers[playerIdx] = { ...player, declaration: declaration as Declaration, chips: player.chips - chipCost, bet: raiseTotal, hasActed: true };
        newPot += chipCost;
        newCurrentBet = raiseTotal;
        wasRaise = true;
        newRaisesThisRound += 1;
        msg = `${player.name} declares ${declaration} and raises to $${raiseTotal}`;
        newPlayers = newPlayers.map((p, i) =>
          i !== playerIdx && p.status === 'active' ? { ...p, hasActed: false } : p
        );
      } else {
        table.actionLock = false;
        return;
      }
    }

    else {
      // Unknown action
      table.actionLock = false;
      return;
    }

    let newState: GameState = {
      ...s,
      players: newPlayers.map((p, i) => {
        if (i !== playerIdx) return p;
        const old = s.players[playerIdx];
        const chipLoss = Math.max(0, old.chips - p.chips);
        return { ...p, totalBet: (old.totalBet || 0) + chipLoss };
      }),
      pot: newPot,
      currentBet: newCurrentBet,
      raisesThisRound: newRaisesThisRound,
    };
    if (msg) newState = addMsg(newState, msg);

    table.state = newState;
    table.actionLock = false;
    afterHumanAction(table, wasRaise);
  } catch (err) {
    console.error('[genericEngine:ERROR] handleGenericAction threw:', err);
    table.actionLock = false;
  }
}

export function getActiveGenericTables(): { tableId: string; modeId: string; humanCount: number; phase: string }[] {
  const result: { tableId: string; modeId: string; humanCount: number; phase: string }[] = [];
  for (const [, table] of Array.from(tables.entries())) {
    if (table.connections.size > 0 && !table.isPrivate) {
      result.push({ tableId: table.tableId, modeId: table.modeId, humanCount: table.humanSeats.size, phase: table.state.phase });
    }
  }
  return result;
}

// ─── Startup restore ──────────────────────────────────────────────────────────
// Called once at server startup. Restores all generic mode tables (Dead7,
// Fifteen35, SuitsPoker) from disk so active players reconnecting
// after a server restart find their table intact with chips preserved.

export function initGenericEngine(): void {
  const restored = loadPersistedGenericTables();
  for (const { modeId, tableId, state, handId } of restored) {
    const mode = MODE_REGISTRY[modeId];
    if (!mode) continue; // skip unknown modes (e.g. leftover from a removed mode)
    const key = tableKey(modeId, tableId);
    if (tables.has(key)) continue; // already in-memory (shouldn't happen at startup)
    tables.set(key, {
      tableId,
      modeId,
      mode,
      state,
      handId,
      actionLock: false,
      botTimers: new Map(),
      connections: new Map(),
      humanSeats: new Set(),
      sessionToSeat: new Map(),
      seatToIdentityId: new Map(),
      lastChipSyncHand: new Map(),
      spectators: new Map(),
      disconnectTimers: new Map(),
      publicCardIndicesPerPlayer: {},
      joinWindowEndsAt: 0, // join window closed for restored tables
      isPrivate: false,
      chipsAtHandStart: new Map(),
      sessionStats: new Map(),
    });
    engineLog('TABLE_CREATE', key, { source: 'restore', mode: modeId, phase: state.phase, handId });
  }
  if (restored.length > 0) {
    console.log(`[modes] Restored ${restored.length} generic table(s) from disk.`);
  }
}
