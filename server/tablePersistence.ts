// ─── Authoritative Badugi + Generic table persistence ────────────────────────
// After every player action (bet, call, raise, fold, check, draw, declare)
// state is written to Postgres immediately — fire-and-forget, non-blocking —
// so a crash loses at most ONE action, not the whole hand.
//
// JSON files (.data/*.json) are kept as a 2-second-debounced local backup.
// On startup, both sources are compared per-table; whichever has the newer
// savedAt timestamp wins.
//
// Only game state is persisted — connections and bot timers are runtime-only.

import fs from 'fs';
import path from 'path';
import type { GameState } from '../shared/gameTypes';
import { engineLog } from './engineLog';
import { db } from './db';
import { gameTableSnapshots } from '../shared/schema';
import { eq, inArray } from 'drizzle-orm';

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

// ─── File helpers ─────────────────────────────────────────────────────────────

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

// ─── Postgres helpers — fire-and-forget, never block the caller ───────────────

/**
 * Immediately upsert a snapshot to Postgres.  The promise is NOT awaited —
 * this function returns void and handles errors internally so the action
 * handler is never blocked.
 */
function saveToDb(
  persistKey: string,
  modeId: string,
  tableId: string,
  handId: number,
  state: GameState,
): void {
  const dataJson = { state, handId, savedAt: Date.now() } as Record<string, unknown>;
  db.insert(gameTableSnapshots)
    .values({ persistKey, modeId, tableId, handId, dataJson, savedAt: new Date() })
    .onConflictDoUpdate({
      target: gameTableSnapshots.persistKey,
      set: { handId, dataJson, savedAt: new Date() },
    })
    .catch(err =>
      engineLog('ERROR', persistKey, { msg: 'db-snapshot-upsert-failed', err: String(err) }),
    );
}

/** Fire-and-forget Postgres delete. */
function deleteFromDb(persistKey: string): void {
  db.delete(gameTableSnapshots)
    .where(eq(gameTableSnapshots.persistKey, persistKey))
    .catch(err =>
      engineLog('ERROR', persistKey, { msg: 'db-snapshot-delete-failed', err: String(err) }),
    );
}

/** Async load of all DB snapshots matching the given mode IDs (used at startup). */
async function loadAllFromDb(
  modeIds: string[],
): Promise<Record<string, PersistedEntry & { tableId: string; modeId: string }>> {
  try {
    const rows = await db
      .select()
      .from(gameTableSnapshots)
      .where(inArray(gameTableSnapshots.modeId, modeIds));

    const cutoff = Date.now() - TABLE_EXPIRY_MS;
    const result: Record<string, PersistedEntry & { tableId: string; modeId: string }> = {};

    for (const row of rows) {
      const data = row.dataJson as { state: GameState; handId: number; savedAt: number };
      if (!data?.state) continue;
      const savedAt = typeof data.savedAt === 'number' ? data.savedAt : row.savedAt.getTime();
      if (savedAt < cutoff) continue;
      result[row.persistKey] = {
        state:   data.state,
        handId:  data.handId ?? row.handId,
        savedAt,
        tableId: row.tableId,
        modeId:  row.modeId,
      };
    }
    return result;
  } catch (err) {
    console.error('[PERSIST] db load failed (falling back to JSON):', err);
    return {};
  }
}

// ─── Load all tables on startup ───────────────────────────────────────────────

export interface RestoredTable {
  tableId: string;
  state: GameState;
  handId: number;
}

