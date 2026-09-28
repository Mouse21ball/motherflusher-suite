import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import { FIRST_PURCHASE_BUNDLE, GOOGLE_SUBSCRIPTION_PRODUCT_IDS } from "../shared/billingProducts";
import { crews, crewMembers, playerProfiles } from "../shared/schema";
import { extractAppleNotificationTransactionId, PERSONAL_CHIP_PACK_CATALOG } from "../server/billing";
import {
  FIRST_PURCHASE_OFFER_DURATION_MS,
  isFirstPurchaseBundlePurchaseValid,
  isFirstPurchaseOfferAvailable,
} from "../server/firstPurchase";

let hasOfferTable = false;
if (process.env.DATABASE_URL) {
  const tableCheck = await db.execute(sql`
    SELECT to_regclass('public.first_purchase_offers') IS NOT NULL AS available
  `);
  hasOfferTable = Boolean(tableCheck?.rows?.[0]?.available);
}

describe("first-purchase bundle offer rules", () => {
  const issuedAt = new Date("2025-04-01T12:00:00.000Z");
  const offer = {
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + FIRST_PURCHASE_OFFER_DURATION_MS),
    claimedAt: new Date(issuedAt.getTime() + 1_000),
  };

  it("defines the matching one-time Google and Apple bundle catalog", () => {
    expect(FIRST_PURCHASE_BUNDLE).toMatchObject({
      chips: 6_000,
      stripes: 200,
      priceCents: 199,
      offerDurationMs: 24 * 60 * 60 * 1_000,
    });
    expect(PERSONAL_CHIP_PACK_CATALOG[FIRST_PURCHASE_BUNDLE.googleId]).toEqual({
      chips: FIRST_PURCHASE_BUNDLE.chips,
      priceCents: FIRST_PURCHASE_BUNDLE.priceCents,
    });
    expect(PERSONAL_CHIP_PACK_CATALOG[FIRST_PURCHASE_BUNDLE.appleId]).toEqual({
      chips: FIRST_PURCHASE_BUNDLE.chips,
      priceCents: FIRST_PURCHASE_BUNDLE.priceCents,
    });
  });

  it("requires a claimed exposure window and a verified store timestamp before expiry", () => {
    expect(isFirstPurchaseOfferAvailable({ ...offer, claimedAt: null }, issuedAt)).toBe(true);
    expect(isFirstPurchaseOfferAvailable({ ...offer, claimedAt: null }, offer.expiresAt)).toBe(false);
    expect(isFirstPurchaseBundlePurchaseValid(offer, new Date(issuedAt.getTime() + 2_000))).toBe(true);
    expect(isFirstPurchaseBundlePurchaseValid(offer, new Date(offer.expiresAt.getTime() + 1))).toBe(false);
    expect(isFirstPurchaseBundlePurchaseValid(offer, new Date(issuedAt.getTime() + 500))).toBe(false);
    expect(isFirstPurchaseBundlePurchaseValid({ ...offer, claimedAt: null }, new Date(issuedAt.getTime() + 2_000))).toBe(false);
    expect(isFirstPurchaseBundlePurchaseValid(offer, null)).toBe(false);
  });

  it("extracts an Apple notification transaction id without trusting its JWS as proof", () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const signedTransactionInfo = `header.${encode({ transactionId: "apple-transaction-1" })}.signature`;
    const signedPayload = `header.${encode({
      data: { signedTransactionInfo },
    })}.signature`;
    expect(extractAppleNotificationTransactionId(signedPayload)).toBe("apple-transaction-1");
  });
});

