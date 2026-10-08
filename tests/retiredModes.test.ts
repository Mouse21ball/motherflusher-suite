import express from 'express';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getRetiredModeError, rejectRetiredMode, sendRetiredModeRejection } from '../server/retiredModes';

const retiredModes = ['dead7', 'fifteen35', 'suitspoker', 'suits_poker', 'kamikaze', 'bonecrusher'];
const message = 'This game mode has been retired. Please update the app to continue.';

describe('retired-mode compatibility contract', () => {
  it.each(retiredModes)('initializes only an empty display and surfaces the legacy error for %s', mode => {
    const frames: Record<string, any>[] = [];
    expect(sendRetiredModeRejection({ send: wire => frames.push(JSON.parse(wire)) }, mode, 'OLDAPP', 'old-session')).toBe(true);
    expect(frames.map(frame => frame.type)).toEqual(['mode:init', 'error']);
    expect(frames[0]).toMatchObject({
      accepted: false, playerId: 'old-session', role: 'player',
      code: 'MODE_RETIRED', modeId: mode,
      state: { phase: 'WAITING', players: [], pot: 0, deck: [], activePlayerId: '' },
    });
    expect(frames[1]).toMatchObject({ code: 'MODE_RETIRED', message, updateRequired: true });
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
    const before = downstream.mock.calls.length;
    for (const request of [
      { path: '/api/tables', method: 'POST', body: { modeId } },
      { path: `/api/tables/mode/${modeId}/join`, method: 'GET', body: undefined },
      { path: '/api/tables/OLDAPP/join', method: 'POST', body: { mode_id: modeId } },
    ]) {
      const response = await fetch(origin + request.path, {
        method: request.method,
        headers: { 'content-type': 'application/json' },
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      expect(response.status).toBe(410);
      expect(await response.json()).toMatchObject({ code: 'MODE_RETIRED', error: message, modeId, updateRequired: true });
    }
    expect(downstream.mock.calls.length).toBe(before);
  });
  it.each(['badugi', 'flushed_up', 'lady_luck', 'box_chevy', 'invalid'])('leaves existing HTTP handling unchanged for %s', async modeId => {
    const response = await fetch(`${origin}/api/tables/mode/${modeId}/join`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tableId: null });
  });
});
