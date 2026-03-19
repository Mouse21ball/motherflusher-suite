// ─── Authoritative Badugi table persistence ───────────────────────────────────
// Writes table state to .data/badugi_tables.json after each hand mutation
// (debounced 2 s per table). On server restart, tables are restored with
// chips intact; any in-progress hand resets to WAITING so the player can
// press Start cleanly. This is the correct alpha recovery strategy.
//
// Only game state is persisted — connections and bot timers are runtime-only.

import fs from 'fs';
import path from 'path';
import type { GameState } from '../shared/gameTypes';
import { engineLog } from './engineLog';

const DATA_DIR  = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'badugi_tables.json');
const SAVE_DEBOUNCE_MS = 2000;
const TABLE_EXPIRY_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days

interface PersistedEntry {
  state: GameState;
  handId: number;
  savedAt: number;
}
type StoreFile = Record<string, PersistedEntry>;

interface PendingWrite {
  timer: ReturnType<typeof setTimeout>;
  state: GameState;
  handId: number;
}

const pending = new Map<string, PendingWrite>();

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStore(): StoreFile {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as StoreFile;
  } catch {
    return {};
  }
}

function writeStore(store: StoreFile): void {
  try {
    ensureDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('[badugi:PERSIST] write failed:', err);
  }
}

// ─── Load all tables on startup ───────────────────────────────────────────────

export interface RestoredTable {
  tableId: string;
  state: GameState;
  handId: number;
}

export function loadPersistedTables(): RestoredTable[] {
  const store = readStore();
  const cutoff = Date.now() - TABLE_EXPIRY_MS;
  const results: RestoredTable[] = [];

  for (const [tableId, entry] of Object.entries(store)) {
    if (entry.savedAt < cutoff) continue; // prune stale tables

    const { state, handId } = sanitizeForRestore(tableId, entry.state, entry.handId);
    results.push({ tableId, state, handId });
  }

  return results;
}

// ─── Sanitize state for safe restart ─────────────────────────────────────────
// Chip counts are always preserved. Mid-hand state resets to WAITING.
// SHOWDOWN results are also reset (auto-reset timer died with the process).

function sanitizeForRestore(tableId: string, state: GameState, handId: number): RestoredTable {
  const isSafe = state.phase === 'WAITING';

  if (isSafe) {
    engineLog('PERSIST', tableId, { op: 'restore', phase: state.phase, safe: true });
    return { tableId, state, handId };
  }

  // Mid-hand or SHOWDOWN: reset to WAITING, preserve chips, clear hand data.
  const restoredPlayers = state.players.map(p => ({
    ...p,
    cards: [],
    bet: 0,
    totalBet: 0,
    hasActed: false,
    declaration: null as null,
    isWinner: undefined as undefined,
    isLoser:  undefined as undefined,
    score:    undefined as undefined,
    status: (p.chips > 0 ? 'active' : 'sitting_out') as 'active' | 'sitting_out',
  }));

  const chips = restoredPlayers.map(p => `${p.id}=$${p.chips}`).join(' ');
  engineLog('PERSIST', tableId, { op: 'restore', phase: state.phase, reset: 'WAITING', chips });

  return {
    tableId,
    state: {
      ...state,
      phase: 'WAITING',
      pot: 0,
      currentBet: 0,
      deck: [],
      discardPile: [],
      players: restoredPlayers,
      messages: [{
        id: Math.random().toString(36).slice(2, 10),
        text: 'Restored after server restart — chips preserved. Press start.',
        time: Date.now(),
      }],
      chatMessages: state.chatMessages ?? [],
    },
    handId: handId + 1, // invalidate any pre-crash generation fences
  };
}

// ─── Debounced save ───────────────────────────────────────────────────────────

export function scheduleSave(tableId: string, state: GameState, handId: number): void {
  const existing = pending.get(tableId);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pending.delete(tableId);
    flush(tableId, state, handId);
  }, SAVE_DEBOUNCE_MS);

  pending.set(tableId, { timer, state, handId });
}

// Immediately flush all pending debounced writes — call before process exit.
export function flushAllPending(): void {
  for (const [tableId, p] of Array.from(pending.entries())) {
    clearTimeout(p.timer);
    pending.delete(tableId);
    flush(tableId, p.state, p.handId);
  }
}

function flush(tableId: string, state: GameState, handId: number): void {
  try {
    const store = readStore();
    store[tableId] = { state, handId, savedAt: Date.now() };
    writeStore(store);
    engineLog('PERSIST', tableId, { op: 'save', phase: state.phase, handId });
  } catch (err) {
    engineLog('ERROR', tableId, { msg: 'persist-flush-failed' });
    console.error('[badugi:PERSIST] flush error:', err);
  }
}

// ─── Delete on table destroy ──────────────────────────────────────────────────

export function deletePersistedTable(tableId: string): void {
  const p = pending.get(tableId);
  if (p) { clearTimeout(p.timer); pending.delete(tableId); }

  try {
    const store = readStore();
    if (!store[tableId]) return;
    delete store[tableId];
    writeStore(store);
    engineLog('PERSIST', tableId, { op: 'delete' });
  } catch { /* non-critical */ }
}
