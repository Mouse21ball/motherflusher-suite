import { describe, expect, it, vi } from 'vitest';
import { getEntitledReactions } from '../client/src/lib/retention';
import { levelFromXP, xpForLevel } from '../shared/progressionRules';
import {
  STARTER_REACTION_EMOTES,
  VIP_REACTION_EMOTES,
} from '../shared/reactionEntitlements';
import {
  dispatchOwnedAction,
  runWithReactionAuthorization,
} from '../server/reactionAuthorization';

const trustedProfile = (level: number) => ({ xp: xpForLevel(level) });

describe('server reaction authorization', () => {
  it('rejects over-tier reactions based on authenticated XP, not the client tray level', async () => {
    const playerId = 'trusted-player';
    const vipEmoji = VIP_REACTION_EMOTES[14];
    // A client retaining a higher local level sees this VIP emoji in its tray.
    expect(getEntitledReactions(36, 5)).toContain(vipEmoji);
    const getProfile = vi.fn(async (id: string) => {
      expect(id).toBe(playerId);
      return trustedProfile(1);
    });
    const badugiHandler = vi.fn(() => undefined);

    const result = await runWithReactionAuthorization(
      playerId,
      'reaction',
      vipEmoji,
      getProfile,
      badugiHandler,
    );

    expect(result.error).toBe('Reaction not authorized');
    expect(badugiHandler).not.toHaveBeenCalled();
    expect(getProfile).toHaveBeenCalledOnce();
  });

  it('allows a VIP reaction unlocked by the authenticated XP tier', async () => {
    const getProfile = vi.fn(async () => trustedProfile(11));
    const engineHandler = vi.fn(() => 'engine-result');

    const result = await runWithReactionAuthorization(
      'trusted-player',
      'reaction',
      VIP_REACTION_EMOTES[4],
      getProfile,
      engineHandler,
    );

    expect(levelFromXP(xpForLevel(11))).toBe(11);
    expect(result).toEqual({ result: 'engine-result' });
    expect(engineHandler).toHaveBeenCalledOnce();
  });

  it('allows all shared starter reactions regardless of VIP tier', async () => {
    const engineHandler = vi.fn(() => undefined);
    const result = await runWithReactionAuthorization(
      'trusted-player',
      'reaction',
      STARTER_REACTION_EMOTES[4],
      async () => trustedProfile(1),
      engineHandler,
    );

    expect(result).toEqual({ result: undefined });
    expect(engineHandler).toHaveBeenCalledOnce();
  });

  it('rejects unlisted emojis', async () => {
    const engineHandler = vi.fn(() => undefined);
    const result = await runWithReactionAuthorization(
      'trusted-player',
      'reaction',
      '🛸',
      async () => trustedProfile(100),
      engineHandler,
    );

    expect(result.error).toBe('Reaction not authorized');
    expect(engineHandler).not.toHaveBeenCalled();
  });

  it('fails closed for missing profiles and lookup errors without exposing details', async () => {
    const handler = vi.fn(() => undefined);
    const missing = await runWithReactionAuthorization(
      'trusted-player',
      'reaction',
      STARTER_REACTION_EMOTES[0],
      async () => undefined,
      handler,
    );
    const errored = await runWithReactionAuthorization(
      'trusted-player',
      'reaction',
      VIP_REACTION_EMOTES[0],
      async () => { throw new Error('database connection details'); },
      handler,
    );

    expect(missing.error).toBe('Reaction not authorized');
    expect(errored.error).toBe('Reaction not authorized');
    expect(JSON.stringify(errored)).not.toContain('database');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rechecks seat ownership after the profile lookup before either room route dispatches', async () => {
    let seatOwner = 'trusted-player';
    const handler = vi.fn(() => 'engine-result');
    const getPlayerProfile = vi.fn(async () => {
      // Simulate seat ownership changing during the awaited profile lookup.
      seatOwner = 'different-player';
      return trustedProfile(1);
    });

    const result = await dispatchOwnedAction(
      'trusted-player',
      'table-1',
      'p1',
      () => seatOwner,
      'reaction',
      STARTER_REACTION_EMOTES[0],
      getPlayerProfile,
      handler,
    );

    expect(result.error).toBe('Action not authorized');
    expect(handler).not.toHaveBeenCalled();
    expect(getPlayerProfile).toHaveBeenCalledOnce();
  });

  it('does not turn engine callback exceptions into authorization denials', async () => {
    const engineFailure = new Error('engine failed');
    await expect(runWithReactionAuthorization(
      'trusted-player',
      'reaction',
      STARTER_REACTION_EMOTES[0],
      async () => trustedProfile(1),
      () => { throw engineFailure; },
    )).rejects.toBe(engineFailure);
  });
});