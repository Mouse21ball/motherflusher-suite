import { verify as verifySignature } from "node:crypto";

const ADMOB_VERIFIER_KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
const VERIFIER_KEY_CACHE_MS = 6 * 60 * 60 * 1000;

export interface AdMobVerifierKey {
  keyId: number;
  pem: string;
}

export interface VerifiedAdMobReward {
  watchSessionId: string;
  adUnitId: string;
  rewardAmount: number;
  rewardItem: string;
  transactionId: string;
  timestamp: number;
}

let verifierKeys: AdMobVerifierKey[] = [];
let verifierKeysLoadedAt = 0;

const ADMOB_CALLBACK_FIELDS = new Set([
  "ad_network", "ad_unit", "custom_data", "key_id", "reward_amount",
  "reward_item", "signature", "timestamp", "transaction_id", "user_id",
]);

/** A console URL-check carries no signature or reward claim, even empty fields. */
export function isAdMobSsvSetupPing(rawQuery: string): boolean {
  if (rawQuery.length > 8_192) return false;
  for (const name of new URLSearchParams(rawQuery).keys()) {
    // Encoded names and malformed array/object forms must not bypass verification.
    if (ADMOB_CALLBACK_FIELDS.has(name.split("[", 1)[0])) return false;
  }
  return true;
}

/** Google's SSV examples send the numeric slot, not always the SDK's full ID. */
export function adMobAdUnitMatches(expected: string, received: string): boolean {
  if (expected === received) return true;
  const slot = /^ca-app-pub-\d+\/(\d+)$/.exec(expected)?.[1];
  return !!slot && /^\d+$/.test(received) && slot === received;
}

export function verifyAdMobSsvQuery(
  rawQuery: string,
  keys: AdMobVerifierKey[],
  expectedAdUnitId?: string,
  nowMs = Date.now(),
  onRejected?: (reason: string) => void,
): VerifiedAdMobReward | null {
  const reject = (reason: string): null => { onRejected?.(reason); return null; };
  if (!rawQuery || rawQuery.length > 8_192) return reject("missing_or_oversized_query");
  const signatureMarkers = ["&signature=", "&key_id="]
    .map(marker => ({ marker, index: rawQuery.indexOf(marker) }))
    .filter(entry => entry.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (!signatureMarkers.length || signatureMarkers[0].index < 1) return reject("missing_signature_fields");

  // AdMob signs the exact URL-encoded query prefix before its trailing
  // signature/key_id fields. Preserve the raw bytes here; reserializing decoded
  // URLSearchParams changes escaping/order and would not verify Google's signature.
  const signedQuery = rawQuery.slice(0, signatureMarkers[0].index);
  const callbackSuffix = new URLSearchParams(rawQuery.slice(signatureMarkers[0].index + 1));
  if (
    callbackSuffix.size !== 2
    || callbackSuffix.getAll("signature").length !== 1
    || callbackSuffix.getAll("key_id").length !== 1
  ) {
    return reject("malformed_signature_suffix");
  }
  const signedParams = new URLSearchParams(signedQuery);
  const signatureText = callbackSuffix.get("signature");
  const keyId = Number(callbackSuffix.get("key_id"));
  const publicKey = keys.find(key => key.keyId === keyId)?.pem;
  if (!signatureText || !Number.isSafeInteger(keyId)) return reject("malformed_signature_fields");
  if (!publicKey) return reject("unknown_verifier_key");

  let signature: Buffer;
  try {
    signature = Buffer.from(signatureText.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return reject("malformed_signature");
  }
  let signatureValid = false;
  try {
    signatureValid = verifySignature("sha256", Buffer.from(signedQuery, "utf8"), publicKey, signature);
  } catch {
    return reject("signature_verification_error");
  }
  if (!signatureValid) return reject("signature_mismatch");

  const watchSessionId = signedParams.get("custom_data") ?? "";
  const adUnitId = signedParams.get("ad_unit") ?? "";
  const rewardAmount = Number(signedParams.get("reward_amount"));
  const rewardItem = signedParams.get("reward_item") ?? "";
  const transactionId = signedParams.get("transaction_id") ?? "";
  const timestamp = Number(signedParams.get("timestamp"));
  if (!/^[0-9a-f-]{36}$/i.test(watchSessionId)) return reject("invalid_custom_data");
  if (expectedAdUnitId != null && !adMobAdUnitMatches(expectedAdUnitId, adUnitId)) return reject("ad_unit_mismatch");
  if (
    // Eligibility is Google's assertion. The grant remains exactly 500 in
    // storage; never copy the provider's configurable reward amount.
    !Number.isSafeInteger(rewardAmount) || rewardAmount <= 0
    || !rewardItem || rewardItem.length > 128
    || !transactionId
    || transactionId.length > 256
  ) {
    return reject("invalid_reward_payload");
  }
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > nowMs + 5 * 60 * 1000) {
    return reject("invalid_timestamp");
  }

  return { watchSessionId, adUnitId, rewardAmount, rewardItem, transactionId, timestamp };
}

export async function getAdMobVerifierKeys(): Promise<AdMobVerifierKey[]> {
  if (verifierKeys.length && Date.now() - verifierKeysLoadedAt < VERIFIER_KEY_CACHE_MS) {
    return verifierKeys;
  }
  const response = await fetch(ADMOB_VERIFIER_KEYS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`AdMob verifier-key request failed (${response.status})`);
  const payload: unknown = await response.json();
  if (
    !payload || typeof payload !== "object" || !("keys" in payload)
    || !Array.isArray((payload as { keys?: unknown }).keys)
  ) {
    throw new Error("AdMob returned an invalid verifier-key document");
  }
  const loaded = (payload as { keys: unknown[] }).keys.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const entry = value as { keyId?: unknown; pem?: unknown };
    const keyId = typeof entry.keyId === "number"
      ? entry.keyId
      : typeof entry.keyId === "string" && /^\d+$/.test(entry.keyId)
        ? Number(entry.keyId)
        : NaN;
    if (!Number.isSafeInteger(keyId) || typeof entry.pem !== "string" || !entry.pem.includes("BEGIN PUBLIC KEY")) {
      return [];
    }
    return [{ keyId, pem: entry.pem }];
  });
  if (!loaded.length) throw new Error("AdMob verifier-key document contains no usable public keys");
  verifierKeys = loaded;
  verifierKeysLoadedAt = Date.now();
  return verifierKeys;
}