// ─── Server-authoritative Badugi engine ──────────────────────────────────────
// Owns the canonical game state for every authoritative Badugi table.
// Clients send action intent; this engine validates, mutates, and broadcasts
// full state snapshots masked per recipient.
//
// Feature-flagged: tables only become authoritative when
// FEATURES.SERVER_AUTHORITATIVE_BADUGI is true in shared/featureFlags.ts.

import type { WebSocket } from 'ws';
import type { GameState, Player, CardType, GamePhase, PlayerStatus, Declaration } from '../shared/gameTypes';
import { BadugiMode } from '../shared/modes/badugi';

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

// ─── Initial table roster ─────────────────────────────────────────────────────

function makeInitialPlayers(heroChips: number): Player[] {
  return [
    { id: 'p1', name: 'You',     presence: 'human', chips: heroChips, bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
    { id: 'p2', name: 'Alice',   presence: 'bot',   chips: 1000,      bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
    { id: 'p3', name: 'Bob',     presence: 'bot',   chips: 1000,      bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
    { id: 'p4', name: 'Charlie', presence: 'bot',   chips: 1000,      bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: true,  declaration: null, hasActed: false },
  ];
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

// ─── Table record ─────────────────────────────────────────────────────────────

interface AuthTable {
  tableId: string;
  state: GameState;
  // Increments on each new hand. Bot timers capture this value at creation;
  // if it has changed when the timer fires, the action is silently dropped.
  handId: number;
  // Prevents re-entrant mutations. Since all mutations are synchronous in Node,
  // this mainly guards against a bot timer firing during another action's
  // post-processing setTimeout callbacks. Drop the incoming action; the bot
  // turn will be re-scheduled if still needed after the current action resolves.
  actionLock: boolean;
  botTimers: Map<string, ReturnType<typeof setTimeout>>;
  connections: Map<string, WebSocket>;
}

const tables = new Map<string, AuthTable>();

// ─── Broadcast ────────────────────────────────────────────────────────────────

function broadcastState(table: AuthTable): void {
  for (const [playerId, ws] of Array.from(table.connections.entries())) {
    if (ws.readyState !== 1 /* OPEN */) continue;
    try {
      ws.send(JSON.stringify({ type: 'badugi:snapshot', state: maskStateForPlayer(table.state, playerId) }));
    } catch { /* ignore closed socket race */ }
  }
}

// ─── Round-over check ────────────────────────────────────────────────────────

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

  table.state = addMsg({
    ...state,
    phase: nextPhase,
    currentBet: isBetRound ? 0 : state.currentBet,
    activePlayerId: nextPlayers[firstActIdx].id,
    players: nextPlayers,
  }, nextPhase.replace(/_/g, ' '));

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
    // '__server__' as myId: resolveShowdown will reveal all opponents' cards
    // (since no player matches '__server__', all cards get isHidden:false).
    // Canonical state already has all cards visible, so this is a no-op.
    const result = BadugiMode.resolveShowdown(s.players, s.pot, '__server__');

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

    // Auto-advance to next hand after 5 seconds (matches client engine timing)
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

  scheduleNextBot(table);
}

// ─── Bot scheduling ───────────────────────────────────────────────────────────
// After any state change that might put a bot in the active seat, call this.
// The generation guard (handId + phase) ensures stale timers are no-ops.

function scheduleNextBot(table: AuthTable): void {
  const { state, handId } = table;
  if (!state.activePlayerId) return;

  const active = state.players.find(p => p.id === state.activePlayerId);
  if (!active || active.presence !== 'bot' || active.status !== 'active') return;

  const botId           = active.id;
  const capturedHandId  = handId;
  const capturedPhase   = state.phase;

  const existing = table.botTimers.get(botId);
  if (existing) clearTimeout(existing);

  const thinkMs = (capturedPhase.startsWith('BET') ? 1200 : 700) + Math.random() * 600;

  const timer = setTimeout(() => {
    table.botTimers.delete(botId);
    // Stale guard: drop if hand or phase has moved on
    if (table.handId !== capturedHandId || table.state.phase !== capturedPhase) return;
    executeBotAction(table, botId);
  }, thinkMs);

  table.botTimers.set(botId, timer);
}

// ─── Bot action execution ─────────────────────────────────────────────────────

function executeBotAction(table: AuthTable, botId: string): void {
  if (table.actionLock) {
    // Another action is in its post-processing window; re-schedule to retry once
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

    // Maintain totalBet accumulator that the client engine tracks
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

    // After a raise, opponents that already acted must re-act
    if (wasRaise) {
      newState.players = newState.players.map(p =>
        p.id !== botId && p.status === 'active' ? { ...p, hasActed: false } : p
      );
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
      }, wasRaise ? 750 : 500);
    } else if (nextPlayerId) {
      table.state = { ...table.state, activePlayerId: nextPlayerId };
      broadcastState(table);
      scheduleNextBot(table);
    }
  } catch (err) {
    console.error('[gameEngine] bot action error:', err);
    table.actionLock = false;
  }
}

// ─── After-human-action plumbing ─────────────────────────────────────────────
// Called after every human action to advance the phase or hand turn to next player.

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

export function getOrCreateBadugiTable(tableId: string): AuthTable {
  if (!tables.has(tableId)) {
    tables.set(tableId, {
      tableId,
      state: makeInitialState(tableId),
      handId: 0,
      actionLock: false,
      botTimers: new Map(),
      connections: new Map(),
    });
  }
  return tables.get(tableId)!;
}

export function addBadugiConnection(tableId: string, playerId: string, ws: WebSocket): void {
  const table = getOrCreateBadugiTable(tableId);
  table.connections.set(playerId, ws);
  // Immediately deliver current state so reconnecting players are in sync
  try {
    ws.send(JSON.stringify({ type: 'badugi:snapshot', state: maskStateForPlayer(table.state, playerId) }));
  } catch { /* ws may have already closed */ }
}

export function removeBadugiConnection(tableId: string, playerId: string): void {
  const table = tables.get(tableId);
  if (!table) return;
  table.connections.delete(playerId);
}

export function handleBadugiAction(tableId: string, playerId: string, action: string, payload: unknown): void {
  const table = tables.get(tableId);
  if (!table) return;

  if (table.actionLock) return; // concurrent action; drop it safely

  table.actionLock = true;

  try {
    const s = table.state;

    // ── start: WAITING → ANTE ──────────────────────────────────────────────
    if (action === 'start' && s.phase === 'WAITING') {
      table.handId += 1;
      const dealerIdx   = getDealerIndex(s.players);
      const firstActIdx = getNextActivePlayerIndex(s.players, dealerIdx);
      table.state = addMsg({
        ...s,
        phase: 'ANTE',
        activePlayerId: s.players[firstActIdx].id,
      }, 'Ante up!');
      table.actionLock = false;
      broadcastState(table);
      scheduleNextBot(table);
      return;
    }

    // ── restart: SHOWDOWN → ANTE (manual, overrides the 5s auto-reset) ────
    if (action === 'restart' && s.phase === 'SHOWDOWN') {
      for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
      table.botTimers.clear();
      table.actionLock = false;
      resetToAnte(table);
      broadcastState(table);
      return;
    }

    // All remaining actions require it to be this player's turn
    if (s.activePlayerId !== playerId) {
      table.actionLock = false;
      return;
    }

    // ── ante ───────────────────────────────────────────────────────────────
    if (action === 'ante' && s.phase === 'ANTE') {
      const me = s.players.find(p => p.id === playerId)!;
      table.state = addMsg({
        ...s,
        pot: s.pot + 1,
        players: s.players.map(p =>
          p.id === playerId
            ? { ...p, chips: p.chips - 1, hasActed: true, totalBet: (p.totalBet || 0) + 1 }
            : p
        ),
      }, 'You paid $1 Ante');
      void me; // used only for pre-read safety; state updated above
      table.actionLock = false;
      afterHumanAction(table);
      return;
    }

    // ── fold ───────────────────────────────────────────────────────────────
    if (action === 'fold' && s.phase.startsWith('BET')) {
      table.state = addMsg({
        ...s,
        players: s.players.map(p => p.id === playerId ? { ...p, status: 'folded', hasActed: true } : p),
      }, 'You folded');
      table.actionLock = false;
      afterHumanAction(table);
      return;
    }

    // ── check / call ───────────────────────────────────────────────────────
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
      table.actionLock = false;
      afterHumanAction(table);
      return;
    }

    // ── raise ──────────────────────────────────────────────────────────────
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
      table.state = newState;
      table.actionLock = false;
      afterHumanAction(table, true);
      return;
    }

    // ── draw ───────────────────────────────────────────────────────────────
    if (action === 'draw' && s.phase.startsWith('DRAW')) {
      const indices: number[] = Array.isArray(payload) ? (payload as number[]) : [];
      let newDeck     = [...s.deck];
      const newDiscard = [...(s.discardPile || [])];

      const newPlayers = s.players.map(p => {
        if (p.id !== playerId) return p;
        if (indices.length === 0) return { ...p, hasActed: true };
        const newCards = [...p.cards];
        indices.forEach(idx => {
          newDiscard.push(newCards[idx]);
          // Reshuffle discard into deck if deck is exhausted
          if (newDeck.length === 0 && newDiscard.length > 0) {
            const reshuffled = [...newDiscard];
            newDiscard.length = 0;
            for (let i = reshuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
            }
            newDeck = reshuffled;
          }
          // New card is visible in canonical server state
          newCards[idx] = { ...newDeck.shift()!, isHidden: false };
        });
        return { ...p, cards: newCards, hasActed: true };
      });

      const msg = indices.length === 0 ? 'You stood pat' : `You discarded ${indices.length} card${indices.length > 1 ? 's' : ''}`;
      table.state = addMsg({ ...s, players: newPlayers, deck: newDeck, discardPile: newDiscard }, msg);
      table.actionLock = false;
      afterHumanAction(table);
      return;
    }

    // ── declare ────────────────────────────────────────────────────────────
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
      table.actionLock = false;
      afterHumanAction(table);
      return;
    }

    table.actionLock = false;
  } catch (err) {
    console.error('[gameEngine] action error:', err);
    table.actionLock = false;
  }
}

export function destroyBadugiTable(tableId: string): void {
  const table = tables.get(tableId);
  if (!table) return;
  for (const t of Array.from(table.botTimers.values())) clearTimeout(t);
  tables.delete(tableId);
}
