import WebSocket from 'ws';
import { storage } from './storage';
import {
  LadyLuckState,
  LadyLuckPlayer,
  LadyLuckSuit,
  LadyLuckRoom,
  LADY_LUCK_ROOMS,
  SUITS,
} from '../shared/modes/ladyluck';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LLCard { rank: string; suit: LadyLuckSuit; }

interface LLTableMeta {
  state: LadyLuckState;
  connections: Map<string, WebSocket>;
  raceInterval?: ReturnType<typeof setInterval>;
  deck: LLCard[];
  hostId: string | null;
}

// ── In-memory tables ──────────────────────────────────────────────────────────

const tables = new Map<string, LLTableMeta>();

// ── Helpers ───────────────────────────────────────────────────────────────────

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'K'];

function buildDeck(): LLCard[] {
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
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function broadcast(meta: LLTableMeta, msg: object) {
  const payload = JSON.stringify(msg);
  for (const ws of meta.connections.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch {}
    }
  }
}

function broadcastState(meta: LLTableMeta) {
  broadcast(meta, { type: 'll:state', state: meta.state });
}

function emptyPositions(): Record<LadyLuckSuit, number> {
  return { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
}

// ── Public: create table from REST endpoint ───────────────────────────────────

export function createLLTable(tableId: string, roomType: LadyLuckRoom, hostId: string): void {
  if (tables.has(tableId)) return;
  const state: LadyLuckState = {
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
  };
  tables.set(tableId, {
    state,
    connections: new Map(),
    deck:        [],
    hostId,
  });
}

export function getLLActiveTables(): { tableId: string; roomType: LadyLuckRoom; playerCount: number }[] {
  const out: { tableId: string; roomType: LadyLuckRoom; playerCount: number }[] = [];
  for (const [tableId, meta] of tables.entries()) {
    if (meta.state.phase === 'LOBBY' || meta.state.phase === 'SELECT' || meta.state.phase === 'WAGER') {
      out.push({ tableId, roomType: meta.state.roomType, playerCount: meta.state.players.filter(p => p.presence !== 'open').length });
    }
  }
  return out;
}

// ── ll:join ───────────────────────────────────────────────────────────────────

export function handleLLJoin(
  tableId: string,
  playerId: string,
  playerName: string,
  chips: number,
  ws: WebSocket,
): void {
  const meta = tables.get(tableId);
  if (!meta) {
    try { ws.send(JSON.stringify({ type: 'll:error', message: 'table_not_found' })); } catch {}
    return;
  }
  const { state } = meta;

  meta.connections.set(playerId, ws);

  const existing = state.players.find(p => p.id === playerId);
  if (!existing) {
    if (state.phase !== 'LOBBY') {
      try { ws.send(JSON.stringify({ type: 'll:error', message: 'game_in_progress' })); } catch {}
      return;
    }
    if (state.players.length >= 4) {
      try { ws.send(JSON.stringify({ type: 'll:error', message: 'table_full' })); } catch {}
      return;
    }
    const player: LadyLuckPlayer = {
      id:         playerId,
      name:       playerName,
      chips,
      suit:       null,
      wager:      0,
      presence:   'human',
      wagered:    false,
      seatIndex:  state.players.length,
    };
    state.players.push(player);
  } else {
    existing.chips = chips;
  }

  if (!meta.hostId) meta.hostId = playerId;

  broadcastState(meta);
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

  const count = state.players.length;
  if (count < 4) {
    const botCount = 4 - count;
    const botNames = ['Lady L.', 'Lucky Lou', 'Wild Card'];
    for (let i = 0; i < botCount; i++) {
      state.players.push({
        id:        `bot_${tableId}_${i}`,
        name:      botNames[i] ?? `Bot ${i + 1}`,
        chips:     10000,
        suit:      null,
        wager:     0,
        presence:  'bot',
        wagered:   false,
        seatIndex: count + i,
      });
    }
  }

  state.dealerIndex      = 0;
  state.currentPickIndex = 1 % state.players.length;
  state.phase            = 'SELECT';
  state.claimedSuits     = [];

  broadcastState(meta);
  scheduleNextBotPick(tableId);
}

// ── ll:select ─────────────────────────────────────────────────────────────────

export function handleLLSelect(tableId: string, playerId: string, suit: LadyLuckSuit): { ok: boolean; error?: string } {
  const meta = tables.get(tableId);
  if (!meta) return { ok: false, error: 'table_not_found' };
  const { state } = meta;
  if (state.phase !== 'SELECT') return { ok: false, error: 'wrong_phase' };

  const playerIdx = state.players.findIndex(p => p.id === playerId);
  if (playerIdx === -1) return { ok: false, error: 'not_in_table' };
  if (playerIdx !== state.currentPickIndex) return { ok: false, error: 'not_your_turn' };
  if (state.claimedSuits.includes(suit)) return { ok: false, error: 'suit_taken' };

  state.players[playerIdx].suit = suit;
  state.claimedSuits.push(suit);

  advancePickIndex(tableId, meta);
  broadcastState(meta);
  return { ok: true };
}

function advancePickIndex(tableId: string, meta: LLTableMeta) {
  const { state } = meta;
  const count = state.players.length;
  const next  = (state.currentPickIndex + 1) % count;

  if (next === state.dealerIndex) {
    const remaining = SUITS.filter(s => !state.claimedSuits.includes(s));
    if (remaining.length === 1) {
      state.players[state.dealerIndex].suit = remaining[0];
      state.claimedSuits.push(remaining[0]);
      state.currentPickIndex = -1;
      state.phase = 'WAGER';
      scheduleAllBotWagers(tableId);
      return;
    }
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
  if (state.phase !== 'WAGER') return { ok: false, error: 'wrong_phase' };

  const player = state.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'not_in_table' };
  if (player.wagered) return { ok: false, error: 'already_wagered' };

  const room = LADY_LUCK_ROOMS[state.roomType];
  if (amount % 100 !== 0) return { ok: false, error: 'must_be_100_increment' };
  if (amount < room.minWager) return { ok: false, error: 'below_min' };
  if (amount > room.maxWager) return { ok: false, error: 'above_max' };

  if (player.presence === 'human') {
    const ok = await storage.debitChipsForBuyin(playerId, amount);
    if (!ok) return { ok: false, error: 'insufficient_chips' };
  }

  player.wager   = amount;
  player.wagered = true;
  state.pot     += amount;

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
  if (state.players.every(p => p.wagered)) {
    startRace(tableId);
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
  if (state.phase !== 'WAGER') return { ok: false, error: 'wrong_phase' };

  const player = state.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'not_in_table' };

  const room = LADY_LUCK_ROOMS[state.roomType];
  if (amount <= 0 || amount > room.maxSideBet) return { ok: false, error: 'invalid_amount' };

  if (player.presence === 'human') {
    const ok = await storage.debitChipsForBuyin(playerId, amount);
    if (!ok) return { ok: false, error: 'insufficient_chips' };
  }

  state.sideBets.push({
    playerId:   player.id,
    playerName: player.name,
    suit,
    amount,
  });

  broadcastState(meta);
  return { ok: true };
}

// ── Race ──────────────────────────────────────────────────────────────────────

function startRace(tableId: string) {
  const meta = tables.get(tableId);
  if (!meta) return;
  const { state } = meta;

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
      resolveRace(tableId, winner);
      return;
    }

    const card = m.deck.pop()!;
    s.currentCard = card;
    s.flippedCards.push(card);
    s.positions[card.suit] = (s.positions[card.suit] ?? 0) + 1;

    broadcast(m, { type: 'll:flip', card, positions: { ...s.positions } });

    if (s.positions[card.suit] >= 9) {
      clearInterval(m.raceInterval);
      resolveRace(tableId, card.suit);
    }
  }, 1500);
}

