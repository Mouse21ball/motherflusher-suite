// ─── Server-side Google Play Billing ─────────────────────────────────────────
// Handles server-side receipt verification via the Play Developer API.
// NEVER trust the client alone — all Stripes grants / subscription activations
// go through this module.
//
// Required env vars (set in Replit Secrets):
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  — full JSON of the service account key file
//   GOOGLE_PLAY_PACKAGE_NAME          — e.g. com.dgmentertainment.chaingangpoker
//   BILLING_TEST_MODE=true            — accept test_ tokens without hitting Google API
//
// Play Console setup (one-time, done by Laura):
//   1. Create a Google Cloud service account in the Play Console project
//   2. Grant it "View financial data, orders, and cancellation survey responses"
//      in Play Console → Setup → API access
//   3. Download the service account JSON key
//   4. Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON to the full JSON string

// ─── Consumable pack catalog ──────────────────────────────────────────────────
// Google Play product IDs must match Play Console exactly.
// Apple App Store product IDs must match App Store Connect exactly.
export const STRIPES_PACKS: Record<string, { stripes: number; priceCents: number }> = {
  // ── Google Play ──────────────────────────────────────────────────────────────
  stripes_starter_99:  { stripes: 100,   priceCents: 99   },
  stripes_small_499:   { stripes: 550,   priceCents: 499  },
  stripes_medium_999:  { stripes: 1200,  priceCents: 999  },
  stripes_large_2499:  { stripes: 3250,  priceCents: 2499 },
  stripes_mega_9999:   { stripes: 15000, priceCents: 9999 },
  // ── Apple App Store ─────────────────────────────────────────────────────────
  'com.dgmentertainment.poker.stripes.starter.v2':  { stripes: 100,   priceCents: 99   },
  'com.dgmentertainment.poker.stripes.standard.v2': { stripes: 550,   priceCents: 499  },
  'com.dgmentertainment.poker.stripes.popular.v2':  { stripes: 1200,  priceCents: 999  },
  'com.dgmentertainment.poker.stripes.big.v2':      { stripes: 3250,  priceCents: 2499 },
  'com.dgmentertainment.poker.stripes.mega.v2':     { stripes: 15000, priceCents: 9999 },
};

// ─── Club Chip pack catalog ───────────────────────────────────────────────────
// Consumable IAPs that credit chips directly to the buyer's club bank.
// No personal chip deduction — real money is exchanged, not a transfer.
export const CLUB_CHIP_PACKS: Record<string, { chips: number; priceCents: number }> = {
  'club-chips-small-999':   { chips: 10000,  priceCents: 999  },
  'club-chips-medium-2499': { chips: 30000,  priceCents: 2499 },
  'club-chips-large-4999':  { chips: 75000,  priceCents: 4999 },
};

// ─── Subscription product catalog ────────────────────────────────────────────
export type SubscriptionTier   = "gold_pro" | "diamond_elite";
export type BillingPeriod      = "monthly" | "yearly";

export interface SubscriptionProduct {
  tier:           SubscriptionTier;
  billingPeriod:  BillingPeriod;
  priceCents:     number;
  stripesOnStart: number;   // Stripes credited when subscription first activates
  stripesMonthly: number;   // Stripes credited on each renewal
  dailyChipMultiplier: number;  // Multiplier applied to base daily chip reward (e.g. 2 = 2x)
  xpMultiplier:   number;   // e.g. 1.25 = +25%
  frameId:        string;   // cosmetic frame auto-equipped while active
}

