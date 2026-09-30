import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LADY_LUCK_FLIP_DURATION_MS, LADY_LUCK_FLIP_INTERVAL_MS, LADY_LUCK_SUIT_PULSE_MS } from '../shared/ladyluckTiming';

describe('Lady Luck reveal pacing', () => {
  it('speeds the race up moderately without interrupting the reveal animation', () => {
    expect(LADY_LUCK_FLIP_INTERVAL_MS).toBe(1200);
    expect(LADY_LUCK_FLIP_DURATION_MS).toBe(1000);
    expect(LADY_LUCK_FLIP_INTERVAL_MS - LADY_LUCK_FLIP_DURATION_MS).toBeGreaterThanOrEqual(200);
    expect(LADY_LUCK_SUIT_PULSE_MS).toBeLessThan(LADY_LUCK_FLIP_DURATION_MS);
  });

  it('uses the same timing configuration in the live race and rendered flip', () => {
    const server = readFileSync(new URL('../server/ladyluckEngine.ts', import.meta.url), 'utf8');
    const client = readFileSync(new URL('../client/src/pages/LadyLuck.tsx', import.meta.url), 'utf8');
    expect(server).toContain('}, LADY_LUCK_FLIP_INTERVAL_MS)');
    expect(client).toContain('ll-card-flip ${LADY_LUCK_FLIP_DURATION_MS}ms ease-out forwards');
    expect(client).toContain('setFlipAnim(null), LADY_LUCK_SUIT_PULSE_MS');
  });
});