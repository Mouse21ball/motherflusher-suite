// ─── Client-side billing ──────────────────────────────────────────────────────
// Wraps cordova-plugin-purchase (CdvPurchase) for Google Play Billing.
// Falls back to a no-op stub in web/development environments.
//
// NATIVE SETUP REQUIRED (once Android project is configured):
//   npm install cordova-plugin-purchase
//   npx cap sync android
//   In android/app/build.gradle: add Google Play Billing library dependency
//   In Play Console: register the 5 consumable + 4 subscription product IDs
//   Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON + GOOGLE_PLAY_PACKAGE_NAME on server
//
// The consumable purchase flow:
//   1. billing.initialize() — connect to Play Billing, load product prices
//   2. billing.purchase(productId) — launch native payment sheet
//   3. On success → server verifies token → grants Stripes → billing.finish()
//
// The subscription purchase flow:
//   1. billing.launchSubscriptionPurchase(productId) — launch native sheet
//   2. On success → server verifies token via verify-subscription → activates tier

import { apiUrl } from "./apiConfig";
import { getSessionToken } from "./session";
import { ensurePlayerIdentity } from "./persistence";

// ─── Consumable product catalog ───────────────────────────────────────────────
export const STRIPES_PRODUCT_IDS = [
  "stripes_starter_99",
  "stripes_small_499",
  "stripes_medium_999",
  "stripes_large_2499",
  "stripes_mega_9999",
] as const;

export type StripesProductId = typeof STRIPES_PRODUCT_IDS[number];

// ─── Club Chip consumable product catalog ────────────────────────────────────
export const CLUB_CHIP_PRODUCT_IDS = [
  'club-chips-small-999',
  'club-chips-medium-2499',
  'club-chips-large-4999',
] as const;

export type ClubChipProductId = typeof CLUB_CHIP_PRODUCT_IDS[number];

// ─── Subscription product catalog ────────────────────────────────────────────
export const SUBSCRIPTION_PRODUCT_IDS = [
  "sub_gold_pro_monthly",
  "sub_gold_pro_yearly",
  "sub_diamond_elite_monthly",
  "sub_diamond_elite_yearly",
] as const;

export type SubscriptionProductId = typeof SUBSCRIPTION_PRODUCT_IDS[number];

// ─── Apple App Store product catalogs ─────────────────────────────────────────
// These IDs must match App Store Connect exactly — they differ from Google Play IDs.
// Apple Stripes packs mirror the Google Play display configuration.
export const APPLE_STRIPES_PRODUCT_IDS = [
  'com.dgmentertainment.poker.stripes.starter.v2',
  'com.dgmentertainment.poker.stripes.standard.v2',
  'com.dgmentertainment.poker.stripes.popular.v2',
  'com.dgmentertainment.poker.stripes.big.v2',
  'com.dgmentertainment.poker.stripes.mega.v2',
] as const;

export const APPLE_SUBSCRIPTION_PRODUCT_IDS = [
  'com.dgmentertainment.poker.goldpro.monthly',
  'com.dgmentertainment.poker.diamond.monthly',
] as const;

// ─── Apple App Store shop display catalog ─────────────────────────────────────
// Keep the iOS UI in lockstep with the App Store Connect product configuration.
export interface AppleStripesShopProduct {
  id: typeof APPLE_STRIPES_PRODUCT_IDS[number];
  name: string;
  price: string;
  stripes: number;
  badge: string | null;
  featured: boolean;
}

export const APPLE_STRIPES_SHOP_PRODUCTS: AppleStripesShopProduct[] = [
  {
    id: 'com.dgmentertainment.poker.stripes.starter.v2',
    name: 'Starter Pack',
    price: '$0.99',
    stripes: 100,
    badge: null,
    featured: false,
  },
  {
    id: 'com.dgmentertainment.poker.stripes.standard.v2',
    name: 'Small Pack',
    price: '$4.99',
    stripes: 550,
    badge: null,
    featured: false,
  },
  {
    id: 'com.dgmentertainment.poker.stripes.popular.v2',
    name: 'Medium Pack',
    price: '$9.99',
    stripes: 1200,
    badge: 'BEST STARTER',
    featured: false,
  },
  {
    id: 'com.dgmentertainment.poker.stripes.big.v2',
    name: 'Large Pack',
    price: '$24.99',
    stripes: 3250,
    badge: 'BEST VALUE',
    featured: true,
  },
  {
    id: 'com.dgmentertainment.poker.stripes.mega.v2',
    name: 'Mega Pack',
    price: '$99.99',
    stripes: 15000,
    badge: 'WHALE PACK',
    featured: false,
  },
];

