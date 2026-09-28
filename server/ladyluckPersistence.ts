// ─── Lady Luck table persistence ──────────────────────────────────────────────
// Mirrors the pattern in tablePersistence.ts (Badugi / generic engines).
// Writes active LLTableMeta state to .data/ladyluck_tables.json with a 2-second
// debounce. Non-serialisable fields (WebSocket refs, timer handles) are excluded.
//
// On restore:
//   LOBBY / SELECT / RESULTS  → fresh LOBBY, no chips in limbo, no refund needed
//   WAGER / BET               → refund any human players whose wagered=true, fresh LOBBY
//   RACE                      → refund all wagered humans (race never resolved), fresh LOBBY
//
// Pruning: entries older than 24 h are silently dropped. LL tables are ephemeral;
// the 7-day window used for Badugi is unnecessary here.

import fs   from 'fs';
import path from 'path';
import { storage, LADY_LUCK_HOUSE_ID } from './storage';
import type { LadyLuckState, LadyLuckSuit, LadyLuckRoom } from '../shared/modes/ladyluck';
import { db } from './db';
import { gameTableSnapshots } from '../shared/schema';
import { eq } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LLCard { rank: string; suit: LadyLuckSuit; }

interface PersistedLLEntry {
  state:         LadyLuckState;
  deck:          LLCard[];
  hostId:        string | null;
  savedAt:       number;
  refundIssued?: boolean;
  spectatorBets?: { userId: string; suit: LadyLuckSuit; amount: number }[];
}

type StoreFile = Record<string, PersistedLLEntry>;

interface PendingWrite {
  timer:  ReturnType<typeof setTimeout>;
  state:  LadyLuckState;
  deck:   LLCard[];
  hostId: string | null;
  spectatorBets: { userId: string; suit: LadyLuckSuit; amount: number }[];
}

export interface RestoredLLEntry {
  tableId:  string;
  roomType: LadyLuckRoom;
  hostId:   string | null;
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

const DATA_DIR        = path.join(process.cwd(), '.data');
const DATA_FILE       = path.join(DATA_DIR, 'ladyluck_tables.json');
const SAVE_DEBOUNCE_MS = 2_000;
const TABLE_EXPIRY_MS  = 24 * 60 * 60 * 1_000; // 24 hours

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
    console.error('[ll:PERSIST] write failed:', err);
  }
}

// ─── Postgres helpers — fire-and-forget, never block the action handler ───────

function saveLLToDb(tableId: string, state: LadyLuckState, deck: LLCard[], hostId: string | null, spectatorBets: PersistedLLEntry['spectatorBets']): void {
  const persistKey = `ll:${tableId}`;
  const dataJson   = { state, deck, hostId, spectatorBets, savedAt: Date.now() } as Record<string, unknown>;
  db.insert(gameTableSnapshots)
    .values({ persistKey, modeId: 'ladyluck', tableId, handId: 0, dataJson, savedAt: new Date() })
    .onConflictDoUpdate({
      target: gameTableSnapshots.persistKey,
      set:    { dataJson, savedAt: new Date() },
    })
    .catch(err => console.error('[ll:PERSIST] db upsert failed:', err));
}

function deleteLLFromDb(tableId: string): void {
  db.delete(gameTableSnapshots)
    .where(eq(gameTableSnapshots.persistKey, `ll:${tableId}`))
    .catch(err => console.error('[ll:PERSIST] db delete failed:', err));
}

// ─── Debounced save ───────────────────────────────────────────────────────────

export function scheduleLLSave(
  tableId: string,
  state:   LadyLuckState,
  deck:    LLCard[],
  hostId:  string | null,
  bets: Map<string, { suit: LadyLuckSuit; amount: number }> = new Map(),
): void {
  const spectatorBets = [...bets].map(([userId, bet]) => ({ userId, ...bet }));
  // ── Immediate Postgres write — durable before this call returns ──────────
  saveLLToDb(tableId, state, deck, hostId, spectatorBets);

  // ── Debounced JSON file write — 2 s local backup (unchanged) ────────────
  const existing = pending.get(tableId);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pending.delete(tableId);
    flushLLTable(tableId, state, deck, hostId, spectatorBets);
  }, SAVE_DEBOUNCE_MS);

  pending.set(tableId, { timer, state, deck, hostId, spectatorBets });
}

/** Financial transitions cannot wait for the debounced local backup. */
export function flushLLFinancialState(
  tableId: string, state: LadyLuckState, deck: LLCard[], hostId: string | null,
  bets: Map<string, { suit: LadyLuckSuit; amount: number }>,
): void {
  const p = pending.get(tableId);
  if (p) { clearTimeout(p.timer); pending.delete(tableId); }
  ensureDir();
  const store = fs.existsSync(DATA_FILE)
    ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as StoreFile : {};
  const spectatorBets = [...bets].map(([userId, bet]) => ({ userId, ...bet }));
  store[tableId] = { state, deck, hostId, spectatorBets, savedAt: Date.now() };
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2));
  fs.renameSync(temp, DATA_FILE);
  saveLLToDb(tableId, state, deck, hostId, spectatorBets);
}

// ─── Synchronous flush — call before process.exit() ──────────────────────────

