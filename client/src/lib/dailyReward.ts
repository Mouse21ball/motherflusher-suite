// ─── Daily Reward System ──────────────────────────────────────────────────────
// 7-day streak cycle. Missed days reset streak.
// Psychology: variable ratio reward + loss aversion (streak at risk).

const DAILY_REWARD_KEY = 'pt_daily_reward';

export interface DailyRewardTier {
  day: number;   // 1-7 in cycle
  chips: number;
  xp: number;
  label: string;
  isJackpot?: boolean;
}

export const DAILY_REWARD_TIERS: DailyRewardTier[] = [
  { day: 1, chips: 250,  xp: 25,  label: 'Day 1' },
  { day: 2, chips: 350,  xp: 35,  label: 'Day 2' },
  { day: 3, chips: 500,  xp: 50,  label: 'Day 3' },
  { day: 4, chips: 750,  xp: 75,  label: 'Day 4' },
  { day: 5, chips: 1000, xp: 100, label: 'Day 5' },
  { day: 6, chips: 1500, xp: 125, label: 'Day 6' },
  { day: 7, chips: 3000, xp: 250, label: 'Jackpot!', isJackpot: true },
];

export interface DailyRewardState {
  lastClaimedDate: string | null;  // YYYY-MM-DD
  currentStreak: number;
  totalClaimed: number;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function loadState(): DailyRewardState {
  try {
    const raw = localStorage.getItem(DAILY_REWARD_KEY);
    if (raw) return JSON.parse(raw) as DailyRewardState;
  } catch {}
  return { lastClaimedDate: null, currentStreak: 0, totalClaimed: 0 };
}

function saveState(state: DailyRewardState): void {
  try { localStorage.setItem(DAILY_REWARD_KEY, JSON.stringify(state)); } catch {}
}

export function getDailyRewardState(): DailyRewardState {
  return loadState();
}

export function isRewardAvailable(): boolean {
  const state = loadState();
  return state.lastClaimedDate !== todayStr();
}

export function getStreakInfo(): { streak: number; dayInCycle: number; nextReward: DailyRewardTier } {
  const state = loadState();
  const today = todayStr();
  const yesterday = yesterdayStr();
  const isActive = state.lastClaimedDate === today || state.lastClaimedDate === yesterday;
  const streak = isActive ? state.currentStreak : 0;
  const dayInCycle = (streak % 7) + 1;
  return { streak, dayInCycle, nextReward: DAILY_REWARD_TIERS[dayInCycle - 1] };
}

// Returns today's reward tier (what you'd get if you claim now), or null if already claimed.
export function getTodayReward(): DailyRewardTier | null {
  const state = loadState();
  if (state.lastClaimedDate === todayStr()) return null;
  const { dayInCycle } = getStreakInfo();
  return DAILY_REWARD_TIERS[dayInCycle - 1];
}

// Claim today's reward. Returns the tier claimed.
export function claimDailyReward(): DailyRewardTier {
  const state = loadState();
  const yesterday = yesterdayStr();
  const isStreak = state.lastClaimedDate === yesterday || state.lastClaimedDate === null;
  const newStreak = isStreak ? state.currentStreak + 1 : 1;
  const dayIndex = (newStreak - 1) % 7;
  const reward = DAILY_REWARD_TIERS[dayIndex];
  saveState({ lastClaimedDate: todayStr(), currentStreak: newStreak, totalClaimed: state.totalClaimed + 1 });
  return reward;
}

// ─── Simulated live player count ──────────────────────────────────────────────
// Deterministic per 30-second tick → consistent across components, no hydration mismatch.
// Psychology: social proof hook ("X players are online right now").

export function getSimulatedPlayerCount(): number {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;

  // Peak hours: 6-11pm. Low hours: 2-5am.
  const hourFactors = [
    0.15, 0.09, 0.06, 0.05, 0.05, 0.07,   // 12am-5am
    0.12, 0.20, 0.30, 0.42, 0.52, 0.62,   // 6am-11am
    0.72, 0.80, 0.76, 0.71, 0.80, 0.91,   // 12pm-5pm
    1.00, 0.97, 0.90, 0.84, 0.68, 0.44,   // 6pm-11pm
  ];

  const base = isWeekend ? 1247 : 843;
  const factor = hourFactors[hour] ?? 0.5;

  // Deterministic 30-second jitter so it looks alive but doesn't strobe
  const tick = Math.floor(Date.now() / 30000);
  const jitter = ((tick * 1031 + 7) % 47) - 23;

  return Math.max(48, Math.round(base * factor + jitter));
}

// Per-mode simulated active table counts
export function getModeTableCount(modeId: string): number {
  const total = getSimulatedPlayerCount();
  const shares: Record<string, number> = {
    badugi: 0.35,
    dead7: 0.18,
    fifteen35: 0.20,
    swing: 0.15,
    suitspoker: 0.12,
  };
  const share = shares[modeId] ?? 0.15;
  const tick = Math.floor(Date.now() / 60000);
  const jitter = ((tick * 757 + modeId.charCodeAt(0)) % 5) - 2;
  return Math.max(1, Math.round(total * share / 4 + jitter)); // approx tables (4 per table)
}
