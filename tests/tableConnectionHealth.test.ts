import { describe, expect, it } from 'vitest';
import { isTablePath, TABLE_JOIN_TIMEOUT_MS } from '../client/src/lib/tableConnectionHealth';
describe('independent table escape coverage', () => {
  it('covers every poker mode, Lady Luck, watch routes and invite joins', () => {
    for (const path of ['/badugi', '/dead7', '/fifteen35', '/suitspoker', '/flushedup', '/kamikaze', '/bonecrusher', '/box-chevy', '/ladyluck', '/ladyluck/spectate', '/join/ABC123']) expect(isTablePath(path)).toBe(true);
    for (const path of ['/', '/shop', '/ladyluck/history', '/practice/badugi']) expect(isTablePath(path)).toBe(false);
    expect(TABLE_JOIN_TIMEOUT_MS).toBe(15000);
  });
});