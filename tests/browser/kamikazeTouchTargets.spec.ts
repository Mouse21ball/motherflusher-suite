import { expect, test } from '@playwright/test';

test.describe('Kamikaze six-card fan on narrow touch screens', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 320, height: 568 } });

  test('each card position receives a real touch at narrow Android viewport widths', async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto('/kamikaze-touch-test.html');
    const cards = page.locator('[data-player-seat="hero"] button');

    for (const width of [320, 360, 375]) {
      await page.setViewportSize({ width, height: 568 });
      await expect(cards).toHaveCount(6);

      for (let index = 0; index < 6; index += 1) {
        const card = cards.nth(index);
        const bounds = await card.boundingBox();
        expect(bounds, `card ${index} must have a visible touch target at ${width}px`).not.toBeNull();
        const x = bounds!.x + bounds!.width / 2;
        const y = bounds!.y + bounds!.height / 2;
        const topmostCardIndex = await page.evaluate(({ x: pointX, y: pointY }) => {
          const hit = document.elementFromPoint(pointX, pointY);
          const hero = document.querySelector('[data-player-seat="hero"]');
          const buttons = hero ? Array.from(hero.querySelectorAll('button')) : [];
          return hit ? buttons.indexOf(hit.closest('button')) : -1;
        }, { x, y });
        expect(topmostCardIndex, `touch point for card ${index} at ${width}px is intercepted by card ${topmostCardIndex}`).toBe(index);

        await page.touchscreen.tap(x, y);
        await expect(page.getByTestId('selection-state')).toHaveText(String(index));
        await page.getByTestId('clear-selection').click();
        await expect(page.getByTestId('selection-state')).toHaveText('');
      }
    }
  });
});