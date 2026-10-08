import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  leaveId?: string;
  code?: string;
  modeId?: string;
  accepted?: boolean;
  error?: string;
  message?: string;
  chips?: number;
  walletBalance?: number;
  state?: GameState;
}

let httpServer: Server;
let websocketServer: Awaited<ReturnType<typeof startRooms>>['websocketServer'];
let port: number;
let walletBalance = 30_000;
let loanBalance = 0;
let activeTableId: string | null = null;
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

async function connectPlayer(tableId: string, requestedBuyIn?: number, modeId = 'badugi') {
  const sessionId = `wire-session-${tableId}`;
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/ws?ticket=${issueWsTicket(authenticatedPlayerId)}`,
  );
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  const initPromise = waitForMessage(socket, message => message.type === (modeId === 'badugi' ? 'badugi:init' : 'mode:init'));
  socket.send(JSON.stringify({
    type: 'join',
    tableId,
    modeId,
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

async function setSeatBusted(tableId: string, seat: string, modeId = 'badugi') {
  const table = modeId === 'badugi'
    ? (await import('../server/gameEngine')).getOrCreateBadugiTable(tableId, true, false, { maxPlayers: 5, botsEnabled: false })
    : (await import('../server/genericEngine')).getOrCreateTable(modeId, tableId, true, false, { maxPlayers: 5, botsEnabled: false });
  if (!table) throw new Error(`Could not load ${modeId} table for wire rebuy test.`);
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

function sendLegacyRebuy(
  socket: WebSocket,
  tableId: string,
  playerId: string,
  payload: unknown,
  modeId = 'badugi',
  claimedModeId = modeId,
): Promise<ServerMessage> {
  const responseType = modeId === 'badugi' ? 'badugi:snapshot' : 'mode:snapshot';
  const responsePromise = waitForMessage(socket, message =>
    message.type === 'error' ||
    (message.type === responseType &&
      (message.state?.players.find(player => player.id === playerId)?.chips ?? 0) > 0),
  );
  socket.send(JSON.stringify({
    type: modeId === 'badugi' ? 'badugi:action' : 'mode:action',
    tableId,
    modeId: claimedModeId,
    playerId,
    action: 'rebuy',
    payload,
  }));
  return responsePromise;
}

function collectRebuyResponses(
  socket: WebSocket,
  count: number,
  modeId: string,
): Promise<ServerMessage[]> {
  const snapshotType = modeId === 'badugi' ? 'badugi:snapshot' : 'mode:snapshot';
  return new Promise((resolve, reject) => {
    const messages: ServerMessage[] = [];
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for both legacy rebuy responses.'));
    }, 4_000);
    const onMessage = (raw: RawData) => {
      const message = messageFrom(raw);
      if (message.type !== 'error' && message.type !== snapshotType) return;
      messages.push(message);
      if (messages.length === count) {
        clearTimeout(timeout);
        socket.off('message', onMessage);
        resolve(messages);
      }
    };
    socket.on('message', onMessage);
  });
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

    vi.spyOn(storage, 'getPlayerActiveTable').mockImplementation(async () => activeTableId);
    vi.spyOn(storage, 'setPlayerActiveTable').mockImplementation(async (_playerId, tableId) => {
      activeTableId = tableId;
    });
    vi.spyOn(storage, 'clearPlayerActiveTable').mockImplementation(async (_playerId) => {
      activeTableId = null;
    });
    vi.spyOn(storage, 'syncPlayerLeaveDelta').mockImplementation(async (_playerId, gameId) => {
      if (activeTableId === gameId) activeTableId = null;
    });
    vi.spyOn(storage, 'recordRecentCoSeatedPlayers').mockResolvedValue();
    vi.spyOn(storage, 'getOrCreatePlayer').mockImplementation(async () => ({
      chipBalance: walletBalance,
      activeSubscriptionTier: null,
    } as never));
    vi.spyOn(storage, 'getPlayerProfile').mockImplementation(async () => ({
      chipBalance: walletBalance,
      chipLoanBalance: loanBalance,
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
      loanBalance = 1_000;
      return { success: true, newBalance: walletBalance };
    });
    vi.spyOn(storage, 'grantChipLoan').mockImplementation(async () => {
      if (loanBalance > 0) return { success: false, error: 'existing_loan' };
      if (walletBalance > 500) return { success: false, error: 'not_broke' };
      walletBalance += 1_000;
      loanBalance = 1_000;
      return { success: true, newBalance: walletBalance };
    });
  });

  beforeEach(() => {
    walletBalance = 30_000;
    loanBalance = 0;
    activeTableId = null;
    vi.mocked(storage.claimFreeTableRebuy).mockClear().mockImplementation(async (_playerId, gameId, eventId) => {
      const key = `${_playerId}:${gameId}:${eventId}`;
      if (freeGrants.has(key)) return { granted: false, chipBalance: walletBalance };
      freeGrants.add(key);
      walletBalance += 1_000;
      return { granted: true, chipBalance: walletBalance };
    });
    vi.mocked(storage.grantTableChipLoan).mockClear().mockImplementation(async (_playerId, gameId, requestId) => {
      const key = `${_playerId}:${gameId}:${requestId}`;
      if (loanGrants.has(key)) return { success: true, newBalance: walletBalance };
      if (walletBalance > 500) return { success: false, error: 'not_broke' };
      loanGrants.add(key);
      walletBalance += 1_000;
      loanBalance = 1_000;
      return { success: true, newBalance: walletBalance };
    });
    vi.mocked(storage.grantChipLoan).mockClear().mockImplementation(async () => {
      if (loanBalance > 0) return { success: false, error: 'existing_loan' };
      if (walletBalance > 500) return { success: false, error: 'not_broke' };
      walletBalance += 1_000;
      loanBalance = 1_000;
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

  it.each(['dead7', 'fifteen35', 'suitspoker', 'suits_poker', 'kamikaze', 'bonecrusher'])(
    'rejects retired %s joins over the real room handler without seating or accessing wallets', async modeId => {
      const tableId = `retired-${modeId}`;
      const sessionId = `retired-session-${modeId}`;
      const socket = new WebSocket(
        `ws://127.0.0.1:${port}/ws?ticket=${issueWsTicket(authenticatedPlayerId)}`,
      );
      await new Promise<void>((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
      const walletReads = vi.mocked(storage.getOrCreatePlayer).mock.calls.length;
      const seatWrites = vi.mocked(storage.setPlayerActiveTable).mock.calls.length;
      const initPromise = waitForMessage(socket, msg => msg.type === 'mode:init');
      const errorPromise = waitForMessage(socket, msg => msg.type === 'error');
      socket.send(JSON.stringify({
        type: 'join', tableId, modeId, playerId: sessionId, seatId: sessionId,
        identityId: authenticatedPlayerId, name: 'Old Native', quickPlay: true, buyinChips: 1000,
      }));
      try {
        const [init, error] = await Promise.all([initPromise, errorPromise]);
        expect(init.accepted).toBe(false);
        expect(init.state?.players).toEqual([]);
        expect(error).toMatchObject({
          code: 'MODE_RETIRED', modeId,
          message: 'This game mode has been retired. Please update the app to continue.',
        });
        expect(vi.mocked(storage.getOrCreatePlayer).mock.calls.length).toBe(walletReads);
        expect(vi.mocked(storage.setPlayerActiveTable).mock.calls.length).toBe(seatWrites);
        expect((await import('../server/genericEngine')).getOrCreateTable(modeId, tableId)).toBeNull();
        const actionError = waitForMessage(socket, msg => msg.type === 'error');
        socket.send(JSON.stringify({
          type: 'mode:action', tableId, modeId, playerId: sessionId, action: 'rebuy', payload: 1000,
        }));
        expect((await actionError).code).toBe('MODE_RETIRED');
        const left = waitForMessage(socket, msg => msg.type === 'leave:complete');
        socket.send(JSON.stringify({ type: 'leave', tableId, playerId: sessionId, leaveId: 'retired-leave' }));
        expect((await left).leaveId).toBe('retired-leave');
        expect(activeTableId).toBeNull();
        expect(walletBalance).toBe(30_000);
        expect(vi.mocked(storage.claimFreeTableRebuy)).not.toHaveBeenCalled();
        expect(vi.mocked(storage.grantTableChipLoan)).not.toHaveBeenCalled();
      } finally { await closeSocket(socket); }
    },
  );

  it.each(['badugi', 'box_chevy'])('routes Android 1.3 legacy starter rebuy through the same free-grant path in %s', async modeId => {
    walletBalance = 1_000;
    const tableId = `legacy-starter-${modeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId, 1_000, modeId);
    try {
      const table = await setSeatBusted(tableId, seat, modeId);
      table.chipsAtHandStart.set(seat, 0);
      walletBalance = 0;
      const beforeFreeGrants = vi.mocked(storage.claimFreeTableRebuy).mock.calls.length;
      const result = await sendLegacyRebuy(socket, tableId, seat, 1_000, modeId);

      expect(result.type).toBe(modeId === 'badugi' ? 'badugi:snapshot' : 'mode:snapshot');
      expect(result.state?.players.find(player => player.id === seat)?.chips).toBe(1_000);
      expect(walletBalance).toBe(1_000);
      expect(vi.mocked(storage.claimFreeTableRebuy).mock.calls.length - beforeFreeGrants).toBe(1);
      expect(vi.mocked(storage.grantTableChipLoan)).not.toHaveBeenCalled();
    } finally {
      await closeSocket(socket);
    }
  });

  it.each(['badugi', 'box_chevy'])('routes the legacy %s selected amount from reserve and ignores an injected modeId', async modeId => {
    walletBalance = 6_000;
    const tableId = `legacy-reserve-${modeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId, 1_000, modeId);
    try {
      const table = await setSeatBusted(tableId, seat, modeId);
      table.chipsAtHandStart.set(seat, 0);
      walletBalance = 5_000;
      const beforeFreeGrants = vi.mocked(storage.claimFreeTableRebuy).mock.calls.length;
      const beforeLoans = vi.mocked(storage.grantTableChipLoan).mock.calls.length;
      const result = await sendLegacyRebuy(socket, tableId, seat, 2_000, modeId, 'badugi');

      expect(result.type).toBe(modeId === 'badugi' ? 'badugi:snapshot' : 'mode:snapshot');
      expect(result.state?.players.find(player => player.id === seat)?.chips).toBe(2_000);
      expect(walletBalance).toBe(5_000);
      expect(vi.mocked(storage.claimFreeTableRebuy).mock.calls.length).toBe(beforeFreeGrants);
      expect(vi.mocked(storage.grantTableChipLoan).mock.calls.length).toBe(beforeLoans);
    } finally {
      await closeSocket(socket);
    }
  });

  it.each(['badugi', 'box_chevy'])('uses the old default reserve rebuy amount in %s when the payload is null', async modeId => {
    walletBalance = 8_000;
    const tableId = `legacy-default-${modeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId, 1_000, modeId);
    try {
      const table = await setSeatBusted(tableId, seat, modeId);
      table.chipsAtHandStart.set(seat, 0);
      walletBalance = 7_000;
      const result = await sendLegacyRebuy(socket, tableId, seat, null, modeId);

      expect(result.state?.players.find(player => player.id === seat)?.chips).toBe(5_000);
      expect(walletBalance).toBe(7_000);
    } finally {
      await closeSocket(socket);
    }
  });

  it.each(['badugi', 'box_chevy'])('allocates an already granted legacy HTTP chip loan in %s without another grant', async modeId => {
    walletBalance = 1_000;
    const tableId = `legacy-loan-${modeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId, 1_000, modeId);
    try {
      const table = await setSeatBusted(tableId, seat, modeId);
      table.chipsAtHandStart.set(seat, 0);
      walletBalance = 0;
      const priorLoanCalls = vi.mocked(storage.grantChipLoan).mock.calls.length;
      const priorTableLoanCalls = vi.mocked(storage.grantTableChipLoan).mock.calls.length;
      const priorFreeGrants = vi.mocked(storage.claimFreeTableRebuy).mock.calls.length;
      await expect(storage.grantChipLoan(authenticatedPlayerId)).resolves.toMatchObject({
        success: true,
        newBalance: 1_000,
      });

      const result = await sendLegacyRebuy(socket, tableId, seat, 1_000, modeId);
      expect(result.state?.players.find(player => player.id === seat)?.chips).toBe(1_000);
      expect(walletBalance).toBe(1_000);
      expect(loanBalance).toBe(1_000);
      expect(vi.mocked(storage.grantChipLoan).mock.calls.length - priorLoanCalls).toBe(1);
      expect(vi.mocked(storage.grantTableChipLoan).mock.calls.length).toBe(priorTableLoanCalls);
      expect(vi.mocked(storage.claimFreeTableRebuy).mock.calls.length).toBe(priorFreeGrants);
      expect(table.state.players.find(player => player.id === seat)?.chips).toBe(1_000);
    } finally {
      await closeSocket(socket);
    }
  });

  it.each(['badugi', 'box_chevy'])('deduplicates distinct legacy and new rebuy requests in the same %s bust event', async modeId => {
    walletBalance = 1_000;
    const tableId = `legacy-mixed-${modeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId, 1_000, modeId);
    try {
      const table = await setSeatBusted(tableId, seat, modeId);
      table.chipsAtHandStart.set(seat, 0);
      walletBalance = 0;
      const beforeFreeGrants = vi.mocked(storage.claimFreeTableRebuy).mock.calls.length;
      let releaseGrant!: () => void;
      let signalGrantStarted!: () => void;
      const grantGate = new Promise<void>(resolve => { releaseGrant = resolve; });
      const grantStarted = new Promise<void>(resolve => { signalGrantStarted = resolve; });
      const originalClaim = vi.mocked(storage.claimFreeTableRebuy).getMockImplementation()!;
      vi.mocked(storage.claimFreeTableRebuy).mockImplementation(async (...args) => {
        signalGrantStarted();
        await grantGate;
        return originalClaim(...args);
      });
      const legacyFailure = waitForMessage(socket, response => response.type === 'error');
      const modernResponse = sendRebuy(socket, {
        tableId,
        modeId,
        playerId: seat,
        kind: 'free',
      }, `mixed-request-${modeId}-01`);
      await grantStarted;
      socket.send(JSON.stringify({
        type: modeId === 'badugi' ? 'badugi:action' : 'mode:action',
        tableId,
        modeId,
        playerId: seat,
        action: 'rebuy',
        payload: 1_000,
      }));
      await new Promise(resolve => setTimeout(resolve, 15));
      releaseGrant();

      const [legacyResult, modernResult] = await Promise.all([legacyFailure, modernResponse]);
      expect(legacyResult.type).toBe('error');
      expect(modernResult.type).toBe('rebuy:complete');
      expect(walletBalance).toBe(1_000);
      expect(table.state.players.find(player => player.id === seat)?.chips).toBe(1_000);
      expect(vi.mocked(storage.claimFreeTableRebuy).mock.calls.length - beforeFreeGrants).toBe(1);
    } finally {
      await closeSocket(socket);
    }
  });

  it.each(['badugi', 'box_chevy'])('deduplicates a new rebuy queued behind an in-flight legacy grant in %s', async modeId => {
    walletBalance = 1_000;
    const tableId = `legacy-first-mixed-${modeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId, 1_000, modeId);
    try {
      const table = await setSeatBusted(tableId, seat, modeId);
      table.chipsAtHandStart.set(seat, 0);
      walletBalance = 0;
      const beforeFreeGrants = vi.mocked(storage.claimFreeTableRebuy).mock.calls.length;
      let releaseGrant!: () => void;
      let signalGrantStarted!: () => void;
      const grantGate = new Promise<void>(resolve => { releaseGrant = resolve; });
      const grantStarted = new Promise<void>(resolve => { signalGrantStarted = resolve; });
      const originalClaim = vi.mocked(storage.claimFreeTableRebuy).getMockImplementation()!;
      vi.mocked(storage.claimFreeTableRebuy).mockImplementation(async (...args) => {
        signalGrantStarted();
        await grantGate;
        return originalClaim(...args);
      });
      const legacySnapshot = waitForMessage(socket, message =>
        message.type === (modeId === 'badugi' ? 'badugi:snapshot' : 'mode:snapshot') &&
        message.state?.players.find(player => player.id === seat)?.chips === 1_000,
      );
      socket.send(JSON.stringify({
        type: modeId === 'badugi' ? 'badugi:action' : 'mode:action',
        tableId,
        modeId,
        playerId: seat,
        action: 'rebuy',
        payload: 1_000,
      }));
      await grantStarted;
      const modernResponse = sendRebuy(socket, {
        tableId,
        modeId,
        playerId: seat,
        kind: 'free',
      }, `legacy-first-modern-${modeId}`);
      await new Promise(resolve => setTimeout(resolve, 15));
      releaseGrant();

      const [legacyResult, modernResult] = await Promise.all([legacySnapshot, modernResponse]);
      expect(legacyResult.type).toBe(modeId === 'badugi' ? 'badugi:snapshot' : 'mode:snapshot');
      expect(modernResult.type).toBe('rebuy:failed');
      expect(walletBalance).toBe(1_000);
      expect(table.state.players.find(player => player.id === seat)?.chips).toBe(1_000);
      expect(vi.mocked(storage.claimFreeTableRebuy).mock.calls.length - beforeFreeGrants).toBe(1);
    } finally {
      await closeSocket(socket);
    }
  });

  it.each(['badugi', 'box_chevy'])('rejects malformed and cross-seat legacy rebuys in %s without granting chips', async modeId => {
    walletBalance = 1_000;
    const tableId = `legacy-reject-${modeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId, 1_000, modeId);
    try {
      await setSeatBusted(tableId, seat, modeId);
      walletBalance = 0;
      const beforeFreeGrants = vi.mocked(storage.claimFreeTableRebuy).mock.calls.length;
      const malformed = await sendLegacyRebuy(socket, tableId, seat, '1000', modeId);
      const spoofed = await sendLegacyRebuy(socket, tableId, 'another-users-seat', 1_000, modeId);

      expect(malformed.type).toBe('error');
      expect((malformed as ServerMessage & { message?: string }).message).toMatch(/invalid/i);
      expect((spoofed as ServerMessage & { message?: string }).message).toMatch(/does not belong/i);
      expect(walletBalance).toBe(0);
      expect(vi.mocked(storage.claimFreeTableRebuy).mock.calls.length).toBe(beforeFreeGrants);
    } finally {
      await closeSocket(socket);
    }
  });

  it.each(['badugi', 'box_chevy'])('serializes duplicate legacy messages with different server IDs in %s', async modeId => {
    walletBalance = 1_000;
    const tableId = `legacy-duplicate-${modeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, seat } = await connectPlayer(tableId, 1_000, modeId);
    try {
      const table = await setSeatBusted(tableId, seat, modeId);
      table.chipsAtHandStart.set(seat, 0);
      walletBalance = 0;
      const beforeFreeGrants = vi.mocked(storage.claimFreeTableRebuy).mock.calls.length;
      const responses = collectRebuyResponses(socket, 2, modeId);
      const message = {
        type: modeId === 'badugi' ? 'badugi:action' : 'mode:action',
        tableId,
        modeId,
        playerId: seat,
        action: 'rebuy',
        payload: 1_000,
      };
      socket.send(JSON.stringify(message));
      socket.send(JSON.stringify(message));

      const results = await responses;
      expect(results.filter(result => result.type === 'error')).toHaveLength(1);
      expect(results.filter(result => result.type === (modeId === 'badugi' ? 'badugi:snapshot' : 'mode:snapshot'))).toHaveLength(1);
      expect(table.state.players.find(player => player.id === seat)?.chips).toBe(1_000);
      expect(walletBalance).toBe(1_000);
      expect(vi.mocked(storage.claimFreeTableRebuy).mock.calls.length - beforeFreeGrants).toBe(1);
    } finally {
      await closeSocket(socket);
    }
  });

  it('settles and releases an Android 1.3 leave sent with the session id before the socket closes', async () => {
    walletBalance = 1_000;
    const tableId = `legacy-leave-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { socket, sessionId } = await connectPlayer(tableId, 1_000);
    try {
      const { getConnectedBadugiIdentityIds } = await import('../server/gameEngine');
      const syncLeave = vi.mocked(storage.syncPlayerLeaveDelta);
      let releaseSettlement!: () => void;
      let signalSettlementStarted!: () => void;
      const settlementGate = new Promise<void>(resolve => { releaseSettlement = resolve; });
      const settlementStarted = new Promise<void>(resolve => { signalSettlementStarted = resolve; });
      syncLeave.mockImplementation(async (_playerId, gameId) => {
        signalSettlementStarted();
        await settlementGate;
        if (activeTableId === gameId) activeTableId = null;
      });
      // Android 1.3 sends playerId=sessionId (not the engine-assigned p1 seat),
      // omits leaveId, and closes immediately without waiting for an ack.
      socket.send(JSON.stringify({ type: 'leave', tableId, playerId: sessionId }));
      const closed = closeSocket(socket);
      await settlementStarted;
      expect(syncLeave).toHaveBeenCalledTimes(1);
      releaseSettlement();
      await closed;

      for (let attempt = 0; attempt < 100 && getConnectedBadugiIdentityIds(tableId).length > 0; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      expect(syncLeave).toHaveBeenCalledTimes(1);
      expect(syncLeave.mock.calls[0]?.slice(0, 2)).toEqual([authenticatedPlayerId, tableId]);
      expect(getConnectedBadugiIdentityIds(tableId)).toEqual([]);
      expect(activeTableId).toBeNull();
    } finally {
      await closeSocket(socket);
    }
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