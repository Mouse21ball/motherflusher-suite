export const DAILY_REWARDS = [
  { chips: 1250, xp: 25 }, { chips: 1750, xp: 35 },
  { chips: 2500, xp: 50 }, { chips: 3750, xp: 75 },
  { chips: 5000, xp: 100 }, { chips: 7500, xp: 125 },
  { chips: 15000, xp: 250 },
] as const;

export function xpForLevel(level: number): number {
  return level <= 1 ? 0 : (level - 1) * 150 + (level - 1) * (level - 2) * 75 / 2;
}

export function levelFromXP(xp: number): number {
  let level = 1;
  while (level < 100 && xp >= xpForLevel(level + 1)) level++;
  return level;
}

export function hourlyChips(level: number): number {
  const pct = level >= 36 ? 25 : level >= 21 ? 20 : level >= 11 ? 10 : 0;
  return Math.round(500 * (1 + pct / 100));
}

export interface XPCounters {
  handsPlayed: number; handsWon: number; winStreak: number; lossStreak: number;
  biggestPot: number; badugisWon: number; modesPlayed: string[];
  achievements: string[];
}

export const ACHIEVEMENT_XP: Record<string, number> = {
  first_win: 50, hat_trick: 75, high_roller: 50, globe_trotter: 100,
  century: 200, sharp: 150, on_fire: 125, badugi_master: 100,
  unstoppable: 250, legend: 500, grinder: 400, comeback: 75,
};

export function handXP(state: XPCounters, result: { won: boolean; potSize: number; modeId: string }, tier: string | null) {
  const previousLossStreak = state.lossStreak;
  const next: XPCounters = {
    ...state,
    handsPlayed: state.handsPlayed + 1,
    handsWon: state.handsWon + (result.won ? 1 : 0),
    winStreak: result.won ? state.winStreak + 1 : 0,
    lossStreak: result.won ? 0 : state.lossStreak + 1,
    biggestPot: Math.max(state.biggestPot, result.potSize),
    badugisWon: state.badugisWon + (result.won && result.modeId === "badugi" ? 1 : 0),
    modesPlayed: state.modesPlayed.includes(result.modeId) ? state.modesPlayed : [...state.modesPlayed, result.modeId],
    achievements: [...state.achievements],
  };
  let gained = 10 + (result.won ? 25 : 0) + (result.potSize >= 10 ? 15 : 0)
    + (state.modesPlayed.includes(result.modeId) ? 0 : 30);
  gained = Math.round(gained * (tier === "diamond_elite" ? 2 : tier === "gold_pro" ? 1.5 : 1));
  const conditions: Record<string, boolean> = {
    first_win: next.handsWon >= 1, hat_trick: next.winStreak >= 3,
    high_roller: next.biggestPot >= 10, globe_trotter: next.modesPlayed.length >= 5,
    century: next.handsPlayed >= 100, sharp: next.handsWon >= 50,
    on_fire: next.winStreak >= 5, badugi_master: next.badugisWon >= 10,
    unstoppable: next.winStreak >= 10, legend: next.handsWon >= 200,
    grinder: next.handsPlayed >= 500, comeback: result.won && previousLossStreak >= 3,
  };
  for (const [id, met] of Object.entries(conditions)) {
    if (met && !next.achievements.includes(id)) {
      next.achievements.push(id);
      gained += ACHIEVEMENT_XP[id];
    }
  }
  return { next, gained };
}