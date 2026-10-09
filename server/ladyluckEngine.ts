import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { storage, LADY_LUCK_HOUSE_ID } from './storage';
import { LADY_LUCK_FLIP_INTERVAL_MS } from '../shared/ladyluckTiming';
import { applyRake } from './utils/rake';
import {
  canJoinLadyLuckTable,
  isValidLadyLuckSideBetAmount,
  validateLadyLuckWagerAmount,
} from '../shared/ladyLuckJoinEligibility';
import {
  LadyLuckState,
  LadyLuckPlayer,
  LadyLuckSuit,
  LadyLuckRoom,
  LADY_LUCK_ROOMS,
  SUITS,
} from '../shared/modes/ladyluck';
import { scheduleLLSave, flushLLFinancialState, loadPersistedLadyLuckTables, deleteLLPersistedTable } from './ladyluckPersistence';
import { secureShuffleInPlace } from './utils/secureShuffle';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LLCard { rank: string; suit: LadyLuckSuit; }

interface LLSpectator {
  userId:   string;
  username: string;
  avatar:   string;
  ws:       WebSocket;
}

interface LLTableMeta {
  tableId: string;
  state: LadyLuckState;
  connections: Map<string, WebSocket>;
  spectators:  Map<string, LLSpectator>;
  spectatorBets: Map<string, { suit: LadyLuckSuit; amount: number }>;
  raceInterval?: ReturnType<typeof setInterval>;
  botFillTimer?: ReturnType<typeof setTimeout>;
  countdownTimer?: ReturnType<typeof setInterval>;
  resultsInterval?: ReturnType<typeof setInterval>;
  betInterval?: ReturnType<typeof setInterval>;
  deck: LLCard[];
  hostId: string | null;
  starting?: boolean;
  settling?: boolean;
  settlementAttempts?: number;
  /** Per-player/spectator lock: IDs currently awaiting a wager/sidebet debit.
   *  Prevents double-submission through the async debitChipsForBuyin TOCTOU window. */
  wagerLock: Set<string>;
}

// ── In-memory tables ──────────────────────────────────────────────────────────

const tables = new Map<string, LLTableMeta>();

// ── Helpers ───────────────────────────────────────────────────────────────────

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const BOT_NAMES = ['Slick', 'Vega', 'Rosie', 'Duke', 'Nyx', 'Bones', 'Cleo', 'Remy'];

export function buildDeck(): LLCard[] {
  const deck: LLCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  return secureShuffleInPlace(a);
}

function broadcast(meta: LLTableMeta, msg: object) {
  const payload = JSON.stringify(msg);
  for (const ws of meta.connections.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch {}
    }
  }
  // Bug fix: spectators must also receive ll:flip events during the race
  for (const sp of meta.spectators.values()) {
    if (sp.ws.readyState === WebSocket.OPEN) {
      try { sp.ws.send(payload); } catch {}
    }
  }
}

function broadcastState(meta: LLTableMeta) {
  meta.state.spectatorCount = meta.spectators.size;
  const serializeStart = Date.now();
  const payload = JSON.stringify({ type: 'll:state', state: meta.state });
  const serializeMs = Date.now() - serializeStart;
  const sendStart = Date.now();
  let sentCount = 0;
  for (const ws of meta.connections.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); sentCount++; } catch {}
    }
  }
  for (const sp of meta.spectators.values()) {
    if (sp.ws.readyState === WebSocket.OPEN) {
      try { sp.ws.send(payload); sentCount++; } catch {}
    }
  }
  const sendMs = Date.now() - sendStart;
  if (serializeMs > 1 || sendMs > 1 || sentCount > 0) {
    console.log(`[LL-TIMING-SERVER] broadcastState — JSON.stringify=${serializeMs}ms, ws.send x${sentCount}=${sendMs}ms`);
  }
  scheduleLLSave(meta.tableId, meta.state, meta.deck, meta.hostId, meta.spectatorBets);
}

function saveFinancialState(meta: LLTableMeta) {
  flushLLFinancialState(meta.tableId, meta.state, meta.deck, meta.hostId, meta.spectatorBets);
}