export const SUBSCRIPTION_PRODUCTS: Record<string, SubscriptionProduct> = {
  // ── Google Play ──────────────────────────────────────────────────────────────
  sub_gold_pro_monthly: {
    tier: "gold_pro", billingPeriod: "monthly",
    priceCents: 499, stripesOnStart: 1000, stripesMonthly: 1000,
    dailyChipMultiplier: 2, xpMultiplier: 1.5, frameId: "frame_gold_subscription",
  },
  sub_gold_pro_yearly: {
    tier: "gold_pro", billingPeriod: "yearly",
    priceCents: 2999, stripesOnStart: 1000, stripesMonthly: 1000,
    dailyChipMultiplier: 2, xpMultiplier: 1.5, frameId: "frame_gold_subscription",
  },
  sub_diamond_elite_monthly: {
    tier: "diamond_elite", billingPeriod: "monthly",
    priceCents: 999, stripesOnStart: 2500, stripesMonthly: 2500,
    dailyChipMultiplier: 3, xpMultiplier: 2.0, frameId: "frame_diamond_animated",
  },
  sub_diamond_elite_yearly: {
    tier: "diamond_elite", billingPeriod: "yearly",
    priceCents: 5999, stripesOnStart: 2500, stripesMonthly: 2500,
    dailyChipMultiplier: 3, xpMultiplier: 2.0, frameId: "frame_diamond_animated",
  },
  // ── Apple App Store ─────────────────────────────────────────────────────────
  'com.dgmentertainment.poker.goldpro.monthly': {
    tier: "gold_pro", billingPeriod: "monthly",
    priceCents: 499, stripesOnStart: 1000, stripesMonthly: 1000,
    dailyChipMultiplier: 2, xpMultiplier: 1.5, frameId: "frame_gold_subscription",
  },
  'com.dgmentertainment.poker.diamond.monthly': {
    tier: "diamond_elite", billingPeriod: "monthly",
    priceCents: 999, stripesOnStart: 2500, stripesMonthly: 2500,
    dailyChipMultiplier: 3, xpMultiplier: 2.0, frameId: "frame_diamond_animated",
  },
};

const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME ?? "com.dgmentertainment.poker";
const TEST_MODE    = process.env.BILLING_TEST_MODE === "true";
console.log(`[billing] BILLING_TEST_MODE = ${TEST_MODE}`);

// ── Production safety guard ───────────────────────────────────────────────────
// Test mode accepts test_ tokens without hitting Google's API, which means
// anyone who knows the token prefix can credit themselves Stripes for free.
// This MUST never run in production. Throw at boot so a misconfigured
// deployment fails loudly rather than silently accepting fake purchases.
if (process.env.NODE_ENV === 'production' && TEST_MODE) {
  throw new Error(
    '[billing] FATAL: BILLING_TEST_MODE=true is set in a production environment. ' +
    'Test mode bypasses Google Play receipt verification and must never run in ' +
    'production. Remove BILLING_TEST_MODE or set it to false before deploying.'
  );
}

export interface GooglePurchaseData {
  purchaseState:    number;   // 0 = purchased, 1 = canceled, 2 = pending
  orderId:          string;
  consumptionState: number;   // 0 = not consumed, 1 = already consumed
  regionCode?:      string;
  // Fix C: present when the client passed applicationUsername to offer.order().
  // Used to bind the purchase to the authenticated player server-side.
  obfuscatedExternalAccountId?: string;
}

// Fix A: updated for purchases.subscriptionsv2.get (v2 API).
// v1 fields startTimeMillis / expiryTimeMillis / paymentState are removed.
export interface GoogleSubscriptionData {
  startTime:    string;   // ISO 8601 (SubscriptionPurchaseV2.startTime)
  expiryTime:   string;   // ISO 8601 (lineItems[0].expiryTime)
  autoRenewing: boolean;  // lineItems[0].autoRenewingPlan?.autoRenewEnabled
  orderId:      string;   // latestOrderId
  // Fix C: present when the client passed applicationUsername to offer.order().
  obfuscatedExternalAccountId?: string;
}

// ─── Verify consumable purchase ───────────────────────────────────────────────
/**
 * Verifies a Google Play purchase token via the Play Developer API.
 * Returns raw purchase data on success; throws a descriptive Error on failure.
 * This is the ONLY function that may authorize a Stripes credit.
 */
