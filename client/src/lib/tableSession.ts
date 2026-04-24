// ─── Table Session ────────────────────────────────────────────────────────────
// Client-side foundation for private table management.
// Generates and stores a table session scoped to the current browser tab.
// The server validates codes via /api/tables — this module owns the client half.

const SESSION_KEY = 'poker_table_session';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)

export interface TableSession {
  tableId: string;   // 6-character alphanumeric code, e.g. "X7K2MQ"
  modeId: string;    // which game mode this table is for
  createdAt: number; // unix ms
  createdBy: string; // PlayerIdentity.id of creator
}

// ─── Code generation ──────────────────────────────────────────────────────────

export function generateTableCode(): string {
  return Array.from({ length: 6 }, () =>
    ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  ).join('');
}

// ─── Session CRUD ─────────────────────────────────────────────────────────────

export function createTableSession(modeId: string, createdBy: string): TableSession {
  const session: TableSession = {
    tableId: generateTableCode(),
    modeId,
    createdAt: Date.now(),
    createdBy,
  };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
  return session;
}

export function getTableSession(): TableSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as TableSession) : null;
  } catch {
    return null;
  }
}

export function clearTableSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

// Returns the full shareable join URL for a table code.
export function getJoinUrl(tableId: string): string {
  const base = window.location.origin;
  return `${base}/join/${tableId.toUpperCase()}`;
}

// Parses a table code out of a /join/:code URL path.
export function parseTableCodeFromPath(path: string): string | null {
  const match = path.match(/\/join\/([A-Z0-9]{6})/i);
  return match ? match[1].toUpperCase() : null;
}

// ─── Recent table memory (localStorage) ──────────────────────────────────────
// Persists the last table the player was in, so Home can offer a rejoin row.

const RECENT_TABLE_KEY = 'cgp_recent_table';

export function saveRecentTable(tableId: string): void {
  try {
    localStorage.setItem(RECENT_TABLE_KEY, JSON.stringify({ tableId, ts: Date.now() }));
  } catch {}
}

export function getRecentTable(): { tableId: string; ts: number } | null {
  try {
    const raw = localStorage.getItem(RECENT_TABLE_KEY);
    return raw ? (JSON.parse(raw) as { tableId: string; ts: number }) : null;
  } catch {
    return null;
  }
}

// ─── Hand result streak (sessionStorage only — no persistence) ───────────────
// Tracks recent win/loss outcomes for the current browser session.
// Used to derive a lightweight streak label on Home (e.g. "On a run").

const HAND_RESULTS_KEY = 'cgp_hand_results';

export function saveHandResult(outcome: 'win' | 'loss'): void {
  try {
    const raw = sessionStorage.getItem(HAND_RESULTS_KEY);
    const results: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    results.push(outcome);
    if (results.length > 6) results.splice(0, results.length - 6);
    sessionStorage.setItem(HAND_RESULTS_KEY, JSON.stringify(results));
  } catch {}
}

export function getStreakLabel(): string | null {
  try {
    const raw = sessionStorage.getItem(HAND_RESULTS_KEY);
    if (!raw) return null;
    const results = JSON.parse(raw) as string[];
    if (results.length < 2) return null;
    const tail3 = results.slice(-3);
    const tail2 = results.slice(-2);
    if (tail3.length === 3 && tail3.every(r => r === 'win')) return 'Heating up';
    if (tail2.every(r => r === 'win')) return 'On a run';
    if (tail2.every(r => r === 'loss')) return 'Cold table';
    return null;
  } catch {
    return null;
  }
}

// ─── Session P&L memory (localStorage) ───────────────────────────────────────
// Persists the hero's chip delta + hands for the last session so Home can
// surface it on the next visit. Only localStorage is used (per spec).

const SESSION_RESULT_KEY = 'cgp_session_result';

export interface SessionSnapshot {
  delta:   number;
  hands:   number;
  result:  'WINNING SESSION' | 'BREAK EVEN' | 'LOSING SESSION';
  ts:      number;
}

export function saveSessionResult(delta: number, hands = 0, startChips = 0): void {
  try {
    const band   = Math.max(1, Math.round(startChips * 0.05));
    const result: SessionSnapshot['result'] =
      delta  >  band ? 'WINNING SESSION'
      : delta < -band ? 'LOSING SESSION'
      : 'BREAK EVEN';
    const snap: SessionSnapshot = { delta, hands, result, ts: Date.now() };
    localStorage.setItem(SESSION_RESULT_KEY, JSON.stringify(snap));
  } catch {}
}

export function getSessionResult(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;
    return {
      delta:  parsed.delta  ?? 0,
      hands:  parsed.hands  ?? 0,
      result: parsed.result ?? ((parsed.delta ?? 0) >= 0 ? 'WINNING SESSION' : 'LOSING SESSION'),
      ts:     parsed.ts     ?? 0,
    };
  } catch {
    return null;
  }
}

// ─── Server sync ──────────────────────────────────────────────────────────────

import { apiUrl } from './apiConfig';

// Registers a new table on the server. Returns the server-echoed session.
export async function registerTable(session: TableSession): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(apiUrl('/api/tables'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableId: session.tableId,
        modeId: session.modeId,
        createdBy: session.createdBy,
      }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

// Looks up a table code on the server. Returns null if not found.
export async function lookupTable(tableId: string): Promise<{ modeId: string; createdAt: number } | null> {
  try {
    const res = await fetch(apiUrl(`/api/tables/${tableId.toUpperCase()}`));
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
