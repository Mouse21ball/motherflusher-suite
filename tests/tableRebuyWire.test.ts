import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import WebSocket, { type RawData } from 'ws';
import { storage } from '../server/storage';
import { issueWsTicket } from '../server/wsTickets';
import type { GameState } from '../shared/gameTypes';

const authenticatedPlayerId = 'wire-test-profile';

interface ServerMessage {
  type: string;
  tableId?: string;
  playerId?: string;
  requestId?: string;
  error?: string;
  chips?: number;
  walletBalance?: number;
  state?: GameState;
}

let httpServer: Server;
let websocketServer: Awaited<ReturnType<typeof startRooms>>['websocketServer'];
let port: number;
let walletBalance = 30_000;
const freeGrants = new Set<string>();
const loanGrants = new Set<string>();

async function startRooms() {
  const { initRooms } = await import('../server/rooms');
  return { websocketServer: initRooms(httpServer) };
}

function messageFrom(raw: RawData): ServerMessage {
  return JSON.parse(raw.toString()) as ServerMessage;
}

function waitForMessage(
  socket: WebSocket,
  predicate: (message: ServerMessage) => boolean,
  timeoutMs = 4_000,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for table server message after ${timeoutMs}ms.`));
    }, timeoutMs);
    const onMessage = (raw: RawData) => {
      const message = messageFrom(raw);
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

async function connectPlayer(tableId: string, requestedBuyIn?: number) {
  const sessionId = `wire-session-${tableId}`;
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/ws?ticket=${issueWsTicket(authenticatedPlayerId)}`,
  );
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  const initPromise = waitForMessage(socket, message => message.type === 'badugi:init');
  socket.send(JSON.stringify({
    type: 'join',
    tableId,
    modeId: 'badugi',
    playerId: sessionId,
    identityId: authenticatedPlayerId,
    name: 'Wire Test',
    seatId: sessionId,
    isPrivate: true,
    buyinChips: requestedBuyIn,
  }));
  const init = await initPromise;
  const seat = init.playerId;
  if (!seat || !init.state) throw new Error('The real WebSocket join did not assign an authoritative seat.');
  return { socket, seat, sessionId };
}

function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise(resolve => {
    socket.once('close', () => resolve());
    socket.close();
  });
}

async function setSeatBusted(tableId: string, seat: string) {
  const { getOrCreateBadugiTable } = await import('../server/gameEngine');
  const table = getOrCreateBadugiTable(tableId, true, false, { maxPlayers: 5, botsEnabled: false });
  table.state = {
    ...table.state,
    phase: 'WAITING',
    pot: 0,
    activePlayerId: null,
    players: table.state.players.map((player: GameState['players'][number]) => player.id === seat
      ? { ...player, chips: 0, status: 'sitting_out' }
      : player),
  };
  return table;
}

async function sendRebuy(
  socket: WebSocket,
  message: Record<string, unknown>,
  requestId: string,
) {
  const responsePromise = waitForMessage(socket, response =>
    (response.type === 'rebuy:complete' || response.type === 'rebuy:failed') &&
    response.requestId === requestId,
  );
  socket.send(JSON.stringify({ type: 'table:rebuy', ...message, requestId }));
  return responsePromise;
}

