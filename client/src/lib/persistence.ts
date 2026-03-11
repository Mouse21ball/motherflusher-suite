const CHIPS_KEY = 'poker_table_chips';
const HISTORY_KEY = 'poker_table_history';
const NAME_KEY = 'poker_table_player_name';
const MAX_HISTORY = 50;
const DEFAULT_CHIPS = 1000;

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

function readChipsMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CHIPS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function safePersist(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

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

export function getHandHistory(modeId?: string): HandRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const all: HandRecord[] = raw ? JSON.parse(raw) : [];
    if (modeId) return all.filter(h => h.mode === modeId);
    return all;
  } catch {
    return [];
  }
}

export function addHandRecord(record: HandRecord): void {
  const all = getHandHistory();
  all.unshift(record);
  if (all.length > MAX_HISTORY) all.length = MAX_HISTORY;
  safePersist(HISTORY_KEY, all);
}

export function resetChips(modeId: string): void {
  const map = readChipsMap();
  map[modeId] = DEFAULT_CHIPS;
  safePersist(CHIPS_KEY, map);
}

export function resetAllData(): void {
  try {
    localStorage.removeItem(CHIPS_KEY);
    localStorage.removeItem(HISTORY_KEY);
  } catch {
  }
}

export function getPlayerName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function setPlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
  }
}
