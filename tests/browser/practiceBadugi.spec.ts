import { expect, test, type Page } from '@playwright/test';

test.setTimeout(45_000);

const visibleBetAction = /^(Check|Call \d+|All-in \d+)$/;

async function expectGuide(page: Page, title: string, status: string) {
  const guide = page.getByTestId('practice-guide');
  await expect(guide).toBeVisible();
  await expect(guide.getByText(title, { exact: true }).last()).toBeVisible();
  await expect(page.getByTestId('practice-guide-turn-status')).toHaveText(status);
}

async function clickVisibleControl(page: Page, control: ReturnType<Page['getByRole']>) {
  await expect(control).toBeVisible();
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport();
  await control.click();
}

async function finishBettingRound(page: Page, nextGuideTitle: string, openWithBet = false) {
  const guide = page.getByTestId('practice-guide');
  const nextTitle = guide.getByText(nextGuideTitle, { exact: true });
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await nextTitle.isVisible().catch(() => false)) return;

    if (openWithBet) {
      const betButton = page.getByRole('button', { name: 'Bet', exact: true });
      if (await betButton.isVisible().catch(() => false)) {
        await clickVisibleControl(page, betButton);
        openWithBet = false;
        continue;
      }
    }

    const action = page.getByRole('button', { name: visibleBetAction }).first();
    if (await action.isVisible().catch(() => false)) {
      await clickVisibleControl(page, action);
    } else {
      await page.waitForTimeout(50);
    }
  }
  await expect(nextTitle).toBeVisible();
}

test('direct Badugi practice walkthrough stays usable under expanded guidance on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const apiRequests: string[] = [];
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (/^\/api(?:\/|$)/.test(pathname)) apiRequests.push(request.url());
  });

  await page.goto('/practice/badugi');
  await page.getByRole('button', { name: /I am 17 or older/ }).click();

  await expectGuide(page, 'Ready to start', 'Ready to start');
  await page.getByTestId('button-practice-guide-expand').click();
  await expect(page.getByTestId('practice-guide-details')).toBeVisible();
  await expect(page.getByTestId('practice-guide-details')).toContainText('Other practice modes coming later');

  await clickVisibleControl(page, page.getByRole('button', { name: 'Start one-hand practice' }));
  await expectGuide(page, 'Ante', 'Your turn');

  await clickVisibleControl(page, page.getByRole('button', { name: 'Post 25 practice-chip ante' }));
  await expectGuide(page, 'Deal', 'Your turn');

  await clickVisibleControl(page, page.getByRole('button', { name: 'Deal four cards' }));
  await expectGuide(page, 'Draw 1', 'Your turn');

  await clickVisibleControl(page, page.getByRole('button', { name: 'Stand pat', exact: true }));
  await expectGuide(page, 'Betting round', 'Your turn');
  await expect(page.getByRole('button', { name: 'Bet', exact: true })).toBeVisible();
  await finishBettingRound(page, 'Draw 2', true);
  await expectGuide(page, 'Draw 2', 'Your turn');

  await clickVisibleControl(page, page.getByRole('button', { name: 'Stand pat', exact: true }));
  await expectGuide(page, 'Betting round', 'Your turn');
  await finishBettingRound(page, 'Draw 3');
  await expectGuide(page, 'Draw 3', 'Your turn');

  await clickVisibleControl(page, page.getByRole('button', { name: 'Stand pat', exact: true }));
  await expectGuide(page, 'Declare HIGH or LOW', 'Your turn');
  await clickVisibleControl(page, page.getByRole('button', { name: 'Declare Low' }));
  await expectGuide(page, 'Final bet after declaration', 'Your turn');
  await finishBettingRound(page, 'Showdown', true);
  await expectGuide(page, 'Showdown', 'Hand complete');
  await expect(page.getByRole('button', { name: 'Practice another hand' })).toBeVisible();

  expect(apiRequests, 'direct practice should not fetch API resources').toEqual([]);
});