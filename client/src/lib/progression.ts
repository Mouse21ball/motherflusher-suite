// ─── Progression System ───────────────────────────────────────────────────────
// XP, levels, rank tiers, achievements.
// Psychology: clear milestones, status symbols, variable rewards.

const PROGRESSION_KEY = 'pt_progression';

// ─── Rank tiers ───────────────────────────────────────────────────────────────

export type RankTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Master';

export const RANK_TIERS: { name: RankTier; minLevel: number; color: string; bg: string; border: string }[] = [
  { name: 'Bronze',   minLevel: 1,  color: '#CD7F32', bg: 'rgba(205,127,50,0.12)',  border: 'rgba(205,127,50,0.25)' },
  { name: 'Silver',   minLevel: 11, color: '#C0C0C0', bg: 'rgba(192,192,192,0.12)', border: 'rgba(192,192,192,0.25)' },
  { name: 'Gold',     minLevel: 21, color: '#C9A227', bg: 'rgba(201,162,39,0.15)',  border: 'rgba(201,162,39,0.30)' },
  { name: 'Platinum', minLevel: 36, color: '#B0E0E6', bg: 'rgba(176,224,230,0.12)', border: 'rgba(176,224,230,0.25)' },
  { name: 'Diamond',  minLevel: 51, color: '#9B59B6', bg: 'rgba(155,89,182,0.15)',  border: 'rgba(155,89,182,0.30)' },
  { name: 'Master',   minLevel: 71, color: '#E74C3C', bg: 'rgba(231,76,60,0.15)',   border: 'rgba(231,76,60,0.30)' },
];

export function getRankForLevel(level: number): typeof RANK_TIERS[number] {
  let rank = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (level >= tier.minLevel) rank = tier;
    else break;
  }
  return rank;
}

// ─── XP curve ─────────────────────────────────────────────────────────────────
// Total XP to REACH level n (from level 1, 0-indexed accumulation).
// Level 1: 0 XP, Level 2: 150 XP, Level 3: 375 XP, ...
// Paced so casual players hit Lv10 in ~2 hours, Gold (Lv21) in ~10 hours.

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += 150 + (i - 1) * 75;
  }
  return total;
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpNeeded: number;
  progress: number; // 0-1
  totalXP: number;
}

export function getLevelInfo(totalXP: number): LevelInfo {
  let level = 1;
  while (level < 100 && totalXP >= xpForLevel(level + 1)) level++;
  const currentLevelXP = xpForLevel(level);
  const nextLevelXP = level < 100 ? xpForLevel(level + 1) : xpForLevel(100) + 99999;
  const xpIntoLevel = totalXP - currentLevelXP;
  const xpNeeded = nextLevelXP - currentLevelXP;
  return { level, xpIntoLevel, xpNeeded, progress: Math.min(1, xpIntoLevel / xpNeeded), totalXP };
}

// ─── Achievements ─────────────────────────────────────────────────────────────

export interface Achievement {
  id: string;
  name: string;
  description: string;
  xpReward: number;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_win',     name: 'First Blood',    description: 'Win your first hand',      xpReward: 50,  icon: '🩸', rarity: 'common'    },
  { id: 'hat_trick',     name: 'Hat Trick',      description: 'Win 3 hands in a row',     xpReward: 75,  icon: '🎩', rarity: 'common'    },
  { id: 'high_roller',   name: 'High Roller',    description: 'Win a pot of $10 or more', xpReward: 50,  icon: '🎰', rarity: 'common'    },
  { id: 'globe_trotter', name: 'Globe Trotter',  description: 'Play all 5 game modes',    xpReward: 100, icon: '🌍', rarity: 'rare'      },
  { id: 'century',       name: 'Century Club',   description: 'Play 100 hands',           xpReward: 200, icon: '💯', rarity: 'rare'      },
  { id: 'sharp',         name: 'Sharp',          description: 'Win 50 hands total',       xpReward: 150, icon: '⚡', rarity: 'rare'      },
  { id: 'on_fire',       name: 'On Fire',        description: 'Win 5 hands in a row',     xpReward: 125, icon: '🔥', rarity: 'epic'      },
  { id: 'badugi_master', name: 'Badugi Master',  description: 'Win 10 Badugi hands',      xpReward: 100, icon: '♦️', rarity: 'rare'      },
  { id: 'unstoppable',   name: 'Unstoppable',    description: 'Win 10 hands in a row',    xpReward: 250, icon: '🚀', rarity: 'epic'      },
  { id: 'legend',        name: 'Living Legend',  description: 'Win 200 hands',            xpReward: 500, icon: '👑', rarity: 'legendary' },
  { id: 'grinder',       name: 'The Grinder',    description: 'Play 500 hands',           xpReward: 400, icon: '⚙️', rarity: 'legendary' },
  { id: 'comeback',      name: 'Comeback Kid',   description: 'Win after a 3-loss streak',xpReward: 75,  icon: '💪', rarity: 'common'    },
];

const RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3 };
export const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map(a => [a.id, a]));

// ─── Progression state ────────────────────────────────────────────────────────

