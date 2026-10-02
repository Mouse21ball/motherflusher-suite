import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/table-escape-test.html');
  await page.getByRole('button', { name: 'Start connecting', exact: true }).click();
  await expect(page.getByTestId('button-emergency-lobby')).toBeVisible();
});
test('a never-initialized table has an immediate network-independent exit', async ({ page }) => {
  await page.getByTestId('button-emergency-lobby').click();
  await expect(page).toHaveURL(/\/\?tableExit=local$/);
});
test('a rejected seating attempt returns directly to the lobby', async ({ page }) => {
  await page.getByRole('button', { name: 'Reject join' }).click();
  await expect(page).toHaveURL(/\/\?tableExit=unavailable$/);
});
test('repeated connection attempts cannot postpone the join deadline', async ({ page }) => {
  await page.clock.install();
  await page.getByRole('button', { name: 'Receive init' }).click();
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await page.clock.runFor(10000);
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await page.clock.runFor(5001);
  await expect(page).toHaveURL(/\/\?tableExit=timeout$/);
});
test('render crashes do not remove the independent lobby exit', async ({ page }) => {
  await page.getByRole('button', { name: 'Receive init' }).click();
  await page.getByRole('button', { name: 'Break table render' }).click();
  await expect(page.getByText('Something went wrong.')).toBeVisible();
  await page.getByTestId('button-emergency-lobby').click();
  await expect(page).toHaveURL(/\/\?tableExit=local$/);
});