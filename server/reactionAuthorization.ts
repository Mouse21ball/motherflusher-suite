import {
  STARTER_REACTION_EMOTES,
  VIP_REACTION_EMOTES,
  vipReactionCountAtLevel,
} from '../shared/reactionEntitlements';
import { levelFromXP } from '../shared/progressionRules';

const REACTION_AUTH_ERROR = 'Reaction not authorized';
const ACTION_AUTH_ERROR = 'Action not authorized';

/**
 * Runs an action synchronously after authoritative reaction validation. The
 * returned error is safe to send to a client and deliberately hides lookup
 * details. Starter emotes are allowed server-side because starter claims are
 * currently local-only; VIP emotes still require the authenticated XP tier.
 */
export async function runWithReactionAuthorization<TProfile extends { xp: number }, TResult>(
  authenticatedPlayerId: string,
  action: string,
  payload: unknown,
  getPlayerProfile: (id: string) => Promise<TProfile | undefined>,
  run: () => TResult,
): Promise<{ error?: string; result?: TResult }> {
  if (action !== 'reaction') return { result: run() };

  const emoji = typeof payload === 'string' ? payload : '';
  let profile: TProfile | undefined;
  try {
    profile = await getPlayerProfile(authenticatedPlayerId);
  } catch {
    // Fail closed without returning storage/DB error details to the client.
    return { error: REACTION_AUTH_ERROR };
  }
  if (!profile || !Number.isFinite(profile.xp)) return { error: REACTION_AUTH_ERROR };
  if ((STARTER_REACTION_EMOTES as readonly string[]).includes(emoji)) {
    return { result: run() };
  }
  const vipLimit = vipReactionCountAtLevel(levelFromXP(profile.xp));
  if ((VIP_REACTION_EMOTES as readonly string[]).slice(0, vipLimit).includes(emoji)) {
    return { result: run() };
  }
  return { error: REACTION_AUTH_ERROR };
}

/**
 * Applies the final seat ownership check immediately before dispatch. This is
 * important for reaction actions, whose profile lookup yields to the event loop.
 */
export async function dispatchOwnedAction<TProfile extends { xp: number }, TResult>(
  authenticatedPlayerId: string,
  tableId: string,
  playerId: string,
  getSeatOwner: (tableId: string, playerId: string) => string | undefined,
  action: string,
  payload: unknown,
  getPlayerProfile: (id: string) => Promise<TProfile | undefined>,
  run: () => TResult,
): Promise<{ error?: string; result?: TResult }> {
  let ownershipChanged = false;
  const dispatch = await runWithReactionAuthorization(
    authenticatedPlayerId,
    action,
    payload,
    getPlayerProfile,
    () => {
      if (getSeatOwner(tableId, playerId) !== authenticatedPlayerId) {
        ownershipChanged = true;
        return undefined;
      }
      return run();
    },
  );
  return ownershipChanged ? { error: ACTION_AUTH_ERROR } : dispatch;
}