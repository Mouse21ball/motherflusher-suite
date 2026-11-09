import { describe, expect, it } from 'vitest';
import {
  handXP, hourlyChips, levelFromXP, xpForLevel, type XPCounters,
  rankTierForLevel, dailyRankMultiplier, dailyCrewMultiplier, dailyBonusBreakdown,
  DAILY_BONUS_MULTIPLIER_CAP, subscriptionDailyRouteBonus,
} from '../shared/progressionRules';

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
    const result = handXP(afterLosses, { won: true, modeId: 'box_chevy', potSize: 0 }, null);
    expect(result.next.achievements).toContain('comeback');
  });
});

describe('server bonus amounts', () => {
  it('preserves the hourly reward amounts', () => {
    expect(hourlyChips(1)).toBe(500);
    expect(hourlyChips(11)).toBe(550);
    expect(hourlyChips(21)).toBe(600);
    expect(hourlyChips(36)).toBe(625);
  });
});

// P7 (2026-11-08): rank x crew x subscription daily-bonus multipliers.
// Design + math: ~/workspace/cgp-p7/MULTIPLIER-MATH.md.
describe('daily bonus multipliers (P7)', () => {
  it('maps levels to the six rank tiers at their thresholds', () => {
    expect(rankTierForLevel(1).name).toBe('Bronze');
    expect(rankTierForLevel(10).name).toBe('Bronze');
    expect(rankTierForLevel(11).name).toBe('Silver');
    expect(rankTierForLevel(21).name).toBe('Gold');
    expect(rankTierForLevel(36).name).toBe('Platinum');
    expect(rankTierForLevel(51).name).toBe('Diamond');
    expect(rankTierForLevel(71).name).toBe('Master');
    expect(rankTierForLevel(100).name).toBe('Master');
  });

  it('rank curve matches the advertised bands and caps free rank at 1.5x', () => {
    expect(dailyRankMultiplier(1)).toBe(1);
    expect(dailyRankMultiplier(11)).toBe(1.1);
    expect(dailyRankMultiplier(21)).toBe(1.2);
    expect(dailyRankMultiplier(36)).toBe(1.25);
    expect(dailyRankMultiplier(51)).toBe(1.35);
    expect(dailyRankMultiplier(71)).toBe(1.5);
  });

  it('crew factor uses stored member-count bands only', () => {
    expect(dailyCrewMultiplier(null)).toBe(1);
    expect(dailyCrewMultiplier(1)).toBe(1);
    expect(dailyCrewMultiplier(2)).toBe(1.05);
    expect(dailyCrewMultiplier(4)).toBe(1.05);
    expect(dailyCrewMultiplier(5)).toBe(1.075);
    expect(dailyCrewMultiplier(9)).toBe(1.075);
    expect(dailyCrewMultiplier(10)).toBe(1.1);
    expect(dailyCrewMultiplier(25)).toBe(1.1);
  });

  it('a plain Bronze claim is unmultiplied', () => {
    const b = dailyBonusBreakdown(500, 1, null, 1);
    expect(b.combinedMultiplier).toBe(1);
    expect(b.capped).toBe(false);
    expect(b.chips).toBe(500);
  });

  it('stacks rank x crew x subscription multiplicatively', () => {
    // Day 7 base 5,000: Gold 1.2 x crew-of-6 1.075 x Chain Pro 2 = 2.58
    const b = dailyBonusBreakdown(5000, 21, 6, 2);
    expect(b.combinedMultiplier).toBeCloseTo(2.58, 10);
    expect(b.capped).toBe(false);
    expect(b.chips).toBe(12900);
  });

  it('free-player ceiling is rank 1.5 x crew 1.1 = 1.65x', () => {
    const b = dailyBonusBreakdown(5000, 71, 25, 1);
    expect(b.combinedMultiplier).toBeCloseTo(1.65, 10);
    expect(b.chips).toBe(8250);
  });

  it('hard cap binds the maximum stack at 3.5x', () => {
    // Master 1.5 x crew 1.1 x Diamond Elite 3 = 4.95 raw -> capped 3.5
    const b = dailyBonusBreakdown(5000, 71, 25, 3);
    expect(DAILY_BONUS_MULTIPLIER_CAP).toBe(3.5);
    expect(b.combinedMultiplier).toBe(3.5);
    expect(b.capped).toBe(true);
    expect(b.chips).toBe(17500);
  });
});

// P7 follow-up: the flat subscription route bonus is credited on top of the
// multiplied bonus (claim route) and itemized in the breakdown display
// (status preview + celebration). One shared helper pins the amounts so
// payout and display can never diverge; the bonus itself is never
// multiplied and is not part of dailyBonusBreakdown.
describe('subscription daily route bonus (P7 follow-up)', () => {
  it('pays the flat route bonus by tier', () => {
    expect(subscriptionDailyRouteBonus('gold_pro')).toBe(1000);
    expect(subscriptionDailyRouteBonus('diamond_elite')).toBe(2500);
  });

  it('pays nothing to non-subscribers and unknown tiers', () => {
    expect(subscriptionDailyRouteBonus(null)).toBe(0);
    expect(subscriptionDailyRouteBonus('free')).toBe(0);
  });
});