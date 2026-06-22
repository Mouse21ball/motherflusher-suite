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
import { storage } from './storage';
import type { LadyLuckState, LadyLuckSuit, LadyLuckRoom } from '../shared/modes/ladyluck';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LLCard { rank: string; suit: LadyLuckSuit; }

interface PersistedLLEntry {
  state:         LadyLuckState;
  deck:          LLCard[];
  hostId:        string | null;
  savedAt:       number;
  refundIssued?: boolean;
}

type StoreFile = Record<string, PersistedLLEntry>;

interface PendingWrite {
  timer:  ReturnType<typeof setTimeout>;
  state:  LadyLuckState;
  deck:   LLCard[];
  hostId: string | null;
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

// ─── Debounced save ───────────────────────────────────────────────────────────

export function scheduleLLSave(
  tableId: string,
  state:   LadyLuckState,
  deck:    LLCard[],
  hostId:  string | null,
): void {
  const existing = pending.get(tableId);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pending.delete(tableId);
    flushLLTable(tableId, state, deck, hostId);
  }, SAVE_DEBOUNCE_MS);

  pending.set(tableId, { timer, state, deck, hostId });
}

// ─── Synchronous flush — call before process.exit() ──────────────────────────

export function flushAllLadyLuckPending(): void {
  for (const [tableId, p] of Array.from(pending.entries())) {
    clearTimeout(p.timer);
    pending.delete(tableId);
    flushLLTable(tableId, p.state, p.deck, p.hostId);
  }
}

function flushLLTable(
  tableId: string,
  state:   LadyLuckState,
  deck:    LLCard[],
  hostId:  string | null,
): void {
  try {
    const store = readStore();
    store[tableId] = { state, deck, hostId, savedAt: Date.now() };
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
      console.log(
        `[LL-RECOVERY] pruning stale tableId=${tableId} ` +
        `savedAt=${new Date(entry.savedAt).toISOString()} — skipping`,
      );
      handled.add(tableId);
      continue;
    }

    const { state, hostId } = entry;
    const phase = state.phase;

    // ── Phases with no chips in limbo — restore as fresh LOBBY ───────────────
    if (phase === 'LOBBY' || phase === 'SELECT' || phase === 'RESULTS') {
      console.log(
        `[LL-RECOVERY] tableId=${tableId} phase=${phase} — ` +
        `no wagers committed; restoring as fresh LOBBY`,
      );
      results.push({ tableId, roomType: state.roomType, hostId });
      handled.add(tableId);
      continue;
    }

    // ── WAGER / BET / RACE — wagers may be committed; refund before restore ──

    // If refundIssued is already set, a previous boot wrote chips back to DB
    // but crashed before pruning this entry. Skip refund to prevent double-credit.
    if (entry.refundIssued) {
      console.log(
        `[LL-RECOVERY] tableId=${tableId} phase=${phase} — ` +
        `refundIssued=true; skipping refund (already issued on previous boot)`,
      );
      results.push({ tableId, roomType: state.roomType, hostId });
      handled.add(tableId);
      continue;
    }

    const wageredHumans = state.players.filter(
      p => p.presence === 'human' && p.wagered && p.wager > 0,
    );

    if (wageredHumans.length === 0) {
      console.log(
        `[LL-RECOVERY] tableId=${tableId} phase=${phase} — ` +
        `no human wagers found; restoring as fresh LOBBY`,
      );
    } else {
      console.log(
        `[LL-RECOVERY] tableId=${tableId} phase=${phase} — ` +
        `${wageredHumans.length} human wager(s) to refund`,
      );

      // Write the idempotency flag synchronously BEFORE any DB call.
      // If the server crashes between here and the addChipsToPlayer calls,
      // the next boot will see refundIssued=true and skip the refund.
      try {
        const storeSnapshot = readStore();
        if (storeSnapshot[tableId]) {
          storeSnapshot[tableId] = { ...storeSnapshot[tableId], refundIssued: true };
          writeStore(storeSnapshot);
        }
      } catch (flagErr) {
        console.error(`[LL-RECOVERY] WARNING: could not write refundIssued flag for tableId=${tableId}:`, flagErr);
      }

      for (const p of wageredHumans) {
        try {
          await storage.addChipsToPlayer(p.id, p.wager, {
            reason:   'other',
            source:   'lady_luck_crash_refund',
            gameId:   tableId,
            handId:   null,
            metadata: { refundPhase: phase, originalWager: p.wager },
          });
          console.log(
            `[LL-RECOVERY] refunded ${p.wager} chips → playerId=${p.id} ` +
            `(${p.name}) tableId=${tableId} crashPhase=${phase}`,
          );
        } catch (err) {
          console.error(
            `[LL-RECOVERY] ERROR refunding playerId=${p.id} ` +
            `tableId=${tableId} amount=${p.wager}:`,
            err,
          );
        }
      }
    }

    // Restore table as fresh LOBBY regardless of original phase.
    // Human connections are dead; bot-fill will handle repopulation.
    console.log(
      `[LL-RECOVERY] tableId=${tableId} phase=${phase}→LOBBY ` +
      `(refunds complete; table recreated fresh)`,
    );
    results.push({ tableId, roomType: state.roomType, hostId });
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
