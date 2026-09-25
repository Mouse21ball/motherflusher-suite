import { expect, test, type Page } from '@playwright/test';

const preferenceKey = 'cgp_celebration_motion';

interface FakeCelebration {
  type: 'NORMAL_WIN' | 'BIG_POT' | 'DEAD7_SPECIAL';
  playerId: string;
  playerName: string;
  targets: { playerId: string; amount: number }[];
  amount: number;
}

async function publishCelebration(page: Page, event: FakeCelebration) {
  await page.evaluate(async celebration => {
    const { playCelebration } = await import('/src/components/celebrations/celebrationService.ts');
    playCelebration(celebration);
  }, event);
}

async function setMotionPreference(page: Page, mode: 'full' | 'reduced' | 'off') {
  await page.evaluate(({ key, mode }) => {
    localStorage.setItem(key, mode);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: mode }));
  }, { key: preferenceKey, mode });
}

async function mountFakeResultGroup(page: Page) {
  await page.evaluate(() => {
    const tableSeat = document.querySelector<HTMLElement>('[data-player-seat="celebration-test-player"]');
    if (tableSeat) tableSeat.style.visibility = 'hidden';

    const group = document.createElement('div');
    group.setAttribute('data-testid', 'fake-celebration-results');
    Object.assign(group.style, {
      position: 'fixed', inset: '0', zIndex: '200', background: 'rgba(0, 0, 0, 0.7)',
      pointerEvents: 'none',
    });

    const pot = document.createElement('div');
    pot.setAttribute('data-celebration-result-pot', '');
    Object.assign(pot.style, {
      position: 'absolute', left: '40px', top: '120px', width: '4px', height: '4px',
    });

    const seat = document.createElement('div');
    seat.setAttribute('data-celebration-result-seat', 'celebration-test-player');
    Object.assign(seat.style, {
      position: 'absolute', left: '60px', top: '180px', width: '100px', height: '100px',
    });

    const card = document.createElement('div');
    card.setAttribute('data-celebration-card', '');
    Object.assign(card.style, {
      width: '50px', height: '70px', background: 'white', borderRadius: '6px',
    });

    seat.appendChild(card);
    group.append(pot, seat);
    document.body.appendChild(group);
  });
}

async function unmountFakeResultGroup(page: Page) {
  await page.locator('[data-testid="fake-celebration-results"]').evaluate(group => group.remove());
  await page.locator('[data-player-seat="celebration-test-player"]').evaluate(seat => {
    (seat as HTMLElement).style.visibility = 'visible';
  });
}

function fakeEvent(type: FakeCelebration['type'], amount: number): FakeCelebration {
  return {
    type,
    playerId: 'celebration-test-player',
    playerName: 'Celebration Test',
    targets: [{ playerId: 'celebration-test-player', amount }],
    amount,
  };
}

