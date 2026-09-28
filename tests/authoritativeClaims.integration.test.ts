import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import { storage } from '../server/storage';
import { playerProfiles, subscriptions } from '../shared/schema';

const id = `test-rewards-${randomUUID()}`;
const duplicate = (error: unknown) => (error as { code?: string }).code === 'ALREADY_CLAIMED';

describe.skipIf(!process.env.DATABASE_URL)('authoritative claims (development database)', () => {
  afterAll(async () => {
    await db.delete(playerProfiles).where(eq(playerProfiles.id, id));
  });

  it('locks each claim and settles a hand only once', async () => {
    await storage.getOrCreatePlayer(id);
    const hand = { won: true, deltaChips: 100, gameId: 'test-game', handId: '1', modeId: 'badugi', potSize: 10 };
    await Promise.all([
      storage.syncPlayerChips(id, 100, hand),
      storage.syncPlayerChips(id, 100, hand),
    ]);
    const afterHand = await storage.getPlayerProfile(id);
    expect(afterHand?.handsPlayed).toBe(1);
    expect(afterHand?.handsWon).toBe(1);
    expect(afterHand?.xp).toBe(180);

    await db.insert(subscriptions).values({
      playerId: id, tier: 'diamond_elite', billingPeriod: 'monthly',
      productId: 'test-subscription', purchaseToken: `test-${id}`,
      status: 'active', expiresAt: new Date(Date.now() + 86400000),
    });
    await storage.syncPlayerChips(id, -20, {
      won: false, deltaChips: -20, gameId: 'test-game', handId: '2', modeId: 'dead7', potSize: 0,
    });
    expect((await storage.getPlayerProfile(id))?.xp).toBe(260); // (10 base + 30 discovery) doubled

    const hourly = await Promise.allSettled([storage.claimHourlyReward(id), storage.claimHourlyReward(id)]);
    expect(hourly.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(hourly.filter(r => r.status === 'rejected' && duplicate(r.reason))).toHaveLength(1);
    const welcome = await Promise.allSettled([storage.claimWelcomeKit(id), storage.claimWelcomeKit(id)]);
    expect(welcome.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(welcome.filter(r => r.status === 'rejected' && duplicate(r.reason))).toHaveLength(1);

    const profile = await storage.getPlayerProfile(id);
    expect(profile?.xp).toBe(260);
    expect(profile?.chipBalance).toBe(25000 + 100 - 20 + 500 + 2500);
    expect(profile?.stripes).toBe(250);
    expect((await storage.verifyPlayerBalanceConsistency(id)).consistent).toBe(true);
  });
});