function emptyPositions(): Record<LadyLuckSuit, number> {
  return { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
}

// ── Public: create table from REST endpoint ───────────────────────────────────

export function createLLTable(tableId: string, roomType: LadyLuckRoom, hostId: string): void {
  if (tables.has(tableId)) return;
  const state: LadyLuckState = {
    raceId:           randomUUID(),
    phase:            'LOBBY',
    players:          [],
    positions:        emptyPositions(),
    flippedCards:     [],
    currentCard:      null,
    winner:           null,
    pot:              0,
    sideBets:         [],
    roomType,
    dealerIndex:      0,
    currentPickIndex: 1,
    claimedSuits:     [],
    startingIn:       null,
    resultsTimeLeft:  null,
    betTimeLeft:      null,
    spectatorCount:   0,
  };
  const meta: LLTableMeta = {
    tableId,
    state,
    connections: new Map(),
    spectators:  new Map(),
    spectatorBets: new Map(),
    deck:        [],
    hostId,
    wagerLock:   new Set(),
  };
  tables.set(tableId, meta);

  // Start 10-second bot-fill timer so lonely hosts aren't stuck waiting forever
  meta.botFillTimer = setTimeout(() => { void scheduleBotFill(tableId).catch(console.error); }, 10_000);
}

// ── Bot-fill helpers ──────────────────────────────────────────────────────────

function pickBotName(usedNames: string[]): string {
  const available = BOT_NAMES.filter(n => !usedNames.includes(n));
  if (available.length === 0) return `Bot ${usedNames.length + 1}`;
  return available[Math.floor(Math.random() * available.length)];
}

async function addBotToLobby(tableId: string): Promise<void> {
  const meta = tables.get(tableId);
  if (!meta || meta.state.phase !== 'LOBBY' || meta.state.players.length >= 4) return;
  const { state } = meta;
  const name  = pickBotName(state.players.map(p => p.name));
  const botId = `bot_${randomUUID()}`;
  const chips = await storage.fundLadyLuckBot(botId, tableId);
  if (tables.get(tableId) !== meta || state.phase !== 'LOBBY' || state.players.length >= 4) {
    await storage.releaseLadyLuckBot(botId, tableId);
    return;
  }
  state.players.push({
    id:        botId,
    name,
    chips,
    suit:      null,
    wager:     0,
    presence:  'bot',
    wagered:   false,
    seatIndex: state.players.length,
  });
  broadcastState(meta);
}

async function scheduleBotFill(tableId: string): Promise<void> {
  const meta = tables.get(tableId);
  if (!meta || meta.state.phase !== 'LOBBY') return;
  meta.botFillTimer = undefined;

  // Hardened Oct 2026: a single addBotToLobby failure must NOT kill the chain.
  // Previously the bare `await` below threw, the .catch at the timer level
  // swallowed it, and the refill loop never started — soft-locking solo hosts
  // in the lobby forever with no error shown. Retries run forever on the 2s
  // cadence (the failure may be transient, e.g. a funding race); the host is
  // notified once after 5 consecutive failures so they're never left waiting
  // in silence.
  let consecutiveFailures = 0;
  let hostNotified = false;
  const notifyHostOfBotFillFailure = () => {
    if (hostNotified) return;
    hostNotified = true;
    const m = tables.get(tableId);
    const ws = m?.connections.get(m?.hostId ?? '');
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'll:error',
          message: "Couldn't fill the table with players. Please leave and create a new table.",
        }));
      } catch {}
    }
  };

  // Add one bot immediately, then schedule the rest 2 s apart
  try {
    await addBotToLobby(tableId);
  } catch (err) {
    consecutiveFailures++;
    console.error(`[LL] initial bot-fill failed for table ${tableId}:`, err);
  }

  const refill = async () => {
    const m = tables.get(tableId);
    if (!m || m.state.phase !== 'LOBBY') return;
    if (m.state.players.length < 4) {
      try {
        await addBotToLobby(tableId);
        consecutiveFailures = 0;
      } catch (err) {
        consecutiveFailures++;
        console.error(`[LL] bot-fill refill failed for table ${tableId} (${consecutiveFailures}x consecutive):`, err);
        if (consecutiveFailures >= 5) notifyHostOfBotFillFailure();
        // Intentionally no return — keep retrying forever. The failure may be
        // transient; giving up permanently is what soft-locked lobbies before.
      }
      m.botFillTimer = setTimeout(() => { void refill().catch(console.error); }, 2_000);
    } else {
      scheduleCountdown(tableId);
    }
  };

  const m = tables.get(tableId);
  if (!m) return;
  if (m.state.players.length < 4) {
    m.botFillTimer = setTimeout(() => { void refill().catch(console.error); }, 2_000);
  } else {
    scheduleCountdown(tableId);
  }
}

function scheduleCountdown(tableId: string): void {
  const meta = tables.get(tableId);
  if (!meta || meta.state.phase !== 'LOBBY') return;
  if (meta.countdownTimer !== undefined) return; // already running

  meta.state.startingIn = 3;
  broadcastState(meta);

  let ticks = 3;
  meta.countdownTimer = setInterval(() => {
    const m = tables.get(tableId);
    if (!m || m.state.phase !== 'LOBBY') {
      if (m?.countdownTimer) { clearInterval(m.countdownTimer); m.countdownTimer = undefined; }
      return;
    }
    ticks--;
    if (ticks <= 0) {
      clearInterval(m.countdownTimer);
      m.countdownTimer   = undefined;
      m.state.startingIn = null;
      void doStart(tableId).catch(console.error);
    } else {
      m.state.startingIn = ticks;
      broadcastState(m);
    }
  }, 1_000);
}

/** Internal start — no host/player-count guards, called by auto-fill and handleLLStart */
async function doStart(tableId: string): Promise<void> {
  const meta = tables.get(tableId);
  if (!meta) return;
  const { state } = meta;
  if (state.phase !== 'LOBBY' || meta.starting) return;
  meta.starting = true;
  try {

  // Fill any remaining seats with bots (handles manual-start-with-2 case)
  const count = state.players.length;
  if (count < 4) {
    const usedNames = state.players.map(p => p.name);
    const needed    = 4 - count;
    for (let i = 0; i < needed; i++) {
      const name = pickBotName([...usedNames, ...Array.from({ length: i }, (_, k) => state.players[count + k]?.name ?? '')]);
      const botId = `bot_${randomUUID()}`;
      const chips = await storage.fundLadyLuckBot(botId, tableId);
      if (tables.get(tableId) !== meta || state.phase !== 'LOBBY' || state.players.length >= 4) {
        await storage.releaseLadyLuckBot(botId, tableId);
        break;
      }
      state.players.push({
        id:        botId,
        name,
        chips,
        suit:      null,
        wager:     0,
        presence:  'bot',
        wagered:   false,
        seatIndex: count + i,
      });
    }
  }

  state.startingIn       = null;
  state.dealerIndex      = Math.floor(Math.random() * state.players.length);
  state.currentPickIndex = (state.dealerIndex + 1) % state.players.length;
  state.phase            = 'SELECT';
  state.claimedSuits     = [];

  broadcastState(meta);
  scheduleNextBotPick(tableId);
  } finally {
    meta.starting = false;
  }
}

/** Find an existing joinable LOBBY table for this tier, or create a brand-new one.
 *  Runs synchronously — safe from race conditions in Node.js's single-threaded runtime. */