export function flushAllLadyLuckPending(): void {
  for (const [tableId, p] of Array.from(pending.entries())) {
    clearTimeout(p.timer);
    pending.delete(tableId);
    flushLLTable(tableId, p.state, p.deck, p.hostId, p.spectatorBets);
  }
}

function flushLLTable(
  tableId: string,
  state:   LadyLuckState,
  deck:    LLCard[],
  hostId:  string | null,
  spectatorBets: PersistedLLEntry['spectatorBets'],
): void {
  try {
    const store = readStore();
    store[tableId] = { state, deck, hostId, spectatorBets, savedAt: Date.now() };
    writeStore(store);
    console.log(`[ll:PERSIST] saved tableId=${tableId} phase=${state.phase}`);
  } catch (err) {
    console.error('[ll:PERSIST] flush error:', err);
  }
}

// ─── Delete when table is explicitly closed ───────────────────────────────────

export function deleteLLPersistedTable(tableId: string): void {
  const p = pending.get(tableId);
  if (p) { clearTimeout(p.timer); pending.delete(tableId); }

  // Remove from Postgres immediately
  deleteLLFromDb(tableId);

  try {
    const store = readStore();
    if (!store[tableId]) return;
    delete store[tableId];
    writeStore(store);
  } catch { /* non-critical */ }
}

// ─── Boot restore — async because refunds hit Postgres ───────────────────────

export async function loadPersistedLadyLuckTables(): Promise<RestoredLLEntry[]> {
  const store   = readStore();
  const cutoff  = Date.now() - TABLE_EXPIRY_MS;
  const results: RestoredLLEntry[] = [];
  const handled = new Set<string>();

  for (const [tableId, entry] of Object.entries(store)) {
    if (entry.savedAt < cutoff) {
      console.log(`[LL-RECOVERY] stale tableId=${tableId} — refunding committed stakes before pruning`);
    }

    const { state, hostId } = entry;
    const phase = state.phase;

    // ── Phases with no chips in limbo — restore as fresh LOBBY ───────────────
    if (phase === 'LOBBY' || phase === 'SELECT' || phase === 'RESULTS') {
      for (const bot of state.players.filter(p => p.presence === 'bot')) {
        await storage.releaseLadyLuckBot(bot.id, tableId);
      }
      console.log(
        `[LL-RECOVERY] tableId=${tableId} phase=${phase} — ` +
        `no wagers committed; restoring as fresh LOBBY`,
      );
      if (entry.savedAt >= cutoff) results.push({ tableId, roomType: state.roomType, hostId });
      handled.add(tableId);
      continue;
    }

    // ── WAGER / BET / RACE — wagers may be committed; refund before restore ──

    const raceId = state.raceId ?? tableId;
    const stakes = state.raceId
      ? await storage.getLadyLuckOpenStakes(tableId, raceId)
      : {
        wagers: new Map(state.players.filter(p => p.wagered && p.wager > 0).map(p => [p.id, p.wager])),
        seated: new Map<string, number>(),
        spectators: new Map<string, number>(),
      };
    if (await storage.wasLadyLuckRaceSettled(raceId)) {
      console.log(`[LL-RECOVERY] race ${raceId} already settled; no refunds required`);
    } else {
      for (const [playerId, amount] of stakes.wagers) {
        if (amount > 0) await storage.refundLadyLuckWager(playerId, amount, tableId, raceId);
      }
      if (!state.raceId) {
        for (const bet of state.sideBets) {
          stakes.seated.set(bet.playerId, (stakes.seated.get(bet.playerId) ?? 0) + bet.amount);
        }
        for (const bet of entry.spectatorBets ?? []) {
          stakes.spectators.set(bet.userId, (stakes.spectators.get(bet.userId) ?? 0) + bet.amount);
        }
      }
      for (const [playerId, amount] of stakes.seated) {
        if (amount > 0) await storage.refundLadyLuckSideBet(playerId, amount, tableId, raceId, false);
      }
      for (const [userId, amount] of stakes.spectators) {
        if (amount > 0) await storage.refundLadyLuckSideBet(userId, amount, tableId, raceId, true);
      }
    }
    for (const bot of state.players.filter(p => p.presence === 'bot')) {
      await storage.releaseLadyLuckBot(bot.id, tableId);
    }

    // Restore table as fresh LOBBY regardless of original phase.
    // Human connections are dead; bot-fill will handle repopulation.
    console.log(
      `[LL-RECOVERY] tableId=${tableId} phase=${phase}→LOBBY ` +
      `(refunds complete; table recreated fresh)`,
    );
    if (entry.savedAt >= cutoff) results.push({ tableId, roomType: state.roomType, hostId });
    handled.add(tableId);
  }

  // Prune the on-disk store to remove handled/stale entries so they are not
  // processed again on the next restart.
  if (handled.size > 0) {
    const clean: StoreFile = {};
    for (const [tableId, entry] of Object.entries(store)) {
      if (!handled.has(tableId)) clean[tableId] = entry;
    }
    writeStore(clean);
  }

  console.log(
    `[LL-RECOVERY] boot complete — ${results.length} table(s) to restore`,
  );
  return results;
}
