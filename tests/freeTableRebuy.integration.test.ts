import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../server/db';
import { storage } from '../server/storage';
import { chipTransactions, playerProfiles } from '../shared/schema';

// This suite intentionally requires an explicit opt-in as well as development
// mode so regular tests can never accidentally grant chips in a live database.
const useDevelopmentDatabase = process.env.NODE_ENV === 'development'
  && process.env.RUN_DEV_DB_INTEGRATION_TESTS === 'true'
  && !!process.env.DATABASE_URL;
const playerId = `test-free-rebuy-${randomUUID()}`;

describe.skipIf(!useDevelopmentDatabase)('free table rebuy storage claim (development database only)', () => {
  afterAll(async () => {
    await db.delete(playerProfiles).where(eq(playerProfiles.id, playerId));
  });

  it('credits once under concurrent replay and grants once again for a distinct bust event', async () => {
    await storage.getOrCreatePlayer(playerId);
    const startBalance = (await storage.getPlayerProfile(playerId))!.chipBalance;
    const gameId = 'test-mode:test-table';
    const firstEvent = `hand-${randomUUID()}:seat-1`;

    const concurrentClaims = await Promise.all(Array.from({ length: 8 }, () =>
      storage.claimFreeTableRebuy(playerId, gameId, firstEvent),
    ));
    expect(concurrentClaims.filter(claim => claim.granted)).toHaveLength(1);
    expect(concurrentClaims.every(claim => claim.chipBalance === startBalance + 1000)).toBe(true);

    const firstLedger = await db.select().from(chipTransactions).where(and(
      eq(chipTransactions.playerId, playerId),
      eq(chipTransactions.source, 'freeTableRebuy'),
      eq(chipTransactions.gameId, gameId),
      eq(chipTransactions.handId, firstEvent),
    ));
    expect(firstLedger).toHaveLength(1);

    const secondEvent = `hand-${randomUUID()}:seat-1`;
    await expect(storage.claimFreeTableRebuy(playerId, gameId, secondEvent))
      .resolves.toEqual({ granted: true, chipBalance: startBalance + 2000 });
    await expect(storage.claimFreeTableRebuy(playerId, gameId, secondEvent))
      .resolves.toEqual({ granted: false, chipBalance: startBalance + 2000 });

    const profile = await storage.getPlayerProfile(playerId);
    expect(profile?.chipBalance).toBe(startBalance + 2000);
    expect((await storage.verifyPlayerBalanceConsistency(playerId)).consistent).toBe(true);
  });
});