export interface ProgressionState {
  xp: number;
  unlockedAchievements: string[];
  handsPlayed: number;
  wins: number;
  losses: number;
  winStreak: number;
  lossStreak: number;
  biggestPot: number;
  modesPlayed: string[];
  badugisWon: number;
  newAchievements: string[];   // shown once then cleared
  lastXPHandCount: number;     // how many hands we've processed for XP
}

const DEFAULT_STATE: ProgressionState = {
  xp: 0,
  unlockedAchievements: [],
  handsPlayed: 0,
  wins: 0,
  losses: 0,
  winStreak: 0,
  lossStreak: 0,
  biggestPot: 0,
  modesPlayed: [],
  badugisWon: 0,
  newAchievements: [],
  lastXPHandCount: 0,
};

function load(): ProgressionState {
  try {
    const raw = localStorage.getItem(PROGRESSION_KEY);
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) as ProgressionState };
  } catch {}
  return { ...DEFAULT_STATE };
}

function save(state: ProgressionState): void {
  try { localStorage.setItem(PROGRESSION_KEY, JSON.stringify(state)); } catch {}
}

export function getProgression(): ProgressionState {
  return load();
}

// ─── Check achievements ────────────────────────────────────────────────────────

function checkAchievements(state: ProgressionState): string[] {
  const newly: string[] = [];
  const s = state;
  const checks: Record<string, boolean> = {
    first_win:     s.wins >= 1,
    hat_trick:     s.winStreak >= 3,
    on_fire:       s.winStreak >= 5,
    unstoppable:   s.winStreak >= 10,
    high_roller:   s.biggestPot >= 10,
    globe_trotter: s.modesPlayed.length >= 5,
    century:       s.handsPlayed >= 100,
    sharp:         s.wins >= 50,
    badugi_master: s.badugisWon >= 10,
    legend:        s.wins >= 200,
    grinder:       s.handsPlayed >= 500,
    comeback:      s.wins >= 1 && s.lossStreak === 0 && s.wins > 0,
  };
  for (const [id, met] of Object.entries(checks)) {
    if (met && !s.unlockedAchievements.includes(id)) {
      newly.push(id);
    }
  }
  return newly;
}

// ─── Award XP for a hand result ──────────────────────────────────────────────

export interface HandResult {
  won: boolean;
  potSize: number;
  modeId: string;
  isBadugi?: boolean;
}

export interface XPResult {
  xpGained: number;
  newAchievements: Achievement[];
  leveledUp: boolean;
  oldLevel: number;
  newLevel: number;
}

export function awardHandXP(result: HandResult): XPResult {
  const state = load();
  const oldLevel = getLevelInfo(state.xp).level;
  let xpGained = 10; // base per hand

  state.handsPlayed++;

  if (result.won) {
    state.wins++;
    state.winStreak++;
    state.lossStreak = 0;
    xpGained += 25;
  } else {
    state.losses++;
    state.lossStreak++;
    state.winStreak = 0;
  }

  if (result.potSize > state.biggestPot) state.biggestPot = result.potSize;
  if (result.potSize >= 10) xpGained += 15;

  if (!state.modesPlayed.includes(result.modeId)) {
    state.modesPlayed.push(result.modeId);
    xpGained += 30; // new mode discovery bonus
  }

  if (result.isBadugi && result.won) {
    state.badugisWon++;
  }

  state.xp += xpGained;

  const newlyUnlocked = checkAchievements(state);
  for (const id of newlyUnlocked) {
    state.unlockedAchievements.push(id);
    state.newAchievements.push(id);
    const ach = ACHIEVEMENT_MAP.get(id);
    if (ach) {
      state.xp += ach.xpReward;
      xpGained += ach.xpReward;
    }
  }

  const newLevel = getLevelInfo(state.xp).level;
  const leveledUp = newLevel > oldLevel;

  save(state);
  return {
    xpGained,
    newAchievements: newlyUnlocked.map(id => ACHIEVEMENT_MAP.get(id)!).filter(Boolean),
    leveledUp,
    oldLevel,
    newLevel,
  };
}

export function awardDailyXP(xp: number): void {
  const state = load();
  state.xp += xp;
  save(state);
}

// Called on home page load. If this is the first time the progression system
// sees the user (lastXPHandCount=0 but they have history), we silently baseline
// their hand count so we don't retroactively double-award XP.
// Returns true if a new hand was processed (for future use).
export function initProgressionBaseline(historyLength: number): void {
  const state = load();
  if (state.lastXPHandCount === 0 && historyLength > 0) {
    state.lastXPHandCount = historyLength;
    save(state);
  }
}

// Call after awarding XP for N new hands.
export function advanceXPHandCount(n: number): void {
  const state = load();
  state.lastXPHandCount += n;
  save(state);
}

export function clearNewAchievements(): void {
  const state = load();
  state.newAchievements = [];
  save(state);
}

export function getUnlockedAchievements(): Achievement[] {
  const state = load();
  return state.unlockedAchievements
    .map(id => ACHIEVEMENT_MAP.get(id)!)
    .filter(Boolean)
    .sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]);
}