export async function verifyGooglePlayPurchase(
  productId:     string,
  purchaseToken: string,
): Promise<GooglePurchaseData> {
  console.log(
    `[billing] verify start: productId=${productId} ` +
    `token=${purchaseToken.slice(0, 16)}… testMode=${TEST_MODE}`
  );
  console.log("[diagnostic] verifyGooglePlayPurchase calling Google with packageName:", PACKAGE_NAME);

  if (TEST_MODE && purchaseToken.startsWith("test_")) {
    console.log(`[billing] TEST_MODE: accepted test token for ${productId}`);
    return {
      purchaseState:    0,
      orderId:          `test_order_${Date.now()}`,
      consumptionState: 0,
    };
  }

  const credJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!credJson) {
    throw new Error(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON env var not set — " +
      "add the service account key JSON in Replit Secrets"
    );
  }

  const { androidpublisher, auth: gAuth } = await import("@googleapis/androidpublisher");
  const credentials = JSON.parse(credJson);
  const auth = new gAuth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const androidPublisher = androidpublisher({ version: "v3", auth });
  const response = await androidPublisher.purchases.products.get({
    packageName: PACKAGE_NAME,
    productId,
    token: purchaseToken,
  });
  const d = response.data;
  console.log(
    `[billing] Google API response: ` +
    `state=${d.purchaseState} orderId=${d.orderId} consumption=${d.consumptionState}`
  );
  return {
    purchaseState:    d.purchaseState    ?? -1,
    orderId:          d.orderId          ?? "",
    consumptionState: d.consumptionState ?? 0,
    regionCode:       d.regionCode       ?? undefined,
    // Fix C: obfuscatedExternalAccountId is set when client passes applicationUsername
    obfuscatedExternalAccountId: d.obfuscatedExternalAccountId ?? undefined,
  };
}

// ─── Verify subscription ──────────────────────────────────────────────────────
/**
 * Verifies a Google Play subscription token via purchases.subscriptions.get.
 * Subscriptions are NOT consumed — they expire and renew automatically.
 * Returns subscription data on success; throws on failure.
 */
export async function verifyGooglePlaySubscription(
  productId:     string,
  purchaseToken: string,
): Promise<GoogleSubscriptionData> {
  console.log(
    `[billing:sub] verify start: productId=${productId} ` +
    `token=${purchaseToken.slice(0, 16)}… testMode=${TEST_MODE}`
  );

  if (TEST_MODE && purchaseToken.startsWith("test_")) {
    const isYearly     = productId.includes("yearly");
    const periodMs     = isYearly ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    const expiryMillis = Date.now() + periodMs;
    console.log(`[billing:sub] TEST_MODE: accepted test subscription token for ${productId}`);
    // Fix A: return v2-shaped data (ISO strings, no paymentState)
    return {
      startTime:    new Date().toISOString(),
      expiryTime:   new Date(expiryMillis).toISOString(),
      autoRenewing: true,
      orderId:      `test_sub_order_${Date.now()}`,
    };
  }

  const credJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!credJson) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON env var not set");
  }
  const { androidpublisher, auth: gAuth } = await import("@googleapis/androidpublisher");
  const credentials = JSON.parse(credJson);
  const auth = new gAuth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const androidPublisher = androidpublisher({ version: "v3", auth });
  // Fix A: subscriptionsv2.get replaces the deprecated subscriptions.get (v1).
  // v2 uses `token` (not `subscriptionId`) and returns SubscriptionPurchaseV2.
  const response = await androidPublisher.purchases.subscriptionsv2.get({
    packageName: PACKAGE_NAME,
    token:       purchaseToken,
  });
  const d = response.data;
  const expiryTime = d.lineItems?.[0]?.expiryTime
    ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  console.log(
    `[billing:sub] Google API v2 response: ` +
    `state=${d.subscriptionState} orderId=${d.latestOrderId} expiry=${expiryTime}`,
  );
  return {
    startTime:    d.startTime ?? new Date().toISOString(),
    expiryTime,
    // lineItems[0].autoRenewingPlan is absent when subscription is cancelled
    autoRenewing: d.lineItems?.[0]?.autoRenewingPlan?.autoRenewEnabled ?? false,
    orderId:      d.latestOrderId ?? "",
    // Fix C: set by Google when client passes applicationUsername to offer.order()
    obfuscatedExternalAccountId:
      d.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? undefined,
  };
}

