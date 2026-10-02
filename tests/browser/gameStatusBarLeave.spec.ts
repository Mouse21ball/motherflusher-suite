import { expect, test } from '@playwright/test';

test.describe('Game status bar always provides a lobby escape', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 320, height: 640 } });
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/players/*/referral-code', route =>
      route.fulfill({ json: { referralCode: 'QA1234' } }),
    );
    await page.route('**/api/auth/guest-init', route =>
      route.fulfill({
        json: {
          profileId: 'qa-player',
          displayName: 'QA Player',
          chipBalance: 500,
          stripes: 0,
          handsPlayed: 0,
          lifetimeProfit: 0,
          level: 1,
          xp: 0,
          hasAuth: false,
          email: null,
          avatarId: null,
          equippedAvatarId: null,
          equippedFrameId: null,
          equippedNameColorId: null,
          lastNameChangeAt: null,
          nextResetAt: null,
          sessionToken: 'qa-session',
          activeSubscriptionTier: null,
          subscriptionExpiresAt: null,
          equippedLobbyTrack: null,
          equippedGameTrack: null,
          equippedLadyLuckTrack: null,
        },
      }),
    );
    await page.goto('/game-status-bar-test.html');
  });

  test('a regular lobby exit awaits settlement and ignores duplicate taps', async ({ page }) => {
    await page.getByTestId('button-menu').tap();
    await page.getByTestId('link-lobby-menu').tap();

    await expect(page.getByTestId('leave-pending')).toContainText('Saving your table stack…');
    await expect(page.getByTestId('route')).toHaveText('/table');
    await page.getByTestId('button-menu').tap();
    await expect(page.getByTestId('link-lobby-menu')).toBeDisabled();
    await expect(page.getByTestId('leave-calls')).toHaveText('1');
    await page.evaluate(() => window.dispatchEvent(new Event('qa:complete-leave')));
    await expect(page.getByTestId('route')).toHaveText('/');
  });

  test('the lobby exit is directly available without opening the menu', async ({ page }) => {
    const exitToLobby = page.getByTestId('button-exit-lobby');
    await expect(exitToLobby).toBeVisible();
    await exitToLobby.tap();

    await expect(page.getByTestId('leave-pending')).toContainText('Saving your table stack…');
    await expect(page.getByTestId('route')).toHaveText('/table');
    await expect(page.getByTestId('leave-calls')).toHaveText('1');

    await page.evaluate(() => window.dispatchEvent(new Event('qa:complete-leave')));
    await expect(page.getByTestId('route')).toHaveText('/');
  });

  test('a direct mid-hand lobby exit still requires forfeit confirmation', async ({ page }) => {
    await page.getByTestId('use-betting-phase').tap();
    await page.getByTestId('button-exit-lobby').tap();

    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByTestId('leave-calls')).toHaveText('0');
    await page.getByTestId('button-confirm-leave').tap();
    await expect(page.getByTestId('leave-pending')).toContainText('Saving your table stack…');
    await expect(page.getByTestId('route')).toHaveText('/table');

    await page.evaluate(() => window.dispatchEvent(new Event('qa:complete-forfeit')));
    await expect(page.getByTestId('leave-calls')).toHaveText('1');
    await page.evaluate(() => window.dispatchEvent(new Event('qa:complete-leave')));
    await expect(page.getByTestId('route')).toHaveText('/');
  });

  test('a rejected regular settlement automatically returns to the lobby', async ({ page }) => {
    await page.getByTestId('button-menu').tap();
    await page.getByTestId('link-lobby-menu').tap();
    await page.evaluate(() => window.dispatchEvent(new Event('qa:reject-leave')));

    await expect(page.getByTestId('leave-error')).toHaveText('Balance save failed');
    await expect(page.getByTestId('route')).toHaveText('/');
  });

  test('mid-hand exit still requires confirmation, then waits for settlement', async ({ page }) => {
    await page.getByTestId('use-betting-phase').tap();
    await page.getByTestId('button-menu').tap();
    await page.getByTestId('link-lobby-menu').tap();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByTestId('leave-calls')).toHaveText('0');

    await page.getByTestId('button-confirm-leave').tap();
    await expect(page.getByTestId('leave-pending')).toContainText('Saving your table stack…');
    await expect(page.getByTestId('route')).toHaveText('/table');
    await page.evaluate(() => window.dispatchEvent(new Event('qa:complete-forfeit')));
    await expect(page.getByTestId('leave-calls')).toHaveText('1');
    await page.evaluate(() => window.dispatchEvent(new Event('qa:complete-leave')));
    await expect(page.getByTestId('route')).toHaveText('/');
  });

  test('failed mid-hand settlement returns home without claiming settlement succeeded', async ({ page }) => {
    await page.getByTestId('use-betting-phase').tap();
    await page.getByTestId('button-menu').tap();
    await page.getByTestId('link-lobby-menu').tap();
    await page.getByTestId('button-confirm-leave').tap();
    await page.evaluate(() => window.dispatchEvent(new Event('qa:complete-forfeit')));
    await expect(page.getByTestId('leave-calls')).toHaveText('1');
    await page.evaluate(() => window.dispatchEvent(new Event('qa:reject-leave')));

    await expect(page.getByTestId('leave-error')).toHaveText('Balance save failed');
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(page.getByTestId('route')).toHaveText('/');
  });

  test('a hanging leave can be escaped locally and ignores late completion', async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('qa:set-hanging', { detail: { leave: true } })));
    await page.getByTestId('button-exit-lobby').tap();
    await expect(page.getByTestId('leave-pending')).toBeVisible();
    await page.getByTestId('button-return-anyway').tap();
    await expect(page.getByTestId('route')).toHaveText('/');
    await page.evaluate(() => window.dispatchEvent(new Event('qa:complete-leave')));
    await expect(page.getByTestId('route')).toHaveText('/');
    await expect(page.getByTestId('leave-calls')).toHaveText('1');
  });

  test('a hanging mid-hand forfeit has an in-dialog lobby escape', async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('qa:set-hanging', { detail: { forfeit: true } })));
    await page.getByTestId('use-betting-phase').tap();
    await page.getByTestId('button-exit-lobby').tap();
    await page.getByTestId('button-confirm-leave').tap();
    await expect(page.getByTestId('leave-pending')).toBeVisible();
    await expect(page.getByTestId('button-return-anyway-dialog')).toBeVisible();
    await page.getByTestId('button-return-anyway-dialog').tap();
    await expect(page.getByTestId('route')).toHaveText('/');
    await expect(page.getByTestId('leave-calls')).toHaveText('0');
    await expect(page.getByTestId('forfeit-calls')).toHaveText('1');
  });

  test('a hung settlement independently returns home within eight seconds', async ({ page }) => {
    await page.clock.install();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('qa:set-hanging', { detail: { leave: true } })));
    await page.getByTestId('button-exit-lobby').tap();
    await expect(page.getByTestId('leave-pending')).toBeVisible();
    await page.clock.runFor(8001);
    await expect(page.getByTestId('route')).toHaveText('/');
  });
});