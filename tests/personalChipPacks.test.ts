import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  APPLE_PERSONAL_CHIP_PRODUCTS,
  GOOGLE_PERSONAL_CHIP_PRODUCTS,
  PERSONAL_CHIP_PACKS,
  BUST_RESCUE_PRODUCT,
  FIRST_PURCHASE_BUNDLE,
} from "../shared/billingProducts";
import {
  isApplePurchaseAccountBound,
  isGooglePurchaseAccountBound,
  PERSONAL_CHIP_PACK_CATALOG,
} from "../server/billing";
import {
  PERSONAL_CHIP_PRODUCT_IDS,
  APPLE_PERSONAL_CHIP_PRODUCT_IDS_LIST,
} from "../client/src/lib/billing";
import { storage } from "../server/storage";

let hasPersonalChipGrantColumn = false;
if (process.env.DATABASE_URL) {
  const columnCheck = await db.execute(sql`SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_transactions' AND column_name = 'chips_granted'
  ) AS available`);
  hasPersonalChipGrantColumn = Boolean(columnCheck?.rows?.[0]?.available);
}

describe("personal chip pack catalog and receipt account binding", () => {
  it("centralizes five matching Google and Apple products with parallel price tiers", () => {
    expect(PERSONAL_CHIP_PACKS.map(pack => pack.priceCents)).toEqual([99, 499, 999, 2499, 9999]);
    expect(PERSONAL_CHIP_PACKS.map(pack => pack.chips)).toEqual([1_000, 6_000, 15_000, 45_000, 200_000]);
    expect(PERSONAL_CHIP_PRODUCT_IDS).toHaveLength(7);
    expect(APPLE_PERSONAL_CHIP_PRODUCT_IDS_LIST).toHaveLength(7);
    expect(PERSONAL_CHIP_PRODUCT_IDS).toContain(BUST_RESCUE_PRODUCT.googleId);
    expect(APPLE_PERSONAL_CHIP_PRODUCT_IDS_LIST).toContain(BUST_RESCUE_PRODUCT.appleId);
    expect(PERSONAL_CHIP_PRODUCT_IDS).toContain(FIRST_PURCHASE_BUNDLE.googleId);
    expect(APPLE_PERSONAL_CHIP_PRODUCT_IDS_LIST).toContain(FIRST_PURCHASE_BUNDLE.appleId);
    for (const pack of PERSONAL_CHIP_PACKS) {
      expect(GOOGLE_PERSONAL_CHIP_PRODUCTS[pack.tier]).toBeTruthy();
      expect(APPLE_PERSONAL_CHIP_PRODUCTS[pack.tier]).toBeTruthy();
      expect(PERSONAL_CHIP_PRODUCT_IDS).toContain(GOOGLE_PERSONAL_CHIP_PRODUCTS[pack.tier]);
      expect(APPLE_PERSONAL_CHIP_PRODUCT_IDS_LIST).toContain(APPLE_PERSONAL_CHIP_PRODUCTS[pack.tier]);
      expect(PERSONAL_CHIP_PACK_CATALOG[GOOGLE_PERSONAL_CHIP_PRODUCTS[pack.tier]]).toMatchObject({
        chips: pack.chips, priceCents: pack.priceCents,
      });
      expect(PERSONAL_CHIP_PACK_CATALOG[APPLE_PERSONAL_CHIP_PRODUCTS[pack.tier]]).toMatchObject({
        chips: pack.chips, priceCents: pack.priceCents,
      });
    }
  });

  it("requires Google's verified account ID and Apple's appAccountToken to match", () => {
    expect(isGooglePurchaseAccountBound("player-a", "player-a", "token", false)).toBe(true);
    expect(isGooglePurchaseAccountBound("player-b", "player-a", "token", false)).toBe(false);
    expect(isGooglePurchaseAccountBound(undefined, "player-a", "token", false)).toBe(false);
    expect(isGooglePurchaseAccountBound(undefined, "player-a", "test_token", true)).toBe(true);
    expect(isApplePurchaseAccountBound("player-a", "player-a")).toBe(true);
    expect(isApplePurchaseAccountBound("player-b", "player-a")).toBe(false);
    expect(isApplePurchaseAccountBound(undefined, "player-a")).toBe(false);
  });
});