// ─── Acknowledge (consume) consumable ────────────────────────────────────────
/**
 * Consumes (acknowledges) a Google Play purchase so it becomes re-purchasable.
 * Must be called after Stripes are credited. Google auto-refunds unacknowledged
 * purchases after 3 days.
 */
export async function acknowledgeGooglePlayPurchase(
  productId:     string,
  purchaseToken: string,
): Promise<void> {
  if (TEST_MODE) {
    console.log(`[billing] TEST_MODE: skipping acknowledge for ${productId}`);
    return;
  }
  const credJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!credJson) return;
  const { androidpublisher, auth: gAuth } = await import("@googleapis/androidpublisher");
  const credentials = JSON.parse(credJson);
  const auth = new gAuth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const androidPublisher = androidpublisher({ version: "v3", auth });
  await androidPublisher.purchases.products.consume({
    packageName: PACKAGE_NAME,
    productId,
    token: purchaseToken,
  });
  console.log(`[billing] acknowledged (consumed): ${productId}`);
}

// ─── Subscription lifecycle handlers ─────────────────────────────────────────
// All handlers are imported and called from routes.ts.
// They rely on storage methods injected at call-time to avoid circular imports.

import { storage } from "./storage";

/**
 * processSubscriptionPurchase — idempotent on purchaseToken.
 * Called by POST /api/billing/verify-subscription.
 */
export async function processSubscriptionPurchase(
  playerId:      string,
  productId:     string,
  purchaseToken: string,
): Promise<{
  idempotent:    boolean;
  tier:          SubscriptionTier;
  expiresAt:     Date;
  stripesGranted: number;
}> {
  const product = SUBSCRIPTION_PRODUCTS[productId];
  if (!product) throw new Error(`Unknown subscription product: ${productId}`);

  // Idempotency check
  const existing = await storage.getSubscriptionByToken(purchaseToken);
  if (existing) {
    console.log(`[billing:sub] idempotent: token already processed for player=${playerId}`);
    return {
      idempotent:    true,
      tier:          existing.tier as SubscriptionTier,
      expiresAt:     existing.expiresAt ?? new Date(),
      stripesGranted: 0,
    };
  }

  // Verify with Google
  const subData = await verifyGooglePlaySubscription(productId, purchaseToken);

  // Fix C: bind verified subscription to the authenticated player (fail closed).
  // Skip only for test tokens in TEST_MODE (no real Google data available).
  if (!(TEST_MODE && purchaseToken.startsWith("test_"))) {
    if (!subData.obfuscatedExternalAccountId) {
      console.log(
        `[BILLING_AUTHZ] obfuscatedExternalAccountId missing — ` +
        `player=${playerId.slice(0, 8)} product=${productId}`,
      );
      throw new Error("Purchase authorization failed: account identifier missing");
    }
    if (subData.obfuscatedExternalAccountId !== playerId) {
      console.log(
        `[BILLING_AUTHZ] mismatch: session=${playerId.slice(0, 8)} ` +
        `purchase=${subData.obfuscatedExternalAccountId.slice(0, 8)} product=${productId}`,
      );
      throw new Error("Purchase authorization failed: account ID mismatch");
    }
  }

  // Fix A: v2 API returns expiryTime as ISO 8601 string (not expiryTimeMillis)
  const expiresAt = new Date(subData.expiryTime);

  // Snapshot existing frame for restore on expiry
  const profile = await storage.getPlayerProfile(playerId);
  const previousFrameId = profile?.equippedFrameId ?? null;

  // Create subscription row
  const sub = await storage.upsertSubscription({
    playerId,
    tier:              product.tier,
    billingPeriod:     product.billingPeriod,
    productId,
    purchaseToken,
    status:            "active",
    expiresAt,
    autoRenewing:      subData.autoRenewing,
    previousFrameId,
    stripesGrantedCurrentCycle: product.stripesOnStart,
  });

  // Activate tier on player profile
  await storage.setPlayerSubscriptionTier(playerId, product.tier, expiresAt);

  // Credit initial Stripes
  await storage.creditStripes(playerId, product.stripesOnStart, `subscription:${product.tier}:activation`);

  // Fix B: chip_transactions audit row for subscription activation (amountChange=0 — Stripes grant, not chips).
  // `profile` was fetched just above ("Snapshot existing frame for restore on expiry").
  await storage.recordChipTransaction({
    playerId,
    beforeBalance: profile?.chipBalance ?? 0,
    amountChange:  0,
    afterBalance:  profile?.chipBalance ?? 0,
    reason:        'iap_purchase',
    source:        'google_play',
    metadata:      { productId, purchaseToken: purchaseToken.slice(0, 20), event: 'subscription_activation' },
  });

  // Auto-equip subscription frame
  await storage.forceEquipFrame(playerId, product.frameId);

  // Update last Stripes grant timestamp
  await storage.updateSubscriptionLastStripesGrant(playerId);

  // Audit event
  await storage.logSubscriptionEvent({
    playerId,
    subscriptionId: sub.id,
    eventType: "purchased",
    eventData: { productId, tier: product.tier, stripesGranted: product.stripesOnStart },
  });

  console.log(
    `[billing:sub] activated player=${playerId} tier=${product.tier} ` +
    `expires=${expiresAt.toISOString()} stripes=+${product.stripesOnStart}`
  );

  return {
    idempotent:    false,
    tier:          product.tier,
    expiresAt,
    stripesGranted: product.stripesOnStart,
  };
}

