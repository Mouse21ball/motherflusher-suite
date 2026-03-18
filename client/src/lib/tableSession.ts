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

// ─── Server sync ──────────────────────────────────────────────────────────────

// Registers a new table on the server. Returns the server-echoed session.
export async function registerTable(session: TableSession): Promise<{ ok: boolean }> {
  try {
    const res = await fetch('/api/tables', {
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
    const res = await fetch(`/api/tables/${tableId.toUpperCase()}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
