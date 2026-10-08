import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import { storage, LADY_LUCK_HOUSE_ID, isInternalChipAccount } from '../server/storage';
import { chipTransactions, playerProfiles } from '../shared/schema';

// Exercise real PostgreSQL statements, but roll back ALL fixtures and house
// edits. No persistent development house reserve or ledger is changed.
async function withRollback(body: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>) {
  const rollback = new Error('test rollback');
  const transaction = db.transaction.bind(db);
  try {
    await transaction(async tx => {
      const spy = vi.spyOn(db, 'transaction').mockImplementation(async callback => callback(tx));
      const selectSpy = vi.spyOn(db, 'select').mockImplementation(tx.select.bind(tx));
      try {
        await body(tx);
        throw rollback;
      } finally {
        selectSpy.mockRestore();
        spy.mockRestore();
      }
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

describe('Lady Luck house reserve recovery and guest isolation', () => {
  it('restores exactly erased reserve once, preserves legitimate allocations, and handles another historical reset', async () => {
    await withRollback(async tx => {
      await tx.insert(playerProfiles).values({ id: LADY_LUCK_HOUSE_ID, displayName: 'House', chipBalance: 5_000 }).onConflictDoNothing();
      await tx.update(playerProfiles).set({ chipBalance: 5_000 }).where(eq(playerProfiles.id, LADY_LUCK_HOUSE_ID));
      await tx.delete(chipTransactions).where(eq(chipTransactions.playerId, LADY_LUCK_HOUSE_ID));
      await tx.insert(chipTransactions).values({
        playerId: LADY_LUCK_HOUSE_ID, beforeBalance: 100_000_000,
        amountChange: -99_975_000, afterBalance: 25_000, reason: 'guest_reset', source: 'guestReset',
      });
      await storage.ensureLadyLuckHouse();
      await storage.ensureLadyLuckHouse();
      let [house] = await tx.select().from(playerProfiles).where(eq(playerProfiles.id, LADY_LUCK_HOUSE_ID));
      expect(house.chipBalance).toBe(99_980_000); // the allocated 20,000 stays allocated
      let ledger = await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, LADY_LUCK_HOUSE_ID));
      expect(ledger.filter(row => row.source === 'ladyluck_guest_reset_recovery')).toMatchObject([
        { beforeBalance: 5_000, amountChange: 99_975_000, afterBalance: 99_980_000 },
      ]);
      await tx.update(playerProfiles).set({ chipBalance: 25_000 }).where(eq(playerProfiles.id, LADY_LUCK_HOUSE_ID));
      await tx.insert(chipTransactions).values({
        playerId: LADY_LUCK_HOUSE_ID, beforeBalance: 99_980_000,
        amountChange: -99_955_000, afterBalance: 25_000, reason: 'guest_reset', source: 'guestReset',
      });
      await storage.ensureLadyLuckHouse();
      [house] = await tx.select().from(playerProfiles).where(eq(playerProfiles.id, LADY_LUCK_HOUSE_ID));
      expect(house.chipBalance).toBe(99_980_000);
      ledger = await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, LADY_LUCK_HOUSE_ID));
      expect(ledger.filter(row => row.source === 'ladyluck_guest_reset_recovery')).toHaveLength(2);
      const botId = `bot_recovery-${crypto.randomUUID()}`;
      expect(await storage.fundLadyLuckBot(botId, 'recovery-fixture')).toBe(10_000);
      const [fundedHouse] = await tx.select().from(playerProfiles).where(eq(playerProfiles.id, LADY_LUCK_HOUSE_ID));
      const [bot] = await tx.select().from(playerProfiles).where(eq(playerProfiles.id, botId));
      expect(fundedHouse.chipBalance).toBe(99_970_000);
      expect(bot.chipBalance).toBe(10_000);
      expect(fundedHouse.chipBalance + bot.chipBalance).toBe(99_980_000);
    });
  });

  it('never replenishes a genuinely depleted reserve without guest-reset history', async () => {
    await withRollback(async tx => {
      await tx.insert(playerProfiles).values({ id: LADY_LUCK_HOUSE_ID, displayName: 'House', chipBalance: 0 }).onConflictDoNothing();
      await tx.update(playerProfiles).set({ chipBalance: 0 }).where(eq(playerProfiles.id, LADY_LUCK_HOUSE_ID));
      await tx.delete(chipTransactions).where(eq(chipTransactions.playerId, LADY_LUCK_HOUSE_ID));
      await storage.ensureLadyLuckHouse();
      const [house] = await tx.select().from(playerProfiles).where(eq(playerProfiles.id, LADY_LUCK_HOUSE_ID));
      expect(house.chipBalance).toBe(0);
      expect(await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, LADY_LUCK_HOUSE_ID))).toHaveLength(0);
    });
  });

  it('blocks direct resets of house/bot accounts and authenticated accounts without writing misleading ledger entries', async () => {
    await withRollback(async tx => {
      const id = `bot_reset-test-${crypto.randomUUID()}`;
      await tx.insert(playerProfiles).values({ id, displayName: 'Bot', chipBalance: 10_000, createdAt: new Date(0) });
      const eligible = await storage.getEligibleGuestResets(new Date());
      expect(eligible.some(row => row.id === id || row.id === LADY_LUCK_HOUSE_ID)).toBe(false);
      await storage.resetGuestAccount(id);
      await storage.resetGuestAccount(LADY_LUCK_HOUSE_ID);
      expect((await tx.select().from(playerProfiles).where(eq(playerProfiles.id, id)))[0].chipBalance).toBe(10_000);
      expect(await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, id))).toHaveLength(0);
      const authId = `reset-auth-${crypto.randomUUID()}`;
      await tx.insert(playerProfiles).values({ id: authId, displayName: 'Authenticated', chipBalance: 1_000, passwordHash: 'test-not-a-real-credential' });
      await storage.resetGuestAccount(authId);
      expect((await tx.select().from(playerProfiles).where(eq(playerProfiles.id, authId)))[0].chipBalance).toBe(1_000);
      expect(await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, authId))).toHaveLength(0);
      const guestId = `reset-guest-${crypto.randomUUID()}`;
      await tx.insert(playerProfiles).values({ id: guestId, displayName: 'Guest', chipBalance: 1_000 });
      await storage.resetGuestAccount(guestId);
      expect((await tx.select().from(playerProfiles).where(eq(playerProfiles.id, guestId)))[0].chipBalance).toBe(25_000);
      expect(await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, guestId))).toMatchObject([
        { beforeBalance: 1_000, amountChange: 24_000, afterBalance: 25_000, source: 'guestReset' },
      ]);
    });
  });

  it('recognizes only reserved internal identities', () => {
    expect(isInternalChipAccount(LADY_LUCK_HOUSE_ID)).toBe(true);
    expect(isInternalChipAccount('bot_fixture')).toBe(true);
    expect(isInternalChipAccount('botany')).toBe(false);
    expect(isInternalChipAccount('ordinary-guest')).toBe(false);
  });
});