/**
 * handleSubscriptionRenewal — called on SUBSCRIPTION_RENEWED webhook.
 * Extends expires_at, credits monthly Stripes, logs event.
 */
export async function handleSubscriptionRenewal(purchaseToken: string): Promise<void> {
  const sub = await storage.getSubscriptionByToken(purchaseToken);
  if (!sub) {
    console.warn(`[billing:sub] renewal: unknown token ${purchaseToken.slice(0, 16)}…`);
    return;
  }

  const product  = SUBSCRIPTION_PRODUCTS[sub.productId];
  if (!product) return;

  const isYearly  = sub.billingPeriod === "yearly";
  const periodMs  = isYearly ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  const newExpiry = new Date((sub.expiresAt?.getTime() ?? Date.now()) + periodMs);

  await storage.updateSubscriptionOnRenewal(sub.id, newExpiry, product.stripesMonthly);
  await storage.setPlayerSubscriptionTier(sub.playerId, sub.tier as SubscriptionTier, newExpiry);
  await storage.creditStripes(sub.playerId, product.stripesMonthly, `subscription:${sub.tier}:monthly_grant`);
  // Fix B: chip_transactions audit row for renewal Stripes grant (amountChange=0).
  const renewProfile = await storage.getPlayerProfile(sub.playerId);
  await storage.recordChipTransaction({
    playerId:      sub.playerId,
    beforeBalance: renewProfile?.chipBalance ?? 0,
    amountChange:  0,
    afterBalance:  renewProfile?.chipBalance ?? 0,
    reason:        'iap_purchase',
    source:        'google_play',
    metadata:      { productId: sub.productId, purchaseToken: purchaseToken.slice(0, 20), event: 'subscription_renewal' },
  });
  await storage.updateSubscriptionLastStripesGrant(sub.playerId);

  await storage.logSubscriptionEvent({
    playerId:       sub.playerId,
    subscriptionId: sub.id,
    eventType:      "renewed",
    eventData:      { newExpiry: newExpiry.toISOString(), stripesGranted: product.stripesMonthly },
  });

  console.log(`[billing:sub] renewed player=${sub.playerId} tier=${sub.tier} newExpiry=${newExpiry.toISOString()}`);
}

