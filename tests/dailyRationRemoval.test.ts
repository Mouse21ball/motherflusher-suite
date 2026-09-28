import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('legacy Daily Ration removal', () => {
  it('removes the legacy client helper and claim modal', () => {
    expect(existsSync(new URL('../client/src/lib/dailyReward.ts', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../client/src/components/DailyRewardModal.tsx', import.meta.url))).toBe(false);
  });

  it('does not register the legacy daily claim or streak logic', () => {
    const routes = read('../server/routes.ts');
    const storage = read('../server/storage.ts');

    expect(routes).not.toContain('/rewards/daily/claim');
    expect(routes).toContain('/rewards/hourly/claim');
    expect(storage).not.toContain('claimDailyReward');
    expect(storage).not.toContain('dailyRewardStreak');
    expect(storage).not.toContain('lastDailyRewardAt');
  });

  it('removes the Bonus Center ration entry and all bust-out/profile references', () => {
    const bonusCenter = read('../client/src/pages/BonusCenter.tsx');
    const bustOut = read('../client/src/components/game/BustOutModal.tsx');
    const profile = read('../client/src/pages/Profile.tsx');

    expect(bonusCenter).not.toContain('Daily Login Reward');
    expect(bonusCenter).not.toContain('Daily Ration');
    expect(bonusCenter).not.toContain('DailyRewardModal');
    expect(bonusCenter).toContain('HourlyBonusModal');
    expect(bonusCenter).toContain('StarterPackModal');
    expect(bustOut).not.toContain('Daily Ration');
    expect(bustOut).not.toContain('dailyBonus');
    expect(profile).not.toContain('DAILY STREAK');
    expect(profile).not.toContain('dailyReward');
  });

  it('keeps Home’s calendar bonus and its server claim route intact', () => {
    const home = read('../client/src/pages/Home.tsx');
    const routes = read('../server/routes.ts');

    expect(home).toContain('DailyBonusCalendarModal');
    expect(home).toContain('/daily-bonus/status');
    expect(routes).toContain('/daily-bonus/claim');
    expect(routes).toContain('/rewards/hourly/claim');
  });
});