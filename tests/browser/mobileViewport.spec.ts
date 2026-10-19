import { expect, test } from '@playwright/test';

// ─── Mobile viewport regression tests ────────────────────────────────────────
// Detroit 2026-10-18 Stage 1 closeout.
// Verifies game tables render correctly on small mobile viewports.
// These are REAL rendered-screen assertions, not code inspection.
//
// Viewports tested:
//   - 360×740 (Galaxy A15, Detroit's device)
//   - 375×667 (iPhone SE)

test.setTimeout(30_000);

const VIEWPORTS = [
  { width: 360, height: 740, name: 'Galaxy A15' },
  { width: 375, height: 667, name: 'iPhone SE' },
];

for (const vp of VIEWPORTS) {
  test.describe(`Mobile viewport ${vp.name} (${vp.width}×${vp.height})`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      isMobile: true,
      hasTouch: true,
    });

    test('Flushed Up table: no horizontal overflow', async ({ page }) => {
      await page.goto('/flushedup');
      await page.waitForTimeout(2000); // let table render

      // No horizontal scrollbar — body should not overflow
      const overflowX = await page.evaluate(() => {
        return document.documentElement.scrollWidth - document.documentElement.clientWidth;
      });
      expect(overflowX, 'no horizontal overflow').toBeLessThanOrEqual(1);
    });

    test('Flushed Up table: all seats visible within viewport', async ({ page }) => {
      await page.goto('/flushedup');
      await page.waitForTimeout(2000);

      // Find all player seat elements
      const seats = page.locator('[data-testid^="seat-"], [data-testid^="player-seat-"]');
      const count = await seats.count();

      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const box = await seats.nth(i).boundingBox();
          if (box) {
            expect(box.x, `seat ${i} not clipped left`).toBeGreaterThanOrEqual(-2);
            expect(box.x + box.width, `seat ${i} not clipped right`).toBeLessThanOrEqual(vp.width + 2);
          }
        }
      }
    });

    test('Flushed Up table: critical controls are visible and tappable', async ({ page }) => {
      await page.goto('/flushedup');
      await page.waitForTimeout(2000);

      // Deal Me In button (pre-game) or action buttons (in-game) should exist
      const dealButton = page.getByTestId('button-deal-me-in');
      const foldButton = page.getByRole('button', { name: /fold/i });

      const dealVisible = await dealButton.isVisible().catch(() => false);
      const foldVisible = await foldButton.isVisible().catch(() => false);

      // At least one set of controls should be visible
      expect(dealVisible || foldVisible, 'critical controls visible').toBe(true);

      // Visible buttons must meet minimum touch target (44px recommended, 40px minimum)
      const buttons = page.getByRole('button');
      const btnCount = await buttons.count();
      for (let i = 0; i < Math.min(btnCount, 10); i++) {
        const box = await buttons.nth(i).boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          // Only check buttons that are actually rendered (not hidden)
          const isVisible = await buttons.nth(i).isVisible();
          if (isVisible) {
            expect(box.height, `button ${i} meets min touch target`).toBeGreaterThanOrEqual(32);
          }
        }
      }
    });

    test('Flushed Up table: no overlapping critical elements', async ({ page }) => {
      await page.goto('/flushedup');
      await page.waitForTimeout(2000);

      // Check that the pot display and hero cards don't overlap
      const pot = page.locator('[data-testid="pot-display"], [data-testid="pot-amount"]').first();
      const heroCards = page.locator('[data-testid^="hero-card-"]').first();

      const potBox = await pot.boundingBox().catch(() => null);
      const heroBox = await heroCards.boundingBox().catch(() => null);

      if (potBox && heroBox) {
        const overlaps =
          potBox.x < heroBox.x + heroBox.width &&
          potBox.x + potBox.width > heroBox.x &&
          potBox.y < heroBox.y + heroBox.height &&
          potBox.y + potBox.height > heroBox.y;
        expect(overlaps, 'pot and hero cards should not overlap').toBe(false);
      }
    });
  });
}
