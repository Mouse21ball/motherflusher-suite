import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import {
  BUST_RESCUE_PRODUCT,
  GOOGLE_PERSONAL_CHIP_PRODUCT_IDS,
  APPLE_PERSONAL_CHIP_PRODUCT_IDS,
} from "../shared/billingProducts";
import { PERSONAL_CHIP_PACK_CATALOG } from "../server/billing";
import {
  BUST_RESCUE_OFFER_DURATION_MS,
  isBustRescueOfferAvailable,
  isBustRescuePurchaseValid,
} from "../server/bustRescue";
import { readFileSync } from "node:fs";

const bustOutSource = readFileSync(
  new URL("../client/src/components/game/BustOutModal.tsx", import.meta.url),
  "utf8",
);

describe("paid bust-rescue offer", () => {
  it("uses centrally configured matched store products and the discounted personal-chip grant", () => {
    expect(BUST_RESCUE_OFFER_DURATION_MS).toBe(10 * 60 * 1000);
    expect(BUST_RESCUE_PRODUCT).toMatchObject({ chips: 3_000, priceCents: 99 });
    expect(GOOGLE_PERSONAL_CHIP_PRODUCT_IDS).toContain(BUST_RESCUE_PRODUCT.googleId);
    expect(APPLE_PERSONAL_CHIP_PRODUCT_IDS).toContain(BUST_RESCUE_PRODUCT.appleId);
    expect(PERSONAL_CHIP_PACK_CATALOG[BUST_RESCUE_PRODUCT.googleId]).toEqual({ chips: 3_000, priceCents: 99 });
    expect(PERSONAL_CHIP_PACK_CATALOG[BUST_RESCUE_PRODUCT.appleId]).toEqual({ chips: 3_000, priceCents: 99 });
  });

  it("accepts only a verified store timestamp inside the claimed offer window", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const offer = {
      issuedAt: start,
      claimedAt: new Date(start.getTime() + 1_000),
      expiresAt: new Date(start.getTime() + BUST_RESCUE_OFFER_DURATION_MS),
    };
    expect(isBustRescueOfferAvailable({ ...offer, claimedAt: null }, new Date(start.getTime() + 500))).toBe(true);
    expect(isBustRescueOfferAvailable({ ...offer, claimedAt: null }, offer.expiresAt)).toBe(false);
    expect(isBustRescuePurchaseValid(offer, new Date(start.getTime() + 2_000))).toBe(true);
    expect(isBustRescuePurchaseValid(offer, new Date(offer.expiresAt.getTime() + 1))).toBe(false);
    expect(isBustRescuePurchaseValid(offer, new Date(start.getTime() + 500))).toBe(false);
    expect(isBustRescuePurchaseValid(offer, null)).toBe(false);
  });

  it("keeps every existing free triage option alongside the paid offer", () => {
    expect(bustOutSource).toContain("button-bust-rebuy");
    expect(bustOutSource).toContain("button-bust-borrow-chips");
    expect(bustOutSource).toContain("button-bust-watch-ad");
    expect(bustOutSource).toContain("button-bust-free-rebuy");
    expect(bustOutSource).toContain("button-bust-paid-rescue");
    expect(bustOutSource).toContain("hasNeverPurchased ? \"FIRST-TIME PLAYER RESCUE\"");
  });
});

let hasBustRescueTable = false;
if (process.env.DATABASE_URL) {
  const result = await db.execute(sql`SELECT to_regclass('public.bust_rescue_offers') IS NOT NULL AS available`);
  hasBustRescueTable = Boolean(result?.rows?.[0]?.available);
}

describe.skipIf(!hasBustRescueTable)("persisted bust-rescue eligibility", () => {
  const playerId = `test-bust-rescue-${randomUUID()}`;
  const purchaseToken = `test-bust-rescue-purchase-${randomUUID()}`;

  afterEach(async () => {
    await storage.deletePlayer(playerId);
  });

  it("issues once per account, cannot renew by reopening, and can only be claimed once", async () => {
    await storage.getOrCreatePlayer(playerId);
    const issuedAt = new Date();
    const first = await storage.issueBustRescueOffer(playerId, issuedAt, BUST_RESCUE_OFFER_DURATION_MS);
    const reopened = await storage.issueBustRescueOffer(
      playerId,
      new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000),
      BUST_RESCUE_OFFER_DURATION_MS,
    );
    expect(reopened.issuedAt.getTime()).toBe(first.issuedAt.getTime());
    expect(reopened.expiresAt.getTime()).toBe(first.expiresAt.getTime());
    expect(await storage.claimBustRescueOffer(playerId, new Date())).not.toBeNull();
    expect(await storage.claimBustRescueOffer(playerId, new Date())).toBeNull();
  });

  it("does not issue or claim an expired offer again", async () => {
    await storage.getOrCreatePlayer(playerId);
    const expired = new Date(Date.now() - BUST_RESCUE_OFFER_DURATION_MS - 5_000);
    const first = await storage.issueBustRescueOffer(playerId, expired, BUST_RESCUE_OFFER_DURATION_MS);
    const reopened = await storage.issueBustRescueOffer(playerId, new Date(), BUST_RESCUE_OFFER_DURATION_MS);
    expect(reopened.expiresAt.getTime()).toBe(first.expiresAt.getTime());
    expect(await storage.claimBustRescueOffer(playerId, new Date())).toBeNull();
  });

  it("verifies and grants the rescue SKU through the same idempotent personal-chip ledger", async () => {
    const profile = await storage.getOrCreatePlayer(playerId);
    const purchase = await storage.createPurchaseTransaction({
      playerId,
      productId: BUST_RESCUE_PRODUCT.googleId,
      stripesGranted: 0,
      chipsGranted: 0,
      priceUsdCents: BUST_RESCUE_PRODUCT.priceCents,
      purchaseToken,
    });
    const first = await storage.completePersonalChipPurchase({
      purchaseTransactionId: purchase.id,
      playerId,
      productId: BUST_RESCUE_PRODUCT.googleId,
      chips: BUST_RESCUE_PRODUCT.chips,
      orderId: "verified-test-order",
    });
    const replay = await storage.completePersonalChipPurchase({
      purchaseTransactionId: purchase.id,
      playerId,
      productId: BUST_RESCUE_PRODUCT.googleId,
      chips: BUST_RESCUE_PRODUCT.chips,
      orderId: "verified-test-order",
    });
    expect(first.idempotent).toBe(false);
    expect(replay.idempotent).toBe(true);
    expect((await storage.getPlayerProfile(playerId))?.chipBalance)
      .toBe(profile.chipBalance + BUST_RESCUE_PRODUCT.chips);
  });
});