describe('table rebuys over the real server WebSocket handler', () => {
  const unrefLongTimers = () => {
    const originalSetInterval = globalThis.setInterval;
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const timer = originalSetInterval(handler, timeout, ...args);
      if (timeout === 60 * 60 * 1000) timer.unref();
      return timer;
    }) as typeof globalThis.setInterval);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const timer = originalSetTimeout(handler, timeout, ...args);
      if ((timeout ?? 0) >= 60_000) timer.unref();
      return timer;
    }) as typeof globalThis.setTimeout);
  };

  beforeAll(async () => {
    vi.stubEnv('BADUGI_ALPHA_ENABLED', 'true');
    unrefLongTimers();

    httpServer = createServer();
    websocketServer = (await startRooms()).websocketServer;

    await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Could not start the loopback WebSocket server.');
    port = address.port;

    vi.spyOn(storage, 'getPlayerActiveTable').mockResolvedValue(null);
    vi.spyOn(storage, 'setPlayerActiveTable').mockResolvedValue();
    vi.spyOn(storage, 'clearPlayerActiveTable').mockResolvedValue();
    vi.spyOn(storage, 'recordRecentCoSeatedPlayers').mockResolvedValue();
    vi.spyOn(storage, 'getOrCreatePlayer').mockImplementation(async () => ({
      chipBalance: walletBalance,
      activeSubscriptionTier: null,
    } as never));
    vi.spyOn(storage, 'getPlayerProfile').mockImplementation(async () => ({
      chipBalance: walletBalance,
      activeSubscriptionTier: null,
    } as never));
    vi.spyOn(storage, 'claimFreeTableRebuy').mockImplementation(async (_playerId, gameId, eventId) => {
      const key = `${_playerId}:${gameId}:${eventId}`;
      if (freeGrants.has(key)) return { granted: false, chipBalance: walletBalance };
      freeGrants.add(key);
      walletBalance += 1_000;
      return { granted: true, chipBalance: walletBalance };
    });
    vi.spyOn(storage, 'grantTableChipLoan').mockImplementation(async (_playerId, gameId, requestId) => {
      const key = `${_playerId}:${gameId}:${requestId}`;
      if (loanGrants.has(key)) return { success: true, newBalance: walletBalance };
      if (walletBalance > 500) return { success: false, error: 'not_broke' };
      loanGrants.add(key);
      walletBalance += 1_000;
      return { success: true, newBalance: walletBalance };
    });
  });

  afterAll(async () => {
    for (const client of websocketServer.clients) client.terminate();
    await new Promise<void>(resolve => websocketServer.close(() => resolve()));
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    { kind: 'free', amount: undefined, startWallet: 30_000 },
    { kind: 'reserve', amount: 1_000, startWallet: 5_000 },
    { kind: 'borrow', amount: 1_000, startWallet: 400 },
  ])('accepts a $kind request and replies with its request ID after the real engine credits the seat', async ({
    kind, amount, startWallet,
  }) => {
    walletBalance = startWallet;
    const tableId = `wire-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId, kind === 'reserve' ? 1_000 : undefined);
    try {
      const table = await setSeatBusted(tableId, seat);
      const requestId = `wire-${kind}-request-01`;
      const result = await sendRebuy(socket, {
        tableId,
        modeId: 'badugi',
        playerId: seat,
        kind,
        ...(amount == null ? {} : { amount }),
      }, requestId);

      expect(result).toMatchObject({
        type: 'rebuy:complete',
        tableId,
        requestId,
        chips: 1_000,
      });
      expect(table.state.players.find(player => player.id === seat)?.chips).toBe(1_000);
      expect(walletBalance).toBe(startWallet + (kind === 'reserve' ? 0 : 1_000));
    } finally {
      await closeSocket(socket);
    }
  });

  it.each([
    { kind: 'free', amount: undefined, startWallet: 30_000 },
    { kind: 'reserve', amount: 1_000, startWallet: 5_000 },
    { kind: 'borrow', amount: 1_000, startWallet: 400 },
  ])('rejects a second independent $kind request during the same bust event', async ({
    kind, amount, startWallet,
  }) => {
    walletBalance = startWallet;
    const tableId = `wire-duplicate-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId, kind === 'reserve' ? 1_000 : undefined);
    try {
      const table = await setSeatBusted(tableId, seat);
      const beforeFreeGrants = vi.mocked(storage.claimFreeTableRebuy).mock.calls.length;
      const beforeLoans = vi.mocked(storage.grantTableChipLoan).mock.calls.length;
      const request = {
        tableId,
        modeId: 'badugi',
        playerId: seat,
        kind,
        ...(amount == null ? {} : { amount }),
      };

      const first = sendRebuy(socket, request, `wire-first-${kind}-001`);
      const second = sendRebuy(socket, request, `wire-second-${kind}-01`);
      const results = await Promise.all([first, second]);

      expect(results.filter(result => result.type === 'rebuy:complete')).toHaveLength(1);
      expect(results.filter(result => result.type === 'rebuy:failed')).toHaveLength(1);
      expect(results.find(result => result.type === 'rebuy:failed')?.error).toMatch(/already|busted/i);
      expect(table.state.players.find(player => player.id === seat)?.chips).toBe(1_000);
      expect(walletBalance).toBe(startWallet + (kind === 'reserve' ? 0 : 1_000));
      expect(vi.mocked(storage.claimFreeTableRebuy).mock.calls.length - beforeFreeGrants).toBe(kind === 'free' ? 1 : 0);
      expect(vi.mocked(storage.grantTableChipLoan).mock.calls.length - beforeLoans).toBe(kind === 'borrow' ? 1 : 0);
    } finally {
      await closeSocket(socket);
    }
  });

  it('keeps two different free-rebuy requests in flight on one bust event behind the seat lock', async () => {
    walletBalance = 30_000;
    const tableId = `wire-delayed-duplicate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId);
    try {
      const table = await setSeatBusted(tableId, seat);
      let releaseGrant!: () => void;
      let signalGrantStarted!: () => void;
      const grantGate = new Promise<void>(resolve => { releaseGrant = resolve; });
      const grantStarted = new Promise<void>(resolve => { signalGrantStarted = resolve; });
      const originalClaim = vi.mocked(storage.claimFreeTableRebuy).getMockImplementation()!;
      let grantCalls = 0;
      vi.mocked(storage.claimFreeTableRebuy).mockImplementation(async (...args) => {
        grantCalls++;
        signalGrantStarted();
        await grantGate;
        return originalClaim(...args);
      });

      const first = sendRebuy(socket, {
        tableId, modeId: 'badugi', playerId: seat, kind: 'free',
      }, 'wire-delayed-first');
      await grantStarted;
      const second = sendRebuy(socket, {
        tableId, modeId: 'badugi', playerId: seat, kind: 'free',
      }, 'wire-delayed-second');

      await new Promise(resolve => setTimeout(resolve, 15));
      expect(grantCalls).toBe(1);
      expect(table.actionLock).toBe(true);
      releaseGrant();

      const results = await Promise.all([first, second]);
      expect(results.filter(result => result.type === 'rebuy:complete')).toHaveLength(1);
      expect(results.filter(result => result.type === 'rebuy:failed')).toHaveLength(1);
      expect(grantCalls).toBe(1);
      expect(walletBalance).toBe(31_000);
      expect(table.state.players.find(player => player.id === seat)?.chips).toBe(1_000);
    } finally {
      await closeSocket(socket);
    }
  });

  it('permits a genuinely new bust event after the prior free rebuy funded the seat', async () => {
    walletBalance = 30_000;
    const tableId = `wire-new-bust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId);
    try {
      const table = await setSeatBusted(tableId, seat);
      const first = await sendRebuy(socket, {
        tableId, modeId: 'badugi', playerId: seat, kind: 'free',
      }, 'wire-new-bust-first');
      expect(first.type).toBe('rebuy:complete');

      await setSeatBusted(tableId, seat);
      const second = await sendRebuy(socket, {
        tableId, modeId: 'badugi', playerId: seat, kind: 'free',
      }, 'wire-new-bust-second');
      expect(second.type).toBe('rebuy:complete');
      expect(table.state.players.find(player => player.id === seat)?.chips).toBe(1_000);
      expect(walletBalance).toBe(32_000);
    } finally {
      await closeSocket(socket);
    }
  });

  it('correlates invalid kinds to an explicit rebuy:failed response', async () => {
    walletBalance = 30_000;
    const tableId = `wire-invalid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId);
    try {
      const requestId = 'wire-invalid-request';
      const result = await sendRebuy(socket, {
        tableId,
        modeId: 'badugi',
        playerId: seat,
        kind: 'bogus',
      }, requestId);
      expect(result).toMatchObject({
        type: 'rebuy:failed',
        tableId,
        requestId,
        error: 'Invalid rebuy request.',
      });
    } finally {
      await closeSocket(socket);
    }
  });

  it('rejects a request whose seat is not owned by the authenticated profile', async () => {
    walletBalance = 30_000;
    const tableId = `wire-owner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket } = await connectPlayer(tableId);
    try {
      const requestId = 'wire-owner-request';
      const result = await sendRebuy(socket, {
        tableId,
        modeId: 'badugi',
        playerId: 'another-users-seat',
        kind: 'free',
      }, requestId);
      expect(result).toMatchObject({
        type: 'rebuy:failed',
        tableId,
        requestId,
      });
      expect(result.error).toContain('does not belong to your account');
    } finally {
      await closeSocket(socket);
    }
  });
});