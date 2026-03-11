const CHIPS_KEY = 'poker_table_chips';
const HISTORY_KEY = 'poker_table_history';
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

export function getChips(modeId: string): number {
  const map = readChipsMap();
  return map[modeId] ?? DEFAULT_CHIPS;
}

export function saveChips(modeId: string, chips: number): void {
  const map = readChipsMap();
  map[modeId] = chips;
  localStorage.setItem(CHIPS_KEY, JSON.stringify(map));
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
  localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
}

export function resetChips(modeId: string): void {
  const map = readChipsMap();
  map[modeId] = DEFAULT_CHIPS;
  localStorage.setItem(CHIPS_KEY, JSON.stringify(map));
}

export function resetAllData(): void {
  localStorage.removeItem(CHIPS_KEY);
  localStorage.removeItem(HISTORY_KEY);
}
