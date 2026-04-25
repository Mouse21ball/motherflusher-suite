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

  // Mid-hand or SHOWDOWN: reset to WAITING, return bets, preserve net chips.
  //
  // Bet-return rule: if pot > 0 there is money in play that was never distributed.
  //   chips_safe = p.chips + p.totalBet  (restores the player to their pre-hand balance)
  //   sum(totalBet for all players) == pot, so returning all totalBets zeroes the pot.
  // If pot == 0 the hand resolved before the crash (e.g. SHOWDOWN already ran and
  //   distributed winnings, then resetToAnte timed out). Chips are already correct.
  const returnBets = state.pot > 0;
  const restoredPlayers = state.players.map(p => ({
    ...p,
    chips: returnBets ? p.chips + (p.totalBet ?? 0) : p.chips,
    cards: [],
    bet: 0,
    totalBet: 0,
    hasActed: false,
    declaration: null as null,
    isWinner: undefined as undefined,
    isLoser:  undefined as undefined,
    score:    undefined as undefined,
    status: ((returnBets ? p.chips + (p.totalBet ?? 0) : p.chips) > 0 ? 'active' : 'sitting_out') as 'active' | 'sitting_out',
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
        text: returnBets
          ? 'Restored after server restart — bets returned, chips preserved. Press start.'
          : 'Restored after server restart — chips preserved. Press start.',
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

// ─── Generic mode persistence (Dead7, Fifteen35, SuitsPoker) ──────────────────
// Uses a separate file so Badugi and generic tables are isolated.
// Keys in the file are `${modeId}:${tableId}` composite strings.

const GENERIC_DATA_FILE = path.join(DATA_DIR, 'generic_tables.json');
const genericPending = new Map<string, PendingWrite>();

function readGenericStore(): StoreFile {
  try {
    if (!fs.existsSync(GENERIC_DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(GENERIC_DATA_FILE, 'utf-8')) as StoreFile;
  } catch {
    return {};
  }
}

function writeGenericStore(store: StoreFile): void {
  try {
    ensureDir();
    fs.writeFileSync(GENERIC_DATA_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('[generic:PERSIST] write failed:', err);
  }
}

export interface RestoredGenericTable {
  modeId: string;
  tableId: string;
  state: GameState;
  handId: number;
}

export function loadPersistedGenericTables(): RestoredGenericTable[] {
  const store = readGenericStore();
  const cutoff = Date.now() - TABLE_EXPIRY_MS;
  const results: RestoredGenericTable[] = [];

  for (const [key, entry] of Object.entries(store)) {
    if (entry.savedAt < cutoff) continue;
    const colonIdx = key.indexOf(':');
    if (colonIdx === -1) continue; // skip malformed keys
    const modeId  = key.slice(0, colonIdx);
    const tableId = key.slice(colonIdx + 1);
    const { state, handId } = sanitizeForRestore(key, entry.state, entry.handId);
    results.push({ modeId, tableId, state, handId });
  }

  return results;
}

export function scheduleGenericSave(persistKey: string, state: GameState, handId: number): void {
  const existing = genericPending.get(persistKey);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    genericPending.delete(persistKey);
    flushGeneric(persistKey, state, handId);
  }, SAVE_DEBOUNCE_MS);

  genericPending.set(persistKey, { timer, state, handId });
}

export function flushAllGenericPending(): void {
  for (const [key, p] of Array.from(genericPending.entries())) {
    clearTimeout(p.timer);
    genericPending.delete(key);
    flushGeneric(key, p.state, p.handId);
  }
}

function flushGeneric(persistKey: string, state: GameState, handId: number): void {
  try {
    const store = readGenericStore();
    store[persistKey] = { state, handId, savedAt: Date.now() };
    writeGenericStore(store);
    engineLog('PERSIST', persistKey, { op: 'save', phase: state.phase, handId });
  } catch {
    engineLog('ERROR', persistKey, { msg: 'generic-persist-flush-failed' });
  }
}

export function deletePersistedGenericTable(persistKey: string): void {
  const p = genericPending.get(persistKey);
  if (p) { clearTimeout(p.timer); genericPending.delete(persistKey); }

  try {
    const store = readGenericStore();
    if (!store[persistKey]) return;
    delete store[persistKey];
    writeGenericStore(store);
    engineLog('PERSIST', persistKey, { op: 'delete' });
  } catch { /* non-critical */ }
}
