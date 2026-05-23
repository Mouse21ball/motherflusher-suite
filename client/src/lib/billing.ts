// ─── Client-side billing ──────────────────────────────────────────────────────
// Wraps cordova-plugin-purchase (CdvPurchase) for Google Play Billing.
// Falls back to a no-op stub in web/development environments.
//
// NATIVE SETUP REQUIRED (once Android project is configured):
//   npm install cordova-plugin-purchase
//   npx cap sync android
//   In android/app/build.gradle: add Google Play Billing library dependency
//   In Play Console: register the 5 consumable product IDs below
//   Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON + GOOGLE_PLAY_PACKAGE_NAME on server
//
// The purchase flow:
//   1. billing.initialize() — connect to Play Billing, load product prices
//   2. billing.purchase(productId) — launch native payment sheet
//   3. On success → server verifies token → grants Stripes → billing.finish()

import { apiUrl } from "./apiConfig";
import { getSessionToken } from "./session";

// ─── Product catalog (must match Play Console exactly) ────────────────────────
export const STRIPES_PRODUCT_IDS = [
  "stripes_starter_99",
  "stripes_small_499",
  "stripes_medium_999",
  "stripes_large_2199",
  "stripes_mega_9999",
] as const;

export type StripesProductId = typeof STRIPES_PRODUCT_IDS[number];

export interface ProductInfo {
  id:           string;
  title:        string;
  description:  string;
  price:        string;  // formatted local currency, e.g. "$0.99"
  priceMicros:  number;
}

export interface PurchaseResult {
  productId:     string;
  purchaseToken: string;
  orderId:       string;
  stripesGranted: number;
}

// ─── BillingPlugin interface ──────────────────────────────────────────────────
export interface BillingPlugin {
  initialize(): Promise<void>;
  getProducts(): ProductInfo[];
  purchase(productId: string): Promise<PurchaseResult>;
  restorePurchases(): Promise<void>;
}

// ─── CdvPurchase type stubs (plugin injects at runtime) ──────────────────────
declare global {
  interface Window {
    CdvPurchase?: {
      store: {
        register(products: Array<{ id: string; type: string; platform: string }>): void;
        initialize(platforms?: string[]): Promise<void>;
        get(id: string): unknown;
        order(product: unknown): Promise<{ isError: boolean; code?: number; message?: string }>;
        when(): {
          approved(cb: (t: CdvTransaction) => void): void;
          finished(cb: (t: CdvTransaction) => void): void;
        };
      };
      ProductType: { CONSUMABLE: string };
      Platform:    { GOOGLE_PLAY: string };
    };
  }
  interface CdvTransaction {
    products: Array<{ id: string }>;
    purchaseToken?: string;
    transactionId?: string;
    state: string;
    finish(): void;
  }
}

// ─── Native implementation ────────────────────────────────────────────────────
class NativeBillingPlugin implements BillingPlugin {
  private products: ProductInfo[] = [];
  private initialized = false;

  async initialize(): Promise<void> {
    const cdv = window.CdvPurchase;
    if (!cdv) throw new Error("cordova-plugin-purchase not available");

    const { store, ProductType, Platform } = cdv;

    // Register all consumable Stripes products
    store.register(
      STRIPES_PRODUCT_IDS.map(id => ({
        id,
        type:     ProductType.CONSUMABLE,
        platform: Platform.GOOGLE_PLAY,
      }))
    );

    await store.initialize([Platform.GOOGLE_PLAY]);
    this.initialized = true;

    // Collect product info for UI price display
    this.products = STRIPES_PRODUCT_IDS.map(id => {
      const p = store.get(id) as any;
      return {
        id,
        title:       p?.title       ?? id,
        description: p?.description ?? "",
        price:       p?.pricing?.price ?? "–",
        priceMicros: p?.pricing?.priceMicros ?? 0,
      };
    });
  }

  getProducts(): ProductInfo[] {
    return this.products;
  }

  async purchase(productId: string): Promise<PurchaseResult> {
    const cdv = window.CdvPurchase;
    if (!cdv || !this.initialized) throw new Error("Billing not initialized");

    const product = cdv.store.get(productId);
    if (!product) throw new Error(`Product not found: ${productId}`);

    const result = await cdv.store.order(product);
    if (result.isError) {
      throw new Error(`Purchase failed: ${result.message ?? result.code}`);
    }

    // Wait for the approved callback (Google confirms payment)
    return new Promise<PurchaseResult>((resolve, reject) => {
      cdv.store.when().approved(async (transaction: CdvTransaction) => {
        const tProductId = transaction.products[0]?.id;
        if (tProductId !== productId) return;

        const purchaseToken = transaction.purchaseToken ?? transaction.transactionId ?? "";

        try {
          // Server-side verification — MUST succeed before granting Stripes
          const resp = await fetch(apiUrl("/api/billing/verify-purchase"), {
            method: "POST",
            headers: {
              "Content-Type":   "application/json",
              "X-Session-Token": getSessionToken() ?? "",
            },
            body: JSON.stringify({ productId, purchaseToken }),
          });

          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            transaction.finish(); // must finish even on failure to avoid stuck state
            reject(new Error(err.error ?? `Verification failed: ${resp.status}`));
            return;
          }

          const data = await resp.json() as { stripesGranted: number; orderId: string };

          // Tell Google the purchase was processed (consumable → re-purchasable)
          transaction.finish();

          resolve({
            productId,
            purchaseToken,
            orderId:       data.orderId,
            stripesGranted: data.stripesGranted,
          });
        } catch (err: any) {
          transaction.finish();
          reject(err);
        }
      });
    });
  }

  async restorePurchases(): Promise<void> {
    // Consumables are not restorable — no-op
    console.log("[billing] Consumables cannot be restored");
  }
}

// ─── Web stub ─────────────────────────────────────────────────────────────────
class WebBillingStub implements BillingPlugin {
  async initialize(): Promise<void> {
    console.log("[billing] Web stub initialized — no native billing available");
  }

  getProducts(): ProductInfo[] {
    return [];
  }

  async purchase(_productId: string): Promise<PurchaseResult> {
    throw new Error("In-app purchases require the native Android build. Open the app from the Play Store.");
  }

  async restorePurchases(): Promise<void> {
    console.log("[billing] Restore not available in web mode");
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
function isNativePlatform(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.CdvPurchase !== "undefined"
  );
}

export const billing: BillingPlugin = isNativePlatform()
  ? new NativeBillingPlugin()
  : new WebBillingStub();
