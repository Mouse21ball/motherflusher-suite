import { describe, expect, it } from 'vitest';
import { DAILY_REWARDS, handXP, hourlyChips, levelFromXP, xpForLevel, type XPCounters } from '../shared/progressionRules';

const base = (): XPCounters => ({
  handsPlayed: 0, handsWon: 0, winStreak: 0, lossStreak: 0,
  biggestPot: 0, badugisWon: 0, modesPlayed: [], achievements: [],
});

describe('authoritative XP rules', () => {
  it('backfilled hands use the capped existing level curve', () => {
    expect(levelFromXP(0)).toBe(1);
    expect(xpForLevel(2)).toBe(150);
    expect(levelFromXP(150)).toBe(2);
    expect(levelFromXP(500 * 10)).toBeGreaterThan(1);
    expect(levelFromXP(99999999)).toBe(100);
  });

  it('awards discovery and first win, boosts hand XP only, never repeated achievements', () => {
    const first = handXP(base(), { won: true, modeId: 'badugi', potSize: 10 }, 'gold_pro');
    // 10 + 25 + 15 + 30 = 80, gold = 120; first win and high roller = 100 unboosted
    expect(first.gained).toBe(220);
    expect(first.next.achievements).toContain('first_win');
    expect(first.next.achievements).toContain('high_roller');
    const second = handXP(first.next, { won: false, modeId: 'badugi', potSize: 0 }, null);
    expect(second.gained).toBe(10);
    expect(second.next.modesPlayed).toEqual(['badugi']);
  });

  it('recognizes a comeback only after at least three losses', () => {
    const afterLosses = { ...base(), handsPlayed: 3, lossStreak: 3, achievements: ['first_win'] };
    const result = handXP(afterLosses, { won: true, modeId: 'dead7', potSize: 0 }, null);
    expect(result.next.achievements).toContain('comeback');
  });
});

describe('server bonus amounts', () => {
  it('preserves the seven-day cycle and XP schedule', () => {
    expect(DAILY_REWARDS.map(r => r.chips)).toEqual([1250, 1750, 2500, 3750, 5000, 7500, 15000]);
    expect(DAILY_REWARDS.map(r => r.xp)).toEqual([25, 35, 50, 75, 100, 125, 250]);
    expect(hourlyChips(1)).toBe(500);
    expect(hourlyChips(11)).toBe(550);
    expect(hourlyChips(21)).toBe(600);
    expect(hourlyChips(36)).toBe(625);
  });
});