/**
 * handleSubscriptionCancellation — called on SUBSCRIPTION_CANCELED webhook.
 * Marks auto_renewing=false and status=canceled. Benefits continue until expires_at.
 */
export async function handleSubscriptionCancellation(purchaseToken: string): Promise<void> {
  const sub = await storage.getSubscriptionByToken(purchaseToken);
  if (!sub) return;

  await storage.updateSubscriptionStatus(sub.id, "canceled", { autoRenewing: false, canceledAt: new Date() });

  await storage.logSubscriptionEvent({
    playerId:       sub.playerId,
    subscriptionId: sub.id,
    eventType:      "canceled",
    eventData:      { expiresAt: sub.expiresAt?.toISOString() },
  });

  console.log(`[billing:sub] canceled player=${sub.playerId} benefits until ${sub.expiresAt?.toISOString()}`);
}

/**
 * handleSubscriptionExpiration — called on SUBSCRIPTION_EXPIRED webhook.
 * Clears tier on player, unequips subscription frame, restores previous frame.
 */
export async function handleSubscriptionExpiration(purchaseToken: string): Promise<void> {
  const sub = await storage.getSubscriptionByToken(purchaseToken);
  if (!sub) return;

  await storage.updateSubscriptionStatus(sub.id, "expired", {});
  await storage.clearPlayerSubscriptionTier(sub.playerId);
  await storage.restorePreviousFrame(sub.playerId, sub.previousFrameId);

  await storage.logSubscriptionEvent({
    playerId:       sub.playerId,
    subscriptionId: sub.id,
    eventType:      "expired",
    eventData:      { tier: sub.tier },
  });

  console.log(`[billing:sub] expired player=${sub.playerId} tier=${sub.tier} frame restored`);
}

/**
 * handleSubscriptionGracePeriod — called on SUBSCRIPTION_IN_GRACE_PERIOD webhook.
 * Benefits continue during grace period; sets status but keeps tier active.
 */
export async function handleSubscriptionGracePeriod(purchaseToken: string): Promise<void> {
  const sub = await storage.getSubscriptionByToken(purchaseToken);
  if (!sub) return;

  await storage.updateSubscriptionStatus(sub.id, "in_grace_period", {});

  await storage.logSubscriptionEvent({
    playerId:       sub.playerId,
    subscriptionId: sub.id,
    eventType:      "grace_period_entered",
    eventData:      { expiresAt: sub.expiresAt?.toISOString() },
  });

  console.log(`[billing:sub] grace_period player=${sub.playerId}`);
}

/**
 * handleSubscriptionOnHold — called on SUBSCRIPTION_ON_HOLD webhook.
 * Benefits PAUSED — tier cleared but subscription row kept.
 */
export async function handleSubscriptionOnHold(purchaseToken: string): Promise<void> {
  const sub = await storage.getSubscriptionByToken(purchaseToken);
  if (!sub) return;

  await storage.updateSubscriptionStatus(sub.id, "on_hold", {});
  await storage.clearPlayerSubscriptionTier(sub.playerId);

  await storage.logSubscriptionEvent({
    playerId:       sub.playerId,
    subscriptionId: sub.id,
    eventType:      "on_hold",
    eventData:      {},
  });

  console.log(`[billing:sub] on_hold player=${sub.playerId} benefits paused`);
}

/**
 * handleSubscriptionRecovered — called on SUBSCRIPTION_RECOVERED webhook.
 * Player fixed payment. Re-activate tier.
 */
export async function handleSubscriptionRecovered(purchaseToken: string): Promise<void> {
  const sub = await storage.getSubscriptionByToken(purchaseToken);
  if (!sub) return;

  const product = SUBSCRIPTION_PRODUCTS[sub.productId];
  if (!product) return;

  await storage.updateSubscriptionStatus(sub.id, "active", { autoRenewing: true });
  if (sub.expiresAt) {
    await storage.setPlayerSubscriptionTier(sub.playerId, sub.tier as SubscriptionTier, sub.expiresAt);
  }
  await storage.forceEquipFrame(sub.playerId, product.frameId);

  await storage.logSubscriptionEvent({
    playerId:       sub.playerId,
    subscriptionId: sub.id,
    eventType:      "recovered",
    eventData:      { tier: sub.tier },
  });

  console.log(`[billing:sub] recovered player=${sub.playerId} tier=${sub.tier} re-activated`);
}

