import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.route('**/api/**', route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/table-escape-test.html');
  await page.getByRole('button', { name: 'Start connecting', exact: true }).click();
  await expect(page.getByTestId('button-emergency-lobby')).toHaveCount(0);
});
test('a never-initialized table returns automatically at the unchanged deadline without an exit button', async ({ page }) => {
  await page.clock.runFor(14999);
  await expect(page).toHaveURL(/\/badugi$/);
  await expect(page.getByRole('button', { name: /Emergency lobby exit|Connecting… Return to lobby/ })).toHaveCount(0);
  await page.clock.runFor(2);
  await expect(page).toHaveURL(/\/\?tableExit=timeout$/);
});
test('a rejected seating attempt returns directly to the lobby', async ({ page }) => {
  await page.getByRole('button', { name: 'Reject join' }).click();
  await expect(page).toHaveURL(/\/\?tableExit=unavailable$/);
});
test('repeated connection attempts cannot postpone the join deadline', async ({ page }) => {
  await page.getByRole('button', { name: 'Receive init' }).click();
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await page.clock.runFor(10000);
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await page.clock.runFor(5001);
  await expect(page).toHaveURL(/\/\?tableExit=timeout$/);
});
test('render crashes do not stop the invisible failed-connection guard', async ({ page }) => {
  await page.getByRole('button', { name: 'Receive init' }).click();
  await page.getByRole('button', { name: 'Break table render' }).click();
  await expect(page.getByText('Something went wrong.')).toBeVisible();
  await expect(page.getByTestId('button-emergency-lobby')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reject join' }).click();
  await expect(page).toHaveURL(/\/\?tableExit=unavailable$/);
});
test('a ready connection cancels the timeout while the guard remains invisible', async ({ page }) => {
  await page.getByRole('button', { name: 'Receive init' }).click();
  await page.clock.runFor(20000);
  await expect(page).toHaveURL(/\/badugi$/);
  await expect(page.getByTestId('button-emergency-lobby')).toHaveCount(0);
});