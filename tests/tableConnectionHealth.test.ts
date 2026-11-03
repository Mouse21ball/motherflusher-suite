import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isTablePath, TABLE_JOIN_TIMEOUT_MS } from '../client/src/lib/tableConnectionHealth';
describe('independent table escape coverage', () => {
  it('covers every poker mode, Lady Luck, watch routes and invite joins', () => {
    for (const path of ['/badugi', '/flushedup', '/box-chevy', '/ladyluck', '/ladyluck/spectate', '/join/ABC123']) expect(isTablePath(path)).toBe(true);
    for (const path of ['/', '/shop', '/ladyluck/history', '/practice/badugi']) expect(isTablePath(path)).toBe(false);
    expect(TABLE_JOIN_TIMEOUT_MS).toBe(15000);
  });
});
// Detroit 2026-10-24: the connection guard must say "Connecting…" on a
// FIRST connection and "Reconnecting…" only after the table actually
// reached 'ready' once. The health module tracks that per path.
describe('tableConnectionHealth — first connect vs reconnect', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as any).window = {
      location: { pathname: '/box-chevy' },
      dispatchEvent: () => true,
    };
    if (typeof (globalThis as any).CustomEvent === 'undefined') {
      (globalThis as any).CustomEvent = class { type: string; detail: any; constructor(type: string, init: any) { this.type = type; this.detail = init?.detail; } };
    }
  });

  it('first connect is NOT marked as a reconnect', async () => {
    const m = await import('../client/src/lib/tableConnectionHealth');
    m.reportTableConnection('connecting');
    const h = m.getTableConnectionHealth()!;
    expect(h.status).toBe('connecting');
    expect(h.hasConnectedBefore).toBe(false);
  });

  it('after ready, a later connecting IS a reconnect', async () => {
    const m = await import('../client/src/lib/tableConnectionHealth');
    m.reportTableConnection('connecting');
    m.reportTableConnection('ready');
    expect(m.getTableConnectionHealth()!.hasConnectedBefore).toBe(true);
    m.reportTableConnection('connecting');
    const h = m.getTableConnectionHealth()!;
    expect(h.status).toBe('connecting');
    expect(h.hasConnectedBefore).toBe(true);
  });

  it('readiness is per path — a different table still starts as a first connect', async () => {
    const m = await import('../client/src/lib/tableConnectionHealth');
    m.reportTableConnection('ready');
    (globalThis as any).window.location.pathname = '/badugi';
    m.reportTableConnection('connecting');
    const h = m.getTableConnectionHealth()!;
    expect(h.path).toBe('/badugi');
    expect(h.hasConnectedBefore).toBe(false);
  });
});
