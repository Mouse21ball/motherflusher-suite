import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';

type RebuyKind = 'free' | 'reserve' | 'borrow';
interface WireMessage {
  type: string;
  tableId?: string;
  modeId?: string;
  playerId?: string;
  requestId?: string;
  kind?: RebuyKind;
  amount?: number;
}

const playerId = 'qa-seat-p1';
const tableId = 'QA';

function bustedState() {
  return {
    tableId,
    phase: 'WAITING',
    pot: 0,
    players: [{
      id: playerId,
      name: 'Browser QA',
      chips: 0,
      bet: 0,
      cards: [],
      status: 'active',
      isDealer: true,
      declaration: null,
    }],
  };
}

async function mockHttpApis(page: Page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }

    if (url.pathname === '/api/version') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tableProtocol: { version: 1, leave: true, rebuy: true, borrow: true } }),
      });
      return;
    }

    if (url.pathname === '/api/auth/guest-init') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profileId: 'qa-profile',
          displayName: 'Browser QA',
          chipBalance: 30_000,
          stripes: 0,
          handsPlayed: 0,
          lifetimeProfit: 0,
          level: 1,
          xp: 0,
          hasAuth: false,
          email: null,
          avatarId: null,
          equippedAvatarId: null,
          equippedFrameId: null,
          equippedNameColorId: null,
          lastNameChangeAt: null,
          nextResetAt: null,
          sessionToken: 'browser-test-session',
          activeSubscriptionTier: null,
          subscriptionExpiresAt: null,
          equippedLobbyTrack: null,
          equippedGameTrack: null,
          equippedLadyLuckTrack: null,
        }),
      });
      return;
    }

    if (url.pathname === '/api/auth/ws-ticket') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ticket: 'browser-test-ticket' }),
      });
      return;
    }

    if (url.pathname === `/api/tables/${tableId}`) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ crewId: null }) });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, tableId: null }),
    });
  });
}

async function mockTableSocket(page: Page, outcome: 'accept' | 'ack-only' | 'reject' | 'disconnect') {
  const messages: WireMessage[] = [];
  let activeSocket: WebSocketRoute | null = null;
  let disconnected = false;

  // Catch every WS URL, including Vite/HMR and any configured production URL.
  // No socket in this fixture is allowed to connect to a real server.
  await page.routeWebSocket(/.*/, socket => {
    activeSocket = socket;
    socket.onMessage(raw => {
      let message: WireMessage;
      try {
        message = JSON.parse(String(raw)) as WireMessage;
      } catch {
        return;
      }
      messages.push(message);

      if (message.type === 'join') {
        if (outcome === 'disconnect' && disconnected) return;
        const modeId = message.modeId ?? 'badugi';
        const type = modeId === 'badugi' ? 'badugi:init' : 'mode:init';
        socket.send(JSON.stringify({ type, modeId, playerId, state: bustedState() }));
        return;
      }

      if (message.type !== 'table:rebuy') return;

      if (outcome === 'disconnect') {
        disconnected = true;
        void socket.close({ code: 4001, reason: 'simulated test disconnect' });
        return;
      }

      if (outcome === 'reject') {
        socket.send(JSON.stringify({
          type: 'rebuy:failed',
          tableId,
          requestId: message.requestId,
          error: 'Authoritative table rejected this test rebuy.',
        }));
        return;
      }

      const modeId = message.modeId ?? 'badugi';
      const snapshotType = modeId === 'badugi' ? 'badugi:snapshot' : 'mode:snapshot';
      const acceptedState = bustedState();
      acceptedState.players[0].chips = message.kind === 'free' ? 1_000 : (message.amount ?? 0);

      // Exercise the protocol ordering relied on by the modal: the authoritative
      // stack snapshot reaches the hook before the correlated success ack.
      if (outcome !== 'ack-only') {
        socket.send(JSON.stringify({ type: snapshotType, modeId, state: acceptedState }));
      }
      setTimeout(() => {
        socket.send(JSON.stringify({
          type: 'rebuy:complete',
          tableId,
          requestId: message.requestId,
          kind: message.kind,
          amount: acceptedState.players[0].chips,
          chips: acceptedState.players[0].chips,
          walletBalance: message.kind === 'reserve' ? 30_000 : 31_000,
        }));
      }, 180);
    });
  });

  return {
    messages,
    currentSocket: () => activeSocket,
  };
}

