import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 30_000 });

// Restore the guest storage that survives an app update, without hitting the
// production API or changing the app's bootstrap/rendering path.
async function openReturningGuest(page: Page, legacyNameOnly = false) {
  await page.addInitScript((legacy: boolean) => {
    localStorage.setItem('cgp_age_17_confirmed', '1');
    localStorage.setItem('poker_table_player_name', 'Returning Guest');
    if (!legacy) {
      localStorage.setItem('poker_table_identity', JSON.stringify({
        id: 'welcome-upgrade-fixture',
        name: 'Returning Guest',
        avatarSeed: 'Returning Guest',
        createdAt: 1,
      }));
    }
  }, legacyNameOnly);

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      const profile = {
        profileId: 'welcome-upgrade-fixture', displayName: 'Returning Guest',
        chipBalance: 25000, stripes: 0, handsPlayed: 0, lifetimeProfit: 0,
        hasAuth: false, level: 1, xp: 0, welcomeKitClaimed: true,
        activeSubscriptionTier: null, sessionToken: 'synthetic-welcome-fixture-session',
      };
      let body: unknown = {};
      if (['/api/auth/me', '/api/auth/guest-init', '/api/players/welcome-upgrade-fixture'].includes(url.pathname)) body = profile;
      else if (url.pathname.includes('/quests')) body = { quests: [], claimed: [] };
      else if (['/cosmetics', '/friends', '/crews'].some(part => url.pathname.includes(part)) || url.pathname === '/api/tables') body = [];
      else if (url.pathname.includes('/notifications')) body = { count: 0, notifications: [], preferences: {} };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    } else if (['localhost', '127.0.0.1'].includes(url.hostname)) {
      await route.continue();
    } else {
      await route.fulfill({ status: 204, body: '' });
    }
  });
  await page.routeWebSocket(url => url.pathname === '/ws', socket => socket.close());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Skip Chain Gang Poker introduction' }).click();
  await expect(page.getByRole('button', { name: 'Skip Chain Gang Poker introduction' })).toHaveCount(0);
  await expect(page.getByTestId('button-welcome-back-play')).toBeVisible();
}

// Tap the gold button painted INSIDE the poster. Clicking a locator alone
// misses the regression: the old transparent locator was tappable, but sat
// somewhere different from the visible artwork on iPad.
async function tapPaintedPlayButton(page: Page) {
  await expect.poll(() => page.getByAltText('Chain Gang Poker — Welcome Back').evaluate(
    image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
  )).toBe(true);
  const target = await page.getByAltText('Chain Gang Poker — Welcome Back').evaluate(image => {
    const img = image as HTMLImageElement;
    const rect = img.getBoundingClientRect();
    const fit = getComputedStyle(img).objectFit;
    const scale = fit === 'cover'
      ? Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
      : Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    const x = rect.left + (rect.width - width) / 2 + width * 0.5;
    const y = rect.top + (rect.height - height) / 2 + height * 0.768;
    return {
      x, y, loaded: img.complete && img.naturalWidth === 941 && img.naturalHeight === 1672,
      hit: document.elementFromPoint(x, y)?.closest('button')?.getAttribute('data-testid'),
    };
  });
  expect(target.loaded, 'the bundled welcome-back poster must decode').toBe(true);
  expect(target.x).toBeGreaterThan(0);
  expect(target.y).toBeGreaterThan(0);
  expect(target.x).toBeLessThan(page.viewportSize()!.width);
  expect(target.y).toBeLessThan(page.viewportSize()!.height);
  expect(target.hit, `painted Play now at (${target.x}, ${target.y}) must hit its button`).toBe('button-welcome-back-play');
  await page.touchscreen.tap(target.x, target.y);
}

for (const viewport of [
  { label: 'iPad Air 11 portrait', width: 820, height: 1180 },
  { label: 'iPad Air 11 landscape', width: 1180, height: 820 },
  { label: 'iPhone portrait', width: 390, height: 844 },
]) {
  test.describe(viewport.label, () => {
    test.use({ viewport, hasTouch: true });

    for (const legacyNameOnly of [false, true]) {
      test(`${legacyNameOnly ? 'legacy' : 'persisted identity'} guest taps the artwork and reaches Home after an upgrade`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error') errors.push(message.text());
        });
        await openReturningGuest(page, legacyNameOnly);
        await tapPaintedPlayButton(page);
        await expect(page.getByTestId('button-welcome-back-play')).toHaveCount(0);
        await expect(page.getByTestId('text-bankroll')).toHaveText('$25,000');
        await expect(page.getByTestId('button-play-badugi')).toBeVisible();
        await expect(page.getByTestId(/^button-play-/)).toHaveCount(4);
        for (const id of ['badugi', 'flushedup', 'ladyluck', 'box_chevy']) {
          await expect(page.getByTestId(`button-play-${id}`)).toHaveCount(1);
        }
        expect(errors).toEqual([]);
      });
    }

    test('rotation keeps the painted button aligned and tappable', async ({ page }) => {
      await openReturningGuest(page);
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await tapPaintedPlayButton(page);
      await expect(page.getByTestId('text-bankroll')).toBeVisible();
    });
  });
}

test('returning guest can enter Home using the keyboard', async ({ page }) => {
  await openReturningGuest(page);
  await page.getByRole('button', { name: 'Play now', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('text-bankroll')).toBeVisible();
});