/**
 * handleSubscriptionRefund — called on SUBSCRIPTION_REVOKED webhook.
 * Immediate revocation: clear tier, debit Stripes granted in current cycle,
 * unequip subscription frame.
 */
export async function handleSubscriptionRefund(purchaseToken: string): Promise<void> {
  const sub = await storage.getSubscriptionByToken(purchaseToken);
  if (!sub) return;

  await storage.updateSubscriptionStatus(sub.id, "expired", { canceledAt: new Date() });
  await storage.clearPlayerSubscriptionTier(sub.playerId);
  await storage.restorePreviousFrame(sub.playerId, sub.previousFrameId);

  // Debit Stripes granted in current billing cycle
  if (sub.stripesGrantedCurrentCycle > 0) {
    await storage.debitStripes(
      sub.playerId,
      sub.stripesGrantedCurrentCycle,
      `subscription:${sub.tier}:refund_clawback`,
    );
  }

  await storage.logSubscriptionEvent({
    playerId:       sub.playerId,
    subscriptionId: sub.id,
    eventType:      "refunded",
    eventData:      { tier: sub.tier, stripesDebited: sub.stripesGrantedCurrentCycle },
  });

  console.log(
    `[billing:sub] refunded player=${sub.playerId} tier=${sub.tier} ` +
    `stripes_debited=${sub.stripesGrantedCurrentCycle}`
  );
}

// ─── Apple App Store Server API ───────────────────────────────────────────────
// Verifies Apple IAP consumables via the App Store Server API (REST v1, JWT auth).
// No new packages required — JWT signing uses Node's built-in `crypto` module.
//
// Required env vars (set in Replit Secrets when Apple credentials are available):
//   APPLE_KEY_ID      — 10-character key ID from App Store Connect → Users & Access → Keys
//   APPLE_ISSUER_ID   — Issuer UUID shown at the top of the Keys page
//   APPLE_PRIVATE_KEY — Full ES256 PEM private key (contents of the downloaded .p8 file)
//   APPLE_BUNDLE_ID   — App bundle identifier, e.g. com.dgmentertainment.poker
//
// If any credential is missing the function throws a clear error (logged but never crashes
// the server). The route handler catches it and returns HTTP 402 to the client.

import crypto from 'crypto';

function getAppleCredentials(): { keyId: string; issuerId: string; privateKey: string; bundleId: string } | null {
  const keyId      = process.env.APPLE_KEY_ID;
  const issuerId   = process.env.APPLE_ISSUER_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  const bundleId   = process.env.APPLE_BUNDLE_ID;
  if (!keyId || !issuerId || !privateKey || !bundleId) {
    const missing = (['APPLE_KEY_ID', 'APPLE_ISSUER_ID', 'APPLE_PRIVATE_KEY', 'APPLE_BUNDLE_ID'] as const)
      .filter(k => !process.env[k]);
    console.warn(`[billing:apple] Apple IAP disabled — missing env vars: ${missing.join(', ')}`);
    return null;
  }
  return { keyId, issuerId, privateKey, bundleId };
}