export async function loadPersistedTables(): Promise<RestoredTable[]> {
  const [dbEntries, store] = await Promise.all([
    loadAllFromDb(['badugi']),
    Promise.resolve(readStore()),
  ]);

  const cutoff = Date.now() - TABLE_EXPIRY_MS;
  const allKeys = new Set([...Object.keys(dbEntries), ...Object.keys(store)]);
  const results: RestoredTable[] = [];

  for (const tableId of allKeys) {
    const dbEntry   = dbEntries[tableId];
    const jsonEntry = store[tableId];

    // Prefer whichever source has the more-recent savedAt
    let entry: PersistedEntry | undefined;
    if (dbEntry && jsonEntry) {
      entry = dbEntry.savedAt >= jsonEntry.savedAt ? dbEntry : jsonEntry;
    } else {
      entry = dbEntry ?? jsonEntry;
    }
    if (!entry || entry.savedAt < cutoff) continue;

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

// ─── Debounced save (Badugi) ──────────────────────────────────────────────────

export function scheduleSave(tableId: string, state: GameState, handId: number): void {
  // ── Immediate Postgres write — durable before this call returns ──────────
  saveToDb(tableId, 'badugi', tableId, handId, state);

  // ── Debounced JSON file write — 2 s local backup (unchanged) ────────────
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

  // Remove from Postgres immediately
  deleteFromDb(tableId);

  try {
    const store = readStore();
    if (!store[tableId]) return;
    delete store[tableId];
    writeStore(store);
    engineLog('PERSIST', tableId, { op: 'delete' });
  } catch { /* non-critical */ }
}

// ─── Generic mode persistence (Dead7, Fifteen35, SuitsPoker, Kamikaze…) ───────
// Uses a separate JSON file so Badugi and generic tables are isolated.
// Keys in the file are `${modeId}:${tableId}` composite strings.
// Postgres uses the same `game_table_snapshots` table with the modeId column
// set to the actual mode slug (e.g. 'kamikaze', 'dead7', 'suits_poker').

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

// All mode IDs served by the generic engine — kept in sync with MODE_REGISTRY
const GENERIC_MODE_IDS = [
  'dead7', 'fifteen35', 'suits_poker', 'flushed_up',
  'kamikaze', 'bonecrusher', 'box_chevy',
];

export async function loadPersistedGenericTables(): Promise<RestoredGenericTable[]> {
  const [dbEntries, store] = await Promise.all([
    loadAllFromDb(GENERIC_MODE_IDS),
    Promise.resolve(readGenericStore()),
  ]);

  const cutoff = Date.now() - TABLE_EXPIRY_MS;
  const allKeys = new Set([...Object.keys(dbEntries), ...Object.keys(store)]);
  const results: RestoredGenericTable[] = [];

  for (const key of allKeys) {
    const dbEntry   = dbEntries[key];
    const jsonEntry = store[key];

    // Prefer whichever source is newer
    let entry: PersistedEntry | undefined;
    let modeId:  string | undefined;
    let tableId: string | undefined;

    if (dbEntry && jsonEntry) {
      if (dbEntry.savedAt >= jsonEntry.savedAt) {
        entry = dbEntry; modeId = dbEntry.modeId; tableId = dbEntry.tableId;
      } else {
        entry = jsonEntry;
      }
    } else if (dbEntry) {
      entry = dbEntry; modeId = dbEntry.modeId; tableId = dbEntry.tableId;
    } else {
      entry = jsonEntry;
    }

    if (!entry || entry.savedAt < cutoff) continue;

    // Derive modeId/tableId from the composite key if not from DB
    if (!modeId || !tableId) {
      const colonIdx = key.indexOf(':');
      if (colonIdx === -1) continue;
      modeId  = key.slice(0, colonIdx);
      tableId = key.slice(colonIdx + 1);
    }

    const { state, handId } = sanitizeForRestore(key, entry.state, entry.handId);
    results.push({ modeId, tableId, state, handId });
  }

  return results;
}

export function scheduleGenericSave(persistKey: string, state: GameState, handId: number): void {
  // Derive modeId and tableId from the composite "modeId:tableId" key
  const colonIdx = persistKey.indexOf(':');
  const modeId   = colonIdx !== -1 ? persistKey.slice(0, colonIdx) : 'generic';
  const tableId  = colonIdx !== -1 ? persistKey.slice(colonIdx + 1) : persistKey;

  // ── Immediate Postgres write — durable before this call returns ──────────
  saveToDb(persistKey, modeId, tableId, handId, state);

  // ── Debounced JSON file write — 2 s local backup (unchanged) ────────────
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

  // Remove from Postgres immediately
  deleteFromDb(persistKey);

  try {
    const store = readGenericStore();
    if (!store[persistKey]) return;
    delete store[persistKey];
    writeGenericStore(store);
    engineLog('PERSIST', persistKey, { op: 'delete' });
  } catch { /* non-critical */ }
}
