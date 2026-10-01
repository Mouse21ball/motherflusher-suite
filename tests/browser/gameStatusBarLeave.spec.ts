import { expect, test } from '@playwright/test';

test.describe('Game status bar waits for persisted leave settlement', () => {
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

    await expect(page.getByTestId('leave-pending')).toHaveText('Saving your table stack…');
    await expect(page.getByTestId('route')).toHaveText('/table');
    await page.getByTestId('button-menu').tap();
    await expect(page.getByTestId('link-lobby-menu')).toBeDisabled();
    await expect(page.getByTestId('leave-calls')).toHaveText('1');
    await page.evaluate(() => window.dispatchEvent(new Event('qa:complete-leave')));
    await expect(page.getByTestId('route')).toHaveText('/');
  });

  test('a failed regular exit stays at the table and exposes the error', async ({ page }) => {
    await page.getByTestId('button-menu').tap();
    await page.getByTestId('link-lobby-menu').tap();
    await page.evaluate(() => window.dispatchEvent(new Event('qa:reject-leave')));

    await expect(page.getByTestId('leave-error')).toHaveText('Balance save failed');
    await expect(page.getByTestId('route')).toHaveText('/table');
  });

  test('mid-hand exit still requires confirmation, then waits for settlement', async ({ page }) => {
    await page.getByTestId('use-betting-phase').tap();
    await page.getByTestId('button-menu').tap();
    await page.getByTestId('link-lobby-menu').tap();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByTestId('leave-calls')).toHaveText('0');

    await page.getByTestId('button-confirm-leave').tap();
    await expect(page.getByTestId('leave-pending')).toHaveText('Saving your table stack…');
    await expect(page.getByTestId('route')).toHaveText('/table');
    await page.evaluate(() => window.dispatchEvent(new Event('qa:complete-leave')));
    await expect(page.getByTestId('route')).toHaveText('/');
  });

  test('failed mid-hand settlement keeps the leave confirmation open', async ({ page }) => {
    await page.getByTestId('use-betting-phase').tap();
    await page.getByTestId('button-menu').tap();
    await page.getByTestId('link-lobby-menu').tap();
    await page.getByTestId('button-confirm-leave').tap();
    await page.evaluate(() => window.dispatchEvent(new Event('qa:reject-leave')));

    await expect(page.getByTestId('leave-error')).toHaveText('Balance save failed');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByTestId('route')).toHaveText('/table');
  });
});