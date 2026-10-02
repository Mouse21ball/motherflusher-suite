import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 30_000 });

async function openHome(page: Page, chipBalance: number) {
  await page.addInitScript(() => {
    localStorage.setItem('cgp_age_17_confirmed', '1');
    localStorage.setItem('poker_table_player_name', 'QA Player');
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const profile = {
      profileId: 'home-recovery-fixture', displayName: 'QA Player', chipBalance,
      stripes: 0, handsPlayed: 0, lifetimeProfit: 0, hasAuth: true, level: 1, xp: 0,
      welcomeKitClaimed: true, activeSubscriptionTier: null,
      sessionToken: 'synthetic-home-fixture-session',
    };
    let body: unknown = {};
    if (path === '/api/auth/me' || path === '/api/auth/guest-init' || path === '/api/players/home-recovery-fixture') body = profile;
    else if (path.includes('/quests')) body = { quests: [], claimed: [] };
    else if (path.includes('/cosmetics') || path === '/api/tables' || path.includes('/friends') || path.includes('/crews')) body = [];
    else if (path.includes('/notifications')) body = { count: 0, notifications: [], preferences: {} };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip Chain Gang Poker introduction' }).click();
  await page.getByTestId('button-welcome-back-play').click();
  await expect(page.getByTestId('text-bankroll')).toBeVisible();
}

test('zero-chip Home explains the balance and links to the existing chip shop', async ({ page }) => {
  await openHome(page, 0);
  await expect(page.getByTestId('text-bankroll')).toHaveText("You're out of chips");
  await page.getByTestId('button-home-get-chips').click();
  await expect(page).toHaveURL(/\/shop$/);
});

test('funded Home retains the normal balance without the broke-state action', async ({ page }) => {
  await openHome(page, 25000);
  await expect(page.getByTestId('text-bankroll')).toHaveText('$25,000');
  await expect(page.getByTestId('button-home-get-chips')).toHaveCount(0);
});