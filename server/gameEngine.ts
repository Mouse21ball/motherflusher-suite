// ─── Server-authoritative Badugi engine ──────────────────────────────────────
// Owns the canonical game state for every authoritative Badugi table.
// Clients send action intent; this engine validates, mutates, and broadcasts
// full state snapshots masked per recipient.
//
// Feature-flagged: tables only become authoritative when
// FEATURES.SERVER_AUTHORITATIVE_BADUGI is true OR
// BADUGI_ALPHA_ENABLED=true is set in the environment.

import type { WebSocket } from 'ws';
import type { GameState, Player, CardType, GamePhase, PlayerStatus, Declaration, ChatMessage, ReactionEvent } from '../shared/gameTypes';
import { BadugiMode } from '../shared/modes/badugi';
import { engineLog } from './engineLog';
import { scheduleSave, loadPersistedTables, deletePersistedTable } from './tablePersistence';

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
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
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

function addMsg(state: GameState, text: string, isResolution = false): GameState {
  return {
    ...state,
    messages: [...state.messages, { id: makeId(), text, time: Date.now(), isResolution }].slice(-10),
  };
}

// ─── Join window ──────────────────────────────────────────────────────────────
// How long (ms) seats p2-p5 are held open for real players before bots fill them.
const JOIN_WINDOW_MS = 30_000;

// Bot names restored when reserved seats convert to bots.
const BOT_PLAYERS: Record<string, string> = { p2: 'Alice', p3: 'Bob', p4: 'Charlie', p5: 'Daisy' };

// ─── Initial table roster ─────────────────────────────────────────────────────
// p4 is initial dealer → p1 (human) is always first-to-act in hand 1.
// p2-p5 start as 'reserved'/sitting_out: open seats for real players to claim.

function makeInitialPlayers(heroChips: number): Player[] {
  return [
    { id: 'p1', name: 'You',  presence: 'human',    chips: heroChips, bet: 0, totalBet: 0, cards: [], status: 'active',      isDealer: false, declaration: null, hasActed: false },
    { id: 'p2', name: 'Open', presence: 'reserved', chips: 1000,      bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: false, declaration: null, hasActed: false },
    { id: 'p3', name: 'Open', presence: 'reserved', chips: 1000,      bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: false, declaration: null, hasActed: false },
    { id: 'p4', name: 'Open', presence: 'reserved', chips: 1000,      bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: true,  declaration: null, hasActed: false },
    { id: 'p5', name: 'Open', presence: 'reserved', chips: 1000,      bet: 0, totalBet: 0, cards: [], status: 'sitting_out', isDealer: false, declaration: null, hasActed: false },
  ];
}