test('renders celebration presets, cleans them up, and honors motion preferences', async ({ page }) => {
  test.setTimeout(45_000);
  await page.addInitScript(() => localStorage.setItem('cgp_age_17_confirmed', '1'));
  await page.goto('/');
  await expect(page.getByTestId('text-age-gate-title')).toHaveCount(0);
  await page.getByRole('button', { name: 'Skip Chain Gang Poker introduction' }).click();
  await expect(page.locator('.cgp-cold-splash')).toHaveCount(0, { timeout: 2_000 });

  await page.evaluate(() => {
    const pot = document.createElement('div');
    pot.setAttribute('data-pot-anchor', '');
    Object.assign(pot.style, {
      position: 'fixed', left: '180px', top: '320px', width: '2px', height: '2px',
    });

    const seat = document.createElement('div');
    seat.setAttribute('data-player-seat', 'celebration-test-player');
    Object.assign(seat.style, {
      position: 'fixed', left: '250px', top: '410px', width: '80px', height: '100px',
    });

    const targetCard = document.createElement('div');
    targetCard.setAttribute('data-celebration-card', '');
    Object.assign(targetCard.style, {
      width: '50px', height: '70px', background: 'white', borderRadius: '6px',
    });
    seat.appendChild(targetCard);
    document.body.append(pot, seat);
  });
  const card = page.locator('[data-player-seat="celebration-test-player"] [data-celebration-card]');
  await setMotionPreference(page, 'full');

  const celebration = page.getByTestId('celebration');

  await publishCelebration(page, fakeEvent('NORMAL_WIN', 125));
  await expect(celebration).toBeVisible();
  await expect(celebration).toHaveAttribute('data-celebration', 'NORMAL_WIN');
  await expect(celebration.locator('.cgp-celebration-title')).toHaveText('WINNER');
  await expect(celebration).not.toHaveClass(/cgp-celebration--reduced/);
  await expect(page.locator('[data-celebration-chip]')).toHaveCount(3);
  await expect(page.locator('[data-player-seat="celebration-test-player"] [data-celebration-card]'))
    .toHaveClass(/cgp-celebrating-card/);
  await expect(celebration).toHaveCount(0, { timeout: 3_000 });
  await expect(page.locator('[data-celebration-chip]')).toHaveCount(0);
  await expect(card).not.toHaveClass(/cgp-celebrating-card/);

  await mountFakeResultGroup(page);
  const resultSeat = page.locator('[data-celebration-result-seat="celebration-test-player"]');
  const resultCard = resultSeat.locator('[data-celebration-card]');
  await expect(resultSeat).toBeVisible();
  await publishCelebration(page, fakeEvent('BIG_POT', 750));
  await expect(celebration).toBeVisible();
  await expect(celebration).toHaveAttribute('data-celebration', 'BIG_POT');
  await expect(celebration.locator('.cgp-celebration-title')).toHaveText('BIG POT');
  await expect(celebration.locator('.cgp-celebration-chip--big')).toHaveCount(3);
  await expect(resultCard).toHaveClass(/cgp-celebrating-card/);
  await expect(card).not.toHaveClass(/cgp-celebrating-card/);
  await expect(celebration.locator('.cgp-celebration-chain .cgp-celebration-link')).toHaveCount(14);
  const firstResultChip = await celebration.locator('[data-celebration-chip]').first().evaluate(node => {
    const style = (node as HTMLElement).style;
    return {
      left: style.left,
      top: style.top,
      dx: style.getPropertyValue('--dx'),
      dy: style.getPropertyValue('--dy'),
    };
  });
  expect(firstResultChip).toEqual({ left: '42px', top: '122px', dx: '68px', dy: '108px' });
  await expect(celebration).toHaveCount(0, { timeout: 4_000 });
  await expect(page.locator('[data-celebration-chip]')).toHaveCount(0);
  await expect(resultCard).not.toHaveClass(/cgp-celebrating-card/);
  await unmountFakeResultGroup(page);

  await publishCelebration(page, fakeEvent('DEAD7_SPECIAL', 300));
  await expect(celebration).toBeVisible();
  await expect(celebration).toHaveAttribute('data-celebration', 'DEAD7_SPECIAL');
  await expect(celebration.locator('.cgp-celebration-title')).toHaveText('DEAD 7');
  await expect(celebration.locator('.cgp-celebration-skull')).toBeVisible();
  await expect(celebration).toHaveCount(0, { timeout: 4_000 });

  await setMotionPreference(page, 'reduced');
  await publishCelebration(page, fakeEvent('DEAD7_SPECIAL', 300));
  await expect(celebration).toBeVisible();
  await expect(celebration).toHaveClass(/cgp-celebration--reduced/);
  await expect(celebration).toHaveAttribute('style', /--celebration-duration: 900ms/);
  await expect(celebration).toHaveCount(0, { timeout: 2_000 });

  await setMotionPreference(page, 'off');
  await publishCelebration(page, fakeEvent('BIG_POT', 750));
  await expect(celebration).toHaveCount(0);

  await setMotionPreference(page, 'full');
  await publishCelebration(page, fakeEvent('NORMAL_WIN', 125));
  await expect(celebration).toBeVisible();
  await expect(celebration).not.toHaveClass(/cgp-celebration--reduced/);
  await expect(card).toHaveClass(/cgp-celebrating-card/);
  await mountFakeResultGroup(page);
  const delayedResultCard = page.locator(
    '[data-celebration-result-seat="celebration-test-player"] [data-celebration-card]',
  );
  await expect(delayedResultCard).toHaveClass(/cgp-celebrating-card/);
  await expect(card).not.toHaveClass(/cgp-celebrating-card/);
  await expect(celebration).toHaveCount(0, { timeout: 3_000 });
  await expect(delayedResultCard).not.toHaveClass(/cgp-celebrating-card/);
});