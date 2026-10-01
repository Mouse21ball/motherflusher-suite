import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const APP_ORIGIN = 'http://127.0.0.1:4181';
const DEV_API_ORIGIN = 'http://localhost:5000';
const QA_SCREENSHOT_DIR = resolve('.local/qa');

type ApiStatus = {
  method: string;
  path: string;
  status: number;
};

type NativeCall = {
  plugin: string;
  method: string;
  phase: 'before-root-dom' | 'after-root-dom';
};

type QaWindow = Window & {
  __CGP_PRODUCTION_QA?: {
    nativeCalls: NativeCall[];
    billingShimCalls: string[];
    rootDomAt: number | null;
  };
};

type SimulatedNativeWindow = Window & {
  Capacitor?: Record<string, unknown>;
  androidBridge?: { postMessage(data: string): void };
  CdvPurchase?: unknown;
  cordova?: unknown;
};

function sanitizedError(error: Error): string {
  return `${error.name}: ${error.message}`
    .replace(/((?:token|authorization|cookie|secret)\s*[:=]\s*["']?)[^"' \s,;}]+/gi, '$1[REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED]');
}

async function configureOfflineSafeBrowser(
  context: BrowserContext,
  page: Page,
  androidShim: boolean,
  apiStatuses: ApiStatus[],
  apiProxyErrors: string[],
  websocketAttempts: number[],
  pageErrors: string[],
) {
  await context.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
      const apiTarget = new URL(`${requestUrl.pathname}${requestUrl.search}`, DEV_API_ORIGIN);
      try {
        const headers = await route.request().allHeaders();
        delete headers.host;
        headers.origin = DEV_API_ORIGIN;
        const response = await route.fetch({
          url: apiTarget.toString(),
          maxRedirects: 0,
          headers,
        });
        apiStatuses.push({
          method: route.request().method(),
          path: requestUrl.pathname,
          status: response.status(),
        });
        await route.fulfill({
          response,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'access-control-allow-headers': 'Content-Type, Authorization, X-Requested-With, X-Session-Token',
          },
        });
      } catch (error) {
        apiProxyErrors.push(`${route.request().method()} ${requestUrl.pathname}: ${error instanceof Error ? error.name : 'proxy error'}`);
        await route.abort('failed');
      }
      return;
    }

    if (requestUrl.origin === APP_ORIGIN) {
      await route.continue();
      return;
    }

    // No analytics, fonts, production API, or other external HTTP traffic.
    await route.abort('blockedbyclient');
  });

  await page.routeWebSocket(() => true, async socket => {
    websocketAttempts.push(1);
    await socket.close({ code: 1000, reason: 'Blocked by isolated production cold-start QA' });
  });

  page.on('pageerror', error => pageErrors.push(sanitizedError(error)));

  await page.addInitScript((simulateAndroid: boolean) => {
    const qa = {
      nativeCalls: [] as NativeCall[],
      billingShimCalls: [] as string[],
      rootDomAt: null as number | null,
    };
    (window as QaWindow).__CGP_PRODUCTION_QA = qa;

    const recordNativeCall = (plugin: string, method: string) => {
      const rootHasDom = Boolean(document.getElementById('root')?.childElementCount);
      qa.nativeCalls.push({
        plugin,
        method,
        phase: rootHasDom ? 'after-root-dom' : 'before-root-dom',
      });
    };
    const recordBillingCall = (method: string) => {
      qa.billingShimCalls.push(method);
    };

    const markRootMounted = () => {
      if (qa.rootDomAt !== null) return;
      if (document.getElementById('root')?.childElementCount) qa.rootDomAt = performance.now();
    };
    new MutationObserver(markRootMounted).observe(document, {
      childList: true,
      subtree: true,
    });

    if (!simulateAndroid) return;

    const capacitor = {
      PluginHeaders: [{
        name: 'FirebaseMessaging',
        methods: [
          { name: 'addListener', rtype: 'promise' },
          { name: 'checkPermissions', rtype: 'promise' },
          { name: 'getToken', rtype: 'promise' },
          { name: 'requestPermissions', rtype: 'promise' },
        ],
      }],
      nativePromise: (plugin: string, method: string) => {
        recordNativeCall(plugin, method);
        if (plugin === 'FirebaseMessaging' && method === 'addListener') {
          const listenerSetup = Promise.resolve({});
          Object.assign(listenerSetup, { remove: async () => undefined });
          return listenerSetup;
        }
        // Permission/token calls must not show dialogs, request push tokens, or reach real native services.
        return Promise.reject(new Error('QA native bridge stub: capability unavailable'));
      },
      nativeCallback: (plugin: string, method: string) => {
        recordNativeCall(plugin, method);
        return undefined;
      },
    };
    const nativeWindow = window as SimulatedNativeWindow;
    nativeWindow.Capacitor = capacitor;
    nativeWindow.androidBridge = {
      postMessage: () => recordNativeCall('CapacitorBridge', 'postMessage'),
    };

    // Simulate only the purchase-plugin initialization surface used at app startup.
    // No store/network capability is exposed and every call is locally recorded.
    const whenChain: {
      approved: () => unknown;
      verified: () => unknown;
      receiptUpdated: () => unknown;
      receiptsUpdated: () => unknown;
    } = {
      approved: () => {
        recordBillingCall('store.when.approved');
        return whenChain;
      },
      verified: () => {
        recordBillingCall('store.when.verified');
        return whenChain;
      },
      receiptUpdated: () => {
        recordBillingCall('store.when.receiptUpdated');
        return whenChain;
      },
      receiptsUpdated: () => {
        recordBillingCall('store.when.receiptsUpdated');
        return whenChain;
      },
    };
    const store = {
      products: [],
      register: () => recordBillingCall('store.register'),
      error: () => recordBillingCall('store.error'),
      when: () => whenChain,
      initialize: async () => recordBillingCall('store.initialize'),
      get: () => undefined,
      restorePurchases: async () => undefined,
    };
    nativeWindow.CdvPurchase = {
      Platform: { GOOGLE_PLAY: 'google-play', APPLE_APPSTORE: 'apple-appstore' },
      ProductType: { CONSUMABLE: 'consumable', PAID_SUBSCRIPTION: 'paid-subscription' },
      store,
    };
    nativeWindow.cordova = {};

    // Synthetic first-run age confirmation lets the production tree mount without
    // turning this bootstrap check into an onboarding interaction test.
    localStorage.setItem('cgp_age_17_confirmed', '1');
  }, androidShim);

  if (!androidShim) {
    await page.addInitScript(() => {
      localStorage.setItem('cgp_age_17_confirmed', '1');
    });
  }
}

