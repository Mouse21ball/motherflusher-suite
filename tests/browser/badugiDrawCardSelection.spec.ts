import { expect, test } from '@playwright/test';

test.setTimeout(30_000);

async function openDrawHarness(page: Parameters<typeof test>[0]['page'], width = 375) {
  await page.setViewportSize({ width, height: 720 });
  await page.goto('/badugi-draw-test.html');
  await expect(page.getByTestId('draw-phase')).toHaveText('DRAW_3');
  await page.waitForTimeout(250);
}

async function tapCardCenter(page: Parameters<typeof test>[0]['page'], index: number) {
  const target = page.getByTestId(`badugi-card-${index}`).locator('button');
  await expect(target).toBeVisible();
  const point = await target.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    const hitCard = hit?.closest<HTMLElement>('[data-testid^="badugi-card-"]');
    return { x, y, hitTestId: hitCard?.dataset.testid ?? null };
  });
  await page.touchscreen.tap(point.x, point.y);
  return point.hitTestId;
}

test.describe('Badugi draw card touch targets', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
  });

  test('taps on every position in the Badugi hero fan hit the matching card button', async ({ page }) => {
    await openDrawHarness(page);
    for (let index = 0; index < 4; index += 1) {
      if (index > 0) {
        await openDrawHarness(page);
      }
      expect(await tapCardCenter(page, index)).toBe(`badugi-card-${index}`);
      await expect(page.getByTestId('last-tapped')).toHaveText(String(index));
      await expect(page.getByTestId('selected-cards')).toHaveText(String(index));
    }
  });

  test('keeps every card tappable after the draw-limit selection is raised', async ({ page }) => {
    for (let selectedIndex = 0; selectedIndex < 4; selectedIndex += 1) {
      await openDrawHarness(page);
      expect(await tapCardCenter(page, selectedIndex)).toBe(`badugi-card-${selectedIndex}`);
      await expect(page.getByTestId('selected-cards')).toHaveText(String(selectedIndex));
      await page.waitForTimeout(250);

      const nextIndex = (selectedIndex + 1) % 4;
      expect(await tapCardCenter(page, nextIndex)).toBe(`badugi-card-${nextIndex}`);
      await expect(page.getByTestId('last-tapped')).toHaveText(String(nextIndex));
      await expect(page.getByTestId('selected-cards')).toHaveText(String(selectedIndex));
    }
  });

  test('respects draw-round limits and supports deselecting and selecting another card on a narrow phone', async ({ page }) => {
    await openDrawHarness(page, 320);

    for (const round of [
      { phase: 'DRAW_1', limit: 3, positions: [3, 1, 0] },
      { phase: 'DRAW_2', limit: 2, positions: [2, 0] },
      { phase: 'DRAW_3', limit: 1, positions: [1] },
    ]) {
      await page.getByTestId(`phase-${round.phase}`).tap();
      await expect(page.getByTestId('draw-phase')).toHaveText(round.phase);
      await expect(page.getByTestId('selected-cards')).toHaveText('');
      await page.waitForTimeout(250);

      for (const index of round.positions) {
        expect(await tapCardCenter(page, index)).toBe(`badugi-card-${index}`);
        await expect(page.getByTestId('selected-cards')).toHaveText(
          round.positions.slice(0, round.positions.indexOf(index) + 1).join(','),
        );
      }
      expect(round.positions).toHaveLength(round.limit);

      const selected = [...round.positions];
      const extraIndex = [0, 1, 2, 3].find(index => !selected.includes(index))!;
      expect(await tapCardCenter(page, extraIndex)).toBe(`badugi-card-${extraIndex}`);
      await expect(page.getByTestId('last-tapped')).toHaveText(String(extraIndex));
      await expect(page.getByTestId('selected-cards')).toHaveText(selected.join(','));

      const removedIndex = selected[0];
      expect(await tapCardCenter(page, removedIndex)).toBe(`badugi-card-${removedIndex}`);
      const deselected = selected.slice(1);
      await expect(page.getByTestId('selected-cards')).toHaveText(deselected.join(','));
      expect(await tapCardCenter(page, extraIndex)).toBe(`badugi-card-${extraIndex}`);
      await expect(page.getByTestId('selected-cards')).toHaveText([...deselected, extraIndex].join(','));
    }

    await page.getByTestId('phase-BET_4').tap();
    await expect(page.getByTestId('draw-phase')).toHaveText('BET_4');
    await expect(page.getByTestId('badugi-card-0').locator('button')).toHaveCount(0);
  });
});