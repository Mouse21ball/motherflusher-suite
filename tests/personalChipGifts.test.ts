import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import { storage } from '../server/storage';
import { chipTransactions, playerProfiles } from '../shared/schema';
import { resolveGiftSeats } from '../server/personalChipGifts';

describe('personal chip gift seat authorization', () => {
  const seats = new Map([
    ['p1', 'human-sender'],
    ['p2', 'human-recipient'],
    ['p3', 'bot-identity'],
  ]);
  const humans = new Set(['p1', 'p2']);
  const connected = new Set(['p1', 'p2']);

  it('only resolves another current human seat, not bots or arbitrary identities', () => {
    expect(resolveGiftSeats(seats, humans, connected, 'human-sender', 'p2'))
      .toEqual({ senderId: 'human-sender', recipientId: 'human-recipient' });
    expect(resolveGiftSeats(seats, humans, connected, 'human-sender', 'p3')).toBeNull();
    expect(resolveGiftSeats(seats, humans, connected, 'human-sender', 'profile-id-from-request')).toBeNull();
    expect(resolveGiftSeats(seats, humans, connected, 'spectator', 'p2')).toBeNull();
    expect(resolveGiftSeats(seats, humans, connected, 'human-sender', 'p1')).toBeNull();
    expect(resolveGiftSeats(seats, humans, new Set(['p1']), 'human-sender', 'p2')).toBeNull();
  });
});

const makeId = () => `test-gift-${randomUUID()}`;

describe.skipIf(!process.env.DATABASE_URL)('personal chip gifts (development database)', () => {
  const profiles: string[] = [];
  afterAll(async () => {
    if (profiles.length) await db.delete(playerProfiles).where(
      eq(playerProfiles.id, profiles[0]),
    );
    for (const id of profiles.slice(1)) {
      await db.delete(playerProfiles).where(eq(playerProfiles.id, id));
    }
  });

  async function newPair() {
    const senderId = makeId();
    const recipientId = makeId();
    profiles.push(senderId, recipientId);
    await storage.getOrCreatePlayer(senderId);
    await storage.getOrCreatePlayer(recipientId);
    return { senderId, recipientId };
  }

  it('conserves chips, writes paired ledger rows and replays idempotently', async () => {
    const { senderId, recipientId } = await newPair();
    const requestId = randomUUID();
    const initialSender = (await storage.getPlayerProfile(senderId))!.chipBalance;
    const initialRecipient = (await storage.getPlayerProfile(recipientId))!.chipBalance;

    const first = await storage.giftTableChips({ requestId, senderId, recipientId, tableId: 'GIFT01' });
    const replay = await storage.giftTableChips({ requestId, senderId, recipientId, tableId: 'GIFT01' });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(first.senderBalance).toBe(initialSender - 100);
    expect(first.recipientBalance).toBe(initialRecipient + 100);
    expect(first.senderBalance + first.recipientBalance).toBe(initialSender + initialRecipient);

    const ledger = await db.select().from(chipTransactions).where(eq(chipTransactions.gameId, 'GIFT01'));
    const giftLedger = ledger.filter(row => row.metadata?.giftId === requestId);
    expect(giftLedger).toHaveLength(2);
    expect(giftLedger.reduce((sum, row) => sum + row.amountChange, 0)).toBe(0);
    expect(giftLedger.map(row => row.amountChange).sort((a, b) => a - b)).toEqual([-100, 100]);
  });

  it('rejects insufficient funds without recording a gift or ledger debit', async () => {
    const { senderId, recipientId } = await newPair();
    await db.update(playerProfiles).set({ chipBalance: 50 }).where(eq(playerProfiles.id, senderId));
    const requestId = randomUUID();
    await expect(storage.giftTableChips({ requestId, senderId, recipientId, tableId: 'GIFT02' }))
      .rejects.toMatchObject({ code: 'insufficient_chips' });
    expect((await storage.getPlayerProfile(senderId))?.chipBalance).toBe(50);
    const ledger = await db.select().from(chipTransactions).where(eq(chipTransactions.gameId, 'GIFT02'));
    expect(ledger.filter(row => row.metadata?.giftId === requestId)).toHaveLength(0);
  });

  it('enforces the per-recipient, per-table cooldown and allows another table', async () => {
    const { senderId, recipientId } = await newPair();
    await storage.giftTableChips({ requestId: randomUUID(), senderId, recipientId, tableId: 'GIFT03' });
    await expect(storage.giftTableChips({ requestId: randomUUID(), senderId, recipientId, tableId: 'GIFT03' }))
      .rejects.toMatchObject({ code: 'gift_cooldown' });
    const otherTableGift = await storage.giftTableChips({
      requestId: randomUUID(), senderId, recipientId, tableId: 'GIFT04',
    });
    expect(otherTableGift.replayed).toBe(false);
  });
});