async function resolveRace(tableId: string, winningSuit: LadyLuckSuit) {
  const meta = tables.get(tableId);
  if (!meta) return;
  const { state } = meta;

  state.winner = winningSuit;
  state.phase  = 'RESULT';

  const winner = state.players.find(p => p.suit === winningSuit);
  if (winner && winner.presence === 'human') {
    try {
      await storage.addChipsToPlayer(winner.id, state.pot, { reason: 'other', source: 'ladyluck_win' });
    } catch (e) {
      console.error('[LadyLuck] Failed to credit winner chips:', e);
    }
  }

  for (const bet of state.sideBets) {
    if (bet.suit === winningSuit && bet.playerId) {
      const betPlayer = state.players.find(p => p.id === bet.playerId);
      if (betPlayer && betPlayer.presence === 'human') {
        const payout = Math.floor(bet.amount * 2.5);
        try {
          await storage.addChipsToPlayer(bet.playerId, payout, { reason: 'other', source: 'ladyluck_sidebet' });
        } catch (e) {
          console.error('[LadyLuck] Failed to credit side bet:', e);
        }
      }
    }
  }

  broadcast(meta, {
    type:   'll:result',
    state:  { ...state },
    winner: winningSuit,
    pot:    state.pot,
  });

  setTimeout(() => {
    const m = tables.get(tableId);
    if (!m) return;
    const s = m.state;

    s.dealerIndex      = (s.dealerIndex + 1) % s.players.length;
    s.currentPickIndex = (s.dealerIndex + 1) % s.players.length;
    s.phase            = 'LOBBY';
    s.positions        = emptyPositions();
    s.flippedCards     = [];
    s.currentCard      = null;
    s.winner           = null;
    s.pot              = 0;
    s.sideBets         = [];
    s.claimedSuits     = [];
    for (const p of s.players) {
      p.suit    = null;
      p.wager   = 0;
      p.wagered = false;
    }

    broadcastState(m);
  }, 8000);
}

// ── Disconnect cleanup ────────────────────────────────────────────────────────

export function handleLLDisconnect(tableId: string, playerId: string) {
  const meta = tables.get(tableId);
  if (!meta) return;
  meta.connections.delete(playerId);

  if (meta.connections.size === 0) {
    if (meta.raceInterval) clearInterval(meta.raceInterval);
    setTimeout(() => {
      const m = tables.get(tableId);
      if (m && m.connections.size === 0) tables.delete(tableId);
    }, 30000);
  }
}