async function runProductionColdStart(
  page: Page,
  context: BrowserContext,
  androidShim: boolean,
) {
  const apiStatuses: ApiStatus[] = [];
  const apiProxyErrors: string[] = [];
  const websocketAttempts: number[] = [];
  const pageErrors: string[] = [];

  await configureOfflineSafeBrowser(
    context,
    page,
    androidShim,
    apiStatuses,
    apiProxyErrors,
    websocketAttempts,
    pageErrors,
  );

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Skip Chain Gang Poker introduction' })).toBeVisible({
    timeout: 45_000,
  });
  await expect.poll(() => apiStatuses.some(
    event => event.path === '/api/auth/guest-init' && event.status >= 200 && event.status < 300,
  ), { timeout: 45_000 }).toBe(true);

  const mountedRoot = await page.locator('#root').evaluate(element => ({
    children: element.childElementCount,
    textLength: element.textContent?.length ?? 0,
  }));
  expect(mountedRoot.children).toBeGreaterThan(0);
  expect(mountedRoot.textLength).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Skip Chain Gang Poker introduction' }).click();
  const firstRunScreen = page.locator('#root').getByTestId('text-welcome-title')
    .or(page.locator('#root').getByTestId('text-age-gate-title'));
  await expect(firstRunScreen).toBeVisible();
  const firstRunScreenName = await page.locator('#root').evaluate(root =>
    root.querySelector('[data-testid="text-welcome-title"]')
      ? 'welcome-onboarding'
      : root.querySelector('[data-testid="text-age-gate-title"]')
        ? 'age-gate'
        : 'unexpected',
  );
  mkdirSync(QA_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: resolve(QA_SCREENSHOT_DIR, androidShim
      ? 'production-cold-start-android-shim.png'
      : 'production-cold-start-web.png'),
    fullPage: true,
  });

  if (androidShim) {
    await expect.poll(() => page.evaluate(
      () => (window as QaWindow).__CGP_PRODUCTION_QA?.nativeCalls.some(
        call => call.plugin === 'FirebaseMessaging' && call.method === 'checkPermissions',
      ) ?? false,
    ), { timeout: 45_000 }).toBe(true);
  }

  const nativeState = await page.evaluate(() => {
    const qa = (window as QaWindow).__CGP_PRODUCTION_QA;
    return {
      rootDomAt: qa?.rootDomAt ?? null,
      nativeCalls: qa?.nativeCalls ?? [],
      billingShimCalls: qa?.billingShimCalls ?? [],
    };
  });

  expect(apiProxyErrors).toEqual([]);
  expect(apiStatuses.some(
    event => event.path === '/api/auth/guest-init' && event.status >= 200 && event.status < 300,
  )).toBe(true);
  expect(pageErrors).toEqual([]);

  if (androidShim) {
    expect(nativeState.nativeCalls.length).toBeGreaterThan(0);
    expect(nativeState.nativeCalls.every(call => call.phase === 'after-root-dom')).toBe(true);
    expect(nativeState.billingShimCalls).toContain('store.initialize');
  } else {
    expect(nativeState.nativeCalls).toEqual([]);
    expect(nativeState.billingShimCalls).toEqual([]);
  }

  // Diagnostics intentionally omit request/response bodies, query strings, tokens,
  // plugin arguments, and raw WebSocket URLs.
  console.log('[production-cold-start]', JSON.stringify({
    mode: androidShim ? 'android-capacitor-shim' : 'web',
    mountedRoot,
    firstRunScreen: firstRunScreenName,
    rootDomObserved: nativeState.rootDomAt !== null,
    apiStatuses: apiStatuses.map(({ method, path, status }) => ({ method, path, status })),
    nativeCalls: nativeState.nativeCalls,
    billingShimCalls: nativeState.billingShimCalls,
    websocketConnectionsBlocked: websocketAttempts.length,
    pageErrors,
  }));
}

test('full production entry cold-starts in a normal web context', async ({ page, context }) => {
  await runProductionColdStart(page, context, false);
});

test('full production entry cold-starts through a no-capability Android bridge shim', async ({ page, context }) => {
  await runProductionColdStart(page, context, true);
});