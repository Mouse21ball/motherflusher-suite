import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 30_000 });

async function openYard(page: Page, handsPlayed = 1000) {
  const claimed: string[] = [];
  const claims: string[] = [];
  let dailyClaims = 0;
  let chipBalance = 25000;
  let stripes = 100;
  await page.addInitScript(() => {
    localStorage.setItem('cgp_age_17_confirmed', '1');
    localStorage.setItem('poker_table_player_name', 'QA Player');
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const profile = {
      profileId: 'yard-surface-fixture', displayName: 'QA Player', chipBalance,
      stripes, handsPlayed, lifetimeProfit: 0, hasAuth: true, level: 4, xp: 1200,
      welcomeKitClaimed: true, activeSubscriptionTier: null,
      sessionToken: 'synthetic-yard-surface-session',
    };
    let body: unknown = {};
    if (path === '/api/auth/me' || path === '/api/auth/guest-init' || path === '/api/players/yard-surface-fixture') body = profile;
    else if (path.endsWith('/quests/claim')) {
      const questId = route.request().postDataJSON().questId;
      claims.push(questId);
      claimed.push(questId);
      stripes += 5;
      body = { stripesGranted: 5, newTotal: stripes };
    } else if (path.endsWith('/quests')) body = {
      claimed, handsPlayed, handsPlayedBadugi: handsPlayed,
      handsPlayedFlushedUp: handsPlayed, handsPlayedLadyLuck: handsPlayed,
      handsPlayedBoxChevy: handsPlayed,
    };
    else if (path.endsWith('/daily-bonus/claim')) {
      dailyClaims++;
      chipBalance += 1000;
      body = { chipsGranted: 1000, stripesGranted: 0, newStreakDay: 3, newChipBalance: chipBalance,
        newStripesBalance: stripes, nextClaimAvailableAt: new Date(Date.now() + 86400000).toISOString() };
    }
    else if (path.endsWith('/daily-bonus/status')) body = {
      canClaim: dailyClaims === 0, currentStreakDay: 3, nextClaimAvailableAt: new Date().toISOString(),
      todaysReward: { chips: 1000, stripes: 0 },
    };
    else if (path.endsWith('/rewards/status')) body = {
      hourly: { available: true, chips: 100, nextAt: null },
      welcomeKitClaimed: true,
    };
    else if (path.includes('/cosmetics') || path === '/api/tables' || path.includes('/friends') || path.includes('/crews')) body = [];
    else if (path.includes('/notifications')) body = { count: 0, notifications: [], preferences: {} };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip Chain Gang Poker introduction' }).click();
  await page.getByTestId('button-welcome-back-play').click();
  await expect(page.getByTestId('text-bankroll')).toBeVisible();
  return { claims, dailyClaimCount: () => dailyClaims };
}

for (const viewport of [
  { label: 'phone', width: 390, height: 844, columns: 2 },
  { label: 'iPad', width: 820, height: 1180, columns: 4 },
]) {
  test.describe(`yard surfaces ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('Home loads four real art tiles with responsive columns and active navigation', async ({ page }) => {
      await openYard(page);
      const grid = page.locator('.yard-game-grid');
      expect(await grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(viewport.columns);
      for (const mode of ['badugi', 'flushedup', 'ladyluck', 'box_chevy']) {
        const card = page.getByTestId(`button-mode-${mode}`);
        await expect(card).toBeVisible();
        const bounds = await card.boundingBox();
        expect(bounds!.width).toBeGreaterThanOrEqual(160);
        expect(bounds!.height).toBeGreaterThanOrEqual(200);
        const artBounds = await card.locator('img.yard-card-art').boundingBox();
        expect(artBounds!.width).toBeLessThanOrEqual(bounds!.width * 1.05);
        expect(artBounds!.height).toBeLessThanOrEqual(bounds!.height * 1.05);
        await expect.poll(() => card.locator('img.yard-card-art').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      }
      await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'HOME', exact: true })).toHaveAttribute('aria-current', 'page');
      await page.screenshot({ path: `/tmp/yard-home-${viewport.label}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });

    test('Missions navigation activates its tab and claims through the original quest endpoint', async ({ page }) => {
      const { claims } = await openYard(page);
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'MISSIONS', exact: true }).click();
      await expect(page).toHaveURL(/\/missions$/);
      await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'MISSIONS', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByText('DAILY MISSIONS', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('WEEKLY MISSIONS', { exact: true }).first()).toBeVisible();
      await page.screenshot({ path: `/tmp/yard-missions-${viewport.label}.png` });
      await page.locator('.yard-mission-state.is-claim').first().click();
      await expect.poll(() => claims.length).toBe(1);
      expect(claims[0]).toMatch(/^daily_/);
      await expect(page.getByRole('button', { name: 'DONE', exact: true }).first()).toBeDisabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });

    test('My Chips displays inline streak and existing approved purchases without personal chip SKUs', async ({ page }) => {
      const { dailyClaimCount } = await openYard(page);
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'MY CHIPS', exact: true }).click();
      await expect(page).toHaveURL(/\/shop$/);
      await expect(page.getByText('YOUR CHIP BALANCE', { exact: true })).toBeVisible();
      for (let day = 1; day <= 7; day++) {
        await expect(page.getByText(new RegExp(`^Day ${day}$`, 'i')).first()).toBeVisible();
      }
      await expect(page.getByTestId('button-buy-personal-chips-small')).toHaveCount(0);
      await expect(page.getByTestId('button-buy-stripes_starter_99')).toBeVisible();
      await page.screenshot({ path: `/tmp/yard-chips-${viewport.label}.png` });
      await page.getByTestId('day-card-3').click();
      await expect.poll(dailyClaimCount).toBe(1);
      await expect(page.getByTestId('text-bankroll')).toContainText('26,000');
      await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'MY CHIPS', exact: true })).toHaveAttribute('aria-current', 'page');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  });
}
