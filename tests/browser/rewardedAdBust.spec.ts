import { expect, test, type Page, type Route } from '@playwright/test';

async function setupAd(page: Page, tier = 4) {
  let starts = 0;
  let confirms = 0;
  let verified = false;
  const sessionId = '5e795e2d-d52c-4a8e-91ba-f662c82ee21d';
  await page.addInitScript(() => {
    const win = window as any;
    const listeners = new Map<string, () => void>();
    let reward: (value: any) => void;
    win.__adShows = 0;
    win.__finishReward = async (eligible = true) => {
      reward(eligible ? { type: 'chips', amount: 999 } : undefined);
      await Promise.resolve();
      listeners.get('onRewardedVideoAdDismissed')?.();
    };
    win.androidBridge = { postMessage: () => {} };
    win.Capacitor = {
      PluginHeaders: [{ name: 'AdMob', methods: [
        { name: 'initialize', rtype: 'promise' }, { name: 'prepareRewardVideoAd', rtype: 'promise' },
        { name: 'showRewardVideoAd', rtype: 'promise' }, { name: 'addListener', rtype: 'callback' },
        { name: 'removeListener', rtype: 'promise' },
      ] }],
      nativePromise: (_plugin: string, method: string, options: any) => {
        if (method === 'prepareRewardVideoAd') win.__preparedAd = options;
        if (method === 'showRewardVideoAd') {
          win.__adShows++;
          return new Promise(resolve => { reward = resolve; });
        }
        return Promise.resolve({});
      },
      nativeCallback: (_plugin: string, _method: string, options: any, callback: () => void) => {
        listeners.set(options.eventName, callback);
        return options.eventName;
      },
    };
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: any = {};
    if (path === '/api/ads/rewarded/start') {
      starts++;
      expect(route.request().postDataJSON()).toEqual({ platform: 'android', tableId: 'QA', modeId: 'badugi' });
      body = { sessionId, adUnitId: 'ca-app-pub-1122384597919929/4402812186',
        testMode: false, rewardChips: 500, completed: false, awaitingVerification: false };
    } else if (path === '/api/ads/rewarded/confirm') {
      confirms++;
      body = { awaitingVerification: true };
    } else if (path === `/api/ads/rewarded/${sessionId}`) {
      body = { completed: verified, expired: false, ...(verified ? { chipBalance: 500 } : {}) };
    } else if (/\/api\/auth\/|\/api\/players\//.test(path)) {
      body = { profileId: 'qa-ad-player', displayName: 'QA Ad Player', chipBalance: 0,
        stripes: 0, handsPlayed: 0, lifetimeProfit: 0, hasAuth: false, welcomeKitClaimed: true, sessionToken: 'qa-ad-token' };
    } else if (path.includes('/tables/')) body = { minBet: 50 };
    else if (path.includes('bust-rescue-offer')) body = { available: false, claimed: false };
    await route.fulfill({ json: body });
  });
  await page.goto(`/bust-out-rebuy-test.html?tier=${tier}&balance=0&ad=1`);
  await expect(page.getByTestId('ad-wallet-balance')).toHaveAttribute('data-profile-ready', 'true');
  return { starts: () => starts, confirms: () => confirms, verify: () => { verified = true; } };
}

test('duplicate taps play one ad, lock through playback and SSV, and refresh the wallet without restarting', async ({ page }) => {
  const ad = await setupAd(page);
  const button = page.getByTestId('button-bust-watch-ad');
  await expect(button).toHaveText('WATCH AD — GET 500 CHIPS');
  await button.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect(button).toBeDisabled();
  await expect.poll(() => ad.starts()).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__adShows)).toBe(1);
  const prepared = await page.evaluate(() => (window as any).__preparedAd);
  expect(prepared.adId).toBe('ca-app-pub-1122384597919929/4402812186');
  await expect(page.getByRole('slider')).toHaveCount(0);
  await expect(page.getByTestId('ad-wallet-balance')).toHaveText('0');
  await page.evaluate(() => (window as any).__finishReward());
  await expect.poll(() => ad.confirms()).toBe(1);
  await expect(button).toBeDisabled();
  await expect(page.getByTestId('ad-wallet-balance')).toHaveText('0');
  ad.verify();
  await expect(page.getByTestId('ad-wallet-balance')).toHaveText('500');
  await expect(button).toHaveText('500-CHIP AD REWARD USED');
  await button.evaluate(element => (element as HTMLButtonElement).click());
  expect(ad.starts()).toBe(1);
  expect(await page.evaluate(() => (window as any).__adShows)).toBe(1);
});

test('a skipped ad never signals completion or credits chips, and permits a retry', async ({ page }) => {
  const ad = await setupAd(page, 2);
  const button = page.getByTestId('button-bust-watch-ad');
  await expect(button).toHaveCount(1);
  await button.click();
  await expect.poll(() => page.evaluate(() => (window as any).__adShows)).toBe(1);
  await page.evaluate(() => (window as any).__finishReward(false));
  await expect(page.getByTestId('bust-ad-status')).toContainText('not completed');
  await expect(button).toBeEnabled();
  expect(ad.confirms()).toBe(0);
  await expect(page.getByTestId('ad-wallet-balance')).toHaveText('0');
  await button.click();
  await expect.poll(() => page.evaluate(() => (window as any).__adShows)).toBe(2);
  expect(ad.starts()).toBe(2);
});

test('a delayed pre-reward profile refresh cannot erase the confirmed 500-chip balance', async ({ page }) => {
  const ad = await setupAd(page);
  let oldProfile: Route | undefined;
  await page.route('**/api/auth/me', route => { oldProfile = route; });
  await page.getByTestId('ad-refresh-profile').click();
  await expect.poll(() => !!oldProfile).toBe(true);
  await page.getByTestId('button-bust-watch-ad').click();
  await expect.poll(() => page.evaluate(() => (window as any).__adShows)).toBe(1);
  ad.verify();
  await page.evaluate(() => (window as any).__finishReward());
  await expect(page.getByTestId('ad-wallet-balance')).toHaveText('500');
  await oldProfile!.fulfill({ json: {
    profileId: 'qa-ad-player', displayName: 'Stale fixture profile', chipBalance: 0,
    stripes: 0, handsPlayed: 0, lifetimeProfit: 0,
  } });
  await expect(page.getByTestId('ad-wallet-balance')).toHaveAttribute('data-profile-name', 'Stale fixture profile');
  await expect(page.getByTestId('ad-wallet-balance')).toHaveText('500');
});