/** Build an App Store Server API JWT signed with ES256 via Node's built-in crypto. */
function buildAppleJWT(keyId: string, issuerId: string, privateKeyPem: string, bundleId: string): string {
  const header  = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })).toString('base64url');
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: issuerId, iat: now, exp: now + 3600,
    aud: 'appstoreconnect-v1', bid: bundleId,
  })).toString('base64url');
  const signer = crypto.createSign('SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  // dsaEncoding: 'ieee-p1363' produces the compact r||s signature format required by JWA ES256
  const sig = signer.sign({ key: privateKeyPem, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

/** Decode a JWS string (Apple-signed transaction info) without re-verifying Apple's signature.
 *  The payload is fetched over HTTPS from Apple's own servers so the transport provides trust. */
function decodeAppleJWS(jws: string): Record<string, unknown> {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS format (expected 3 dot-separated segments)');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

export interface ApplePurchaseData {
  transactionId:         string;
  originalTransactionId: string;
  productId:             string;
  bundleId:              string;
  purchaseDate:          number;   // epoch ms
  quantity:              number;
  type:                  string;   // "Consumable" | "Non-Consumable" | "Auto-Renewable Subscription" | etc.
  revocationReason?:     number;   // present when Apple has refunded / revoked the purchase
  appAccountToken?:      string;   // UUID sent by the client via store.applicationUsername (links to player)
  environment:           'Sandbox' | 'Production';
}

/**
 * Verifies an Apple App Store transaction via the App Store Server API.
 * Tries production first; automatically falls back to sandbox for TestFlight / dev builds.
 * Returns parsed transaction data on success; throws a descriptive Error on any failure.
 *
 * When Apple credentials are not configured the thrown message says exactly which env vars to set.
 * The route catches it and returns HTTP 402 so the server never crashes at startup or at runtime.
 */
export async function verifyAppleAppStorePurchase(transactionId: string): Promise<ApplePurchaseData> {
  console.log(`[billing:apple] verify start: transactionId=${transactionId.slice(0, 20)}…`);

  const creds = getAppleCredentials();
  if (!creds) {
    throw new Error(
      'Apple IAP credentials not configured — set APPLE_KEY_ID, APPLE_ISSUER_ID, ' +
      'APPLE_PRIVATE_KEY, and APPLE_BUNDLE_ID in Replit Secrets',
    );
  }

  const jwt = buildAppleJWT(creds.keyId, creds.issuerId, creds.privateKey, creds.bundleId);

  // Try production first; fall back to sandbox for TestFlight and development builds.
  const endpoints: { env: 'Production' | 'Sandbox'; base: string }[] = [
    { env: 'Production', base: 'https://api.storekit.itunes.apple.com'         },
    { env: 'Sandbox',    base: 'https://api.storekit-sandbox.itunes.apple.com' },
  ];

  let lastErr: Error | null = null;
  for (const { env, base } of endpoints) {
    const url  = `${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });

    if (resp.status === 404) {
      lastErr = new Error(`Transaction not found on Apple ${env}`);
      continue; // try the other environment
    }
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Apple App Store Server API (${env}) returned ${resp.status}: ${body.slice(0, 200)}`);
    }

    const body = await resp.json() as { signedTransactionInfo?: string };
    if (!body.signedTransactionInfo) {
      throw new Error(`Apple API (${env}) response missing signedTransactionInfo field`);
    }

    const tx = decodeAppleJWS(body.signedTransactionInfo) as Record<string, any>;

    if (tx['bundleId'] !== creds.bundleId) {
      throw new Error(
        `Apple transaction bundleId mismatch: expected ${creds.bundleId}, got ${tx['bundleId']}`,
      );
    }

    console.log(
      `[billing:apple] verified (${env}): product=${tx['productId']} ` +
      `type=${tx['type']} revoked=${tx['revocationReason'] ?? 'none'}`,
    );

    return {
      transactionId:         tx['transactionId']         ?? transactionId,
      originalTransactionId: tx['originalTransactionId'] ?? transactionId,
      productId:             tx['productId']             ?? '',
      bundleId:              tx['bundleId']              ?? '',
      purchaseDate:          tx['purchaseDate']          ?? Date.now(),
      quantity:              tx['quantity']              ?? 1,
      type:                  tx['type']                  ?? 'Consumable',
      revocationReason:      tx['revocationReason'],
      appAccountToken:       tx['appAccountToken'],
      environment:           env,
    };
  }

  throw lastErr ?? new Error(`Apple transaction ${transactionId} not found on any Apple environment`);
}
