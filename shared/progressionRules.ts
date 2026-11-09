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

// ─── Rank tiers + daily-bonus multipliers (P7, 2026-11-08) ───────────────────
// Rank tier names/thresholds mirror client/src/lib/progression.ts RANK_TIERS
// (Bronze 1 / Silver 11 / Gold 21 / Platinum 36 / Diamond 51 / Master 71).
// The daily rank multiplier makes real the percentages the game already
// advertises in the VIP ladder (client/src/lib/retention.ts: Silver +10%,
// Gold +20%, Platinum+ +25% — the same bands hourlyChips already pays on the
// hourly bonus) and extends the two higher ranks to the free-player ceiling:
// Diamond +35%, Master +50% (top free rank = 1.5x, by design).
// Full design + economy math: ~/workspace/cgp-p7/MULTIPLIER-MATH.md.
export interface RankTierDef {
  name: string;
  minLevel: number;
  dailyMultiplier: number;
}

export const RANK_TIER_DEFS: RankTierDef[] = [
  { name: 'Bronze',   minLevel: 1,  dailyMultiplier: 1.0  },
  { name: 'Silver',   minLevel: 11, dailyMultiplier: 1.1  },
  { name: 'Gold',     minLevel: 21, dailyMultiplier: 1.2  },
  { name: 'Platinum', minLevel: 36, dailyMultiplier: 1.25 },
  { name: 'Diamond',  minLevel: 51, dailyMultiplier: 1.35 },
  { name: 'Master',   minLevel: 71, dailyMultiplier: 1.5  },
];

export function rankTierForLevel(level: number): RankTierDef {
  let tier = RANK_TIER_DEFS[0];
  for (const t of RANK_TIER_DEFS) {
    if (level >= t.minLevel) tier = t;
    else break;
  }
  return tier;
}

export function dailyRankMultiplier(level: number): number {
  return rankTierForLevel(level).dailyMultiplier;
}

// Crew factor: computed ONLY from real stored crew data — the player's crew
// membership and that crew's stored member_count (maintained on join/leave/
// kick in storage; crews cap at 25). A one-member "crew" is just the captain
// alone and earns no factor. There are no crew tiers/levels in the data, so
// none are invented here — size bands only.
export function dailyCrewMultiplier(crewMemberCount: number | null): number {
  if (crewMemberCount === null || crewMemberCount < 2) return 1;
  if (crewMemberCount <= 4) return 1.05;
  if (crewMemberCount <= 9) return 1.075;
  return 1.1;
}

// Hard ceiling on the COMBINED daily-bonus multiplier (rank x crew x
// subscription). Diamond Elite alone is 3x today; a 3.0 cap would make rank
// and crew worthless to Diamond subscribers. 3.5 keeps bounded headroom over
// today's maximum faucet while the free-player ceiling stays 1.5 x 1.1 = 1.65.
export const DAILY_BONUS_MULTIPLIER_CAP = 3.5;

export interface DailyBonusBreakdown {
  baseChips: number;
  rankName: string;
  rankMultiplier: number;
  crewMemberCount: number | null;
  crewMultiplier: number;
  subMultiplier: number;
  combinedMultiplier: number; // after the cap
  capped: boolean;
  chips: number;              // final chips granted (single final rounding)
}

// Pure + server-authoritative: the server computes this at claim time from
// stored profile/crew data; the client only displays the returned breakdown.
export function dailyBonusBreakdown(
  baseChips: number,
  level: number,
  crewMemberCount: number | null,
  subMultiplier: number,
): DailyBonusBreakdown {
  const tier = rankTierForLevel(level);
  const crewMultiplier = dailyCrewMultiplier(crewMemberCount);
  const raw = tier.dailyMultiplier * crewMultiplier * subMultiplier;
  const combinedMultiplier = Math.min(raw, DAILY_BONUS_MULTIPLIER_CAP);
  return {
    baseChips,
    rankName: tier.name,
    rankMultiplier: tier.dailyMultiplier,
    crewMemberCount,
    crewMultiplier,
    subMultiplier,
    combinedMultiplier,
    capped: raw > DAILY_BONUS_MULTIPLIER_CAP,
    chips: Math.round(baseChips * combinedMultiplier),
  };
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
    high_roller: next.biggestPot >= 10, globe_trotter: next.modesPlayed.length >= 4,
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