export function findOrCreateLLTable(roomType: LadyLuckRoom, hostId: string): string {
  for (const [tableId, meta] of tables.entries()) {
    if (
      meta.state.roomType === roomType &&
      meta.state.phase === 'LOBBY' &&
      meta.state.players.filter(p => p.presence !== 'open').length < 4
    ) {
      return tableId; // reuse existing open lobby
    }
  }
  // No joinable table found — create a fresh one
  const tableId = `ll_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  createLLTable(tableId, roomType, hostId);
  return tableId;
}

export function getLLActiveTables(): { tableId: string; roomType: LadyLuckRoom; playerCount: number; isFull: boolean; spectatorCount: number }[] {
  const out: { tableId: string; roomType: LadyLuckRoom; playerCount: number; isFull: boolean; spectatorCount: number }[] = [];
  for (const [tableId, meta] of tables.entries()) {
    const { phase } = meta.state;
    if (phase === 'LOBBY' || phase === 'SELECT' || phase === 'WAGER' || phase === 'RACE' || phase === 'RESULTS' || phase === 'BET') {
      const activePlayers = meta.state.players.filter(p => p.presence !== 'open').length;
      const openSlots     = meta.state.players.filter(p => p.presence === 'open').length;
      const isFull        = activePlayers >= 4 && openSlots === 0 && phase !== 'LOBBY';
      out.push({
        tableId,
        roomType:       meta.state.roomType,
        playerCount:    activePlayers,
        isFull,
        spectatorCount: meta.spectators.size,
      });
    }
  }
  return out;
}

export function getPlayerLLTablePhase(playerId: string): string | null {
  for (const meta of tables.values()) {
    if (meta.state.players.some(player => player.id === playerId)) return meta.state.phase;
  }
  return null;
}

// ── ll:join ───────────────────────────────────────────────────────────────────

export function handleLLJoin(
  tableId: string,
  playerId: string,
  playerName: string,
  chips: number,
  ws: WebSocket,
): void {
  const joinStart = Date.now();
  const t0 = joinStart;

  const meta = tables.get(tableId);
  console.log(`[LL-TIMING-SERVER] handleLLJoin — tables.get(tableId) took ${Date.now() - t0}ms, found=${!!meta}`);
  if (!meta) {
    try { ws.send(JSON.stringify({ type: 'll:error', message: 'table_not_found' })); } catch {}
    return;
  }
  const { state } = meta;

  const t1 = Date.now();
  const existing = state.players.find(p => p.id === playerId);
  if (!canJoinLadyLuckTable(state, playerId, chips)) {
    try { ws.send(JSON.stringify({ type: 'll:error', message: 'insufficient_chips' })); } catch {}
    return;
  }
  meta.connections.set(playerId, ws);
  if (!existing) {
    if (state.phase === 'LOBBY') {
      // First-time join in lobby — just append
      if (state.players.length >= 4) {
        try { ws.send(JSON.stringify({ type: 'll:error', message: 'table_full' })); } catch {}
        return;
      }
      state.players.push({
        id:        playerId,
        name:      playerName,
        chips,
        suit:      null,
        wager:     0,
        presence:  'human',
        wagered:   false,
        seatIndex: state.players.length,
      });
    } else if (state.phase === 'RESULTS' || state.phase === 'BET') {
      // New player joining during inter-round window — fill an open seat
      const openIdx = state.players.findIndex(p => p.presence === 'open');
      if (openIdx === -1) {
        try { ws.send(JSON.stringify({ type: 'll:error', message: 'table_full' })); } catch {}
        return;
      }
      const seat = state.players[openIdx];
      state.players[openIdx] = {
        id:        playerId,
        name:      playerName,
        chips,
        suit:      null,
        wager:     0,
        presence:  'human',
        wagered:   false,
        seatIndex: seat.seatIndex,
      };
    } else {
      try { ws.send(JSON.stringify({ type: 'll:error', message: 'game_in_progress' })); } catch {}
      return;
    }
  } else {
    existing.chips = chips;
  }

  console.log(`[LL-TIMING-SERVER] handleLLJoin — player lookup+append took ${Date.now() - t1}ms (existing=${!!existing})`);

  if (!meta.hostId) meta.hostId = playerId;

  const broadcastStart = Date.now();
  broadcastState(meta);
  console.log(`[LL-TIMING-SERVER] handleLLJoin — broadcastState call took ${Date.now() - broadcastStart}ms, total handleLLJoin=${Date.now() - joinStart}ms`);
}

// ── ll:start ──────────────────────────────────────────────────────────────────

export function handleLLStart(tableId: string, playerId: string): void {
  const meta = tables.get(tableId);
  if (!meta) return;
  const { state } = meta;
  if (state.phase !== 'LOBBY') return;
  if (meta.hostId !== playerId) return;
  if (state.players.length < 2) {
    const ws = meta.connections.get(playerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'll:error', message: 'need_2_players' })); } catch {}
    }
    return;
  }

  // Cancel any pending bot-fill or countdown timers — human host is starting now
  if (meta.botFillTimer)   { clearTimeout(meta.botFillTimer);   meta.botFillTimer   = undefined; }
  if (meta.countdownTimer) { clearInterval(meta.countdownTimer); meta.countdownTimer = undefined; }

  void doStart(tableId).catch(console.error);
}

// ── ll:select ─────────────────────────────────────────────────────────────────

export function handleLLSelect(tableId: string, playerId: string, suit: LadyLuckSuit): { ok: boolean; error?: string } {
  const meta = tables.get(tableId);
  if (!meta) return { ok: false, error: 'table_not_found' };
  const { state } = meta;
  if (state.phase !== 'SELECT' && state.phase !== 'BET') return { ok: false, error: 'wrong_phase' };

  const playerIdx = state.players.findIndex(p => p.id === playerId);
  if (playerIdx === -1) return { ok: false, error: 'not_in_table' };

  // In SELECT phase, picks follow strict turn order; in BET phase anyone can pick freely
  if (state.phase === 'SELECT' && playerIdx !== state.currentPickIndex) return { ok: false, error: 'not_your_turn' };
  if (state.players[playerIdx].suit !== null) return { ok: false, error: 'already_selected' };
  if (state.claimedSuits.includes(suit)) return { ok: false, error: 'suit_taken' };

  state.players[playerIdx].suit = suit;
  state.claimedSuits.push(suit);

  if (state.phase === 'SELECT') {
    advancePickIndex(tableId, meta);
  }
  broadcastState(meta);
  return { ok: true };
}

function advancePickIndex(tableId: string, meta: LLTableMeta) {
  const { state } = meta;
  const count = state.players.length;

  // If all suits are claimed (including just now), transition immediately to WAGER
  const remaining = SUITS.filter(s => !state.claimedSuits.includes(s));
  if (remaining.length === 0) {
    state.currentPickIndex = -1;
    state.phase = 'WAGER';
    scheduleAllBotWagers(tableId);
    return;
  }

  const next = (state.currentPickIndex + 1) % count;

  if (next === state.dealerIndex) {
    const dealerIsBot = state.players[state.dealerIndex]?.presence === 'bot';
    if (remaining.length === 1 && dealerIsBot) {
      // Auto-assign last suit to bot dealer
      state.players[state.dealerIndex].suit = remaining[0];
      state.claimedSuits.push(remaining[0]);
      state.currentPickIndex = -1;
      state.phase = 'WAGER';
      scheduleAllBotWagers(tableId);
      return;
    }
    // Human dealer with suits remaining — must pick manually
    state.currentPickIndex = next;
  } else {
    state.currentPickIndex = next;
  }
  scheduleNextBotPick(tableId);
}

function scheduleNextBotPick(tableId: string) {
  const meta = tables.get(tableId);
  if (!meta) return;
  const { state } = meta;
  if (state.phase !== 'SELECT') return;
  if (state.currentPickIndex < 0) return;

  const player = state.players[state.currentPickIndex];
  if (!player || player.presence !== 'bot') return;

  setTimeout(() => {
    const m = tables.get(tableId);
    if (!m || m.state.phase !== 'SELECT') return;
    const available = SUITS.filter(s => !m.state.claimedSuits.includes(s));
    if (available.length === 0) return;
    const suit = available[Math.floor(Math.random() * available.length)];
    handleLLSelect(tableId, player.id, suit);
  }, 2000);
}

// ── ll:wager ──────────────────────────────────────────────────────────────────

export async function handleLLWager(
  tableId: string,
  playerId: string,
  amount: number,
): Promise<{ ok: boolean; error?: string }> {
  const meta = tables.get(tableId);
  if (!meta) return { ok: false, error: 'table_not_found' };
  const { state } = meta;
  if (state.phase !== 'WAGER' && state.phase !== 'BET') return { ok: false, error: 'wrong_phase' };
  const phase = state.phase;
  if (meta.settling) return { ok: false, error: 'wrong_phase' };

  const player = state.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'not_in_table' };
  if (player.wagered) return { ok: false, error: 'already_wagered' };
  // In BET phase player must have picked a suit before wagering
  if (state.phase === 'BET' && player.suit === null) return { ok: false, error: 'no_suit_selected' };

  const room = LADY_LUCK_ROOMS[state.roomType];
  const amountError = validateLadyLuckWagerAmount(amount, room.minWager, room.maxWager);
  if (amountError) return { ok: false, error: amountError };

  // Synchronous lock: set before any await so a second concurrent submission
  // sees it and is rejected immediately — no double-debit from rapid taps or two tabs.
  if (meta.wagerLock.has(playerId)) return { ok: false, error: 'already_processing' };
  meta.wagerLock.add(playerId);
  try {
    saveFinancialState(meta);
    const ok = await storage.debitLadyLuckWager(playerId, amount, tableId, state.raceId ?? tableId);
    if (!ok) return { ok: false, error: 'insufficient_chips' };
    if (tables.get(tableId) !== meta || state.phase !== phase || meta.settling || player.presence === 'open') {
      await storage.addChipsToPlayer(playerId, amount, { reason: 'refund', source: 'ladyluck_late_wager_refund', gameId: tableId, handId: state.raceId ?? tableId });
      return { ok: false, error: 'wrong_phase' };
    }

    player.wager   = amount;
    player.wagered = true;
    player.chips  -= amount;
    state.pot     += amount;
    saveFinancialState(meta);
  } finally {
    meta.wagerLock.delete(playerId);
  }

  broadcastState(meta);
  checkAllWagered(tableId);
  return { ok: true };
}

function scheduleAllBotWagers(tableId: string) {
  const meta = tables.get(tableId);
  if (!meta) return;
  const { state } = meta;
  const room = LADY_LUCK_ROOMS[state.roomType];

  for (const player of state.players) {
    if (player.presence === 'bot' && !player.wagered) {
      const p = player;
      setTimeout(async () => {
        const m = tables.get(tableId);
        if (!m || m.state.phase !== 'WAGER') return;
        const steps = Math.floor((room.maxWager - room.minWager) / 100);
        const amount = room.minWager + Math.floor(Math.random() * (steps + 1)) * 100;
        await handleLLWager(tableId, p.id, amount);
      }, 2000 + Math.random() * 1000);
    }
  }
}

function checkAllWagered(tableId: string) {
  const meta = tables.get(tableId);
  if (!meta) return;
  const { state } = meta;
  // Only active (non-open) players count — open seats don't wager
  const active = state.players.filter(p => p.presence !== 'open');
  if (active.length > 0 && active.every(p => p.wagered)) {
    startRace(tableId);
  }
}

/** Bot auto-pick for BET phase: each bot picks a suit then wagers, staggered naturally */
async function scheduleBotAutobet(tableId: string) {
  const meta = tables.get(tableId);
  if (!meta) return;
  const room = LADY_LUCK_ROOMS[meta.state.roomType];

  for (const player of meta.state.players) {
    if (player.presence !== 'bot') continue;
    const p = player;
    const delay = 2_000 + Math.random() * 2_000;
    setTimeout(async () => {
      const m = tables.get(tableId);
      if (!m || m.state.phase !== 'BET') return;
      // Pick suit if not yet chosen
      if (!p.suit) {
        const available = SUITS.filter(s => !m.state.claimedSuits.includes(s));
        if (available.length === 0) return;
        handleLLSelect(tableId, p.id, available[Math.floor(Math.random() * available.length)]);
      }
      // Wager 1 s later
      setTimeout(async () => {
        const m2 = tables.get(tableId);
        if (!m2 || m2.state.phase !== 'BET') return;
        const steps  = Math.floor((room.maxWager - room.minWager) / 100);
        const amount = room.minWager + Math.floor(Math.random() * (steps + 1)) * 100;
        await handleLLWager(tableId, p.id, amount);
      }, 1_000);
    }, delay);
  }
}

// ── ll:sidebet ────────────────────────────────────────────────────────────────

export async function handleLLSideBet(
  tableId: string,
  playerId: string,
  suit: LadyLuckSuit,
  amount: number,
): Promise<{ ok: boolean; error?: string }> {
  const meta = tables.get(tableId);
  if (!meta) return { ok: false, error: 'table_not_found' };
  const { state } = meta;
  if (state.phase !== 'WAGER' && state.phase !== 'BET') return { ok: false, error: 'wrong_phase' };
  const phase = state.phase;
  if (meta.settling) return { ok: false, error: 'wrong_phase' };

  const player = state.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'not_in_table' };

  const room = LADY_LUCK_ROOMS[state.roomType];
  if (!isValidLadyLuckSideBetAmount(amount, room.maxSideBet)) return { ok: false, error: 'invalid_amount' };

  // Synchronous lock: prevents double-submission from rapid taps or two tabs
  // charging the same player twice for one side bet.
  if (meta.wagerLock.has(playerId)) return { ok: false, error: 'already_processing' };
  meta.wagerLock.add(playerId);
  try {
    await storage.ensureLadyLuckHouse();
    saveFinancialState(meta);
    const ok = await storage.transferLadyLuckChips(playerId, LADY_LUCK_HOUSE_ID, amount, 'ladyluck_sidebet_stake', tableId, undefined, state.raceId ?? tableId);
    if (!ok) return { ok: false, error: 'insufficient_chips' };
    if (tables.get(tableId) !== meta || state.phase !== phase || meta.settling) {
      const refunded = await storage.transferLadyLuckChips(LADY_LUCK_HOUSE_ID, playerId, amount, 'ladyluck_late_sidebet_refund', tableId, undefined, state.raceId ?? tableId);
      if (!refunded) throw new Error('Lady Luck late side-bet refund failed');
      return { ok: false, error: 'wrong_phase' };
    }
    player.chips -= amount;

    state.sideBets.push({
      playerId:   player.id,
      playerName: player.name,
      suit,
      amount,
    });
    saveFinancialState(meta);
  } finally {
    meta.wagerLock.delete(playerId);
  }

  broadcastState(meta);
  return { ok: true };
}

// ── ll:spectate ───────────────────────────────────────────────────────────────

export function handleLLSpectate(
  tableId:  string,
  userId:   string,
  username: string,
  avatar:   string,
  ws:       WebSocket,
): void {
  const meta = tables.get(tableId);
  if (!meta) {
    try { ws.send(JSON.stringify({ type: 'll:error', message: 'table_not_found' })); } catch {}
    return;
  }
  meta.spectators.set(userId, { userId, username, avatar, ws });
  const existingBet = meta.spectatorBets.get(userId);
  if (existingBet && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type: 'll:spectator_bet_confirmed', ...existingBet })); } catch {}
  }
  // Bug fix: only push the current state to the NEW spectator — do NOT call
  // broadcastState() here because that would send ll:state to all existing players
  // during a RACE, resetting their client-side card-flip animation state and
  // freezing the race for everyone.
  meta.state.spectatorCount = meta.spectators.size;
  const payload = JSON.stringify({ type: 'll:state', state: meta.state });
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(payload); } catch {}
  }
  // Nudge existing players/spectators with the updated spectator count only
  const countMsg = JSON.stringify({ type: 'll:spectator_count', count: meta.spectators.size });
  for (const pWs of meta.connections.values()) {
    if (pWs.readyState === WebSocket.OPEN) {
      try { pWs.send(countMsg); } catch {}
    }
  }
  for (const sp of meta.spectators.values()) {
    if (sp.userId === userId) continue; // already sent full state above
    if (sp.ws.readyState === WebSocket.OPEN) {
      try { sp.ws.send(countMsg); } catch {}
    }
  }
}

// ── ll:spectator_sidebet ──────────────────────────────────────────────────────

export async function handleLLSpectatorSideBet(
  tableId: string,
  userId:  string,
  suit:    LadyLuckSuit,
  amount:  number,
  ws:      WebSocket,
): Promise<void> {
  const meta = tables.get(tableId);
  if (!meta) {
    try { ws.send(JSON.stringify({ type: 'll:error', message: 'table_not_found' })); } catch {}
    return;
  }
  const { state } = meta;
  if (state.phase !== 'BET' && state.phase !== 'WAGER') {
    try { ws.send(JSON.stringify({ type: 'll:error', message: 'wrong_phase' })); } catch {}
    return;
  }
  const phase = state.phase;
  if (meta.settling) {
    try { ws.send(JSON.stringify({ type: 'll:error', message: 'wrong_phase' })); } catch {}
    return;
  }
  const spectator = meta.spectators.get(userId);
  if (!spectator) {
    try { ws.send(JSON.stringify({ type: 'll:error', message: 'not_spectating' })); } catch {}
    return;
  }
  if (meta.spectatorBets.has(userId)) {
    try { ws.send(JSON.stringify({ type: 'll:error', message: 'bet_already_placed' })); } catch {}
    return;
  }
  const room = LADY_LUCK_ROOMS[state.roomType];
  if (!Number.isSafeInteger(amount) || amount < room.minWager || amount > room.maxSideBet) {
    try { ws.send(JSON.stringify({ type: 'll:error', message: 'invalid_amount' })); } catch {}
    return;
  }

  // Synchronous lock: prevents double-submission charging the spectator twice for
  // one side bet (rapid double-tap / network retry) before the flag is set.
  if (meta.wagerLock.has(userId)) {
    try { ws.send(JSON.stringify({ type: 'll:error', message: 'already_processing' })); } catch {}
    return;
  }
  meta.wagerLock.add(userId);
  try {
    await storage.ensureLadyLuckHouse();
    saveFinancialState(meta);
    const ok = await storage.transferLadyLuckChips(userId, LADY_LUCK_HOUSE_ID, amount, 'ladyluck_spectator_stake', tableId, undefined, state.raceId ?? tableId);
    if (!ok) {
      try { ws.send(JSON.stringify({ type: 'll:error', message: 'insufficient_chips' })); } catch {}
      return;
    }
    if (tables.get(tableId) !== meta || state.phase !== phase || meta.settling) {
      const refunded = await storage.transferLadyLuckChips(LADY_LUCK_HOUSE_ID, userId, amount, 'ladyluck_late_spectator_refund', tableId, undefined, state.raceId ?? tableId);
      if (!refunded) throw new Error('Lady Luck late spectator refund failed');
      try { ws.send(JSON.stringify({ type: 'll:error', message: 'wrong_phase' })); } catch {}
      return;
    }
    meta.spectatorBets.set(userId, { suit, amount });
    saveFinancialState(meta);
    broadcastState(meta);
    try { ws.send(JSON.stringify({ type: 'll:spectator_bet_confirmed', suit, amount })); } catch {}
  } finally {
    meta.wagerLock.delete(userId);
  }
}

// ── ll:spectator_leave ────────────────────────────────────────────────────────

export function handleLLSpectatorLeave(tableId: string, userId: string): void {
  const meta = tables.get(tableId);
  if (!meta) return;
  meta.spectators.delete(userId);
  broadcastState(meta); // update spectatorCount for all
}

// ── Race ──────────────────────────────────────────────────────────────────────

function startRace(tableId: string) {
  const meta = tables.get(tableId);
  if (!meta) return;
  const { state } = meta;
  if (state.phase === 'RACE' || state.phase === 'RESULTS' || meta.settling) return;
  if (meta.wagerLock.size > 0) {
    setTimeout(() => startRace(tableId), 100);
    return;
  }

  state.phase       = 'RACE';
  state.positions   = emptyPositions();
  state.flippedCards = [];
  state.currentCard  = null;
  meta.deck         = shuffle(buildDeck());

  broadcastState(meta);

  meta.raceInterval = setInterval(() => {
    const m = tables.get(tableId);
    if (!m) { clearInterval(meta.raceInterval); return; }
    const s = m.state;

    if (m.deck.length === 0) {
      clearInterval(m.raceInterval);
      const winner = (Object.entries(s.positions) as [LadyLuckSuit, number][])
        .sort((a, b) => b[1] - a[1])[0][0];
      void resolveRace(tableId, winner).catch(err => console.error('[LadyLuck] Race settlement failed:', err));
      return;
    }

    const card = m.deck.pop()!;
    s.currentCard = card;
    s.flippedCards.push(card);
    s.positions[card.suit] = (s.positions[card.suit] ?? 0) + 1;

    broadcast(m, { type: 'll:flip', card, positions: { ...s.positions } });

    if (s.positions[card.suit] >= 9) {
      clearInterval(m.raceInterval);
      void resolveRace(tableId, card.suit).catch(err => console.error('[LadyLuck] Race settlement failed:', err));
    }
  }, LADY_LUCK_FLIP_INTERVAL_MS);
}

export async function resolveRace(tableId: string, winningSuit: LadyLuckSuit) {
  const meta = tables.get(tableId);
  if (!meta) return;
  const { state } = meta;
  if (state.phase === 'RESULTS' || meta.settling) return;
  meta.settling = true;
  try {

  if (meta.raceInterval) { clearInterval(meta.raceInterval); meta.raceInterval = undefined; }

  // ── Payout ─────────────────────────────────────────────────────────────────
  const grossPot = state.pot;
  const winnerPlayer = state.players.find(p => p.suit === winningSuit);
  if (!winnerPlayer) throw new Error('Lady Luck winning suit has no player');
  const settled = await storage.settleLadyLuckRace({
    tableId, raceId: state.raceId ?? tableId, winnerId: winnerPlayer.id, winningSuit, grossPot,
    seatedBets: state.sideBets,
    seatedPlayers: state.players.filter(player => player.presence === 'human').map(player => player.id),
    spectatorBets: [...meta.spectatorBets].map(([userId, bet]) => ({ userId, ...bet })),
  });
  state.winner = winningSuit;
  state.phase  = 'RESULTS';
  winnerPlayer.chips += settled.winnerPot;
  for (const payout of settled.seatedPayouts) {
    const p = state.players.find(p => p.id === payout.playerId);
    if (p) p.chips += payout.net;
  }
  for (const [userId] of meta.spectatorBets) {
    const spectator = meta.spectators.get(userId);
    const payout = settled.spectatorPayouts.find(p => p.userId === userId);
    if (payout) {
      try { spectator?.ws.send(JSON.stringify({ type: 'll:spectator_payout', won: true, grossPayout: payout.gross, netPayout: payout.net })); } catch {}
    } else {
      try { spectator?.ws.send(JSON.stringify({ type: 'll:spectator_payout', won: false, suit: winningSuit })); } catch {}
    }
  }
  meta.spectatorBets.clear();
  saveFinancialState(meta);

  // ── Log race result for history/stats ──────────────────────────────────────
  try {
    const seatResults = state.players
      .filter(p => p.presence === 'human')
      .map(p => ({
        playerId:   p.id,
        playerName: p.name,
        pickedSuit: p.suit ?? 'none',
        wager:      p.wager,
        won:        p.suit === winningSuit,
        chipChange: p.suit === winningSuit ? settled.winnerPot - p.wager : -p.wager,
      }));
    await storage.logLadyLuckRace({
      tableId,
      roomType:     state.roomType,
      winningSuit,
      flippedCards: state.flippedCards,
      seatResults,
    });
  } catch (e) {
    console.error('[LadyLuck] Failed to log race result:', e);
  }

  // ── Update chip totals for all players so RESULTS UI shows ledger balances ─
  for (const p of state.players) {
    if (p.presence !== 'open') {
      try {
        const profile = await storage.getPlayerProfile(p.id);
        if (profile) p.chips = profile.chipBalance;
      } catch {}
    }
  }

  // ── RESULTS countdown 10 → 0 ───────────────────────────────────────────────
  state.resultsTimeLeft = 10;
  broadcastState(meta);

  let ticks = 10;
  meta.resultsInterval = setInterval(() => {
    const m = tables.get(tableId);
    if (!m || m.state.phase !== 'RESULTS') {
      clearInterval(m?.resultsInterval);
      if (m) m.resultsInterval = undefined;
      return;
    }
    ticks--;
    if (ticks <= 0) {
      clearInterval(m.resultsInterval);
      m.resultsInterval       = undefined;
      m.state.resultsTimeLeft = null;
      void startNextRound(tableId).catch(console.error);
    } else {
      m.state.resultsTimeLeft = ticks;
      broadcastState(m);
    }
  }, 1_000);
  } catch (err) {
    meta.settlementAttempts = (meta.settlementAttempts ?? 0) + 1;
    console.error(`[LadyLuck] Settlement attempt ${meta.settlementAttempts} failed:`, err);
    if (meta.settlementAttempts < 3) {
      setTimeout(() => {
        if (tables.get(tableId) === meta && state.phase === 'RACE') {
          void resolveRace(tableId, winningSuit).catch(console.error);
        }
      }, 3_000);
    } else {
      try {
        const stakes = await storage.getLadyLuckOpenStakes(tableId, state.raceId ?? tableId);
        for (const [id, amount] of stakes.wagers) {
          if (amount > 0 && !await storage.refundLadyLuckWager(id, amount, tableId, state.raceId ?? tableId))
            throw new Error('Race settled while refunding wagers');
        }
        for (const [id, amount] of stakes.seated) {
          if (amount > 0 && !await storage.refundLadyLuckSideBet(id, amount, tableId, state.raceId ?? tableId, false))
            throw new Error('Race settled while refunding seated bets');
        }
        for (const [id, amount] of stakes.spectators) {
          if (amount > 0 && !await storage.refundLadyLuckSideBet(id, amount, tableId, state.raceId ?? tableId, true))
            throw new Error('Race settled while refunding spectator bets');
        }
        for (const bot of state.players.filter(p => p.presence === 'bot')) {
          await storage.releaseLadyLuckBot(bot.id, tableId);
        }
        broadcast(meta, { type: 'll:error', message: 'Race settlement failed; wagers refunded' });
        clearAllTimers(meta);
        deleteLLPersistedTable(tableId);
        tables.delete(tableId);
      } catch (refundErr) {
        // Keep the persisted race for boot recovery if the database is unavailable.
        console.error('[LadyLuck] Failed to refund unsettled race:', refundErr);
      }
    }
    throw err;
  } finally {
    meta.settling = false;
  }
}

// ── Inter-round transition ────────────────────────────────────────────────────

export async function startNextRound(tableId: string) {
  const meta = tables.get(tableId);
  if (!meta) return;

  // Return bot stacks to the house before a seat is released or the table is
  // deleted. Rebuying a new bot next hand is a separate, logged transfer.
  for (const p of meta.state.players.filter(p => p.presence === 'bot')) {
    await storage.releaseLadyLuckBot(p.id, tableId);
    p.chips = 0;
  }

  // If no live connections remain the race finished while everyone was disconnected.
  // Payouts were already credited by resolveRace; clean up the table now rather than
  // starting a new round nobody can join or see.
  if (meta.connections.size === 0) {
    clearAllTimers(meta);
    tables.delete(tableId);
    return;
  }

  const { state } = meta;

  const nonActive = state.players.length;
  state.dealerIndex = (state.dealerIndex + 1) % Math.max(1, nonActive);

  // Mark busted/bot players as open seats; keep solvent humans
  for (const p of state.players) {
    if (p.presence === 'bot') {
      // Bots never auto-rejoin — free the seat for humans or fresh bots
      p.presence = 'open';
    } else if (p.presence === 'human' && p.chips <= 0) {
      p.presence = 'open';
    }
    // Reset round-specific state
    p.suit    = null;
    p.wager   = 0;
    p.wagered = false;
  }

  // If only 1 or 0 humans remain, fill open seats with bots so the round can run
  const humanCount = state.players.filter(p => p.presence === 'human').length;
  if (humanCount < 2) {
    for (let i = 0; i < state.players.length; i++) {
      if (state.players[i].presence === 'open') {
        const name  = pickBotName(state.players.map(p => p.name));
        const botId = `bot_${randomUUID()}`;
        // Future paid chip packs: revisit bot stakes/table economics so house
        // subsidies cannot become a free-chip farm that undercuts sales.
        const chips = await storage.fundLadyLuckBot(botId, tableId);
        if (tables.get(tableId) !== meta || state.players[i].presence !== 'open') {
          await storage.releaseLadyLuckBot(botId, tableId);
          continue;
        }
        state.players[i] = {
          id:        botId,
          name,
          chips,
          suit:      null,
          wager:     0,
          presence:  'bot',
          wagered:   false,
          seatIndex: state.players[i].seatIndex,
        };
      }
    }
  }

  // Reset shared round state
  state.positions        = emptyPositions();
  state.flippedCards     = [];
  state.currentCard      = null;
  state.winner           = null;
  state.pot              = 0;
  state.raceId           = randomUUID();
  state.sideBets         = [];
  state.claimedSuits     = [];
  state.startingIn       = null;
  state.resultsTimeLeft  = null;
  state.betTimeLeft      = 30;
  state.phase            = 'BET';

  saveFinancialState(meta);
  broadcastState(meta);
  scheduleBotAutobet(tableId);

  // 30-second BET countdown
  let betTicks = 30;
  meta.betInterval = setInterval(async () => {
    const m = tables.get(tableId);
    if (!m || m.state.phase !== 'BET') {
      clearInterval(m?.betInterval);
      if (m) m.betInterval = undefined;
      return;
    }
    betTicks--;
    if (betTicks <= 0) {
      clearInterval(m.betInterval);
      m.betInterval      = undefined;
      m.state.betTimeLeft = null;
      // Force-wager any active player who hasn't yet (auto min-bet)
      const room = LADY_LUCK_ROOMS[m.state.roomType];
      for (const p of m.state.players) {
        // A manual wager may already be awaiting its ledger debit. Wait for it
        // rather than debiting the same seat twice or starting with an unpaid seat.
        while (m.wagerLock.has(p.id)) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (tables.get(tableId) !== m || m.state.phase !== 'BET') return;
        if (p.presence === 'open' || p.wagered) continue;
        // Assign a suit if missing
        if (!p.suit) {
          const avail = SUITS.filter(s => !m.state.claimedSuits.includes(s));
          if (avail.length > 0) {
            p.suit = avail[Math.floor(Math.random() * avail.length)];
            m.state.claimedSuits.push(p.suit);
          } else continue;
        }
        const originalPresence = p.presence;
        m.wagerLock.add(p.id);
        let ok: boolean;
        try {
          saveFinancialState(m);
          ok = await storage.debitLadyLuckWager(p.id, room.minWager, tableId, m.state.raceId ?? tableId);
        } finally {
          m.wagerLock.delete(p.id);
        }
        if (!ok) { p.presence = 'open'; continue; }
          // Re-check presence after the async debit — handleLLDisconnect may have run
          // during the await and already set this player to 'open'. If so chips were
          // already taken from the DB but the player is gone; refund immediately.
        if (p.presence !== originalPresence || tables.get(tableId) !== m || m.state.phase !== 'BET') {
          console.warn(
            `[LL] betInterval auto-wager: playerId=${p.id} disconnected during debit ` +
            `— refunding ${room.minWager} chips (tableId=${tableId})`,
          );
          await storage.addChipsToPlayer(p.id, room.minWager, {
            reason:   'other',
            source:   'ladyluck_late_wager_refund',
            gameId:   tableId,
            handId:   m.state.raceId ?? tableId,
            metadata: { refundReason: 'disconnect_during_auto_wager', amount: room.minWager },
          });
          continue;
        }
        p.wager   = room.minWager;
        p.wagered = true;
        p.chips  -= room.minWager;
        m.state.pot += room.minWager;
        saveFinancialState(m);
      }
      broadcastState(m);
      const active = m.state.players.filter(q => q.presence !== 'open');
      if (active.length >= 2) startRace(tableId);
    } else {
      m.state.betTimeLeft = betTicks;
      broadcastState(m);
    }
  }, 1_000);
}

// ── Disconnect cleanup ────────────────────────────────────────────────────────

function clearAllTimers(meta: LLTableMeta) {
  if (meta.raceInterval)    { clearInterval(meta.raceInterval);    meta.raceInterval    = undefined; }
  if (meta.botFillTimer)    { clearTimeout(meta.botFillTimer);     meta.botFillTimer    = undefined; }
  if (meta.countdownTimer)  { clearInterval(meta.countdownTimer);  meta.countdownTimer  = undefined; }
  if (meta.resultsInterval) { clearInterval(meta.resultsInterval); meta.resultsInterval = undefined; }
  if (meta.betInterval)     { clearInterval(meta.betInterval);     meta.betInterval     = undefined; }
}

async function closeAbandonedLLTable(tableId: string, meta: LLTableMeta): Promise<void> {
  if (meta.state.phase === 'WAGER' || meta.state.phase === 'BET') {
    const raceId = meta.state.raceId ?? tableId;
    const stakes = await storage.getLadyLuckOpenStakes(tableId, raceId);
    for (const [playerId, amount] of stakes.wagers) {
      if (amount > 0) await storage.refundLadyLuckWager(playerId, amount, tableId, raceId);
    }
    for (const [playerId, amount] of stakes.seated) {
      if (amount > 0) await storage.refundLadyLuckSideBet(playerId, amount, tableId, raceId, false);
    }
    for (const [userId, amount] of stakes.spectators) {
      if (amount > 0) await storage.refundLadyLuckSideBet(userId, amount, tableId, raceId, true);
    }
    meta.spectatorBets.clear();
  }
  for (const bot of meta.state.players.filter(p => p.presence === 'bot')) {
    await storage.releaseLadyLuckBot(bot.id, tableId);
  }
  clearAllTimers(meta);
  deleteLLPersistedTable(tableId);
  tables.delete(tableId);
}

export function handleLLDisconnect(tableId: string, playerId: string) {
  const meta = tables.get(tableId);
  if (!meta) return;
  meta.connections.delete(playerId);

  // During RESULTS or BET, open the seat instead of just removing the connection
  if (meta.state.phase === 'RESULTS' || meta.state.phase === 'BET') {
    const idx = meta.state.players.findIndex(p => p.id === playerId);
    if (idx !== -1 && meta.state.players[idx].presence === 'human'
        && (meta.state.phase === 'RESULTS' || !meta.state.players[idx].wagered)) {
      meta.state.players[idx].presence = 'open';
      meta.state.players[idx].suit     = null;
      meta.state.players[idx].wager    = 0;
      meta.state.players[idx].wagered  = false;
      broadcastState(meta);
    }
  }

  if (meta.connections.size === 0) {
    // If a RACE is in progress with wagered participants (bots or this disconnected
    // human), keep raceInterval alive so it can resolve naturally and credit payouts.
    // Bot players have no WebSocket and are never in meta.connections, so a single
    // human disconnecting from a 1-human + N-bot table used to incorrectly kill the
    // race and strand the wager until the next server restart.
    const racingWithStakes =
      (meta.state.phase === 'RACE' || meta.state.phase === 'BET') &&
      meta.state.players.some(p => p.presence !== 'open' && p.wagered);

    if (racingWithStakes) {
      // Keep the race or BET timeout running until committed wagers resolve.
      if (meta.botFillTimer)    { clearTimeout(meta.botFillTimer);     meta.botFillTimer    = undefined; }
      if (meta.countdownTimer)  { clearInterval(meta.countdownTimer);  meta.countdownTimer  = undefined; }
      if (meta.resultsInterval) { clearInterval(meta.resultsInterval); meta.resultsInterval = undefined; }
      // raceInterval / betInterval keep running; after resolveRace → startNextRound detects no
      // connections and cleans up the table (see startNextRound guard below).
    } else {
      clearAllTimers(meta);
      setTimeout(() => {
        const m = tables.get(tableId);
        const inProgress = m && (m.state.phase === 'RACE' ||
          (m.state.phase === 'BET' && m.state.players.some(p => p.wagered)) ||
          m.settling || m.wagerLock.size > 0);
        if (m && m.connections.size === 0 && !inProgress) {
          void closeAbandonedLLTable(tableId, m).catch(console.error);
        }
      }, 30_000);
    }
  }
}

// ── Boot restore ──────────────────────────────────────────────────────────────
// Called on server startup. Reads .data/ladyluck_tables.json, issues Postgres
// refunds for any wagers that were in-flight at crash time, then recreates each
// surviving table as a fresh LOBBY so bot-fill and matchmaking can resume.

export async function initLadyLuckEngine(): Promise<void> {
  const entries = await loadPersistedLadyLuckTables();
  for (const { tableId, roomType, hostId } of entries) {
    if (!tables.has(tableId)) {
      createLLTable(tableId, roomType, hostId ?? 'system');
      console.log(`[LL-RECOVERY] recreated tableId=${tableId} roomType=${roomType} as fresh LOBBY`);
    }
  }
}
