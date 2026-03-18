import { PlayerStats } from './poker/types';

// ─── Storage keys ────────────────────────────────────────────────────────────
const CHIPS_KEY    = 'poker_table_chips';
const HISTORY_KEY  = 'poker_table_history';
const IDENTITY_KEY = 'poker_table_identity';
const MAX_HISTORY  = 100;
const DEFAULT_CHIPS = 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HandRecord {
  id: string;
  mode: string;
  modeName: string;
  timestamp: number;
  potSize: number;
  chipsBefore: number;
  chipsAfter: number;
  chipChange: number;
  result: 'win' | 'loss' | 'push' | 'rollover' | 'folded';
  summary: string;
  isRollover: boolean;
}

// Stable identity for a player. Created once, persisted in localStorage.
// The `id` field is the canonical player identifier — used by analytics,
// table sessions, and future server-side player records.
export interface PlayerIdentity {
  id: string;         // stable UUID — canonical across all sessions
  name: string;       // display name
  avatarSeed: string; // deterministic seed for avatar initials / color generation
  createdAt: number;  // unix ms — when identity was first created
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safePersist(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readChipsMap(): Record<string, number> {
  return safeRead<Record<string, number>>(CHIPS_KEY) ?? {};
}

// ─── Player Identity ──────────────────────────────────────────────────────────

// Returns the existing identity, or creates one from the legacy name key.
// Migrates the old `poker_table_player_name` and `poker_table_analytics_id`
// into a single identity object on first call.
export function ensurePlayerIdentity(): PlayerIdentity {
  const existing = safeRead<PlayerIdentity>(IDENTITY_KEY);
  if (existing && existing.id && existing.name) return existing;

  // Migrate from legacy keys if present
  const legacyName = localStorage.getItem('poker_table_player_name') ?? 'Player';
  const legacyId   = localStorage.getItem('poker_table_analytics_id') ?? crypto.randomUUID();

  const identity: PlayerIdentity = {
    id: legacyId,
    name: legacyName,
    avatarSeed: legacyId.slice(0, 8),
    createdAt: Date.now(),
  };

  safePersist(IDENTITY_KEY, identity);
  return identity;
}

export function getPlayerIdentity(): PlayerIdentity | null {
  return safeRead<PlayerIdentity>(IDENTITY_KEY);
}

export function savePlayerIdentity(identity: PlayerIdentity): void {
  safePersist(IDENTITY_KEY, identity);
  // Keep legacy name key in sync for any code that still reads it directly
  try { localStorage.setItem('poker_table_player_name', identity.name); } catch {}
}

export function updatePlayerName(name: string): void {
  const identity = ensurePlayerIdentity();
  savePlayerIdentity({ ...identity, name });
}

// Legacy shims — kept so existing callers don't break
export function getPlayerName(): string | null {
  const identity = getPlayerIdentity();
  if (identity) return identity.name;
  try { return localStorage.getItem('poker_table_player_name'); } catch { return null; }
}

export function setPlayerName(name: string): void {
  updatePlayerName(name);
}

// ─── Chips ────────────────────────────────────────────────────────────────────

export function getChips(modeId: string): number {
  const map = readChipsMap();
  return map[modeId] ?? DEFAULT_CHIPS;
}

export function saveChips(modeId: string, chips: number): void {
  const map = readChipsMap();
  map[modeId] = chips;
  safePersist(CHIPS_KEY, map);
}

export function getAllChips(): Record<string, number> {
  return readChipsMap();
}

export function resetChips(modeId: string): void {
  const map = readChipsMap();
  map[modeId] = DEFAULT_CHIPS;
  safePersist(CHIPS_KEY, map);
}

// ─── Hand History ─────────────────────────────────────────────────────────────

export function getHandHistory(modeId?: string): HandRecord[] {
  const all = safeRead<HandRecord[]>(HISTORY_KEY) ?? [];
  if (modeId) return all.filter(h => h.mode === modeId);
  return all;
}

export function addHandRecord(record: HandRecord): void {
  const all = getHandHistory();
  all.unshift(record);
  if (all.length > MAX_HISTORY) all.length = MAX_HISTORY;
  safePersist(HISTORY_KEY, all);
}

// ─── Stats Aggregation ────────────────────────────────────────────────────────

// Computes PlayerStats from the stored HandRecord history.
// Pure derivation — no stored state, recomputed on demand.
export function getPlayerStats(modeId?: string): PlayerStats {
  const records = getHandHistory(modeId);

  const byMode: PlayerStats['byMode'] = {};
  let wins = 0, losses = 0, pushes = 0;
  let biggestWin = 0, biggestLoss = 0, totalChipChange = 0;
  let streak = 0, streakType: PlayerStats['streakType'] = 'none';

  for (const r of records) {
    // per-mode tracking
    if (!byMode[r.mode]) byMode[r.mode] = { played: 0, wins: 0, chipChange: 0 };
    byMode[r.mode].played++;
    byMode[r.mode].chipChange += r.chipChange;

    if (r.result === 'win') {
      wins++;
      byMode[r.mode].wins++;
      if (r.chipChange > biggestWin) biggestWin = r.chipChange;
    } else if (r.result === 'loss' || r.result === 'folded') {
      losses++;
      if (r.chipChange < biggestLoss) biggestLoss = r.chipChange;
    } else if (r.result === 'push') {
      pushes++;
    }
    totalChipChange += r.chipChange;
  }

  // streak: iterate from most recent (records are newest-first)
  if (records.length > 0) {
    const first = records[0].result;
    streakType = first === 'win' ? 'win' : first === 'loss' || first === 'folded' ? 'loss' : 'none';
    if (streakType !== 'none') {
      for (const r of records) {
        const isMatch = streakType === 'win'
          ? r.result === 'win'
          : r.result === 'loss' || r.result === 'folded';
        if (isMatch) streak++;
        else break;
      }
    }
  }

  const handsPlayed = records.length;
  const winRate = handsPlayed > 0 ? Math.round((wins / handsPlayed) * 100) : 0;

  return {
    handsPlayed,
    wins,
    losses,
    pushes,
    winRate,
    biggestWin,
    biggestLoss,
    currentStreak: streak,
    streakType,
    totalChipChange,
    byMode,
  };
}

// ─── Avatar Utilities ─────────────────────────────────────────────────────────
// Pure functions — no state, no side effects. Used wherever avatar initials
// or a deterministic avatar color is needed.

// Returns up to 2 uppercase initials from a display name.
// "Alice" → "AL", "Bob Chen" → "BC", "" → "??"
export function getAvatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '??';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

// Returns a deterministic hex color from an avatar seed string.
// The same seed always produces the same color.
const AVATAR_PALETTE = [
  '#C9A227', // gold
  '#7B61FF', // violet
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#06B6D4', // cyan
  '#EC4899', // pink
  '#84CC16', // lime
];

export function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

// ─── Full Reset ───────────────────────────────────────────────────────────────

export function resetAllData(): void {
  try {
    localStorage.removeItem(CHIPS_KEY);
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}
