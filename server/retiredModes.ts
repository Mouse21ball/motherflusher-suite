import type { GameState } from '../shared/gameTypes';
import type { Request, RequestHandler } from 'express';
import { APP_STORE_LISTING_URL, PLAY_STORE_LISTING_URL } from '../shared/mobileStoreListings';

const RETIRED_MODE_NAMES = new Map([
  ['dead7', 'Dead 7'], ['fifteen35', 'Fifteen-Thirty-Five'],
  ['suitspoker', 'Suits Poker'], ['kamikaze', 'Kamikaze'], ['bonecrusher', 'Bonecrusher'],
  // Shipped UnifiedGamePage maps the Suits Poker UI ID to this wire ID.
  ['suits_poker', 'Suits Poker'],
]);

/** Exported metadata only; null prototype avoids treating constructor/__proto__ as modes. */
export const RETIRED_MODES: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, string>, Object.fromEntries(RETIRED_MODE_NAMES)),
);

export interface RetirementClientContext {
  platform?: unknown;
  userAgent?: string;
}

export function getRetirementPlatform(client: RetirementClientContext): 'ios' | 'android' | 'web' {
  if (client.platform === 'ios' || client.platform === 'android' || client.platform === 'web') return client.platform;
  const ua = client.userAgent ?? '';
  if (/\bAndroid\b/i.test(ua)) return 'android';
  // iPad desktop-mode WebViews identify as Macintosh but retain Mobile/.
  if (/\b(iPad|iPhone|iPod)\b/i.test(ua) || /Macintosh.*\bMobile\//i.test(ua)) return 'ios';
  return 'web';
}

export function retirementClientFromRequest(req: Request): RetirementClientContext {
  return {
    platform: req.body?.platform ?? req.query.platform ?? req.get('x-app-platform'),
    userAgent: req.get('user-agent'),
  };
}

export function getRetiredModeError(modeId: unknown, client: RetirementClientContext = {}) {
  if (typeof modeId !== 'string' || !RETIRED_MODE_NAMES.has(modeId)) return null;
  const modeName = RETIRED_MODE_NAMES.get(modeId)!;
  const message = `${modeName} has been retired. Please update the app to continue.`;
  const platform = getRetirementPlatform(client);
  return {
    modeId,
    modeName,
    message,
    error: message,
    updateRequired: true,
    platform,
    updateUrl: platform === 'ios' ? APP_STORE_LISTING_URL : platform === 'android' ? PLAY_STORE_LISTING_URL : null,
    ...(platform === 'web' ? { storeLinks: { ios: APP_STORE_LISTING_URL, android: PLAY_STORE_LISTING_URL } } : {}),
  } as const;
}

/** HTTP callers already surface the response's `error` string. */
export const rejectRetiredMode: RequestHandler = (req, res, next) => {
  const error = getRetiredModeError(req.params.modeId ?? req.body?.modeId ?? req.body?.mode_id, retirementClientFromRequest(req));
  if (!error) { next(); return; }
  res.status(410).json({ ...error, tableId: null });
};

/**
 * Old useServerMode ignores error text until mode:init has arrived. This is
 * a display-only rejection handshake, NOT a seat/table/game initialization.
 * Never allocate rooms, timers, bots, wallet funds or an active-table record.
 * Keep role=player: the old Suits Poker UI hides its error banner for spectators.
 */
export function sendRetiredModeRejection(
  ws: { send: (message: string) => void },
  modeId: string,
  tableId: string,
  playerId: string,
  client: RetirementClientContext = {},
): boolean {
  const error = getRetiredModeError(modeId, client);
  if (!error) return false;
  const state: GameState = {
    tableId,
    phase: 'WAITING',
    pot: 0,
    currentBet: 0,
    minBet: 2,
    activePlayerId: '',
    players: [],
    communityCards: [],
    deck: [],
    discardPile: [],
    messages: [],
    chatMessages: [],
  };
  try {
    ws.send(JSON.stringify({
      type: 'mode:init', playerId, role: 'player', state,
      accepted: false, ...error,
    }));
    ws.send(JSON.stringify({ type: 'error', ...error }));
  } catch { /* A closed socket cannot display the rejection. */ }
  return true;
}
