import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import { storage } from '../server/storage';
import { chipTransactions, playerProfiles } from '../shared/schema';

const id = `test-buyin-${randomUUID()}`;

describe.skipIf(!process.env.DATABASE_URL)('concurrent buy-in debit (development database)', () => {
  afterAll(async () => {
    await db.delete(playerProfiles).where(eq(playerProfiles.id, id));
  });

  it('allows only one debit when simultaneous requests each need the entire balance', async () => {
    const player = await storage.getOrCreatePlayer(id);
    const amount = player.chipBalance;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => storage.debitChipsForBuyin(id, amount)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter(result => !result)).toHaveLength(5);
    expect((await storage.getPlayerProfile(id))?.chipBalance).toBe(0);

    const debits = await db.select()
      .from(chipTransactions)
      .where(eq(chipTransactions.playerId, id));
    expect(debits.filter(row => row.reason === 'buy_in')).toMatchObject([
      { beforeBalance: amount, amountChange: -amount, afterBalance: 0 },
    ]);
    expect((await storage.verifyPlayerBalanceConsistency(id)).consistent).toBe(true);
  });
});