export const APPLE_SUBSCRIPTION_PRODUCTS = {
  goldPro: {
    id: 'com.dgmentertainment.poker.goldpro.monthly',
    name: 'Gold Pro',
    price: '$4.99',
    period: 'monthly',
  },
  diamondElite: {
    id: 'com.dgmentertainment.poker.diamond.monthly',
    name: 'Diamond Elite',
    price: '$19.99',
    period: 'monthly',
  },
} as const;

export type SubscriptionTier = "gold_pro" | "diamond_elite";

export interface ProductInfo {
  id:           string;
  title:        string;
  description:  string;
  price:        string;  // formatted local currency, e.g. "$9.99"
  priceMicros:  number;
}

export interface PurchaseResult {
  productId:      string;
  purchaseToken:  string;
  orderId:        string;
  stripesGranted: number;
  chipsGranted?:  number;
  crewId?:        string;
}

export interface SubscriptionResult {
  productId:      string;
  purchaseToken:  string;
  tier:           SubscriptionTier;
  expiresAt:      string;     // ISO string
  stripesGranted: number;
  idempotent:     boolean;
}

export interface ActiveSubscription {
  active:       boolean;
  tier:         SubscriptionTier | null;
  status:       string | null;  // "active" | "in_grace_period" | "canceled" | "on_hold" | "expired"
  expiresAt:    string | null;  // ISO string
  autoRenewing: boolean | null;
  productId:    string | null;
  billingPeriod: "monthly" | "yearly" | null;
}

// ─── BillingPlugin interface ──────────────────────────────────────────────────
export interface BillingPlugin {
  initialize(): Promise<void>;
  getProducts(): ProductInfo[];
  purchase(productId: string, meta?: { crewId?: string }): Promise<PurchaseResult>;
  restorePurchases(): Promise<void>;
  launchSubscriptionPurchase(productId: string): Promise<SubscriptionResult>;
  getActiveSubscription(): Promise<ActiveSubscription>;
  openSubscriptionManagement(): void;
}

