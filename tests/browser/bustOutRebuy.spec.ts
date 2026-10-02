import { expect, test } from '@playwright/test';

test.describe('bust-out rebuy confirmation and errors', () => {
  for (const kind of ['free', 'reserve', 'borrow'] as const) {
    test(`${kind} same-tick double tap submits only once and stays disabled until resolution`, async ({ page }) => {
      await page.goto('/bust-out-rebuy-test.html');
      await page.clock.install();
      if (kind === 'reserve') await page.getByTestId('button-bust-rebuy').tap();
      const testId = kind === 'free' ? 'button-bust-starter-pack'
        : kind === 'borrow' ? 'button-bust-borrow-chips' : 'buyin-confirm';
      await page.getByTestId(testId).evaluate(element => {
        (element as HTMLButtonElement).click();
        (element as HTMLButtonElement).click();
      });
      await expect(page.getByTestId(testId)).toBeDisabled();
      await expect(page.getByTestId('rebuy-submissions')).toHaveText('1');
      await page.clock.runFor(451);
      await expect(page.getByTestId('rebuy-result')).toHaveText(`${kind}:${kind === 'reserve' ? 5000 : 1000}`);
      await expect(page.getByTestId('bust-out-modal')).toHaveCount(0);
    });
  }

  test('borrow is disabled while pending and dismisses only after its credit succeeds', async ({ page }) => {
    await page.goto('/bust-out-rebuy-test.html');
    const borrow = page.getByTestId('button-bust-borrow-chips');
    await borrow.tap();
    await expect(borrow).toBeDisabled();
    await expect(page.getByTestId('bust-rebuy-pending')).toBeVisible();
    await expect(page.getByTestId('rebuy-result')).toHaveText('borrow:1000');
    await expect(page.getByTestId('bust-out-modal')).toHaveCount(0);
  });

  test('borrow failure appears in the modal and permits a retry without crediting chips', async ({ page }) => {
    await page.goto('/bust-out-rebuy-test.html?outcome=fail');
    const borrow = page.getByTestId('button-bust-borrow-chips');
    await borrow.tap();
    await expect(page.getByTestId('bust-rebuy-error')).toContainText('borrow rebuy was rejected');
    await expect(borrow).toBeEnabled();
    await expect(page.getByTestId('rebuy-result')).toHaveText('');
    await expect(page.getByTestId('bust-out-modal')).toBeVisible();
  });

  test.use({ isMobile: true, hasTouch: true, viewport: { width: 360, height: 740 } });

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/billing/bust-rescue-offer', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        claimed: true,
        available: false,
      }),
    }));
    const fulfillTableRequest = (route: import('@playwright/test').Route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
    await page.route('**/api/tables/QA/join', fulfillTableRequest);
    await page.route('**/api/tables/QA/rebuy', fulfillTableRequest);
  });

  test('free rebuy stays visible while pending and dismisses only after success', async ({ page }) => {
    await page.goto('/bust-out-rebuy-test.html');
    const modal = page.getByTestId('bust-out-modal');
    await expect(modal).toBeVisible();
    await page.getByTestId('button-bust-starter-pack').tap();
    await expect(page.getByTestId('bust-rebuy-pending')).toBeVisible();
    await expect(page.getByTestId('bust-rebuy-error')).toHaveCount(0);
    await expect(page.getByTestId('button-bust-rebuy')).toBeDisabled();
    await expect(modal).toBeVisible();
    await expect(modal).toBeHidden({ timeout: 3_000 });
    await expect(page.getByTestId('rebuy-result')).toHaveText('free:1000');
  });

  test('reserve-backed slider rebuy remains open until the amount is confirmed', async ({ page }) => {
    const joinPrevalidationRequests: string[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/tables/QA/join') joinPrevalidationRequests.push(url.pathname);
    });
    await page.goto('/bust-out-rebuy-test.html');
    const modal = page.getByTestId('bust-out-modal');
    await page.getByTestId('button-bust-rebuy').tap();
    await expect(page.getByTestId('buyin-slider-panel')).toBeVisible();
    await expect(page.getByTestId('buyin-confirm')).toHaveText(/Rebuy/);
    await page.getByTestId('buyin-confirm').tap();
    await expect(page.getByTestId('bust-rebuy-pending')).toBeVisible();
    await expect(modal).toBeVisible();
    await expect(modal).toBeHidden({ timeout: 3_000 });
    await expect(page.getByTestId('rebuy-result')).toHaveText('reserve:5000');
    expect(joinPrevalidationRequests).toHaveLength(0);
  });

  test('free-rebuy rejection keeps the modal open and exposes an error', async ({ page }) => {
    await page.goto('/bust-out-rebuy-test.html?outcome=fail');
    const modal = page.getByTestId('bust-out-modal');
    await page.getByTestId('button-bust-starter-pack').tap();
    await expect(page.getByTestId('bust-rebuy-error')).toHaveText(/free rebuy was rejected; no chips were credited/i);
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('bust-rebuy-pending')).toHaveCount(0);
  });

  test('reserve-rebuy rejection retains slider and table modal', async ({ page }) => {
    await page.goto('/bust-out-rebuy-test.html?outcome=fail');
    const modal = page.getByTestId('bust-out-modal');
    await page.getByTestId('button-bust-rebuy').tap();
    await page.getByTestId('buyin-confirm').tap();
    await expect(page.getByTestId('bust-rebuy-error')).toHaveText(/reserve rebuy was rejected; no chips were credited/i);
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('buyin-slider-panel')).toBeVisible();
  });
});