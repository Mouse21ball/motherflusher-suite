import { useEffect, useState } from 'react';

export type CelebrationMotion = 'full' | 'reduced' | 'off';

const STORAGE_KEY = 'cgp_celebration_motion';
const VALID_MODES: readonly CelebrationMotion[] = ['full', 'reduced', 'off'];

let memoryMode: CelebrationMotion | null = null;
const listeners = new Set<() => void>();
let stopListening: (() => void) | null = null;

function isCelebrationMotion(value: string | null): value is CelebrationMotion {
  return value !== null && VALID_MODES.includes(value as CelebrationMotion);
}

function readStoredMode(): CelebrationMotion | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isCelebrationMotion(value) ? value : null;
  } catch {
    return null;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function getCelebrationMotion(): CelebrationMotion {
  if (typeof window === 'undefined') return 'reduced';
  return readStoredMode() ?? memoryMode ?? (prefersReducedMotion() ? 'reduced' : 'full');
}

function notifyListeners(): void {
  listeners.forEach(listener => listener());
}

function handleStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  memoryMode = isCelebrationMotion(event.newValue) ? event.newValue : null;
  notifyListeners();
}

function handleMotionPreferenceChange(): void {
  // Explicit user settings take precedence over the operating-system default.
  if (!readStoredMode() && memoryMode === null) notifyListeners();
}

function startListening(): () => void {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener('storage', handleStorage);
  let mediaQuery: MediaQueryList | null = null;
  try {
    mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    mediaQuery.addEventListener?.('change', handleMotionPreferenceChange);
    // Older Safari versions expose addListener instead of addEventListener.
    if (!mediaQuery.addEventListener) mediaQuery.addListener(handleMotionPreferenceChange);
  } catch {
    mediaQuery = null;
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (mediaQuery) {
      mediaQuery.removeEventListener?.('change', handleMotionPreferenceChange);
      if (!mediaQuery.removeEventListener) mediaQuery.removeListener(handleMotionPreferenceChange);
    }
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!stopListening) stopListening = startListening();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopListening) {
      stopListening();
      stopListening = null;
    }
  };
}

export function setCelebrationMotion(mode: CelebrationMotion): void {
  if (!VALID_MODES.includes(mode)) return;
  memoryMode = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Keep this session's preference in memory when storage is unavailable.
  }
  notifyListeners();
}

export function useCelebrationMotion(): CelebrationMotion {
  const [mode, setMode] = useState(getCelebrationMotion);

  useEffect(() => {
    const refresh = () => setMode(getCelebrationMotion());
    const unsubscribe = subscribe(refresh);
    refresh();
    return unsubscribe;
  }, []);

  return mode;
}