describe.skipIf(!hasPersonalChipGrantColumn)("personal chip purchase ledger and refund idempotency", () => {
  const playerId = `test-personal-chip-${randomUUID()}`;
  const otherPlayerId = `test-personal-chip-other-${randomUUID()}`;
  const purchaseToken = `personal-chip-token-${randomUUID()}`;
  let purchaseId: string | undefined;

  afterEach(async () => {
    // Purchase rows and chip audit entries cascade with their owning profile.
    await storage.deletePlayer(playerId);
    await storage.deletePlayer(otherPlayerId);
    purchaseId = undefined;
  });

  it("credits only the bound player's balance once and clawbacks refunds once", async () => {
    const player = await storage.getOrCreatePlayer(playerId);
    await storage.getOrCreatePlayer(otherPlayerId);
    const pack = PERSONAL_CHIP_PACK_CATALOG[GOOGLE_PERSONAL_CHIP_PRODUCTS.starter];
    const purchase = await storage.createPurchaseTransaction({
      playerId,
      productId: GOOGLE_PERSONAL_CHIP_PRODUCTS.starter,
      stripesGranted: 0,
      chipsGranted: 0,
      priceUsdCents: pack.priceCents,
      purchaseToken,
    });
    purchaseId = purchase.id;

    await expect(storage.completePersonalChipPurchase({
      purchaseTransactionId: purchase.id,
      playerId: otherPlayerId,
      productId: GOOGLE_PERSONAL_CHIP_PRODUCTS.starter,
      chips: pack.chips,
    })).rejects.toThrow(/binding mismatch/);
    expect((await storage.getPlayerProfile(playerId))?.chipBalance).toBe(player.chipBalance);

    const grants = await Promise.all([
      storage.completePersonalChipPurchase({
        purchaseTransactionId: purchase.id, playerId, productId: GOOGLE_PERSONAL_CHIP_PRODUCTS.starter, chips: pack.chips,
      }),
      storage.completePersonalChipPurchase({
        purchaseTransactionId: purchase.id, playerId, productId: GOOGLE_PERSONAL_CHIP_PRODUCTS.starter, chips: pack.chips,
      }),
    ]);
    expect(grants.filter(grant => !grant.idempotent)).toHaveLength(1);
    expect((await storage.getPlayerProfile(playerId))?.chipBalance).toBe(player.chipBalance + pack.chips);
    const chipHistory = await storage.getPlayerChipHistory(playerId, 20, 0);
    expect(chipHistory.filter(entry => entry.source === "personal_chip_pack")).toHaveLength(1);
    expect(chipHistory.find(entry => entry.source === "personal_chip_pack")?.amountChange).toBe(pack.chips);
    expect((await Promise.all([
      storage.debitChipsForRefund(purchase.id),
      storage.debitChipsForRefund(purchase.id),
    ])).filter(Boolean)).toHaveLength(1);
    expect((await storage.getPlayerProfile(playerId))?.chipBalance).toBe(player.chipBalance);
    expect(await storage.getPurchaseTransactionByToken(purchaseToken)).toMatchObject({
      verificationStatus: "refunded",
      chipsGranted: pack.chips,
    });

    const refundedBeforeGrant = await storage.createPurchaseTransaction({
      playerId,
      productId: GOOGLE_PERSONAL_CHIP_PRODUCTS.small,
      stripesGranted: 0,
      priceUsdCents: PERSONAL_CHIP_PACK_CATALOG[GOOGLE_PERSONAL_CHIP_PRODUCTS.small].priceCents,
      purchaseToken: `${purchaseToken}-pregrant-refund`,
    });
    expect(await storage.debitChipsForRefund(refundedBeforeGrant.id)).toBe(true);
    await expect(storage.completePersonalChipPurchase({
      purchaseTransactionId: refundedBeforeGrant.id,
      playerId,
      productId: GOOGLE_PERSONAL_CHIP_PRODUCTS.small,
      chips: PERSONAL_CHIP_PACK_CATALOG[GOOGLE_PERSONAL_CHIP_PRODUCTS.small].chips,
    })).rejects.toThrow(/cannot be completed from refunded/);
    expect((await storage.getPlayerProfile(playerId))?.chipBalance).toBe(player.chipBalance);
  });
});