import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { storage } from '../server/storage';
import { chipTransactions, crews, playerProfiles, playerReferrals, stripeTransactions } from '../shared/schema';

const ids = Array.from({ length: 7 }, () => `test-referral-${randomUUID()}`);
const [inviterId, refereeId, crewRefereeId, playedRefereeId, payoutInviterId, payoutRefereeId, ladyLuckRefereeId] = ids;
const crewCode = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

describe.skipIf(!process.env.DATABASE_URL)('player referral rewards (development database)', () => {
  afterAll(async () => {
    await db.delete(crews).where(eq(crews.captainId, inviterId));
    await db.delete(playerProfiles).where(inArray(playerProfiles.id, ids));
  });

  it('attributes signup through player and crew invite codes; rejects invalid, self, existing, and late attribution', async () => {
    await storage.getOrCreatePlayer(inviterId, 'Referral inviter');
    await storage.getOrCreatePlayer(refereeId, 'Referral referee');
    await storage.getOrCreatePlayer(crewRefereeId, 'Crew referee');
    await storage.getOrCreatePlayer(playedRefereeId, 'Late referee');
    const inviter = await storage.getPlayerProfile(inviterId);
    const selfReferee = await storage.getPlayerProfile(crewRefereeId);
    expect(inviter?.referralCode).toMatch(/^[A-F0-9]{16}$/);

    await expect(storage.registerPlayerAuth({
      id: refereeId, email: `${refereeId}@example.invalid`, passwordHash: 'hash',
      referralCode: inviter!.referralCode,
    })).resolves.toMatchObject({ referredByPlayerId: inviterId });
    await expect(storage.registerPlayerAuth({
      id: refereeId, email: `${refereeId}-again@example.invalid`, passwordHash: 'hash',
      referralCode: inviter!.referralCode,
    })).rejects.toMatchObject({ code: 'ACCOUNT_EXISTS' });
    await expect(storage.registerPlayerAuth({
      id: crewRefereeId, email: `${crewRefereeId}@example.invalid`, passwordHash: 'hash',
      referralCode: 'NOTACODE',
    })).rejects.toMatchObject({ code: 'REFERRAL_INVALID' });
    await expect(storage.registerPlayerAuth({
      id: crewRefereeId, email: `${crewRefereeId}@example.invalid`, passwordHash: 'hash',
      referralCode: selfReferee!.referralCode,
    })).rejects.toMatchObject({ code: 'REFERRAL_SELF' });

    await storage.createCrewTx({ playerId: inviterId, name: 'Referral Crew', inviteCode: crewCode });
    await expect(storage.registerPlayerAuth({
      id: crewRefereeId, email: `${crewRefereeId}@example.invalid`, passwordHash: 'hash',
      referralCode: crewCode,
    })).resolves.toMatchObject({ referredByPlayerId: inviterId });

    await storage.syncPlayerChips(playedRefereeId, 0, {
      won: false, deltaChips: 0, gameId: `game-${playedRefereeId}`, handId: '1', modeId: 'badugi', potSize: 0,
    });
    await expect(storage.registerPlayerAuth({
      id: playedRefereeId, email: `${playedRefereeId}@example.invalid`, passwordHash: 'hash',
      referralCode: inviter!.referralCode,
    })).rejects.toMatchObject({ code: 'REFERRAL_TOO_LATE' });
    await expect(storage.registerPlayerAuth({
      id: playedRefereeId, email: `${playedRefereeId}@example.invalid`, passwordHash: 'hash',
    })).resolves.toMatchObject({ referredByPlayerId: null });

    const referral = await db.select().from(playerReferrals).where(eq(playerReferrals.refereePlayerId, refereeId));
    expect(referral).toHaveLength(1);
    expect(referral[0].codeUsed).toBe(inviter!.referralCode);
    const crewReferral = await db.select().from(playerReferrals).where(eq(playerReferrals.refereePlayerId, crewRefereeId));
    expect(crewReferral).toHaveLength(1);
    expect(crewReferral[0].codeUsed).toBe(crewCode);
  });

  it('pays the referee after hand one and the referrer after hand ten, exactly once', async () => {
    await storage.getOrCreatePlayer(payoutInviterId);
    await storage.getOrCreatePlayer(payoutRefereeId);
    const inviter = await storage.getPlayerProfile(payoutInviterId);
    await storage.registerPlayerAuth({
      id: payoutRefereeId, email: `${payoutRefereeId}@example.invalid`, passwordHash: 'hash',
      referralCode: inviter!.referralCode,
    });
    const inviterBefore = await storage.getPlayerProfile(payoutInviterId);
    const refereeBefore = await storage.getPlayerProfile(payoutRefereeId);

    const playHand = async (number: number) => storage.syncPlayerChips(payoutRefereeId, 0, {
      won: false, deltaChips: 0, gameId: `referral-${payoutRefereeId}`, handId: String(number), modeId: 'badugi', potSize: 0,
    });
    await Promise.all([playHand(1), playHand(1)]);
    let inviterAfter = await storage.getPlayerProfile(payoutInviterId);
    let refereeAfter = await storage.getPlayerProfile(payoutRefereeId);
    expect(refereeAfter?.handsPlayed).toBe(1);
    expect(refereeAfter?.chipBalance).toBe(refereeBefore!.chipBalance + 2500);
    expect(refereeAfter?.stripes).toBe(refereeBefore!.stripes + 100);
    expect(inviterAfter?.chipBalance).toBe(inviterBefore!.chipBalance);
    expect(inviterAfter?.stripes).toBe(inviterBefore!.stripes);

    for (let hand = 2; hand < 10; hand++) await playHand(hand);
    inviterAfter = await storage.getPlayerProfile(payoutInviterId);
    refereeAfter = await storage.getPlayerProfile(payoutRefereeId);
    expect(refereeAfter?.handsPlayed).toBe(9);
    expect(inviterAfter?.chipBalance).toBe(inviterBefore!.chipBalance);
    expect(inviterAfter?.stripes).toBe(inviterBefore!.stripes);

    await Promise.all([playHand(10), playHand(10)]);
    inviterAfter = await storage.getPlayerProfile(payoutInviterId);
    refereeAfter = await storage.getPlayerProfile(payoutRefereeId);
    expect(refereeAfter?.handsPlayed).toBe(10);
    expect(inviterAfter?.chipBalance).toBe(inviterBefore!.chipBalance + 2500);
    expect(inviterAfter?.stripes).toBe(inviterBefore!.stripes + 100);

    const repeated = await Promise.allSettled([playHand(1), playHand(10)]);
    expect(repeated.every(result => result.status === 'fulfilled')).toBe(true);
    inviterAfter = await storage.getPlayerProfile(payoutInviterId);
    refereeAfter = await storage.getPlayerProfile(payoutRefereeId);
    expect(refereeAfter?.chipBalance).toBe(refereeBefore!.chipBalance + 2500);
    expect(refereeAfter?.stripes).toBe(refereeBefore!.stripes + 100);
    expect(inviterAfter?.chipBalance).toBe(inviterBefore!.chipBalance + 2500);
    expect(inviterAfter?.stripes).toBe(inviterBefore!.stripes + 100);

    const referralChipRewards = await db.select().from(chipTransactions)
      .where(eq(chipTransactions.source, 'referral_reward'));
    expect(referralChipRewards.filter(row => row.playerId === payoutRefereeId)).toHaveLength(1);
    expect(referralChipRewards.filter(row => row.playerId === payoutInviterId)).toHaveLength(1);
    const stripeRewards = await db.select().from(stripeTransactions)
      .where(inArray(stripeTransactions.playerId, [payoutInviterId, payoutRefereeId]));
    expect(stripeRewards.filter(row => row.playerId === payoutRefereeId && row.reason.startsWith('referral_reward:'))).toHaveLength(1);
    expect(stripeRewards.filter(row => row.playerId === payoutInviterId && row.reason.startsWith('referral_reward:'))).toHaveLength(1);
  });

  it('counts a settled Lady Luck race as a played hand for referral rewards', async () => {
    await storage.getOrCreatePlayer(payoutInviterId);
    await storage.getOrCreatePlayer(ladyLuckRefereeId);
    const inviter = await storage.getPlayerProfile(payoutInviterId);
    await storage.registerPlayerAuth({
      id: ladyLuckRefereeId, email: `${ladyLuckRefereeId}@example.invalid`, passwordHash: 'hash',
      referralCode: inviter!.referralCode,
    });
    const before = await storage.getPlayerProfile(ladyLuckRefereeId);
    const raceId = `referral-race-${randomUUID()}`;
    await storage.settleLadyLuckRace({
      tableId: `ref-table-${randomUUID()}`,
      raceId,
      winnerId: ladyLuckRefereeId,
      winningSuit: 'spades',
      grossPot: 0,
      seatedBets: [],
      seatedPlayers: [ladyLuckRefereeId],
      spectatorBets: [],
    });
    const after = await storage.getPlayerProfile(ladyLuckRefereeId);
    expect(after?.handsPlayed).toBe(1);
    expect(after?.chipBalance).toBe(before!.chipBalance + 2500);
    expect(after?.stripes).toBe(before!.stripes + 100);
  });
});