import { expect, test, type Page } from '@playwright/test';

const identity = {
  id: 'browser-profile-test',
  name: 'Browser Guest',
  avatarSeed: 'browser-',
  createdAt: 1,
};

function serverProfile(displayName: string, sessionToken: string) {
  return {
    profileId: identity.id,
    displayName,
    sessionToken,
    chipBalance: 1000,
    stripes: 0,
    handsPlayed: 0,
    lifetimeProfit: 0,
    level: 1,
    hasAuth: false,
    email: null,
    avatarId: null,
    equippedAvatarId: null,
    equippedFrameId: null,
    equippedNameColorId: null,
    lastNameChangeAt: null,
    nextResetAt: null,
    activeSubscriptionTier: null,
    subscriptionExpiresAt: null,
    equippedLobbyTrack: null,
    equippedGameTrack: null,
    equippedLadyLuckTrack: null,
  };
}

async function seedIdentity(page: Page, token?: string) {
  await page.addInitScript(({ identity, token }) => {
    localStorage.setItem('poker_table_identity', JSON.stringify(identity));
    if (token) localStorage.setItem('cgp_session_token', token);
  }, { identity, token });
}

async function expectBothProfiles(page: Page, name: string) {
  for (const consumer of ['first', 'second']) {
    await expect(page.getByTestId(`profile-${consumer}`)).toHaveText(name);
    await expect(page.getByTestId(`loading-${consumer}`)).toHaveText('false');
  }
}

test('two consumers bootstrap one guest, then share one authenticated refetch', async ({ page }) => {
  await seedIdentity(page);
  let guestRequests = 0;
  let meRequests = 0;
  let releaseGuest!: () => void;
  const guestGate = new Promise<void>(resolve => { releaseGuest = resolve; });
  let releaseMe!: () => void;
  const meGate = new Promise<void>(resolve => { releaseMe = resolve; });
  await page.route('**/api/auth/guest-init', async route => {
    guestRequests++;
    expect(route.request().method()).toBe('POST');
    expect(JSON.parse(route.request().postData()!)).toEqual({
      profileId: identity.id,
      displayName: identity.name,
    });
    await guestGate;
    await route.fulfill({ json: serverProfile('First guest', 'guest-token') });
  });
  await page.route('**/api/auth/me', async route => {
    meRequests++;
    expect(route.request().headers()['x-session-token']).toBe('guest-token');
    await meGate;
    await route.fulfill({ json: serverProfile('Updated guest', 'refreshed-token') });
  });

  await page.goto('/profile-provider-test.html');
  await expect.poll(() => guestRequests).toBe(1);
  await expect(page.getByTestId('loading-first')).toHaveText('true');
  await expect(page.getByTestId('loading-second')).toHaveText('true');
  expect(meRequests).toBe(0);
  releaseGuest();
  await expectBothProfiles(page, 'First guest');
  expect(guestRequests).toBe(1);
  expect(meRequests).toBe(0);

  await page.getByTestId('refetch-first').click();
  await expect.poll(() => meRequests).toBe(1);
  await expect(page.getByTestId('loading-first')).toHaveText('true');
  await expect(page.getByTestId('loading-second')).toHaveText('true');
  expect(guestRequests).toBe(1);
  releaseMe();
  await expectBothProfiles(page, 'Updated guest');
  expect(meRequests).toBe(1);
  expect(guestRequests).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('cgp_session_token'))).toBe('refreshed-token');
});

test('expired token falls back to one guest setup shared by both consumers', async ({ page }) => {
  await seedIdentity(page, 'expired-token');
  let meRequests = 0;
  let guestRequests = 0;
  await page.route('**/api/auth/me', async route => {
    meRequests++;
    expect(route.request().headers()['x-session-token']).toBe('expired-token');
    await route.fulfill({ status: 401, body: 'expired' });
  });
  await page.route('**/api/auth/guest-init', async route => {
    guestRequests++;
    await route.fulfill({ json: serverProfile('Recovered guest', 'new-guest-token') });
  });

  await page.goto('/profile-provider-test.html');
  await expectBothProfiles(page, 'Recovered guest');
  expect(meRequests).toBe(1);
  expect(guestRequests).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('cgp_session_token'))).toBe('new-guest-token');
});