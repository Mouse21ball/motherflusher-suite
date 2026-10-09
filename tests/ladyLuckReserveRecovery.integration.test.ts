import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import {
  storage, LADY_LUCK_HOUSE_ID, LADY_LUCK_BOT_STACK,
  LADY_LUCK_BOT_FUNDING_FLOAT, isInternalChipAccount,
} from '../server/storage';
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
      // Profile reads can backfill XP. Route their writes into this fixture
      // too, or they can wait on our own row locks from another connection.
      const updateSpy = vi.spyOn(db, 'update').mockImplementation(tx.update.bind(tx));
      try {
        await body(tx);
        throw rollback;
      } finally {
        updateSpy.mockRestore();
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

  it('does not replenish a depleted reserve at startup; subsidies require actual bot funding', async () => {
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

describe('Lady Luck on-demand bot funding', () => {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  async function depletedHouse(tx: Tx, balance: number) {
    await tx.insert(playerProfiles).values({
      id: LADY_LUCK_HOUSE_ID, displayName: 'House', chipBalance: balance,
    }).onConflictDoNothing();
    await tx.update(playerProfiles).set({ chipBalance: balance }).where(eq(playerProfiles.id, LADY_LUCK_HOUSE_ID));
    await tx.delete(chipTransactions).where(eq(chipTransactions.playerId, LADY_LUCK_HOUSE_ID));
  }

  it.each([0, 5_000, 25_000])('funds a full solo lobby from a %i-chip house, with an exact subsidy ledger', async balance => {
    await withRollback(async tx => {
      await depletedHouse(tx, balance);
      const botIds = Array.from({ length: 4 }, () => `bot_float-${crypto.randomUUID()}`);
      for (const id of botIds) {
        expect(await storage.fundLadyLuckBot(id, 'float-fixture')).toBe(LADY_LUCK_BOT_STACK);
        expect((await storage.getPlayerProfile(id))?.chipBalance).toBe(LADY_LUCK_BOT_STACK);
      }
      const [house] = await tx.select().from(playerProfiles).where(eq(playerProfiles.id, LADY_LUCK_HOUSE_ID));
      const ledger = await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, LADY_LUCK_HOUSE_ID));
      const grants = ledger.filter(row => row.source === 'ladyluck_bot_funding_subsidy');
      expect(grants).toHaveLength(1);
      expect(grants[0].afterBalance).toBe(LADY_LUCK_BOT_FUNDING_FLOAT);
      expect(grants[0].amountChange).toBe(LADY_LUCK_BOT_FUNDING_FLOAT - grants[0].beforeBalance);
      expect(grants[0].metadata).toMatchObject({ purpose: 'system_generated_bot_stakes', requiredChips: LADY_LUCK_BOT_STACK });
      expect(house.chipBalance + botIds.length * LADY_LUCK_BOT_STACK).toBe(balance + grants[0].amountChange);
      const debits = ledger.filter(row => row.source === 'ladyluck_bot_rebuy');
      expect(debits).toHaveLength(4);
      expect(debits.reduce((sum, row) => sum + row.amountChange, 0)).toBe(-40_000);
    });
  });

  it('does not grant or allocate twice when an already funded bot is retried', async () => {
    await withRollback(async tx => {
      await depletedHouse(tx, 0);
      const id = `bot_retry-${crypto.randomUUID()}`;
      await storage.fundLadyLuckBot(id, 'retry-fixture');
      await storage.fundLadyLuckBot(id, 'retry-fixture');
      await storage.rebalanceLadyLuckBot(id, 'retry-fixture');
      const house = await storage.getPlayerProfile(LADY_LUCK_HOUSE_ID);
      expect(house?.chipBalance).toBe(LADY_LUCK_BOT_FUNDING_FLOAT - LADY_LUCK_BOT_STACK);
      expect((await storage.getPlayerProfile(id))?.chipBalance).toBe(LADY_LUCK_BOT_STACK);
      const ledger = await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, LADY_LUCK_HOUSE_ID));
      expect(ledger.filter(row => row.source === 'ladyluck_bot_funding_subsidy')).toHaveLength(1);
      expect(ledger.filter(row => row.source === 'ladyluck_bot_rebuy')).toHaveLength(1);
    });
  });

  it('never subsidizes ordinary transfers, including a human recipient with a bot-funding source label', async () => {
    await withRollback(async tx => {
      await depletedHouse(tx, 0);
      const fromId = `float-player-${crypto.randomUUID()}`;
      const toId = `float-player-${crypto.randomUUID()}`;
      const botId = `bot_direct-${crypto.randomUUID()}`;
      await tx.insert(playerProfiles).values([
        { id: fromId, displayName: 'Player', chipBalance: 100 },
        { id: toId, displayName: 'Player', chipBalance: 0 },
        { id: botId, displayName: 'Bot', chipBalance: 0 },
      ]);
      expect(await storage.transferLadyLuckChips(LADY_LUCK_HOUSE_ID, toId, 10_000, 'ladyluck_bot_rebuy', 'transfer-fixture')).toBe(false);
      expect(await storage.transferLadyLuckChips(LADY_LUCK_HOUSE_ID, botId, 10_000, 'ladyluck_bot_rebuy', 'transfer-fixture')).toBe(false);
      expect(await storage.transferLadyLuckChips(fromId, toId, 101, 'ladyluck_sidebet', 'transfer-fixture')).toBe(false);
      expect(await storage.transferLadyLuckChips(fromId, toId, 50, 'ladyluck_sidebet', 'transfer-fixture')).toBe(true);
      expect((await storage.getPlayerProfile(fromId))?.chipBalance).toBe(50);
      expect((await storage.getPlayerProfile(toId))?.chipBalance).toBe(50);
      expect((await storage.getPlayerProfile(botId))?.chipBalance).toBe(0);
      expect((await storage.getPlayerProfile(LADY_LUCK_HOUSE_ID))?.chipBalance).toBe(0);
      expect(await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, LADY_LUCK_HOUSE_ID))).toHaveLength(0);
    });
  });

  it('sweeps bot profits and returns bot stakes without generating another subsidy', async () => {
    await withRollback(async tx => {
      await depletedHouse(tx, 0);
      const id = `bot_sweep-${crypto.randomUUID()}`;
      await storage.fundLadyLuckBot(id, 'sweep-fixture');
      await tx.update(playerProfiles).set({ chipBalance: 12_000 }).where(eq(playerProfiles.id, id));
      await storage.rebalanceLadyLuckBot(id, 'sweep-fixture');
      expect((await storage.getPlayerProfile(id))?.chipBalance).toBe(10_000);
      await storage.releaseLadyLuckBot(id, 'sweep-fixture');
      expect((await storage.getPlayerProfile(id))?.chipBalance).toBe(0);
      expect((await storage.getPlayerProfile(LADY_LUCK_HOUSE_ID))?.chipBalance).toBe(LADY_LUCK_BOT_FUNDING_FLOAT + 2_000);
      const ledger = await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, LADY_LUCK_HOUSE_ID));
      expect(ledger.filter(row => row.source === 'ladyluck_bot_funding_subsidy')).toHaveLength(1);
      expect(ledger.filter(row => row.source === 'ladyluck_bot_sweep')).toMatchObject([{ amountChange: 2_000 }]);
      expect(ledger.filter(row => row.source === 'ladyluck_bot_return')).toMatchObject([{ amountChange: 10_000 }]);
    });
  });

  it('rolls back the system grant and both account changes if the funding ledger write fails', async () => {
    await withRollback(async tx => {
      await depletedHouse(tx, 0);
      // Real savepoints verify rollback of the application's transaction, not
      // merely the final fixture cleanup.
      vi.spyOn(db, 'transaction').mockImplementation(callback => tx.transaction(callback));
      const ledgerOwner = storage as unknown as {
        _insertChipLedger(tx: unknown, entry: { source: string }): Promise<void>;
      };
      const insertLedger = ledgerOwner._insertChipLedger.bind(storage);
      const failure = vi.spyOn(ledgerOwner, '_insertChipLedger').mockImplementation(async (innerTx, entry) => {
        if (entry.source === 'ladyluck_bot_rebuy') throw new Error('test funding ledger failure');
        return insertLedger(innerTx, entry);
      });
      const id = `bot_rollback-${crypto.randomUUID()}`;
      try {
        await expect(storage.fundLadyLuckBot(id, 'rollback-fixture')).rejects.toThrow('test funding ledger failure');
      } finally {
        failure.mockRestore();
      }
      expect((await storage.getPlayerProfile(LADY_LUCK_HOUSE_ID))?.chipBalance).toBe(0);
      expect((await storage.getPlayerProfile(id))?.chipBalance).toBe(0);
      expect(await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, LADY_LUCK_HOUSE_ID))).toHaveLength(0);
      const ledger = await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, id));
      expect(ledger).toHaveLength(1);
      expect(ledger[0].source).toBe('ladyluck_bot_genesis');
    });
  });

  it('rejects non-bot IDs and missing bot accounts without generating chips', async () => {
    await withRollback(async tx => {
      await depletedHouse(tx, 0);
      await expect(storage.fundLadyLuckBot('player-not-a-bot', 'invalid-fixture')).rejects.toThrow('Invalid Lady Luck bot ID');
      await expect(storage.rebalanceLadyLuckBot('player-not-a-bot', 'invalid-fixture')).rejects.toThrow('Invalid Lady Luck bot ID');
      await expect(storage.rebalanceLadyLuckBot(`bot_missing-${crypto.randomUUID()}`, 'invalid-fixture')).rejects.toThrow('Lady Luck bot has no ledger account');
      expect((await storage.getPlayerProfile(LADY_LUCK_HOUSE_ID))?.chipBalance).toBe(0);
      expect(await tx.select().from(chipTransactions).where(eq(chipTransactions.playerId, LADY_LUCK_HOUSE_ID))).toHaveLength(0);
    });
  });
});
