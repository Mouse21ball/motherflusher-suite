import type { GameState } from '../shared/gameTypes';
import type { RequestHandler } from 'express';

const RETIRED_MODE_IDS = new Set([
  'dead7', 'fifteen35', 'suitspoker', 'kamikaze', 'bonecrusher',
  // Shipped UnifiedGamePage maps the Suits Poker UI ID to this wire ID.
  'suits_poker',
]);

export function getRetiredModeError(modeId: unknown) {
  if (typeof modeId !== 'string' || !RETIRED_MODE_IDS.has(modeId)) return null;
  const message = 'This game mode has been retired. Please update the app to continue.';
  return {
    code: 'MODE_RETIRED',
    reason: 'mode-retired',
    modeId,
    message,
    error: message,
    updateRequired: true,
  } as const;
}

/** HTTP callers already surface the response's `error` string. */
export const rejectRetiredMode: RequestHandler = (req, res, next) => {
  const error = getRetiredModeError(req.params.modeId ?? req.body?.modeId ?? req.body?.mode_id);
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
): boolean {
  const error = getRetiredModeError(modeId);
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
