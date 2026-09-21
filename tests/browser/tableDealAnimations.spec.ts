import { expect, test } from '@playwright/test';

const flightSelector = '[data-deal-flight]';
const seatSelector = '[data-deal-seat]';
const fullTableTimingCapMs = 1900;

async function openFixture(page: Parameters<typeof test>[0]['page']) {
  await page.goto('/table-deal-test.html');
  await expect(page.getByTestId('deal')).toBeVisible();
}

test.describe('table deal animation in a narrow browser viewport', () => {
  test('measures the deck and seats, preserves privacy, and restores destinations', async ({ page }) => {
    await openFixture(page);

    const geometry = await page.evaluate(() => {
      const table = document.querySelector<HTMLElement>('[data-testid="table"]')!;
      const deck = document.querySelector<HTMLElement>('[data-testid="deck"]')!;
      const seat = document.querySelector<HTMLElement>('[data-deal-seat="hero"]')!;
      const tableRect = table.getBoundingClientRect();
      const deckRect = deck.getBoundingClientRect();
      const seatRect = seat.getBoundingClientRect();
      return {
        deckCenter: {
          x: deckRect.left + deckRect.width / 2 - tableRect.left,
          y: deckRect.top + deckRect.height / 2 - tableRect.top,
        },
        heroCenter: {
          x: seatRect.left + seatRect.width / 2 - tableRect.left,
          y: seatRect.top + seatRect.height / 2 - tableRect.top,
        },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    });
    expect(geometry.viewport.width).toBe(375);
    await page.getByTestId('deal').click();
    await expect(page.locator(flightSelector)).toHaveCount(3);
    await expect(page.locator('[data-deal-seat="hero"]')).toHaveCSS('visibility', 'hidden');
    await expect(page.locator('[data-deal-seat="opponent-1"]')).toHaveCSS('visibility', 'hidden');

    const flightGeometry = await page.locator(flightSelector).first().evaluate((flight) => ({
      left: parseFloat((flight as HTMLElement).style.left),
      top: parseFloat((flight as HTMLElement).style.top),
      hasFront: !!flight.querySelector('.playing-card-front'),
      hasBack: !!flight.querySelector('.playing-card-back'),
      text: flight.textContent,
    }));
    expect(flightGeometry.left).toBeCloseTo(geometry.deckCenter.x - 19, 0);
    expect(flightGeometry.top).toBeCloseTo(geometry.deckCenter.y - 27, 0);
    expect(flightGeometry.hasFront || flightGeometry.hasBack).toBe(true);

    const flightKinds = await page.locator(flightSelector).evaluateAll((flights) =>
      flights.map((flight) => ({
        hasFront: !!flight.querySelector('.playing-card-front'),
        hasBack: !!flight.querySelector('.playing-card-back'),
        text: flight.textContent ?? '',
      })),
    );
    expect(flightKinds.filter((flight) => flight.hasFront)).toHaveLength(1);
    expect(flightKinds.filter((flight) => flight.hasBack)).toHaveLength(2);
    expect(flightKinds.find((flight) => flight.hasFront)?.text).toContain('A');
    expect(flightKinds.filter((flight) => flight.hasBack).every((flight) => flight.text === '')).toBe(true);

    await page.waitForTimeout(380);
    const heroFlightBox = await page.locator(flightSelector).filter({ has: page.locator('.playing-card-front') }).boundingBox();
    const tableBox = await page.getByTestId('table').boundingBox();
    expect(heroFlightBox).not.toBeNull();
    expect(tableBox).not.toBeNull();
    expect(heroFlightBox!.x + heroFlightBox!.width / 2 - tableBox!.x).toBeCloseTo(geometry.heroCenter.x, 0);
    expect(heroFlightBox!.y + heroFlightBox!.height / 2 - tableBox!.y).toBeCloseTo(geometry.heroCenter.y, 0);

    await page.getByTestId('interrupt').click();
    await expect(page.locator(flightSelector)).toHaveCount(0);
    await expect(page.locator(seatSelector).first()).toHaveCSS('visibility', 'visible');
  });

  test('restores destination visibility when the animator unmounts', async ({ page }) => {
    await openFixture(page);
    await page.getByTestId('deal').click();
    await expect(page.locator(flightSelector)).toHaveCount(3);
    await page.getByTestId('unmount').click();
    await expect(page.locator(flightSelector)).toHaveCount(0);
    await expect(page.locator(seatSelector)).toHaveCount(3);
    const restored = await page.locator(seatSelector).evaluateAll((seats) =>
      seats.every((seat) => getComputedStyle(seat).visibility === 'visible'),
    );
    expect(restored).toBe(true);
  });

  test('snaps to authoritative cards when an anchor is missing', async ({ page }) => {
    await openFixture(page);
    await page.getByTestId('missing-deck').click();
    await expect(page.locator(flightSelector)).toHaveCount(0);
    await expect(page.locator('.playing-card-front')).toHaveCount(1);
    await expect(page.locator('.playing-card-back')).toHaveCount(2);

    await page.reload();
    await openFixture(page);
    await page.getByTestId('missing-seat').click();
    await expect(page.locator(flightSelector)).toHaveCount(0);
    await expect(page.locator('.playing-card-front')).toHaveCount(1);
    await expect(page.locator('.playing-card-back')).toHaveCount(1);
  });

  test('snaps to authoritative cards in reduced-motion mode', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await openFixture(page);
    await page.getByTestId('deal').click();
    await expect(page.locator(flightSelector)).toHaveCount(0);
    await expect(page.locator('.playing-card-front')).toHaveCount(1);
    await expect(page.locator('.playing-card-back')).toHaveCount(2);
    await context.close();
  });

  test('completes a representative full-table deal within the timing cap', async ({ page }) => {
    await openFixture(page);
    await page.getByTestId('full-deal').click();
    await expect(page.locator(flightSelector)).toHaveCount(40);
    const started = Date.now();
    await expect(page.locator(flightSelector)).toHaveCount(0);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThanOrEqual(fullTableTimingCapMs);
    await expect(page.locator('[data-deal-seat="hero"]')).toHaveCSS('visibility', 'visible');
  });
});