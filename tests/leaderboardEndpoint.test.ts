import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import { inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { storage } from '../server/storage';
import { registerLeaderboardRoute } from '../server/leaderboardRoutes';
import { playerProfiles } from '../shared/schema';
import { LEADERBOARD_LIMIT, type LeaderboardResponse } from '../shared/leaderboard';

describe.skipIf(!process.env.DATABASE_URL)('real lifetime-profit leaderboard endpoint', () => {
  const runId = randomUUID();
  const players = Array.from({ length: LEADERBOARD_LIMIT + 1 }, (_, i) => ({
    id: `test-leaderboard-${runId}-${String(i).padStart(3, '0')}`,
    displayName: `Real test player ${i}`,
    lifetimeProfit: 2_000_000_000 - i,
    xp: i * 10,
    handsPlayed: i + 1,
    email: `test-leaderboard-${runId}-${i}@example.test`,
  }));
  const excluded = [
    { id: `bot_${runId}`, displayName: 'Bot', lifetimeProfit: 2_100_000_000 },
    { id: `test-leaderboard-deleted-${runId}`, displayName: 'Deleted', lifetimeProfit: 2_100_000_000, isDeleted: true },
    { id: `test-leaderboard-banned-${runId}`, displayName: 'Banned', lifetimeProfit: 2_100_000_000, bannedAt: new Date() },
  ];
  const ids = [...players, ...excluded].map(row => row.id);
  let server: Server;
  let url: string;
  let token: string;

  beforeAll(async () => {
    await db.insert(playerProfiles).values([...players, ...excluded]);
    token = await storage.createSession(players[LEADERBOARD_LIMIT].id, new Date(Date.now() + 60_000));
    const app = express();
    registerLeaderboardRoute(app);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.delete(playerProfiles).where(inArray(playerProfiles.id, ids));
  });

  it('requires an authenticated player', async () => {
    const response = await fetch(`${url}/api/leaderboard`);
    expect(response.status).toBe(401);
  });

  it('returns only real eligible profiles, ordered and capped at 50, with the viewer’s actual rank', async () => {
    const response = await fetch(`${url}/api/leaderboard`, { headers: { 'X-Session-Token': token } });
    expect(response.status).toBe(200);
    const board = await response.json() as LeaderboardResponse;
    expect(board.entries).toHaveLength(LEADERBOARD_LIMIT);
    expect(board.entries.map(row => row.id)).toEqual(players.slice(0, LEADERBOARD_LIMIT).map(row => row.id));
    expect(board.entries.map(row => row.lifetimeProfit)).toEqual(players.slice(0, LEADERBOARD_LIMIT).map(row => row.lifetimeProfit));
    expect(board.entries.map(row => row.rank)).toEqual(Array.from({ length: LEADERBOARD_LIMIT }, (_, i) => i + 1));
    expect(board.entries[0]).toMatchObject({
      displayName: players[0].displayName, xp: 0, handsPlayed: 1,
    });
    expect(board.me).toMatchObject({
      id: players[LEADERBOARD_LIMIT].id, rank: LEADERBOARD_LIMIT + 1,
      lifetimeProfit: players[LEADERBOARD_LIMIT].lifetimeProfit,
    });
    expect(board.total).toBeGreaterThanOrEqual(players.length);
    expect(board.entries.every(row => !excluded.some(ex => ex.id === row.id))).toBe(true);
    expect(Object.keys(board.entries[0]).sort()).toEqual([
      'avatarId', 'displayName', 'equippedAvatarId', 'equippedFrameId',
      'handsPlayed', 'id', 'lifetimeProfit', 'rank', 'xp',
    ].sort());
    expect(JSON.stringify(board)).not.toContain('@example.test');
  });
});