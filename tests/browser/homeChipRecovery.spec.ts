import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 30_000 });

async function openHome(page: Page, chipBalance: number) {
  await page.addInitScript(() => {
    localStorage.setItem('cgp_age_17_confirmed', '1');
    localStorage.setItem('poker_table_player_name', 'QA Player');
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const profile = {
      profileId: 'home-recovery-fixture', displayName: 'QA Player', chipBalance,
      stripes: 0, handsPlayed: 0, lifetimeProfit: 0, hasAuth: true, level: 1, xp: 0,
      welcomeKitClaimed: true, activeSubscriptionTier: null,
      sessionToken: 'synthetic-home-fixture-session',
    };
    let body: unknown = {};
    if (path === '/api/auth/me' || path === '/api/auth/guest-init' || path === '/api/players/home-recovery-fixture') body = profile;
    else if (path.includes('/quests')) body = { quests: [], claimed: [] };
    else if (path.includes('/cosmetics') || path === '/api/tables' || path.includes('/friends') || path.includes('/crews')) body = [];
    else if (path.includes('/notifications')) body = { count: 0, notifications: [], preferences: {} };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip Chain Gang Poker introduction' }).click();
  await page.getByTestId('button-welcome-back-play').click();
  await expect(page.getByTestId('text-bankroll')).toBeVisible();
}

test('zero-chip Home explains the balance and links to the existing chip shop', async ({ page }) => {
  await openHome(page, 0);
  await expect(page.getByTestId('text-bankroll')).toHaveText("You're out of chips");
  await page.getByTestId('button-home-get-chips').click();
  await expect(page).toHaveURL(/\/shop$/);
});

test('funded Home retains the normal balance without the broke-state action', async ({ page }) => {
  await openHome(page, 25000);
  await expect(page.getByTestId('text-bankroll')).toHaveText('$25,000');
  await expect(page.getByTestId('button-home-get-chips')).toHaveCount(0);
});

test('zero-chip PLAY watches live Badugi updates without betting controls and can exit offline', async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  let liveSocket: Parameters<Parameters<Page['routeWebSocket']>[1]>[0] | undefined;
  let state: Record<string, any>;
  await page.routeWebSocket('**/ws*', socket => {
    liveSocket = socket;
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw));
      sent.push(message);
      if (message.type === 'join') socket.send(JSON.stringify({
        type: 'badugi:init', role: 'spectator', playerId: '__spectator__', state,
      }));
    });
  });
  await openHome(page, 0);
  state = await page.evaluate(async () => {
    const module = await import('/src/lib/poker/engine/useGameEngine.ts');
    const initial = module.createInitialState();
    return { ...initial, phase: 'BET_1', pot: 250, spectatorCount: 1, players: initial.players.map((player: any) => ({
      ...player, name: `Live ${player.id}`, presence: 'human', chips: 1000, cards: [],
    })) };
  });
  await page.getByTestId('button-play-badugi').click();
  await expect(page).toHaveURL(/\/badugi\?.*watch=1/);
  await expect(page.getByTestId('text-spectator-watch-only')).toBeVisible();
  expect(sent.find(message => message.type === 'join')?.spectateOnly).toBe(true);
  await expect(page.getByTestId('button-all-in')).toHaveCount(0);
  state.pot = 987;
  liveSocket!.send(JSON.stringify({ type: 'badugi:snapshot', state }));
  await expect(page.getByText('$987', { exact: true }).first()).toBeVisible();
  expect(sent.some(message => message.type === 'badugi:action' || message.type === 'table:rebuy')).toBe(false);
  liveSocket!.close();
  await page.getByTestId('button-emergency-lobby').click();
  await expect(page).toHaveURL(/\/\?tableExit=local$/);
});

test('zero-chip Lady Luck watchers see live cards but cannot make side bets', async ({ page }) => {
  const messages: Record<string, unknown>[] = [];
  let socket: Parameters<Parameters<Page['routeWebSocket']>[1]>[0] | undefined;
  const state = {
    phase: 'BET', players: [], positions: { spades: 1, hearts: 0, diamonds: 0, clubs: 0 },
    flippedCards: [{ rank: 'A', suit: 'spades' }], currentCard: { rank: 'A', suit: 'spades' },
    winner: null, pot: 400, sideBets: [], roomType: 'pony', dealerIndex: 0,
    currentPickIndex: 0, claimedSuits: [], startingIn: null, resultsTimeLeft: null,
    betTimeLeft: 20, spectatorCount: 1,
  };
  await page.routeWebSocket('**/ws*', ws => {
    socket = ws;
    ws.onMessage(raw => {
      const message = JSON.parse(String(raw));
      messages.push(message);
      if (message.type === 'll:spectate') ws.send(JSON.stringify({ type: 'll:state', state }));
    });
  });
  await openHome(page, 0);
  await page.evaluate(() => {
    history.pushState({}, '', '/ladyluck/spectate?t=LLQA');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByText('Watching only — get chips to play.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /lock.*bet/i })).toHaveCount(0);
  await expect(page.locator('input[type="range"]')).toHaveCount(0);
  expect(messages.some(message => message.type === 'll:spectator_sidebet' || message.type === 'll:join')).toBe(false);
  socket!.send(JSON.stringify({ type: 'll:state', state: { ...state, phase: 'RACE',
    positions: { ...state.positions, hearts: 1 }, currentCard: { rank: 'K', suit: 'hearts' },
    flippedCards: [...state.flippedCards, { rank: 'K', suit: 'hearts' }] } }));
  await expect(page.getByText('K♥', { exact: true })).toBeVisible();
  await expect(page.getByText('Watching only — get chips to play.', { exact: true })).toBeVisible();
  socket!.close();
  await page.getByTestId('button-emergency-lobby').click();
  await expect(page).toHaveURL(/\/\?tableExit=local$/);
});