async function openBustModal(
  page: Page,
  mode: 'badugi' | 'box_chevy',
  outcome: 'accept' | 'ack-only' | 'reject' | 'disconnect',
) {
  await mockHttpApis(page);
  const mock = await mockTableSocket(page, outcome);
  await page.goto(`/server-hook-rebuy-test.html?t=${tableId}&mode=${mode}`);
  await expect(page.getByTestId('hook-mode')).toHaveText(mode);
  await expect(page.getByTestId('hook-seat')).toHaveText(playerId);
  await expect(page.getByTestId('hook-stack')).toHaveText('0');
  await expect(page.getByTestId('bust-out-modal')).toBeVisible();
  return mock;
}

function expectCorrelatedRebuy(
  message: WireMessage | undefined,
  modeId: 'badugi' | 'box_chevy',
  kind: RebuyKind,
) {
  expect(message).toMatchObject({
    type: 'table:rebuy',
    tableId,
    modeId,
    playerId,
    kind,
  });
  expect(message?.requestId).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
}

test.describe('production WebSocket hook rebuy wiring', () => {
  for (const modeId of ['badugi', 'box_chevy']) {
    test(`${modeId} coalesces direct same-tick rebuy calls before the capability check`, async ({ page }) => {
      const mock = await openBustModal(page, modeId, 'ack-only');
      let capabilityChecks = 0;
      await page.route('**/api/version', async route => {
        capabilityChecks++;
        await new Promise(resolve => setTimeout(resolve, 200));
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ tableProtocol: { version: 1, leave: true, rebuy: true, borrow: true } }),
        });
      });
      await page.getByTestId('hook-double-submit').tap();
      await expect(page.getByTestId('hook-stack')).toHaveText('1000');
      expect(capabilityChecks).toBe(1);
      expect(mock.messages.filter(message => message.type === 'table:rebuy')).toHaveLength(1);
    });
  }

  for (const modeId of ['badugi', 'box_chevy']) {
    for (const kind of ['free', 'reserve', 'borrow'] as const) {
      test(`${modeId} ${kind} updates stack and wallet from the acknowledgement without a snapshot`, async ({ page }) => {
        const mock = await openBustModal(page, modeId, 'ack-only');
        if (kind === 'reserve') {
          await page.getByTestId('button-bust-rebuy').tap();
          await page.getByTestId('buyin-confirm').tap();
        } else {
          await page.getByTestId(kind === 'free' ? 'button-bust-starter-pack' : 'button-bust-borrow-chips').tap();
        }
        await expect(page.getByTestId('hook-stack')).toHaveText(kind === 'reserve' ? '5000' : '1000');
        await expect(page.getByTestId('hook-wallet')).toHaveText(kind === 'reserve' ? '30000' : '31000');
        await expect(page.getByTestId('bust-out-modal')).toHaveCount(0);
        expect(mock.messages.filter(message => message.type === 'table:rebuy')).toHaveLength(1);
      });
    }
  }

  for (const modeId of ['badugi', 'box_chevy']) {
    test(`${modeId} borrow credits the table using one authenticated confirmed request`, async ({ page }) => {
      const mock = await openBustModal(page, modeId, 'accept');
      const loanHttpRequests: string[] = [];
      page.on('request', request => {
        if (new URL(request.url()).pathname.endsWith('/chip-loan')) loanHttpRequests.push(request.method());
      });
      await page.getByTestId('button-bust-borrow-chips').tap();
      await expect(page.getByTestId('bust-rebuy-pending')).toBeVisible();
      await expect(page.getByTestId('hook-stack')).toHaveText('1000');
      await expect(page.getByTestId('bust-out-modal')).toHaveCount(0);
      const rebuy = mock.messages.find(message => message.type === 'table:rebuy');
      expectCorrelatedRebuy(rebuy, modeId, 'borrow');
      expect(rebuy?.amount).toBe(1000);
      expect(loanHttpRequests).toEqual([]);
    });
  }

  test('borrow rejection keeps the modal open and exposes the server error', async ({ page }) => {
    const mock = await openBustModal(page, 'badugi', 'reject');
    await page.getByTestId('button-bust-borrow-chips').tap();
    await expect(page.getByTestId('bust-rebuy-error')).toContainText('rejected');
    await expect(page.getByTestId('hook-stack')).toHaveText('0');
    await expect(page.getByTestId('bust-out-modal')).toBeVisible();
    expectCorrelatedRebuy(mock.messages.find(message => message.type === 'table:rebuy'), 'badugi', 'borrow');
  });

  test('an older live backend fails promptly without sending an unhandled rebuy', async ({ page }) => {
    const mock = await openBustModal(page, 'badugi', 'accept');
    await page.route('**/api/version', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ commit: 'legacy-backend-without-rebuy-acknowledgements' }),
    }));
    await page.getByTestId('button-bust-starter-pack').tap();
    await expect(page.getByTestId('bust-rebuy-error')).toContainText('server needs an update');
    expect(mock.messages.filter(message => message.type === 'table:rebuy')).toHaveLength(0);
    await expect(page.getByTestId('hook-stack')).toHaveText('0');
    await expect(page.getByTestId('bust-out-modal')).toBeVisible();
  });

  test.use({ isMobile: true, hasTouch: true, viewport: { width: 360, height: 740 } });
  test.setTimeout(30_000);

  test('Badugi free rebuy sends a correlated request and waits for snapshot plus ack', async ({ page }) => {
    const { messages } = await openBustModal(page, 'badugi', 'accept');

    await page.getByTestId('button-bust-starter-pack').tap();
    await expect.poll(() => messages.find(message => message.type === 'table:rebuy')).toBeDefined();
    const request = messages.find(message => message.type === 'table:rebuy');
    expectCorrelatedRebuy(request, 'badugi', 'free');
    expect(request).not.toHaveProperty('amount');

    await expect(page.getByTestId('hook-stack')).toHaveText('1000');
    await expect(page.getByTestId('bust-out-modal')).toBeVisible();
    await expect(page.getByTestId('bust-out-modal')).toBeHidden({ timeout: 3_000 });
  });

  test('Box Chevy reserve rebuy uses the generic mode hook without HTTP join prevalidation', async ({ page }) => {
    const joinPrevalidationRequests: string[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === `/api/tables/${tableId}/join`) joinPrevalidationRequests.push(url.pathname);
    });
    const { messages } = await openBustModal(page, 'box_chevy', 'accept');

    await page.getByTestId('button-bust-rebuy').tap();
    await expect(page.getByTestId('buyin-slider-panel')).toBeVisible();
    await expect(page.getByTestId('buyin-confirm')).toHaveText(/Rebuy/);
    await page.getByTestId('buyin-confirm').tap();

    expect(joinPrevalidationRequests).toHaveLength(0);
    await expect.poll(() => messages.find(message => message.type === 'table:rebuy')).toBeDefined();
    const request = messages.find(message => message.type === 'table:rebuy');
    expectCorrelatedRebuy(request, 'box_chevy', 'reserve');
    expect(request?.amount).toBe(5_000);
    await expect(page.getByTestId('hook-stack')).toHaveText('5000');
    await expect(page.getByTestId('bust-out-modal')).toBeVisible();
    await expect(page.getByTestId('bust-out-modal')).toBeHidden({ timeout: 3_000 });
  });

  test('a rejected Badugi rebuy acknowledgement is visible and does not dismiss', async ({ page }) => {
    const { messages } = await openBustModal(page, 'badugi', 'reject');

    await page.getByTestId('button-bust-starter-pack').tap();
    await expect.poll(() => messages.find(message => message.type === 'table:rebuy')).toBeDefined();
    expectCorrelatedRebuy(messages.find(message => message.type === 'table:rebuy'), 'badugi', 'free');
    await expect(page.getByTestId('bust-rebuy-error'))
      .toHaveText('Authoritative table rejected this test rebuy.');
    await expect(page.getByTestId('hook-stack')).toHaveText('0');
    await expect(page.getByTestId('bust-out-modal')).toBeVisible();
  });

  test('a disconnected generic-mode rebuy rejects pending work without closing the modal', async ({ page }) => {
    const mock = await openBustModal(page, 'box_chevy', 'disconnect');

    await page.getByTestId('button-bust-starter-pack').tap();
    await expect.poll(() => mock.messages.find(message => message.type === 'table:rebuy')).toBeDefined();
    expectCorrelatedRebuy(mock.messages.find(message => message.type === 'table:rebuy'), 'box_chevy', 'free');
    await expect(page.getByTestId('bust-rebuy-error'))
      .toHaveText(/connection closed|connection unavailable|not confirmed/i, { timeout: 5_000 });
    await expect(page.getByTestId('hook-stack')).toHaveText('0');
    await expect(page.getByTestId('bust-out-modal')).toBeVisible();
  });
});