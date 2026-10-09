import { expect, test } from '@playwright/test';
test.setTimeout(25000);

for (const viewport of [
  { label: 'phone', width: 390, height: 844 },
  { label: 'iPad portrait', width: 820, height: 1180 },
  { label: 'iPad landscape', width: 1180, height: 820 },
]) {
  test.describe(viewport.label, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('all three real game tables use one accent-themed board without horizontal overflow', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/yard-reskin-test.html');
      for (const mode of [
        { id: 'badugi', accent: '#8B5CF6' },
        { id: 'flushed_up', accent: '#D946EF' },
        { id: 'box_chevy', accent: '#F97316' },
      ]) {
        await page.getByTestId(`fixture-mode-${mode.id}`).click();
        const board = page.locator('.yard-table-board');
        await expect(board).toHaveCount(1);
        await expect(board).toBeVisible();
        expect(await board.evaluate(element => getComputedStyle(element).getPropertyValue('--table-accent').trim())).toBe(mode.accent);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        await expect(page.getByText(/Yard King/).first()).toBeVisible();
        if (viewport.label === 'phone') await page.screenshot({ path: `/tmp/yard-table-${mode.id}.png` });
      }
      expect(errors).toEqual([]);
    });

    test('Badugi visible cards remain selectable and betting sends the original action', async ({ page }) => {
      await page.goto('/yard-reskin-test.html');
      const card = page.getByTestId('badugi-card-0').locator('button');
      await expect(card).toBeVisible();
      await card.click();
      await expect(page.getByTestId('fixture-selected')).toHaveText('0');
      await card.click();
      await expect(page.getByTestId('fixture-selected')).toHaveText('');
      await page.getByTestId('fixture-bet').click();
      await page.getByTestId('button-check').click();
      await expect(page.getByTestId('fixture-action')).toHaveText('check:');
      await page.getByTestId('fixture-rival-turn').click();
      await expect(page.getByTestId('button-check')).toHaveCount(0);
      await expect(page.locator('.yard-table-board')).toBeVisible();
    });
  });
}
