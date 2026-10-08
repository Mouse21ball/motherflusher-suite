import { expect, test, type WebSocketRoute } from '@playwright/test';
import type { LadyLuckState } from '../../shared/modes/ladyluck';

const hostId = 'll-lobby-fixture';
const errorMessage = 'Opponents could not be added. Retrying every 2 seconds. You can return to rooms and try another table.';
const lobby: LadyLuckState = {
  tableId: 'll-recovery', phase: 'LOBBY', roomType: 'pony',
  players: [{ id: hostId, name: 'Lobby Host', chips: 25_000, suit: null, wager: 0, presence: 'human', wagered: false, seatIndex: 0 }],
  positions: { spades: 0, hearts: 0, diamonds: 0, clubs: 0 },
  flippedCards: [], currentCard: null, winner: null, pot: 0, sideBets: [],
  dealerIndex: 0, currentPickIndex: 0, claimedSuits: [], startingIn: null,
  resultsTimeLeft: null, betTimeLeft: null, spectatorCount: 0,
  botFillError: { code: 'BOT_FILL_UNAVAILABLE', message: errorMessage, attempts: 4, retryInMs: 2_000 },
};

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
  test.describe(`Lady Luck lobby recovery ${viewport.width}px`, () => {
    test.use({ viewport, reducedMotion: 'reduce' });
    test.describe.configure({ timeout: 30_000 });

    test('shows a funding warning, clears it after recovery, and lets the host leave', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ hostId }) => {
        localStorage.setItem('cgp_age_17_confirmed', '1');
        localStorage.setItem('poker_table_player_name', 'Lobby Host');
        localStorage.setItem('poker_table_identity', JSON.stringify({ id: hostId, name: 'Lobby Host', avatarSeed: hostId, createdAt: 1 }));
        localStorage.setItem('poker_table_intro_seen_v2', JSON.stringify(['ladyluck']));
        sessionStorage.setItem('cgp_skip_welcome_back_once', '1');
      }, { hostId });
      await page.route('https://**/*', route => route.abort());
      // Intercept every API call, including any platform-configured production
      // URL. The regression test must never create accounts or write live data.
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let body: unknown = {};
        if (['/api/auth/me', '/api/auth/guest-init', `/api/players/${hostId}`].includes(path)) {
          body = { profileId: hostId, displayName: 'Lobby Host', chipBalance: 25_000, stripes: 0,
            hasAuth: false, level: 1, xp: 0, handsPlayed: 0, lifetimeProfit: 0,
            welcomeKitClaimed: true, sessionToken: 'synthetic-lobby-token' };
        } else if (path === '/api/auth/ws-ticket') body = { ticket: 'synthetic-ticket' };
        else if (path === '/api/version') body = { tableProtocol: { version: 1, leave: true, rebuy: true } };
        else if (path.includes('/quests')) body = { quests: [], claimed: [] };
        else if (path.includes('/tables') || ['/cosmetics', '/friends', '/crews'].some(part => path.includes(part))) body = [];
        else if (path.includes('/notifications')) body = { notifications: [], count: 0, preferences: {} };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      let socket: WebSocketRoute | undefined;
      let disconnected = false;
      await page.routeWebSocket('**/ws*', ws => {
        socket = ws;
        ws.onClose(() => { disconnected = true; });
        ws.onMessage(raw => {
          const msg = JSON.parse(String(raw));
          if (msg.type === 'll:join') ws.send(JSON.stringify({ type: 'll:state', state: lobby }));
        });
      });
      await page.goto('/ladyluck?t=ll-recovery');
      await page.getByRole('button', { name: 'Skip Chain Gang Poker introduction' }).click();
      const warning = page.getByTestId('ll-bot-fill-error');
      await expect(warning).toBeVisible();
      await expect(warning).toContainText('Retrying every 2 seconds');
      const leave = page.getByTestId('button-ll-bot-fill-leave');
      await expect(leave).toBeVisible();
      const bounds = await leave.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      const recovered = { ...lobby, botFillError: undefined };
      socket!.send(JSON.stringify({ type: 'll:state', state: recovered }));
      socket!.send(JSON.stringify({ type: 'll:bot_fill_recovered' }));
      await expect(warning).toHaveCount(0);
      socket!.send(JSON.stringify({ type: 'll:state', state: lobby }));
      await expect(warning).toBeVisible();
      await leave.click();
      await expect.poll(() => disconnected).toBe(true);
      await expect(warning).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}
