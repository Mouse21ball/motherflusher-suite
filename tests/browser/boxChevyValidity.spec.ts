import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]) {
  test.describe(`Box Chevy live warning ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true });
    test('warns before declaration and updates immediately after a repaired draw', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/box-chevy-validity-test.html');
      const indicator = page.getByTestId('text-hero-made-status');
      await expect(indicator).toBeVisible();
      await expect(indicator).toHaveAttribute('data-validity', 'invalid');
      await expect(indicator).toContainText('WILL AUTO-FOLD AT DECLARE');
      await page.getByRole('button', { name: 'Repair hand' }).tap();
      await expect(indicator).toHaveAttribute('data-validity', 'valid');
      await expect(indicator).not.toContainText('AUTO-FOLD');
      await page.getByRole('button', { name: 'Enter declaration' }).tap();
      await expect(indicator).toHaveAttribute('data-validity', 'valid');
      expect(errors).toEqual([]);
    });
  });
}
