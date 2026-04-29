// ─── Retention Systems ────────────────────────────────────────────────────────
// Hourly bonus, starter pack, VIP tier helpers.
// All purely client-side (localStorage). No real money, no gambling.

const HOURLY_KEY  = 'cgp_hourly_bonus';
const STARTER_KEY = 'cgp_starter_pack';
const HOUR_MS     = 60 * 60 * 1000;

export const DISCLAIMER =
  'Virtual chips are for entertainment only. They have no cash value, cannot be redeemed, and cannot be withdrawn.';

// ─── VIP Tier (derived from progression level) ────────────────────────────────

export interface VipTierInfo {
  name: 'Bronze' | 'Silver' | 'Gold' | 'Platinum+';
  color: string;
  border: string;
  bg: string;
  dailyBonusPct: number;
  hourlyBonusPct: number;
  extraEmotes: number;
  badge: string;
  minLevel: number;
  nextLevel: number | null;
}

export const VIP_TIERS: VipTierInfo[] = [
  {
    name: 'Bronze',
    color: '#CD7F32',
    border: 'rgba(205,127,50,0.30)',
    bg: 'rgba(205,127,50,0.10)',
    dailyBonusPct: 0,
    hourlyBonusPct: 0,
    extraEmotes: 0,
    badge: '🥉',
    minLevel: 1,
    nextLevel: 11,
  },
  {
    name: 'Silver',
    color: '#C0C0C0',
    border: 'rgba(192,192,192,0.30)',
    bg: 'rgba(192,192,192,0.08)',
    dailyBonusPct: 10,
    hourlyBonusPct: 10,
    extraEmotes: 5,
    badge: '🥈',
    minLevel: 11,
    nextLevel: 21,
  },
  {
    name: 'Gold',
    color: '#F0B829',
    border: 'rgba(240,184,41,0.35)',
    bg: 'rgba(240,184,41,0.10)',
    dailyBonusPct: 20,
    hourlyBonusPct: 20,
    extraEmotes: 10,
    badge: '🥇',
    minLevel: 21,
    nextLevel: 36,
  },
  {
    name: 'Platinum+',
    color: '#B0E0E6',
    border: 'rgba(176,224,230,0.30)',
    bg: 'rgba(176,224,230,0.08)',
    dailyBonusPct: 25,
    hourlyBonusPct: 25,
    extraEmotes: 15,
    badge: '💎',
    minLevel: 36,
    nextLevel: null,
  },
];

export function getVipTier(level: number): VipTierInfo {
  if (level >= 36) return VIP_TIERS[3];
  if (level >= 21) return VIP_TIERS[2];
  if (level >= 11) return VIP_TIERS[1];
  return VIP_TIERS[0];
}

// ─── Hourly Bonus ─────────────────────────────────────────────────────────────

interface HourlyState {
  lastClaimedAt: number | null;
}

const HOURLY_BASE_CHIPS = 150;

function loadHourly(): HourlyState {
  try {
    const raw = localStorage.getItem(HOURLY_KEY);
    if (raw) return JSON.parse(raw) as HourlyState;
  } catch {}
  return { lastClaimedAt: null };
}

function saveHourly(state: HourlyState): void {
  try { localStorage.setItem(HOURLY_KEY, JSON.stringify(state)); } catch {}
}

export function isHourlyReady(): boolean {
  const { lastClaimedAt } = loadHourly();
  if (lastClaimedAt === null) return true;
  return Date.now() - lastClaimedAt >= HOUR_MS;
}

export function getHourlyCountdown(): number {
  const { lastClaimedAt } = loadHourly();
  if (lastClaimedAt === null) return 0;
  return Math.max(0, HOUR_MS - (Date.now() - lastClaimedAt));
}

export function getHourlyBonusChips(level: number): number {
  const vip = getVipTier(level);
  return Math.round(HOURLY_BASE_CHIPS * (1 + vip.hourlyBonusPct / 100));
}

export function claimHourlyBonus(level: number): number {
  const chips = getHourlyBonusChips(level);
  saveHourly({ lastClaimedAt: Date.now() });
  return chips;
}

// ─── Starter Pack ─────────────────────────────────────────────────────────────

interface StarterState {
  claimed: boolean;
  seenAt: number | null;
}

export const STARTER_PACK_CHIPS = 2500;

function loadStarter(): StarterState {
  try {
    const raw = localStorage.getItem(STARTER_KEY);
    if (raw) return JSON.parse(raw) as StarterState;
  } catch {}
  return { claimed: false, seenAt: null };
}

function saveStarter(state: StarterState): void {
  try { localStorage.setItem(STARTER_KEY, JSON.stringify(state)); } catch {}
}

export function isStarterPackClaimed(): boolean {
  return loadStarter().claimed;
}

export function shouldShowStarterPack(): boolean {
  return !loadStarter().claimed;
}

export function markStarterPackSeen(): void {
  const state = loadStarter();
  if (!state.seenAt) saveStarter({ ...state, seenAt: Date.now() });
}

export function claimStarterPack(): { chips: number } {
  saveStarter({ claimed: true, seenAt: Date.now() });
  return { chips: STARTER_PACK_CHIPS };
}
