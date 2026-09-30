import { expect, test } from '@playwright/test';

test.describe('shared Badugi, Dead 7 and Kamikaze betting controls', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 320, height: 640 } });
  test.setTimeout(30_000);

  test('each mode has the same usable custom, quick-bet, check/call/fold and all-in controls on a narrow touch screen', async ({ page }) => {
    await page.goto('/betting-controls-test.html');

    for (const mode of ['dead7', 'badugi', 'kamikaze'] as const) {
      await page.getByTestId(`select-mode-${mode}`).tap();
      const controls = page.getByTestId('betting-controls');
      await expect(controls).toBeVisible();

      const input = page.getByTestId('input-bet-amount');
      const inputBounds = await input.boundingBox();
      expect(inputBounds, `${mode} amount input should have a touch target`).not.toBeNull();
      expect(inputBounds!.height).toBeGreaterThanOrEqual(44);
      expect(inputBounds!.width).toBeGreaterThan(90);

      for (const shortcut of ['quarter-pot', 'half-pot', 'pot', 'two-pot']) {
        await expect(page.getByTestId(`button-bet-${shortcut}`)).toBeVisible();
      }

      await input.fill('800');
      await page.getByTestId('button-raise').tap();
      await expect(page.getByTestId('last-action')).toHaveText(`${mode}:raise:800`);

      await page.getByTestId('button-bet-quarter-pot').tap();
      await expect(input).toHaveValue('750');
      await page.getByTestId('button-raise').tap();
      await expect(page.getByTestId('last-action')).toHaveText(`${mode}:raise:750`);

      const allIn = page.getByTestId('button-all-in');
      const allInBounds = await allIn.boundingBox();
      expect(allInBounds!.height).toBeGreaterThanOrEqual(44);
      await allIn.tap();
      await expect(page.getByTestId('last-action')).toHaveText(`${mode}:raise:1500`);

      await page.getByTestId('button-fold').tap();
      await expect(page.getByTestId('last-action')).toHaveText(`${mode}:fold`);

      await page.getByTestId('set-call-state').tap();
      await page.getByTestId('button-call').tap();
      await expect(page.getByTestId('last-action')).toHaveText(`${mode}:call`);

      await page.getByTestId('set-check-state').tap();
      await page.getByTestId('button-check').tap();
      await expect(page.getByTestId('last-action')).toHaveText(`${mode}:check`);
    }

    const dimensions = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  });
});