// ─── Native implementation (cordova-plugin-purchase v13) ─────────────────────
// Types come from cordova-plugin-purchase via tsconfig.json "types" array and
// client/src/types/cordova-purchase.d.ts. CdvPurchase is a global namespace
// injected at runtime by the Cordova plugin. All access is gated by
// isNativePlatform() so web/dev builds always fall through to WebBillingStub.
class NativeBillingPlugin implements BillingPlugin {
  private initialized = false;
  // Pending purchase promises keyed by productId.
  // Resolved/rejected inside store.when().approved() after server verification.
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void; crewId?: string }>();

  async initialize(): Promise<void> {
    const { store, Platform, ProductType } = CdvPurchase;

    // Fix C (v13): set applicationUsername at the store level — additionalData.applicationUsername
    // is deprecated and silently ignored by the v13 Google Play adapter. The store-level setter
    // is what withObfuscatedAccountId() actually reads when building the accountId sent to Google.
    // obfuscator must be 'disabled' so the raw UUID passes through unchanged; the server's
    // BILLING_AUTHZ check compares the raw player UUID against obfuscatedExternalAccountId.
    store.applicationUsername = () => ensurePlayerIdentity().id;
    store.obfuscator = 'disabled';

    // Register Google Play Stripes packs
    store.register(
      STRIPES_PRODUCT_IDS.map(id => ({
        id,
        type:     ProductType.CONSUMABLE,
        platform: Platform.GOOGLE_PLAY,
      }))
    );
    // Register Apple App Store Stripes packs (different IDs from Google Play)
    store.register(
      APPLE_STRIPES_PRODUCT_IDS.map(id => ({
        id,
        type:     ProductType.CONSUMABLE,
        platform: Platform.APPLE_APPSTORE,
      }))
    );

    // Register club chip consumable packs (Google Play only; no Apple equivalents yet)
    store.register(
      CLUB_CHIP_PRODUCT_IDS.map(id => ({
        id,
        type:     ProductType.CONSUMABLE,
        platform: Platform.GOOGLE_PLAY,
      }))
    );

    // Register Google Play subscription products
    store.register(
      SUBSCRIPTION_PRODUCT_IDS.map(id => ({
        id,
        type:     ProductType.PAID_SUBSCRIPTION,
        platform: Platform.GOOGLE_PLAY,
      }))
    );
    // Register Apple App Store subscription products (different IDs from Google Play)
    store.register(
      APPLE_SUBSCRIPTION_PRODUCT_IDS.map(id => ({
        id,
        type:     ProductType.PAID_SUBSCRIPTION,
        platform: Platform.APPLE_APPSTORE,
      }))
    );

    // FIX 3: register error handler before connecting to Play Billing so all
    // store errors (network, billing unavailable, invalid product, etc.) are
    // surfaced instead of being silently swallowed.
    store.error(err => {
      console.error("[billing] store error:", err.code, err.message);
    });

    // ── Google Play approved handler ──────────────────────────────────────────
    // Fires only for Google Play transactions. Server verification must succeed
    // before transaction.finish() is called to acknowledge to Google (required
    // within 3 days for consumables, otherwise Google auto-refunds).
    store.when().approved(async (transaction) => {
      // Skip non-Google transactions — Apple transactions are handled by the
      // separate handler registered below.
      if (transaction.platform !== Platform.GOOGLE_PLAY) return;

      const productId = transaction.products[0]?.id ?? "";
      if (!productId) return;

      // purchaseToken lives on nativePurchase (Bridge.Purchase), NOT on Transaction.
      // Receipt also has purchaseToken, but we receive a Transaction here, so we
      // drill through nativePurchase which is typed on the GooglePlay subclass.
      const gpTx          = transaction as unknown as CdvPurchase.GooglePlay.Transaction;
      const purchaseToken = gpTx.nativePurchase?.purchaseToken ?? transaction.transactionId;
      const sessionToken  = getSessionToken() ?? "";
      const isStripesPack  = (STRIPES_PRODUCT_IDS as readonly string[]).includes(productId);
      const isClubChipPack = (CLUB_CHIP_PRODUCT_IDS as readonly string[]).includes(productId);
      const isConsumable   = isStripesPack || isClubChipPack;

      try {
        if (isConsumable) {
          const pendingEntry = this.pending.get(productId);
          const body: Record<string, unknown> = { productId, purchaseToken };
          if (isClubChipPack && pendingEntry?.crewId) body.crewId = pendingEntry.crewId;
          const resp = await fetch(apiUrl("/api/billing/verify-purchase"), {
            method:  "POST",
            headers: { "Content-Type": "application/json", "X-Session-Token": sessionToken },
            body:    JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            this.pending.get(productId)?.reject(
              new Error((err as any).error ?? `Verification failed: ${resp.status}`)
            );
            return;
          }
          const data = await resp.json() as {
            stripesGranted?: number; orderId?: string;
            chipsGranted?:   number; crewId?:  string;
          };
          // Consumables must be finished (acknowledged + consumed) to become re-purchasable
          await transaction.finish();
          this.pending.get(productId)?.resolve({
            productId,
            purchaseToken,
            orderId:        data.orderId        ?? '',
            stripesGranted: data.stripesGranted ?? 0,
            chipsGranted:   data.chipsGranted,
            crewId:         data.crewId,
          });
        } else {
          // Subscription
          const resp = await fetch(apiUrl("/api/billing/verify-subscription"), {
            method:  "POST",
            headers: { "Content-Type": "application/json", "X-Session-Token": sessionToken },
            body:    JSON.stringify({ productId, purchaseToken }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            this.pending.get(productId)?.reject(
              new Error((err as any).error ?? `Subscription verification failed: ${resp.status}`)
            );
            return;
          }
          const data = await resp.json() as SubscriptionResult;
          // Subscriptions are NOT finished here — Google manages their lifecycle
          this.pending.get(productId)?.resolve({
            productId, purchaseToken,
            tier: data.tier, expiresAt: data.expiresAt,
            stripesGranted: data.stripesGranted, idempotent: data.idempotent,
          });
        }
      } catch (err) {
        this.pending.get(productId)?.reject(err);
      } finally {
        this.pending.delete(productId);
      }
    });

    // ── Apple App Store approved handler ─────────────────────────────────────
    // Fires only for Apple AppStore transactions. Posts the Apple transactionId
    // to the server for App Store Server API verification, then calls
    // transaction.finish() to tell StoreKit the purchase is consumed.
    // (No separate server acknowledge needed — finish() IS the acknowledgement.)
    store.when().approved(async (transaction) => {
      if (transaction.platform !== Platform.APPLE_APPSTORE) return;

      const productId = transaction.products[0]?.id ?? "";
      if (!productId) return;

      // transaction.transactionId is the cross-platform field the Apple adapter
      // populates with the StoreKit transactionIdentifier. SKTransaction also
      // exposes originalTransactionId as a fallback for restored purchases.
      const appleTx      = transaction as unknown as CdvPurchase.AppleAppStore.SKTransaction;
      const transactionId = transaction.transactionId ?? appleTx.originalTransactionId ?? "";
      const sessionToken = getSessionToken() ?? "";

      // Consumable check: Apple Stripes packs + any club chip packs registered for Apple.
      // Apple subscription products are handled separately below.
      const isAppleStripesPack = (APPLE_STRIPES_PRODUCT_IDS as readonly string[]).includes(productId);
      const isGoogleStripesPack = (STRIPES_PRODUCT_IDS as readonly string[]).includes(productId);
      const isStripesPack  = isAppleStripesPack || isGoogleStripesPack;
      const isClubChipPack = (CLUB_CHIP_PRODUCT_IDS as readonly string[]).includes(productId);
      const isConsumable   = isStripesPack || isClubChipPack;

      try {
        if (isConsumable) {
          const pendingEntry = this.pending.get(productId);
          const body: Record<string, unknown> = { productId, transactionId };
          if (isClubChipPack && pendingEntry?.crewId) body.crewId = pendingEntry.crewId;
          const resp = await fetch(apiUrl("/api/billing/verify-apple-purchase"), {
            method:  "POST",
            headers: { "Content-Type": "application/json", "X-Session-Token": sessionToken },
            body:    JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            this.pending.get(productId)?.reject(
              new Error((err as any).error ?? `Apple verification failed: ${resp.status}`)
            );
            return;
          }
          const data = await resp.json() as {
            stripesGranted?: number; orderId?: string;
            chipsGranted?:   number; crewId?:  string;
          };
          // finish() tells StoreKit the consumable is processed — equivalent of Google's consume call.
          await transaction.finish();
          this.pending.get(productId)?.resolve({
            productId,
            purchaseToken:  transactionId,
            orderId:        data.orderId        ?? '',
            stripesGranted: data.stripesGranted ?? 0,
            chipsGranted:   data.chipsGranted,
            crewId:         data.crewId,
          });
        } else {
          // Apple subscription — verify with the server, then finish the transaction.
          const resp = await fetch(apiUrl("/api/billing/verify-apple-subscription"), {
            method:  "POST",
            headers: { "Content-Type": "application/json", "X-Session-Token": sessionToken },
            body:    JSON.stringify({ productId, transactionId }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            this.pending.get(productId)?.reject(
              new Error((err as any).error ?? `Apple subscription verification failed: ${resp.status}`)
            );
            return;
          }
          const data = await resp.json() as SubscriptionResult;
          // On Apple, finish() removes the transaction from the StoreKit queue.
          await transaction.finish();
          this.pending.get(productId)?.resolve({
            productId,
            purchaseToken:  transactionId,
            tier:           data.tier,
            expiresAt:      data.expiresAt,
            stripesGranted: data.stripesGranted,
            idempotent:     data.idempotent,
          });
        }
      } catch (err) {
        this.pending.get(productId)?.reject(err);
      } finally {
        this.pending.delete(productId);
      }
    });

    await store.initialize([Platform.GOOGLE_PLAY, Platform.APPLE_APPSTORE]);
    this.initialized = true;
  }

  getProducts(): ProductInfo[] {
    return CdvPurchase.store.products
      .filter(p => p.platform === CdvPurchase.Platform.GOOGLE_PLAY)
      .map(p => {
        const phase = p.getOffer()?.pricingPhases[0];
        return {
          id:          p.id,
          title:       p.title,
          description: p.description,
          price:       phase?.price ?? "–",
          priceMicros: phase?.priceMicros ?? 0,
        };
      });
  }

  async purchase(productId: string, meta?: { crewId?: string }): Promise<PurchaseResult> {
    if (!this.initialized) throw new Error("Billing not initialized");
    // Try Apple App Store first (iOS), then Google Play (Android). At runtime only
    // one platform's products will be loadable, so the other returns undefined.
    const product = CdvPurchase.store.get(productId, CdvPurchase.Platform.APPLE_APPSTORE)
                 ?? CdvPurchase.store.get(productId, CdvPurchase.Platform.GOOGLE_PLAY);
    if (!product) throw new Error(`Product not found: ${productId}`);
    const offer = product.getOffer();
    if (!offer) throw new Error(`No offer found for: ${productId}`);

    return new Promise<PurchaseResult>((resolve, reject) => {
      this.pending.set(productId, { resolve, reject, crewId: meta?.crewId });
      // Fix C: pass the player ID as applicationUsername so Google embeds it as
      // obfuscatedAccountId in the purchase — the server validates this server-side.
      offer.order({ applicationUsername: ensurePlayerIdentity().id }).then(error => {
        if (error) {
          this.pending.delete(productId);
          reject(new Error(error.message ?? "Order failed"));
        }
      }).catch(err => { this.pending.delete(productId); reject(err); });
    });
  }

  async launchSubscriptionPurchase(productId: string): Promise<SubscriptionResult> {
    if (!this.initialized) throw new Error("Billing not initialized");
    // Try Apple App Store first (iOS), then Google Play (Android).
    const product = CdvPurchase.store.get(productId, CdvPurchase.Platform.APPLE_APPSTORE)
                 ?? CdvPurchase.store.get(productId, CdvPurchase.Platform.GOOGLE_PLAY);
    if (!product) throw new Error(`Subscription product not found: ${productId}`);
    const offer = product.getOffer();
    if (!offer) throw new Error(`No offer found for: ${productId}`);

    return new Promise<SubscriptionResult>((resolve, reject) => {
      this.pending.set(productId, { resolve, reject });
      // Fix C: same applicationUsername binding for subscriptions.
      offer.order({ applicationUsername: ensurePlayerIdentity().id }).then(error => {
        if (error) {
          this.pending.delete(productId);
          reject(new Error(error.message ?? "Subscription order failed"));
        }
      }).catch(err => { this.pending.delete(productId); reject(err); });
    });
  }

  async getActiveSubscription(): Promise<ActiveSubscription> {
    const identity = ensurePlayerIdentity();
    try {
      const resp = await fetch(apiUrl(`/api/players/${identity.id}/subscription`), {
        headers: { "X-Session-Token": getSessionToken() ?? "" },
      });
      if (!resp.ok) return { active: false, tier: null, status: null, expiresAt: null, autoRenewing: null, productId: null, billingPeriod: null };
      return resp.json();
    } catch {
      return { active: false, tier: null, status: null, expiresAt: null, autoRenewing: null, productId: null, billingPeriod: null };
    }
  }

  openSubscriptionManagement(): void {
    const pkg = "com.dgmentertainment.poker";
    window.open(`https://play.google.com/store/account/subscriptions?package=${pkg}`, "_blank");
  }

  async restorePurchases(): Promise<void> {
    const error = await CdvPurchase.store.restorePurchases();
    if (error) console.warn("[billing] restorePurchases:", error.message);
  }
}

// ─── Web stub ─────────────────────────────────────────────────────────────────
// Used in browser/development. Subscriptions call the server directly with
// test_ tokens when BILLING_TEST_MODE=true is set on the server.
class WebBillingStub implements BillingPlugin {
  async initialize(): Promise<void> {
    console.log("[billing] Web stub initialized — no native billing available");
  }

  getProducts(): ProductInfo[] {
    return [];
  }

  async purchase(_productId: string, _meta?: { crewId?: string }): Promise<PurchaseResult> {
    throw new Error("In-app purchases require the native Android build. Open the app from the Play Store.");
  }

  async launchSubscriptionPurchase(productId: string): Promise<SubscriptionResult> {
    // In web/dev mode, use a test token so the server's TEST_MODE can handle it
    const testToken = `test_${productId}_${Date.now()}`;
    const resp = await fetch(apiUrl("/api/billing/verify-subscription"), {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "X-Session-Token": getSessionToken() ?? "",
      },
      body: JSON.stringify({ productId, purchaseToken: testToken }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error ?? `Subscription failed: ${resp.status}`);
    }
    return resp.json();
  }

  async getActiveSubscription(): Promise<ActiveSubscription> {
    const identity = ensurePlayerIdentity();
    try {
      const resp = await fetch(apiUrl(`/api/players/${identity.id}/subscription`), {
        headers: { "X-Session-Token": getSessionToken() ?? "" },
      });
      if (!resp.ok) return { active: false, tier: null, status: null, expiresAt: null, autoRenewing: null, productId: null, billingPeriod: null };
      return resp.json();
    } catch {
      return { active: false, tier: null, status: null, expiresAt: null, autoRenewing: null, productId: null, billingPeriod: null };
    }
  }

  openSubscriptionManagement(): void {
    const pkg = "com.dgmentertainment.poker";
    window.open(`https://play.google.com/store/account/subscriptions?package=${pkg}`, "_blank");
  }

  async restorePurchases(): Promise<void> {
    console.log("[billing] Restore not available in web mode");
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
// Check for the CdvPurchase global injected by cordova-plugin-purchase at runtime.
// We read it through window to avoid TypeScript treating the namespace check as
// always-true (the namespace is declared globally for types, but only exists at
// runtime in native Capacitor/Cordova builds).
function isNativePlatform(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as any).CdvPurchase !== "undefined"
  );
}

// Race B fix: BillingRouter — re-evaluates isNativePlatform() on every dispatch.
// NativeBillingPlugin is cached once created (to preserve internal state like the
// pending purchase map across the approved handler lifecycle). WebBillingStub is
// never permanently locked in: if CdvPurchase becomes available after a stub call
// (e.g. deviceready fires after Shop's first getActiveSubscription access), all
// subsequent calls automatically upgrade to NativeBillingPlugin.
class BillingRouter implements BillingPlugin {
  private _native: NativeBillingPlugin | null = null;
  private _web = new WebBillingStub();

  private delegate(): BillingPlugin {
    if (isNativePlatform()) {
      if (!this._native) this._native = new NativeBillingPlugin();
      return this._native;
    }
    return this._web;
  }

  async initialize(): Promise<void>                          { return this.delegate().initialize(); }
  getProducts(): ProductInfo[]                               { return this.delegate().getProducts(); }
  async purchase(productId: string, meta?: { crewId?: string }): Promise<PurchaseResult> { return this.delegate().purchase(productId, meta); }
  async launchSubscriptionPurchase(productId: string): Promise<SubscriptionResult> {
    return this.delegate().launchSubscriptionPurchase(productId);
  }
  async getActiveSubscription(): Promise<ActiveSubscription> { return this.delegate().getActiveSubscription(); }
  openSubscriptionManagement(): void                         { this.delegate().openSubscriptionManagement(); }
  async restorePurchases(): Promise<void>                    { return this.delegate().restorePurchases(); }
}

export const billing: BillingPlugin = new BillingRouter();