// Convert ALL remaining reserved seats to active bots at once.
// Called on hand start (early fill) or when the creator starts.
// Sets joinWindowEndsAt = 0 so staged-fill timers abort.
function convertReservedToBots(table: AuthTable): void {
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

// Convert exactly ONE reserved seat (lowest id) to a bot.
// Used by staged fill — does NOT close the join window, leaving later
// stages and human claims still valid.
function convertOneReservedToBot(table: AuthTable): boolean {
  const first = table.state.players.find(p => p.presence === 'reserved');
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

// ─── Staged bot fill ──────────────────────────────────────────────────────────
// +1 bot after 10 s · +1 after 40 s total · +1 after 100 s total.
// Each stage aborts if:
//   • the table was removed
//   • the join window was closed (start pressed) — joinWindowEndsAt resets to 0
//   • the hand already started (phase !== 'WAITING')
// If a human claimed the seat before the timer fires, convertOneReservedToBot
// skips their seat and targets the next reserved slot.

function scheduleStagedBotFill(tableId: string, capturedJoinWindowEndsAt: number): void {
  setTimeout(() => {
    const t = tables.get(tableId);
    if (!t || t.joinWindowEndsAt !== capturedJoinWindowEndsAt || t.state.phase !== 'WAITING') return;
    if (convertOneReservedToBot(t)) broadcastState(t);

    setTimeout(() => {
      const t2 = tables.get(tableId);
      if (!t2 || t2.joinWindowEndsAt !== capturedJoinWindowEndsAt || t2.state.phase !== 'WAITING') return;
      if (convertOneReservedToBot(t2)) broadcastState(t2);

      setTimeout(() => {
        const t3 = tables.get(tableId);
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
    activePlayerId: 'p1',
    players: makeInitialPlayers(1000),
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

function maskStateForPlayer(state: GameState, forPlayerId: string): GameState {
  const isShowdown = state.phase === 'SHOWDOWN';
  return {
    ...state,
    deck: [],                // never expose the deck to clients
    players: state.players.map(p => {
      if (p.id === forPlayerId) return p;
      if (isShowdown) return p; // all hands revealed at resolution
      return { ...p, cards: p.cards.map(c => ({ ...c, isHidden: true })) };
    }),
  };
}

// ─── Seat order ───────────────────────────────────────────────────────────────
// All four slots can be claimed by live humans. Bots fill unclaimed slots.
// This is the order in which seats are assigned to connecting browsers.

const SEAT_ORDER = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;
type SeatId = typeof SEAT_ORDER[number];

// ─── Table record ─────────────────────────────────────────────────────────────

interface AuthTable {
  tableId: string;
  state: GameState;
  // Increments on each new hand. Bot timers capture this value at creation;
  // if it has changed when the timer fires, the action is silently dropped.
  handId: number;
  // Prevents re-entrant mutations.
  actionLock: boolean;
  botTimers: Map<string, ReturnType<typeof setTimeout>>;
  // connections keyed by game seat id (p1/p2/p3/p4/p5)
  connections: Map<string, WebSocket>;
  // Which game seats are held by live human WebSocket connections.
  // Bot scheduling skips any seat in this set.
  humanSeats: Set<string>;
  // Maps a client's opaque session id → assigned game seat.
  // Kept across disconnects so a page-refresh gets the same seat back.
  sessionToSeat: Map<string, string>;
  // Spectators: sessions watching but not seated (table full).
  spectators: Map<string, { ws: WebSocket; name: string }>;
  // Unix timestamp after which reserved seats convert to bots. 0 = window closed.
  joinWindowEndsAt: number;
}

const tables = new Map<string, AuthTable>();

// ─── Seat assignment ──────────────────────────────────────────────────────────

function assignSeat(table: AuthTable, sessionId: string): SeatId | null {
  // Reconnect: session already has a seat — reuse it.
  const existing = table.sessionToSeat.get(sessionId);
  if (existing && SEAT_ORDER.includes(existing as SeatId)) return existing as SeatId;

  // New session: first seat with no live connection.
  for (const seat of SEAT_ORDER) {
    if (!table.connections.has(seat)) return seat;
  }
  return null; // table full (>4 humans)
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
      ws.send(JSON.stringify({ type: 'badugi:snapshot', state: maskStateForPlayer(stateWithMeta, playerId) }));
    } catch { /* ignore closed socket race */ }
  }
  // Also send to spectators (all cards hidden)
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
    activePlayerId: nextPlayers[firstActIdx].id,
    players: nextPlayers,
  }, nextPhase.replace(/_/g, ' '));

  engineLog('PHASE', table.tableId, {
    from: prevPhase,
    to: nextPhase,
    pot: table.state.pot,
    active: table.state.activePlayerId,
  });

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
    }, 400);
    return;
  }

  // ── SHOWDOWN: resolve after a brief pause ─────────────────────────────────
  if (nextPhase === 'SHOWDOWN') {
    resolveShowdown(table);
    return;
  }
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

  setTimeout(() => {
    if (table.handId !== fenced || table.state.phase !== 'SHOWDOWN') return;

    const s = table.state;
    const result = BadugiMode.resolveShowdown(s.players, s.pot, '__server__');

    const winner = result.players.find(p => p.isWinner)?.id ?? 'unknown';
    engineLog('PHASE', table.tableId, {
      from: 'SHOWDOWN',
      to: 'RESOLVE',
      pot: s.pot,
      winner,
    });

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

    // Auto-advance to next hand after 5 seconds
    const fenced2 = table.handId;
    setTimeout(() => {
      if (table.handId !== fenced2 || table.state.phase !== 'SHOWDOWN') return;
      resetToAnte(table);
      broadcastState(table);
    }, 5000);
  }, 900);
}

// ─── Reset after showdown ─────────────────────────────────────────────────────

function resetToAnte(table: AuthTable): void {
  const s = table.state;
  const isRollover = s.pot > 0;
  const basePlayers = isRollover ? s.players : moveDealer(s.players);

  const nextPlayers: Player[] = basePlayers.map(p => {
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

  const dealerIdx   = getDealerIndex(nextPlayers);
  const firstActIdx = getNextActivePlayerIndex(nextPlayers, dealerIdx);

  // Cancel all pending bot timers from the previous hand
  for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
  table.botTimers.clear();
  table.handId += 1;

  table.state = {
    ...s,
    phase: 'ANTE',
    currentBet: 0,
    heroChipChange: undefined,
    activePlayerId: nextPlayers[firstActIdx].id,
    players: nextPlayers,
    deck: [],
    discardPile: [],
    messages: [{
      id: makeId(),
      text: isRollover ? `Rollover — $${s.pot} carries over.` : 'New hand.',
      time: Date.now(),
    }],
  };

  engineLog('PHASE', table.tableId, { from: 'SHOWDOWN', to: 'ANTE', pot: table.state.pot, active: table.state.activePlayerId });

  scheduleNextBot(table);
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

  const thinkMs = (capturedPhase.startsWith('BET') ? 1200 : 700) + Math.random() * 600;

  const timer = setTimeout(() => {
    table.botTimers.delete(botId);
    if (table.handId !== capturedHandId || table.state.phase !== capturedPhase) return;
    executeBotAction(table, botId);
  }, thinkMs);

  table.botTimers.set(botId, timer);
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

    if (roundOver) {
      const capturedHandId = table.handId;
      const capturedPhase  = table.state.phase;
      setTimeout(() => {
        if (table.handId !== capturedHandId || table.state.phase !== capturedPhase) return;
        advanceToNextPhase(table);
        broadcastState(table);
        scheduleNextBot(table);
      }, wasRaise ? 750 : 500);
    } else if (nextPlayerId) {
      table.state = { ...table.state, activePlayerId: nextPlayerId };
      broadcastState(table);
      scheduleNextBot(table);
    }
  } catch (err) {
    engineLog('ERROR', table.tableId, { msg: 'bot-action-threw', bot: botId, phase: table.state.phase });
    console.error('[badugi:ERROR] bot action error:', err);
    table.actionLock = false;
  }
}

// ─── After-human-action plumbing ──────────────────────────────────────────────

function afterHumanAction(table: AuthTable, wasRaise = false): void {
  broadcastState(table);

  if (isRoundOver(table.state)) {
    const capturedHandId = table.handId;
    const capturedPhase  = table.state.phase;
    setTimeout(() => {
      if (table.handId !== capturedHandId || table.state.phase !== capturedPhase) return;
      advanceToNextPhase(table);
      broadcastState(table);
      scheduleNextBot(table);
    }, wasRaise ? 750 : 500);
  } else {
    const s = table.state;
    const isDrawPhase    = s.phase.startsWith('DRAW');
    const isDeclarePhase = s.phase === 'DECLARE';
    const skipAllIn      = !isDrawPhase && !isDeclarePhase;
    const myIdx   = s.players.findIndex(p => p.id === s.activePlayerId);
    const nextIdx = getNextActivePlayerIndex(s.players, myIdx, skipAllIn);
    table.state = { ...s, activePlayerId: s.players[nextIdx].id };
    broadcastState(table);
    scheduleNextBot(table);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Called once at server startup to restore persisted table states.
export function initEngine(): void {
  const restored = loadPersistedTables();
  for (const { tableId, state, handId } of restored) {
    tables.set(tableId, {
      tableId,
      state,
      handId,
      actionLock: false,
      botTimers: new Map(),
      connections: new Map(),
      humanSeats: new Set(),
      sessionToSeat: new Map(),
      spectators: new Map(),
      joinWindowEndsAt: 0, // window already closed for restored tables
    });
    engineLog('TABLE_CREATE', tableId, { source: 'restore', phase: state.phase, handId });
  }
  if (restored.length > 0) {
    console.log(`[badugi] Restored ${restored.length} table(s) from disk.`);
  }
}

// Returns summary info for all tables that currently have at least one
// active WebSocket connection. Used by the lobby API to show live tables.
export function getActiveBadugiTables(): { tableId: string; humanCount: number; phase: string; handId: number }[] {
  const result: { tableId: string; humanCount: number; phase: string; handId: number }[] = [];
  for (const [tableId, table] of Array.from(tables.entries())) {
    if (table.connections.size > 0) {
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

export function getOrCreateBadugiTable(tableId: string): AuthTable {
  if (!tables.has(tableId)) {
    const joinWindowEndsAt = Date.now() + JOIN_WINDOW_MS;
    tables.set(tableId, {
      tableId,
      state: makeInitialState(tableId),
      handId: 0,
      actionLock: false,
      botTimers: new Map(),
      connections: new Map(),
      humanSeats: new Set(),
      sessionToSeat: new Map(),
      spectators: new Map(),
      joinWindowEndsAt,
    });
    engineLog('TABLE_CREATE', tableId, { source: 'new', joinWindowMs: JOIN_WINDOW_MS });
    scheduleStagedBotFill(tableId, joinWindowEndsAt);
  }
  return tables.get(tableId)!;
}

// Assigns a seat to the connecting browser session and sends an atomic
// badugi:init message (seat + current state in one frame so the client
// never processes a snapshot before it knows its own seat).
// Returns the assigned seat id, or null if the table is full.
export function addBadugiConnection(tableId: string, sessionId: string, ws: WebSocket, playerName?: string): string | null {
  const table = getOrCreateBadugiTable(tableId);

  const seat = assignSeat(table, sessionId);
  if (!seat) {
    // Table full — register as spectator
    table.spectators.set(sessionId, { ws, name: playerName ?? 'Spectator' });
    engineLog('SPECTATOR_JOIN', tableId, { session: sessionId.slice(-8), count: table.spectators.size });
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

  const isReconnect = table.sessionToSeat.has(sessionId);
  table.sessionToSeat.set(sessionId, seat);
  table.connections.set(seat, ws);
  table.humanSeats.add(seat);

  // Update name, presence, and—if taking a reserved seat—activate it.
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

  engineLog(isReconnect ? 'RECONNECT' : 'PLAYER_JOIN', tableId, {
    player: seat,
    session: sessionId.slice(-8),
    phase: table.state.phase,
    connections: table.connections.size,
    wasReserved,
  });

  // Atomic init: seat assignment + masked snapshot in one message.
  // Client must process seat before it can correctly display cards.
  try {
    ws.send(JSON.stringify({
      type: 'badugi:init',
      playerId: seat,
      state: maskStateForPlayer(table.state, seat),
    }));
  } catch { /* ws may have already closed */ }

  return seat;
}

export function removeBadugiConnection(tableId: string, sessionId: string): void {
  const table = tables.get(tableId);
  if (!table) return;

  // Handle spectator disconnect
  if (table.spectators.has(sessionId)) {
    table.spectators.delete(sessionId);
    engineLog('SPECTATOR_LEAVE', tableId, { session: sessionId.slice(-8), remaining: table.spectators.size });
    broadcastState(table);
    return;
  }

  const seat = table.sessionToSeat.get(sessionId);
  if (!seat) return;

  table.connections.delete(seat);
  table.humanSeats.delete(seat);
  // sessionToSeat is kept so a page-refresh reconnect gets the same seat.

  engineLog('PLAYER_LEAVE', tableId, {
    player: seat,
    session: sessionId.slice(-8),
    phase: table.state.phase,
    remaining: table.connections.size,
  });
}

export function handleBadugiAction(tableId: string, playerId: string, action: string, payload: unknown): void {
  const table = tables.get(tableId);
  if (!table) {
    engineLog('ACTION', tableId, { player: playerId, action, accepted: false, reason: 'no-table' });
    return;
  }

  if (table.actionLock) {
    engineLog('ACTION', tableId, { player: playerId, action, accepted: false, reason: 'locked' });
    return;
  }

  table.actionLock = true;

  try {
    const s = table.state;

    // ── start: WAITING → ANTE ────────────────────────────────────────────────
    if (action === 'start' && s.phase === 'WAITING') {
      // Close join window — fill any still-open seats with bots before the hand starts.
      convertReservedToBots(table);
      const freshPlayers = table.state.players;
      table.handId += 1;
      const dealerIdx   = getDealerIndex(freshPlayers);
      const firstActIdx = getNextActivePlayerIndex(freshPlayers, dealerIdx);
      table.state = addMsg({
        ...table.state,
        phase: 'ANTE',
        activePlayerId: freshPlayers[firstActIdx].id,
      }, 'Ante up!');
      engineLog('ACTION', tableId, { player: playerId, action: 'start', accepted: true, phase: 'ANTE' });
      table.actionLock = false;
      broadcastState(table);
      scheduleNextBot(table);
      return;
    }

    // ── restart: SHOWDOWN → ANTE (manual, overrides 5 s auto-reset) ──────────
    if (action === 'restart' && s.phase === 'SHOWDOWN') {
      for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
      table.botTimers.clear();
      table.actionLock = false;
      engineLog('ACTION', tableId, { player: playerId, action: 'restart', accepted: true });
      resetToAnte(table);
      broadcastState(table);
      return;
    }

    // ── chat — no turn required, any seated player can message ─────────────
    if (action === 'chat') {
      const text = typeof payload === 'string' ? payload.trim().slice(0, 150) : '';
      if (!text) { table.actionLock = false; return; }
      const sender = s.players.find(p => p.id === playerId);
      if (!sender) { table.actionLock = false; return; }
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
      broadcastState(table);
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

    // All remaining actions require it to be this player's turn
    if (s.activePlayerId !== playerId) {
      engineLog('ACTION', tableId, { player: playerId, action, accepted: false, reason: 'not-turn', active: s.activePlayerId });
      table.actionLock = false;
      return;
    }

    // ── ante ─────────────────────────────────────────────────────────────────
    if (action === 'ante' && s.phase === 'ANTE') {
      table.state = addMsg({
        ...s,
        pot: s.pot + 1,
        players: s.players.map(p =>
          p.id === playerId
            ? { ...p, chips: p.chips - 1, hasActed: true, totalBet: (p.totalBet || 0) + 1 }
            : p
        ),
      }, 'You paid $1 Ante');
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
      const me = s.players.find(p => p.id === playerId)!;
      const prevBet   = me.bet;
      const increment = Math.min(payload - prevBet, me.chips);
      const newBet    = prevBet + increment;
      let newState: GameState = addMsg({
        ...s,
        currentBet: newBet,
        pot: s.pot + increment,
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
      const indices: number[] = Array.isArray(payload) ? (payload as number[]) : [];
      let newDeck      = [...s.deck];
      const newDiscard = [...(s.discardPile || [])];

      const newPlayers = s.players.map(p => {
        if (p.id !== playerId) return p;
        if (indices.length === 0) return { ...p, hasActed: true };
        const newCards = [...p.cards];
        indices.forEach(idx => {
          newDiscard.push(newCards[idx]);
          if (newDeck.length === 0 && newDiscard.length > 0) {
            const reshuffled = [...newDiscard];
            newDiscard.length = 0;
            for (let i = reshuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
            }
            newDeck = reshuffled;
          }
          newCards[idx] = { ...newDeck.shift()!, isHidden: false };
        });
        return { ...p, cards: newCards, hasActed: true };
      });

      const msg = indices.length === 0 ? 'You stood pat' : `You discarded ${indices.length} card${indices.length > 1 ? 's' : ''}`;
      engineLog('ACTION', tableId, { player: playerId, action: 'draw', accepted: true, count: indices.length, phase: s.phase });
      table.state = addMsg({ ...s, players: newPlayers, deck: newDeck, discardPile: newDiscard }, msg);
      table.actionLock = false;
      afterHumanAction(table);
      return;
    }

    // ── declare ───────────────────────────────────────────────────────────────
    if (action === 'declare' && s.phase === 'DECLARE') {
      const { declaration } = payload as { declaration: Declaration };
      if (declaration === 'FOLD') {
        table.state = addMsg({
          ...s,
          players: s.players.map(p =>
            p.id === playerId ? { ...p, status: 'folded', declaration: null, hasActed: true } : p
          ),
        }, 'You declared FOLD');
      } else {
        table.state = addMsg({
          ...s,
          players: s.players.map(p =>
            p.id === playerId ? { ...p, declaration, hasActed: true } : p
          ),
        }, `You declared ${declaration}`);
      }
      engineLog('ACTION', tableId, { player: playerId, action: 'declare', accepted: true, declaration: String(declaration) });
      table.actionLock = false;
      afterHumanAction(table);
      return;
    }

    // Unknown or mismatched action — log and drop
    engineLog('ACTION', tableId, { player: playerId, action, accepted: false, reason: 'invalid', phase: s.phase });
    table.actionLock = false;
  } catch (err) {
    engineLog('ERROR', tableId, { msg: 'action-threw', player: playerId, action, phase: tables.get(tableId)?.state.phase ?? '?' });
    console.error('[badugi:ERROR] action error:', err);
    table.actionLock = false;
  }
}

export function destroyBadugiTable(tableId: string): void {
  const table = tables.get(tableId);
  if (!table) return;
  for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
  deletePersistedTable(tableId);
  tables.delete(tableId);
  engineLog('TABLE_CREATE', tableId, { source: 'destroy' });
}
