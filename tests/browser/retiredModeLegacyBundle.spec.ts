import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { sendRetiredModeRejection } from '../../server/retiredModes';

const modes = ['dead7', 'fifteen35', 'suitspoker', 'kamikaze', 'bonecrusher'];
const names: Record<string, string> = { dead7: 'Dead 7', fifteen35: 'Fifteen-Thirty-Five',
  suitspoker: 'Suits Poker', kamikaze: 'Kamikaze', bonecrusher: 'Bonecrusher' };
// This archived Android bundle predates forwarding actionError to these pages.
// Keep this limitation explicit; a server cannot patch an installed JS renderer.
const androidMissingBanner = new Set(['dead7', 'fifteen35', 'suitspoker', 'kamikaze']);
const bundles = [
  { platform: 'Android', root: 'android/app/src/main/assets/public', viewport: { width: 412, height: 915 } },
  { platform: 'iOS iPad layout', root: 'ios/App/App/public', viewport: { width: 820, height: 1180 } },
];

// Optional archived-bundle QA: cap sync must NOT be run first, since it would
// replace precisely the old UI we are verifying. CI without native assets skips.
for (const bundle of bundles) {
  const root = path.resolve(bundle.root);
  const index = path.join(root, 'index.html');
  const available = fs.existsSync(index) &&
    /Dead 7|15\/35|Suits/.test(fs.readFileSync(index, 'utf8'));
  test.describe(`retired-mode banner in archived ${bundle.platform} UI`, () => {
    test.describe.configure({ timeout: 30_000 });
    test.skip(!available, 'Requires an archived nine-mode native web bundle');
    test.use({ viewport: bundle.viewport });
    for (const mode of modes) {
      const message = `${names[mode]} has been retired. Please update the app to continue.`;
      const missingBanner = bundle.platform === 'Android' && androidMissingBanner.has(mode);
      test(`${mode} ${missingBanner ? 'receives rejection but archived UI lacks its banner' : 'shows the real legacy error banner'}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript((ids: string[]) => {
          localStorage.setItem('cgp_age_17_confirmed', '1');
          localStorage.setItem('poker_table_player_name', 'Legacy Player');
          localStorage.setItem('poker_table_identity', JSON.stringify({
            id: 'retirement-fixture', name: 'Legacy Player', avatarSeed: 'Legacy Player', createdAt: 1,
          }));
          localStorage.setItem('poker_table_intro_seen_v2', JSON.stringify(ids));
          sessionStorage.setItem('cgp_skip_welcome_back_once', '1');
        }, modes);
        let joinSeen = false;
        const sentFrames: Record<string, unknown>[] = [];
        await page.routeWebSocket('**/ws*', socket => {
          socket.onMessage(wire => {
            const msg = JSON.parse(String(wire));
            if (msg.type === 'join') {
              joinSeen = true;
              sendRetiredModeRejection({ send: frame => {
                sentFrames.push(JSON.parse(frame));
                socket.send(frame);
              } }, msg.modeId, msg.tableId, msg.playerId, { platform: bundle.platform === 'Android' ? 'android' : 'ios' });
            } else if (msg.type === 'leave') {
              socket.send(JSON.stringify({ type: 'leave:complete', leaveId: msg.leaveId }));
            }
          });
        });
        await page.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.pathname.startsWith('/api/')) {
            const profile = {
              profileId: 'retirement-fixture', displayName: 'Legacy Player',
              chipBalance: 25000, stripes: 0, handsPlayed: 0, lifetimeProfit: 0,
              hasAuth: false, level: 1, xp: 0, welcomeKitClaimed: true,
              activeSubscriptionTier: null, sessionToken: 'synthetic-retirement-token',
            };
            let body: unknown = {};
            if (['/api/auth/me', '/api/auth/guest-init', '/api/players/retirement-fixture'].includes(url.pathname)) body = profile;
            else if (url.pathname === '/api/auth/ws-ticket') body = { ticket: 'synthetic-ticket' };
            else if (url.pathname === '/api/version') body = { tableProtocol: { version: 1, leave: true, rebuy: true } };
            else if (url.pathname.includes('/quests')) body = { quests: [], claimed: [] };
            else if (url.pathname.includes('/tables/mode/')) body = { tableId: null };
            else if (['/cosmetics', '/friends', '/crews'].some(part => url.pathname.includes(part)) || url.pathname === '/api/tables') body = [];
            else if (url.pathname.includes('/notifications')) body = { count: 0, notifications: [], preferences: {} };
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
            return;
          }
          if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
            await route.abort();
            return;
          }
          // Everything is intercepted: no production API/assets can be touched.
          let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
          if (!file.startsWith(root + path.sep)) { await route.abort(); return; }
          if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
            if (url.pathname.includes('.')) { await route.fulfill({ status: 404 }); return; }
            file = index;
          }
          const mime: Record<string, string> = {
            '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
            '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
            '.svg': 'image/svg+xml', '.json': 'application/json',
          };
          await route.fulfill({ contentType: mime[path.extname(file)] ?? 'application/octet-stream', body: fs.readFileSync(file) });
        });
        await page.goto(`/${mode}?t=OLDAPP`);
        await page.getByRole('button', { name: 'Skip Chain Gang Poker introduction' }).click();
        const playNow = page.getByRole('button', { name: 'Play now', exact: true });
        if (bundle.platform === 'Android') await playNow.click();
        await expect.poll(() => joinSeen).toBe(true);
        expect(sentFrames.map(frame => frame.type)).toEqual(['mode:init', 'error']);
        expect(sentFrames[1]).toMatchObject({ updateRequired: true, message, updateUrl: bundle.platform === 'Android'
          ? 'https://play.google.com/store/apps/details?id=com.dgmentertainment.poker'
          : 'https://apps.apple.com/app/id6796398661' });
        const banner = page.getByRole('alert').filter({ hasText: message });
        if (missingBanner) {
          await expect(page.locator('#root')).not.toBeEmpty();
          await expect(banner).not.toBeVisible();
        } else {
          await expect(banner).toBeVisible();
        }
        expect(errors).toEqual([]);
      });
    }
  });
}
