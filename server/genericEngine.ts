// ─── Generic Server-Authoritative Game Engine ─────────────────────────────────
// Handles Dead7, Fifteen35, SwingPoker, SuitsPoker in server-authoritative mode.
// Same seat/session model as the Badugi engine, parameterized by GameMode.

import type { WebSocket } from 'ws';
import type { GameState, Player, CardType, GamePhase, PlayerStatus, Declaration, ChatMessage, ReactionEvent, GameMode } from '../shared/gameTypes';
import { Dead7Mode, evaluateDead7 } from '../shared/modes/dead7';
import { Fifteen35Mode } from '../shared/modes/fifteen35';
import { SwingPokerMode } from '../shared/modes/swing';
import { SuitsPokerMode } from '../shared/modes/suitspoker';
import { engineLog } from './engineLog';
import { storage } from './storage';

// ─── Mode registry ────────────────────────────────────────────────────────────

const MODE_REGISTRY: Record<string, GameMode> = {
  dead7: Dead7Mode,
  fifteen35: Fifteen35Mode,
  swing_poker: SwingPokerMode,
  suits_poker: SuitsPokerMode,
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
  // Unix timestamp after which reserved seats convert to bots. 0 = window closed.
  joinWindowEndsAt: number;
  // Private tables are excluded from the live table listing and never auto-fill bots.
  isPrivate: boolean;
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
      ws.send(JSON.stringify({ type: 'mode:snapshot', state: maskStateForPlayer(stateWithMeta, playerId, pub) }));
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
  const delay = 1200 + Math.random() * 1600;

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
    }, 4000);
  }, 650);
}

// ─── Reset after showdown ─────────────────────────────────────────────────────

function resetToAnte(table: GenericTable): void {
  const s = table.state;
  const hadWinner  = s.players.some(p => p.isWinner);
  const isRollover = s.pot > 0 && !hadWinner;
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

  // ── Sync human chip balances to player profiles ────────────────────────────
  for (const p of nextPlayers) {
    if (p.presence !== 'human') continue;
    const identityId = table.seatToIdentityId.get(p.id);
    if (!identityId) continue;
    storage.syncPlayerChips(identityId, p.chips, { won: !!p.isWinner }).catch(() => {});
  }

  for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
  table.botTimers.clear();
  table.handId += 1;
  table.publicCardIndicesPerPlayer = {};

  table.state = {
    ...s,
    phase: 'ANTE',
    currentBet: 0,
    heroChipChange: undefined,
    activePlayerId: nextPlayers[firstActIdx].id,
    players: nextPlayers,
    deck: [],
    discardPile: [],
    communityCards: [],
    messages: [{
      id: makeId(),
      text: isRollover ? `Rollover — $${s.pot} carries over.` : 'New hand.',
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

  const thinkMs = (capturedPhase.startsWith('BET') ? 650 : 280) + Math.random() * 350;

  const timer = setTimeout(() => {
    table.botTimers.delete(botId);
    if (table.handId !== capturedHandId || table.state.phase !== capturedPhase) return;
    executeBotAction(table, botId);
  }, thinkMs);

  table.botTimers.set(botId, timer);
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
      spectators: new Map(),
      publicCardIndicesPerPlayer: {},
      joinWindowEndsAt,
      isPrivate,
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

  const seat = assignSeat(table, sessionId);
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

  const isReconnect = table.sessionToSeat.has(sessionId);
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
    }));
  } catch {}

  return seat;
}

export function removeGenericConnection(tableId: string, sessionId: string): void {
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

    // ── Sync chips on disconnect / leave ──────────────────────────────────────
    const identityId = table.seatToIdentityId.get(seat);
    if (identityId) {
      const player = table.state.players.find(p => p.id === seat);
      if (player) {
        storage.syncPlayerChips(identityId, player.chips).catch(() => {});
        storage.clearPlayerActiveTable(identityId).catch(() => {});
      }
    }

    engineLog('PLAYER_LEAVE', `${modeId}:${tableId}`, {
      player: seat,
      session: sessionId.slice(-8),
      remaining: table.connections.size,
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

  if (!table) return;
  if (table.actionLock) return;

  table.actionLock = true;

  try {
    const s = table.state;
    // Resolve seat: if playerOrSessionId is a UUID, map via sessionToSeat;
    // if it's already a seatId (p1-p5), fall back to it directly.
    const playerId = table.sessionToSeat.get(playerOrSessionId) || playerOrSessionId;

    // ── start: WAITING → ANTE ────────────────────────────────────────────────
    if (action === 'start' && s.phase === 'WAITING') {
      // Close join window — fill any still-open seats with bots before the hand starts.
      convertReservedToBots(table);
      const freshPlayers = table.state.players;
      table.handId += 1;
      const dealerIdx   = getDealerIndex(freshPlayers);
      const firstActIdx = getNextActivePlayerIndex(freshPlayers, dealerIdx);
      table.state = addMsg({ ...table.state, phase: 'ANTE', activePlayerId: freshPlayers[firstActIdx].id }, 'Ante up!');
      table.actionLock = false;
      broadcastState(table);
      scheduleNextBot(table);
      return;
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
      const dec = typeof payload === 'string' ? payload : null;
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
      const raiseTotal = Math.min(amount, player.chips + player.bet);
      const chipCost = raiseTotal - player.bet;
      newPlayers[playerIdx] = { ...player, chips: player.chips - chipCost, bet: raiseTotal, hasActed: true };
      newPot += chipCost;
      newCurrentBet = raiseTotal;
      wasRaise = true;
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
        newPlayers[playerIdx] = { ...player, cards: newCards, hasActed: true };
        // Hit cards in 15/35 are face-up for all — add to public indices
        const prevPub = table.publicCardIndicesPerPlayer[playerId] ?? [];
        table.publicCardIndicesPerPlayer = {
          ...table.publicCardIndicesPerPlayer,
          [playerId]: [...prevPub, newCardIndex],
        };
        table.state = addMsg({ ...s, players: newPlayers, deck: newDeck }, `${player.name} hits`);
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
