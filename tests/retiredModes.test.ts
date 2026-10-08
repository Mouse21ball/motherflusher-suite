import express from 'express';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getRetiredModeError, getRetirementPlatform, rejectRetiredMode, sendRetiredModeRejection } from '../server/retiredModes';
import { APP_STORE_LISTING_URL, PLAY_STORE_LISTING_URL } from '../shared/mobileStoreListings';

const retiredModes = ['dead7', 'fifteen35', 'suitspoker', 'suits_poker', 'kamikaze', 'bonecrusher'];
const names: Record<string, string> = {
  dead7: 'Dead 7', fifteen35: 'Fifteen-Thirty-Five', suitspoker: 'Suits Poker',
  suits_poker: 'Suits Poker', kamikaze: 'Kamikaze', bonecrusher: 'Bonecrusher',
};

describe('retired-mode compatibility contract', () => {
  it.each(retiredModes)('initializes only an empty display and surfaces the legacy error for %s', mode => {
    const message = `${names[mode]} has been retired. Please update the app to continue.`;
    const frames: Record<string, any>[] = [];
    expect(sendRetiredModeRejection({ send: wire => frames.push(JSON.parse(wire)) }, mode, 'OLDAPP', 'old-session')).toBe(true);
    expect(frames.map(frame => frame.type)).toEqual(['mode:init', 'error']);
    expect(frames[0]).toMatchObject({
      accepted: false, playerId: 'old-session', role: 'player',
      modeId: mode, modeName: names[mode],
      state: { phase: 'WAITING', players: [], pot: 0, deck: [], activePlayerId: '' },
    });
    expect(frames[1]).toMatchObject({ message, updateRequired: true, updateUrl: null,
      storeLinks: { ios: APP_STORE_LISTING_URL, android: PLAY_STORE_LISTING_URL } });
    expect(JSON.stringify(frames)).not.toMatch(/MODE_RETIRED|unknown-mode|mode-retired/);
    expect(frames[1]).not.toHaveProperty('code');
    expect(frames[1]).not.toHaveProperty('reason');
    // Exact ordering requirement from the shipped useServerMode consumer:
    // a pre-init error closes the socket without setting actionError.
    let initialized = false;
    let actionError: string | null = null;
    let closed = false;
    for (const frame of frames) {
      if (frame.type === 'mode:init' && Array.isArray(frame.state?.players)) initialized = true;
      if (frame.type === 'error') {
        if (!initialized) { closed = true; continue; }
        actionError = String(frame.message ?? 'Action rejected.');
      }
    }
    expect(actionError).toBe(message);
    expect(closed).toBe(false);
  });

  it.each(['badugi', 'flushed_up', 'lady_luck', 'box_chevy', 'invalid', 'DEAD7', '', '__proto__', null])(
    'does not classify kept or genuinely invalid IDs as retired: %s', mode => {
      expect(getRetiredModeError(mode)).toBeNull();
      const send = vi.fn();
      if (typeof mode === 'string') expect(sendRetiredModeRejection({ send }, mode, 'TEST', 'session')).toBe(false);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 wv', 'android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) Mobile/15E148', 'ios'],
    ['Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X) Mobile/15E148', 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Mobile/15E148', 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Chrome/130.0 Safari/537.36', 'web'],
    ['', 'web'],
  ])('identifies legacy platform from User-Agent %s', (userAgent, expected) => {
    expect(getRetirementPlatform({ userAgent })).toBe(expected);
  });
  it('accepts an explicit Capacitor platform and ignores invalid platform hints', () => {
    expect(getRetirementPlatform({ platform: 'ios' })).toBe('ios');
    expect(getRetirementPlatform({ platform: 'android' })).toBe('android');
    expect(getRetirementPlatform({ platform: 'web', userAgent: 'Android' })).toBe('web');
    expect(getRetirementPlatform({ platform: 'unknown', userAgent: 'Android' })).toBe('android');
    expect(getRetirementPlatform({ platform: ['ios'], userAgent: 'iPhone' })).toBe('ios');
  });
  it.each(retiredModes.flatMap(mode => ['ios', 'android'].map(platform => [mode, platform])))(
    'includes the correct store URL in both frames for %s on %s', (mode, platform) => {
      const frames: Record<string, unknown>[] = [];
      sendRetiredModeRejection({ send: raw => frames.push(JSON.parse(raw)) }, mode, 'OLD', 'session', { platform });
      for (const frame of frames) {
        expect(frame).toMatchObject({ platform, updateUrl: platform === 'ios' ? APP_STORE_LISTING_URL : PLAY_STORE_LISTING_URL,
          message: `${names[mode]} has been retired. Please update the app to continue.` });
        expect(frame.updateUrl).not.toContain('write-review');
      }
    },
  );
});

