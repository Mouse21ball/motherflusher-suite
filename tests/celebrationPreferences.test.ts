import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'cgp_celebration_motion';

function mockWindow(reducedMotion = false, storageBlocked = false) {
  let storedValue: string | null = null;
  const listeners = new Map<string, Set<(event: any) => void>>();
  const mediaListeners = new Set<() => void>();

  const localStorage = {
    getItem: vi.fn((key: string) => {
      if (storageBlocked) throw new Error('Storage access blocked');
      return key === STORAGE_KEY ? storedValue : null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (storageBlocked) throw new Error('Storage access blocked');
      if (key === STORAGE_KEY) storedValue = value;
    }),
    removeItem: vi.fn((key: string) => {
      if (storageBlocked) throw new Error('Storage access blocked');
      if (key === STORAGE_KEY) storedValue = null;
    }),
  };

  const windowMock = {
    localStorage,
    matchMedia: vi.fn(() => ({
      matches: reducedMotion,
      addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
    })),
    addEventListener: (type: string, listener: (event: any) => void) => {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener: (type: string, listener: (event: any) => void) => {
      listeners.get(type)?.delete(listener);
    },
  };

  return {
    windowMock,
    localStorage,
    dispatchStorage(event: { key: string | null; newValue: string | null }) {
      for (const listener of listeners.get('storage') ?? []) listener(event);
    },
  };
}

let browser: ReturnType<typeof mockWindow>;

beforeEach(() => {
  vi.resetModules();
  browser = mockWindow();
  vi.stubGlobal('window', browser.windowMock);
});

afterEach(() => {
  vi.doUnmock('react');
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('celebration motion preference', () => {
  it.each([
    [false, 'full'],
    [true, 'reduced'],
  ] as const)('uses the operating-system default when unset (reduced motion: %s)', async (reduced, expected) => {
    browser = mockWindow(reduced);
    vi.stubGlobal('window', browser.windowMock);
    const { getCelebrationMotion } = await import('../client/src/lib/celebrationPreferences');

    expect(getCelebrationMotion()).toBe(expected);
  });

  it('gets and sets each explicit motion preference', async () => {
    const { getCelebrationMotion, setCelebrationMotion } =
      await import('../client/src/lib/celebrationPreferences');

    for (const mode of ['full', 'reduced', 'off'] as const) {
      setCelebrationMotion(mode);
      expect(getCelebrationMotion()).toBe(mode);
      expect(browser.localStorage.setItem).toHaveBeenLastCalledWith(STORAGE_KEY, mode);
    }
  });

  it('keeps an in-memory preference when localStorage is blocked', async () => {
    browser = mockWindow(true, true);
    vi.stubGlobal('window', browser.windowMock);
    const { getCelebrationMotion, setCelebrationMotion } =
      await import('../client/src/lib/celebrationPreferences');

    expect(getCelebrationMotion()).toBe('reduced');
    setCelebrationMotion('off');

    expect(browser.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'off');
    expect(getCelebrationMotion()).toBe('off');
  });

  it('resets to the OS default when the stored override is cleared', async () => {
    const stateUpdates: string[] = [];
    let cleanup: (() => void) | undefined;
    vi.doMock('react', () => ({
      useState: (initial: string | (() => string)) => [
        typeof initial === 'function' ? initial() : initial,
        (mode: string) => stateUpdates.push(mode),
      ],
      useEffect: (effect: () => () => void) => {
        cleanup = effect();
      },
    }));
    browser = mockWindow(true);
    vi.stubGlobal('window', browser.windowMock);
    const { setCelebrationMotion, useCelebrationMotion } =
      await import('../client/src/lib/celebrationPreferences');

    expect(useCelebrationMotion()).toBe('reduced');
    setCelebrationMotion('off');
    expect(stateUpdates).toContain('off');

    browser.localStorage.removeItem(STORAGE_KEY);
    browser.dispatchStorage({ key: STORAGE_KEY, newValue: null });

    expect(stateUpdates.at(-1)).toBe('reduced');
    cleanup?.();
  });
});