/**
 * Table backgrounds — swappable yard backdrops (Detroit 2026-10-13).
 * Yard at Dusk is the free default. The Dorm and The Real Dorm are
 * Detroit-approved; tiers (unlockable vs premium) TBD by Detroit.
 */

export interface TableBackground {
  id: string;
  name: string;
  url: string;
  /** 'free' | 'unlockable' | 'premium' — gating TBD by Detroit */
  tier: 'free' | 'unlockable' | 'premium';
  description: string;
}

export const TABLE_BACKGROUNDS: TableBackground[] = [
  {
    id: 'yard-dusk',
    name: 'Yard at Dusk',
    url: '/cosmetics/backgrounds/bg-yard-dusk.jpg',
    tier: 'free',
    description: 'The classic yard. Free for everyone.',
  },
  {
    id: 'the-dorm',
    name: 'The Dorm',
    url: '/cosmetics/backgrounds/bg-the-dorm.webp',
    tier: 'unlockable',
    description: 'Freestyle dormitory bay. Warm work lights, deep purple shadows.',
  },
  {
    id: 'real-dorm',
    name: 'The Real Dorm',
    url: '/cosmetics/backgrounds/bg-real-dorm.webp',
    tier: 'premium',
    description: 'Built from a real dorm photo. Numbered lockers, shoes under bunks.',
  },
];

export const DEFAULT_BACKGROUND_ID = 'yard-dusk';

const STORAGE_KEY = 'cgp-table-background';

export function getSelectedBackgroundId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_BACKGROUND_ID;
  } catch {
    return DEFAULT_BACKGROUND_ID;
  }
}

export function setSelectedBackgroundId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable — selection won't persist
  }
}

export function getSelectedBackground(): TableBackground {
  const id = getSelectedBackgroundId();
  return TABLE_BACKGROUNDS.find(b => b.id === id) ?? TABLE_BACKGROUNDS[0];
}
