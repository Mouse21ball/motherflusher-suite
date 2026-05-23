// ─── Server-side Google Play Billing ─────────────────────────────────────────
// Handles server-side receipt verification via the Play Developer API.
// NEVER trust the client alone — all Stripes grants go through this module.
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

// ─── Pack catalog ─────────────────────────────────────────────────────────────
// Product IDs must match what is registered in Play Console exactly.
export const STRIPES_PACKS: Record<string, { stripes: number; priceCents: number }> = {
  stripes_starter_99:  { stripes: 60,   priceCents: 99   },
  stripes_small_499:   { stripes: 300,  priceCents: 499  },
  stripes_medium_999:  { stripes: 650,  priceCents: 999  },
  stripes_large_2199:  { stripes: 1500, priceCents: 2199 },
  stripes_mega_9999:   { stripes: 8000, priceCents: 9999 },
};

const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME ?? "com.dgmentertainment.chaingangpoker";
const TEST_MODE    = process.env.BILLING_TEST_MODE === "true";

export interface GooglePurchaseData {
  purchaseState:    number;   // 0 = purchased, 1 = canceled, 2 = pending
  orderId:          string;
  consumptionState: number;   // 0 = not consumed, 1 = already consumed
  regionCode?:      string;
}

// ─── Verify ───────────────────────────────────────────────────────────────────
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

  // ── Sandbox mode ──────────────────────────────────────────────────────────
  if (TEST_MODE) {
    if (!purchaseToken.startsWith("test_")) {
      throw new Error("BILLING_TEST_MODE: token must start with 'test_'");
    }
    console.log(`[billing] TEST_MODE: accepted ${productId}`);
    return {
      purchaseState:    0,
      orderId:          `test_order_${Date.now()}`,
      consumptionState: 0,
    };
  }

  // ── Production: call Play Developer API ───────────────────────────────────
  const credJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!credJson) {
    throw new Error(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON env var not set — " +
      "add the service account key JSON in Replit Secrets"
    );
  }

  const { google } = await import("googleapis");
  const credentials = JSON.parse(credJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  const androidPublisher = google.androidpublisher({ version: "v3", auth });

  const response = await androidPublisher.purchases.products.get({
    packageName: PACKAGE_NAME,
    productId,
    token: purchaseToken,
  });

  const d = response.data;

  console.log(
    `[billing] Google API response: ` +
    `state=${d.purchaseState} orderId=${d.orderId} ` +
    `consumption=${d.consumptionState}`
  );

  return {
    purchaseState:    d.purchaseState    ?? -1,
    orderId:          d.orderId          ?? "",
    consumptionState: d.consumptionState ?? 0,
    regionCode:       d.regionCode       ?? undefined,
  };
}

// ─── Acknowledge (consume) ────────────────────────────────────────────────────
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

  const { google } = await import("googleapis");
  const credentials = JSON.parse(credJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  const androidPublisher = google.androidpublisher({ version: "v3", auth });

  await androidPublisher.purchases.products.consume({
    packageName: PACKAGE_NAME,
    productId,
    token:       purchaseToken,
  });

  console.log(`[billing] acknowledged (consumed): ${productId}`);
}