describe('retired HTTP create and join rejection', () => {
  let server: Server;
  let origin: string;
  const downstream = vi.fn();
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/tables', rejectRetiredMode, (_req, res) => { downstream(); res.sendStatus(201); });
    app.post('/api/tables/:table_id/join', rejectRetiredMode, (_req, res) => { downstream(); res.sendStatus(200); });
    app.get('/api/tables/mode/:modeId/join', rejectRetiredMode, (_req, res) => { downstream(); res.json({ tableId: null }); });
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing HTTP test port');
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  it.each(retiredModes)('rejects create, public matching and buy-in for %s before downstream side effects', async modeId => {
    const message = `${names[modeId]} has been retired. Please update the app to continue.`;
    const before = downstream.mock.calls.length;
    for (const request of [
      { path: '/api/tables', method: 'POST', body: { modeId } },
      { path: `/api/tables/mode/${modeId}/join`, method: 'GET', body: undefined },
      { path: '/api/tables/OLDAPP/join', method: 'POST', body: { mode_id: modeId } },
    ]) {
      const response = await fetch(origin + request.path, {
        method: request.method,
        headers: { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) wv' },
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      expect(response.status).toBe(410);
      const payload = await response.json();
      expect(payload).toMatchObject({ error: message, message, modeId, modeName: names[modeId], updateRequired: true,
        platform: 'android', updateUrl: PLAY_STORE_LISTING_URL });
      expect(payload).not.toHaveProperty('code');
      expect(payload).not.toHaveProperty('reason');
    }
    expect(downstream.mock.calls.length).toBe(before);
  });
  it.each([
    { path: '/api/tables', method: 'POST', body: { modeId: 'dead7' } },
    { path: '/api/tables/mode/dead7/join', method: 'GET' },
    { path: '/api/tables/OLDAPP/join', method: 'POST', body: { mode_id: 'dead7' } },
  ])('uses the App Store for a legacy iPad request to $path', async request => {
    const response = await fetch(origin + request.path, {
      method: request.method, body: request.body ? JSON.stringify(request.body) : undefined,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Mobile/15E148' },
    });
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      platform: 'ios', updateUrl: APP_STORE_LISTING_URL,
      error: 'Dead 7 has been retired. Please update the app to continue.',
    });
  });
  it('uses optional platform hints for requests without a useful User-Agent', async () => {
    for (const url of ['/api/tables/mode/kamikaze/join?platform=ios', '/api/tables/mode/kamikaze/join']) {
      const response = await fetch(origin + url, { headers: { 'x-app-platform': 'ios', 'User-Agent': 'legacy-http' } });
      expect(await response.json()).toMatchObject({ platform: 'ios', updateUrl: APP_STORE_LISTING_URL });
    }
    const response = await fetch(origin + '/api/tables', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modeId: 'kamikaze', platform: 'android' }) });
    expect(await response.json()).toMatchObject({ platform: 'android', updateUrl: PLAY_STORE_LISTING_URL });
  });
  it.each(['badugi', 'flushed_up', 'lady_luck', 'box_chevy', 'invalid'])('leaves existing HTTP handling unchanged for %s', async modeId => {
    const response = await fetch(`${origin}/api/tables/mode/${modeId}/join`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tableId: null });
  });
});