describe.skipIf(!hasOfferTable)("first-purchase account history, grant and refund", () => {
  const buyerId = `test-first-bundle-${randomUUID()}`;
  const otherBuyerId = `test-first-bundle-other-${randomUUID()}`;

  afterEach(async () => {
    const crew = await storage.getPlayerCurrentCrew(buyerId);
    if (crew) {
      await db.delete(crewMembers).where(eq(crewMembers.crewId, crew.id));
      await db.update(playerProfiles).set({ currentCrewId: null })
        .where(eq(playerProfiles.id, buyerId));
      await db.delete(crews).where(eq(crews.id, crew.id));
    }
    await storage.deletePlayer(buyerId);
    await storage.deletePlayer(otherBuyerId);
  });

  it("starts one account-level 24-hour exposure and never renews or reclaims it", async () => {
    await storage.getOrCreatePlayer(buyerId);
    const now = new Date();
    const first = await storage.issueFirstPurchaseOffer(
      buyerId, now, FIRST_PURCHASE_OFFER_DURATION_MS,
    );
    expect(first).not.toBeNull();
    expect(first?.expiresAt.getTime() - first!.issuedAt.getTime()).toBe(FIRST_PURCHASE_OFFER_DURATION_MS);
    const reopened = await storage.issueFirstPurchaseOffer(
      buyerId, new Date(now.getTime() + 60_000), FIRST_PURCHASE_OFFER_DURATION_MS,
    );
    expect(reopened?.issuedAt).toEqual(first?.issuedAt);
    expect(await storage.claimFirstPurchaseOffer(buyerId, new Date())).not.toBeNull();
    expect(await storage.claimFirstPurchaseOffer(buyerId, new Date())).toBeNull();
    expect(await storage.issueFirstPurchaseOffer(
      buyerId, new Date(now.getTime() + FIRST_PURCHASE_OFFER_DURATION_MS + 1), FIRST_PURCHASE_OFFER_DURATION_MS,
    )).toMatchObject({ issuedAt: first?.issuedAt, claimedAt: expect.any(Date) });

    const expiredBuyerId = `test-first-expired-${randomUUID()}`;
    await storage.getOrCreatePlayer(expiredBuyerId);
    const expiredAt = new Date(now.getTime() - FIRST_PURCHASE_OFFER_DURATION_MS - 1);
    const expiredOffer = await storage.issueFirstPurchaseOffer(
      expiredBuyerId, expiredAt, FIRST_PURCHASE_OFFER_DURATION_MS,
    );
    expect(expiredOffer?.expiresAt.getTime()).toBeLessThan(Date.now());
    expect(await storage.claimFirstPurchaseOffer(expiredBuyerId, new Date())).toBeNull();
    expect(await storage.issueFirstPurchaseOffer(
      expiredBuyerId, new Date(), FIRST_PURCHASE_OFFER_DURATION_MS,
    )).toMatchObject({ issuedAt: expiredAt });
    await storage.deletePlayer(expiredBuyerId);
  });

  it("blocks first-purchase eligibility after verified/refunded consumables, subscriptions and crew purchases", async () => {
    await storage.getOrCreatePlayer(buyerId);
    await storage.getOrCreatePlayer(otherBuyerId);
    expect(await storage.issueFirstPurchaseOffer(buyerId, new Date(), FIRST_PURCHASE_OFFER_DURATION_MS)).not.toBeNull();

    await storage.createPurchaseTransaction({
      playerId: buyerId, productId: "stripes_small_499", stripesGranted: 550,
      priceUsdCents: 499, purchaseToken: `first-bundle-stripes-${randomUUID()}`,
      verificationStatus: "verified",
    });
    expect(await storage.hasPriorPaidPurchase(buyerId)).toBe(true);
    expect(await storage.issueFirstPurchaseOffer(buyerId, new Date(), FIRST_PURCHASE_OFFER_DURATION_MS)).toBeNull();

    await storage.createPurchaseTransaction({
      playerId: otherBuyerId, productId: "stripes_small_499", stripesGranted: 550,
      priceUsdCents: 499, purchaseToken: `first-bundle-other-${randomUUID()}`,
      verificationStatus: "verified",
    });
    expect(await storage.hasPriorPaidPurchase(otherBuyerId)).toBe(true);
    const nonPurchaserId = `test-first-non-purchaser-${randomUUID()}`;
    await storage.getOrCreatePlayer(nonPurchaserId);
    expect(await storage.hasPriorPaidPurchase(nonPurchaserId)).toBe(false);
    expect(await storage.issueFirstPurchaseOffer(nonPurchaserId, new Date(), FIRST_PURCHASE_OFFER_DURATION_MS)).not.toBeNull();

    const refundedId = `test-first-refunded-${randomUUID()}`;
    await storage.getOrCreatePlayer(refundedId);
    await storage.createPurchaseTransaction({
      playerId: refundedId, productId: FIRST_PURCHASE_BUNDLE.googleId, stripesGranted: 200,
      chipsGranted: 6_000, priceUsdCents: FIRST_PURCHASE_BUNDLE.priceCents,
      purchaseToken: `first-bundle-refunded-${randomUUID()}`, verificationStatus: "refunded",
    });
    expect(await storage.hasPriorPaidPurchase(refundedId)).toBe(true);

    const crewBuyerId = `test-first-crew-${randomUUID()}`;
    await storage.getOrCreatePlayer(crewBuyerId);
    await storage.createPurchaseTransaction({
      playerId: crewBuyerId, productId: "club-chips-small-999", stripesGranted: 0,
      priceUsdCents: 999, purchaseToken: `first-bundle-crew-${randomUUID()}`,
      verificationStatus: "verified",
    });
    expect(await storage.hasPriorPaidPurchase(crewBuyerId)).toBe(true);

    const rejectedBuyerId = `test-first-rejected-${randomUUID()}`;
    await storage.getOrCreatePlayer(rejectedBuyerId);
    await storage.createPurchaseTransaction({
      playerId: rejectedBuyerId, productId: "stripes_small_499", stripesGranted: 550,
      priceUsdCents: 499, purchaseToken: `first-bundle-rejected-${randomUUID()}`,
      verificationStatus: "rejected",
    });
    expect(await storage.hasPriorPaidPurchase(rejectedBuyerId)).toBe(false);
    for (const playerId of [refundedId, crewBuyerId, rejectedBuyerId, nonPurchaserId]) await storage.deletePlayer(playerId);
  });

  it("counts historical subscriptions even when no longer active", async () => {
    await storage.getOrCreatePlayer(buyerId);
    await storage.upsertSubscription({
      playerId: buyerId,
      tier: "gold_pro",
      billingPeriod: "monthly",
      productId: GOOGLE_SUBSCRIPTION_PRODUCT_IDS.goldProMonthly,
      purchaseToken: `first-bundle-sub-${randomUUID()}`,
      status: "expired",
      expiresAt: new Date(Date.now() - 60_000),
      autoRenewing: false,
      previousFrameId: null,
      stripesGrantedCurrentCycle: 1_000,
    });
    expect(await storage.hasPriorPaidPurchase(buyerId)).toBe(true);
  });

  it("leases pending receipt verification with an atomic bounded compare-and-swap", async () => {
    await storage.getOrCreatePlayer(buyerId);
    const purchase = await storage.createPurchaseTransaction({
      playerId: buyerId,
      productId: FIRST_PURCHASE_BUNDLE.googleId,
      stripesGranted: FIRST_PURCHASE_BUNDLE.stripes,
      priceUsdCents: FIRST_PURCHASE_BUNDLE.priceCents,
      purchaseToken: `first-bundle-lease-${randomUUID()}`,
    });
    const started = new Date();
    expect(await storage.claimPurchaseVerification(purchase.id, started, 60_000)).toBe(true);
    expect(await storage.claimPurchaseVerification(
      purchase.id, new Date(started.getTime() + 1_000), 60_000,
    )).toBe(false);
    expect(await storage.claimPurchaseVerification(
      purchase.id, new Date(started.getTime() + 60_001), 60_000,
    )).toBe(true);
    await storage.updatePurchaseTransactionStatus(purchase.id, "failed_retryable");
    expect(await storage.claimPurchaseVerification(purchase.id, new Date(), 60_000)).toBe(true);
  });

  it("persists and idempotently honors the original crew destination", async () => {
    await storage.getOrCreatePlayer(buyerId);
    const crew = await storage.createCrewTx({
      playerId: buyerId,
      name: `Bundle Crew ${randomUUID().slice(0, 6)}`,
      inviteCode: randomUUID().slice(0, 6).toUpperCase(),
    });
    const purchase = await storage.createPurchaseTransaction({
      playerId: buyerId,
      productId: "club-chips-small-999",
      crewId: crew.id,
      stripesGranted: 0,
      priceUsdCents: 999,
      purchaseToken: `first-bundle-crew-destination-${randomUUID()}`,
    });
    const params = {
      purchaseTransactionId: purchase.id,
      playerId: buyerId,
      productId: "club-chips-small-999",
      crewId: crew.id,
      chips: 8_000,
      orderId: "crew-order",
    };
    expect((await storage.completeCrewChipPurchase(params)).idempotent).toBe(false);
    expect((await storage.completeCrewChipPurchase(params)).idempotent).toBe(true);
    expect(await storage.getPurchaseTransactionByToken(purchase.purchaseToken)).toMatchObject({
      crewId: crew.id,
      chipsGranted: 8_000,
      verificationStatus: "verified",
    });
    await expect(storage.completeCrewChipPurchase({
      ...params,
      crewId: `${crew.id}-other`,
    })).rejects.toThrow(/binding mismatch/);
  });

  it("atomically grants chips plus Stripes once, then claws both back once", async () => {
    const before = await storage.getOrCreatePlayer(buyerId);
    const otherBefore = await storage.getOrCreatePlayer(otherBuyerId);
    const bundleProductId = FIRST_PURCHASE_BUNDLE.appleId;
    const offer = await storage.issueFirstPurchaseOffer(
      buyerId, new Date(), FIRST_PURCHASE_OFFER_DURATION_MS,
    );
    expect(offer).not.toBeNull();
    const claimedAt = new Date();
    await storage.claimFirstPurchaseOffer(buyerId, claimedAt);
    const storePurchaseAt = new Date(claimedAt.getTime() + 10);
    // A different checkout may settle after claim; a valid paid bundle receipt
    // must still be granted rather than charging the customer without delivery.
    await storage.createPurchaseTransaction({
      playerId: buyerId,
      productId: "stripes_small_499",
      stripesGranted: 550,
      priceUsdCents: 499,
      purchaseToken: `first-bundle-racing-purchase-${randomUUID()}`,
      verificationStatus: "verified",
    });
    const token = `first-bundle-token-${randomUUID()}`;
    const purchase = await storage.createPurchaseTransaction({
      playerId: buyerId,
      productId: bundleProductId,
      stripesGranted: FIRST_PURCHASE_BUNDLE.stripes,
      chipsGranted: 0,
      priceUsdCents: FIRST_PURCHASE_BUNDLE.priceCents,
      purchaseToken: token,
    });

    await expect(storage.completeFirstPurchaseBundle({
      purchaseTransactionId: purchase.id,
      playerId: otherBuyerId,
      productId: bundleProductId,
      chips: FIRST_PURCHASE_BUNDLE.chips,
      stripes: FIRST_PURCHASE_BUNDLE.stripes,
      purchaseAt: storePurchaseAt,
    })).rejects.toThrow(/binding mismatch/);
    await expect(storage.completeFirstPurchaseBundle({
      purchaseTransactionId: purchase.id,
      playerId: buyerId,
      productId: "stripes_small_499",
      chips: FIRST_PURCHASE_BUNDLE.chips,
      stripes: FIRST_PURCHASE_BUNDLE.stripes,
      purchaseAt: storePurchaseAt,
    })).rejects.toThrow(/binding mismatch/);
    const results = await Promise.all([
      storage.completeFirstPurchaseBundle({
        purchaseTransactionId: purchase.id, playerId: buyerId,
        productId: bundleProductId, chips: FIRST_PURCHASE_BUNDLE.chips,
        stripes: FIRST_PURCHASE_BUNDLE.stripes, purchaseAt: storePurchaseAt, orderId: "order-one",
      }),
      storage.completeFirstPurchaseBundle({
        purchaseTransactionId: purchase.id, playerId: buyerId,
        productId: bundleProductId, chips: FIRST_PURCHASE_BUNDLE.chips,
        stripes: FIRST_PURCHASE_BUNDLE.stripes, purchaseAt: storePurchaseAt, orderId: "order-one",
      }),
    ]);
    expect(results.filter(result => !result.idempotent)).toHaveLength(1);
    expect((await storage.getPlayerProfile(buyerId))?.chipBalance).toBe(before.chipBalance + FIRST_PURCHASE_BUNDLE.chips);
    expect((await storage.getPlayerProfile(buyerId))?.stripes).toBe(before.stripes + FIRST_PURCHASE_BUNDLE.stripes);
    expect((await storage.getPlayerProfile(otherBuyerId))?.chipBalance).toBe(otherBefore.chipBalance);
    expect(await storage.hasPriorPaidPurchase(buyerId)).toBe(true);
    expect((await storage.getPlayerChipHistory(buyerId, 20, 0))
      .filter(entry => entry.source === "first_purchase_bundle")).toHaveLength(1);
    expect((await storage.getPlayerStripesHistory(buyerId, 20, 0))
      .filter(entry => entry.reason === `purchase:${bundleProductId}`)).toHaveLength(1);

    const purchaseRow = await storage.getPurchaseTransactionByToken(token);
    expect(purchaseRow).toMatchObject({
      verificationStatus: "verified",
      chipsGranted: FIRST_PURCHASE_BUNDLE.chips,
      stripesGranted: FIRST_PURCHASE_BUNDLE.stripes,
    });
    await expect(storage.refundConsumablePurchase(
      purchase.id, otherBuyerId, bundleProductId,
    )).rejects.toThrow(/binding mismatch/);
    expect(await storage.refundConsumablePurchase(
      purchase.id, buyerId, bundleProductId,
    )).toBe(true);
    expect(await storage.refundConsumablePurchase(
      purchase.id, buyerId, bundleProductId,
    )).toBe(false);
    expect((await storage.getPlayerProfile(buyerId))?.chipBalance).toBe(before.chipBalance);
    expect((await storage.getPlayerProfile(buyerId))?.stripes).toBe(before.stripes);
    expect(await storage.getPurchaseTransactionByToken(token)).toMatchObject({ verificationStatus: "refunded" });
    expect(await storage.hasPriorPaidPurchase(buyerId)).toBe(true);
    expect((await storage.getPlayerChipHistory(buyerId, 20, 0))
      .filter(entry => entry.source === "personal_chip_purchase_refund")).toHaveLength(1);
    expect((await storage.getPlayerStripesHistory(buyerId, 20, 0))
      .filter(entry => entry.reason === `refund:${purchase.id}`)).toHaveLength(1);
  });
});