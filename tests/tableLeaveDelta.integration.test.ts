import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../server/db';
import { storage } from '../server/storage';
import { chipTransactions, handXpAwards, playerProfiles } from '../shared/schema';

const useDevelopmentDatabase = process.env.NODE_ENV === 'development'
  && process.env.RUN_DEV_DB_INTEGRATION_TESTS === 'true'
  && !!process.env.DATABASE_URL;
const playerId = `test-table-leave-${randomUUID()}`;

describe.skipIf(!useDevelopmentDatabase)('table leave wallet delta (development database only)', () => {
  afterAll(async () => {
    await db.delete(playerProfiles).where(eq(playerProfiles.id, playerId));
  });

  it('applies a duplicate leave delta once, preserves an external wallet credit, and clears active-table metadata', async () => {
    await storage.getOrCreatePlayer(playerId);
    const gameId = `test-table-${randomUUID()}`;
    const leaveId = `leave-${randomUUID()}`;
    const sessionDelta = -250;
    const externalBonus = 1_000;
    const initialProfile = await storage.getPlayerProfile(playerId);
    expect(initialProfile).toBeDefined();

    // Simulate a wallet bonus arriving independently after the player's table
    // stack was established; the leave delta must not overwrite that credit.
    const creditedBalance = initialProfile!.chipBalance + externalBonus;
    await db.update(playerProfiles)
      .set({ chipBalance: creditedBalance })
      .where(eq(playerProfiles.id, playerId));
    await storage.setPlayerActiveTable(playerId, gameId, 'seat-1', 'badugi');

    await Promise.all(Array.from({ length: 8 }, () =>
      storage.syncPlayerLeaveDelta(playerId, gameId, leaveId, sessionDelta),
    ));
    // A later retry with the same stable leave ID must remain a no-op too.
    await storage.syncPlayerLeaveDelta(playerId, gameId, leaveId, sessionDelta);

    const expectedBalance = creditedBalance + sessionDelta;
    const profile = await storage.getPlayerProfile(playerId);
    expect(profile?.chipBalance).toBe(expectedBalance);
    expect(profile?.activeTableId).toBeNull();
    expect(profile?.activeSeatId).toBeNull();
    expect(profile?.activeModeId).toBeNull();

    const handId = `leave:${leaveId}`;
    const ledgerEntries = await db.select().from(chipTransactions).where(and(
      eq(chipTransactions.playerId, playerId),
      eq(chipTransactions.source, 'tableLeave'),
      eq(chipTransactions.gameId, gameId),
      eq(chipTransactions.handId, handId),
    ));
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0]).toMatchObject({
      beforeBalance: creditedBalance,
      amountChange: sessionDelta,
      afterBalance: expectedBalance,
    });

    const markers = await db.select().from(handXpAwards).where(and(
      eq(handXpAwards.playerId, playerId),
      eq(handXpAwards.gameId, gameId),
      eq(handXpAwards.handId, handId),
    ));
    expect(markers).toHaveLength(1);
  });
});