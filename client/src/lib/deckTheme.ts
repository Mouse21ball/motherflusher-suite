import { useState, useEffect } from 'react';

export type DeckTheme = 'classic' | 'prison' | 'gold' | 'noir';

const DECK_THEME_KEY = 'cgp_deck_theme';
const DECK_THEME_EVENT = 'cgp:deckThemeChange';

export interface DeckThemeConfig {
  id: DeckTheme;
  name: string;
  tagline: string;
  unlockLevel: number;
  accentColor: string;
  preview: string;
}

export const DECK_THEMES: DeckThemeConfig[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Dark & gold',
    unlockLevel: 1,
    accentColor: '#C9A227',
    preview: 'bg-gradient-to-br from-[#1C1A2E] to-[#0A0A12] border-[#C9A227]/20',
  },
  {
    id: 'prison',
    name: 'Prison Ink',
    tagline: 'Barbed wire edition',
    unlockLevel: 5,
    accentColor: '#A0A0B8',
    preview: 'bg-gradient-to-br from-[#1A1A1A] to-[#0D0D0D] border-[#A0A0B8]/25',
  },
  {
    id: 'gold',
    name: 'Gold Hustle',
    tagline: 'Gilt premium edition',
    unlockLevel: 10,
    accentColor: '#F0B829',
    preview: 'bg-gradient-to-br from-[#2A1F00] to-[#1A1200] border-[#F0B829]/35',
  },
  {
    id: 'noir',
    name: 'Noir',
    tagline: 'Stark monochrome',
    unlockLevel: 15,
    accentColor: '#E5E5E5',
    preview: 'bg-gradient-to-br from-[#1E1E1E] to-[#080808] border-white/15',
  },
];

export function getDeckTheme(): DeckTheme {
  try {
    const stored = localStorage.getItem(DECK_THEME_KEY) as DeckTheme;
    if (stored && DECK_THEMES.some(t => t.id === stored)) return stored;
  } catch {}
  return 'classic';
}

export function setDeckTheme(theme: DeckTheme): void {
  try { localStorage.setItem(DECK_THEME_KEY, theme); } catch {}
  window.dispatchEvent(new CustomEvent(DECK_THEME_EVENT, { detail: theme }));
}

export function useDeckTheme(): [DeckTheme, (t: DeckTheme) => void] {
  const [theme, setThemeState] = useState<DeckTheme>(getDeckTheme);

  useEffect(() => {
    const handler = (e: Event) => {
      setThemeState((e as CustomEvent<DeckTheme>).detail);
    };
    window.addEventListener(DECK_THEME_EVENT, handler);
    return () => window.removeEventListener(DECK_THEME_EVENT, handler);
  }, []);

  const change = (t: DeckTheme) => {
    setDeckTheme(t);
    setThemeState(t);
  };

  return [theme, change];
}

export function getDeckThemeClass(theme: DeckTheme): string {
  return `deck-${theme}`;
}
