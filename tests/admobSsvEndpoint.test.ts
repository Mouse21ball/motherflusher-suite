import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import * as admobSsv from "../server/admobSsv";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const keys = [{ keyId: 123, pem: publicKey.export({ type: "spki", format: "pem" }).toString() }];
const adUnitId = "ca-app-pub-1122384597919929/4402812186";
const sessionId = randomUUID();

function signedCallback(overrides: Record<string, string> = {}): string {
  const query = new URLSearchParams({
    ad_unit: adUnitId, custom_data: sessionId, reward_amount: "1",
    reward_item: "Reward", timestamp: String(Date.now()), transaction_id: randomUUID(),
    ...overrides,
  }).toString();
  return `${query}&key_id=123&signature=${encodeURIComponent(sign("sha256", Buffer.from(query), privateKey).toString("base64"))}`;
}

describe("AdMob SSV setup ping and strict reward endpoint", () => {
  const app = express();
  const server = createServer(app);
  let url: string;
  const keyFetch = vi.spyOn(admobSsv, "getAdMobVerifierKeys");
  const sessionLookup = vi.spyOn(storage, "getRewardedAdSessionForSsv");
  const completion = vi.spyOn(storage, "completeRewardedAdSession");
  const profileLookup = vi.spyOn(storage, "getPlayerProfile");
  const rejected = vi.spyOn(console, "warn").mockImplementation(() => {});
  const failed = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeAll(async () => {
    await registerRoutes(server, app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ads/admob/ssv`;
  });

  afterEach(() => vi.clearAllMocks());
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    vi.restoreAllMocks();
  });

  it.each(["", "?", "?&", "?console_check=1"])("acknowledges a field-free URL check %s without touching verification or wallets", async suffix => {
    // The setup check must succeed even if key retrieval/storage are unavailable.
    keyFetch.mockRejectedValue(new Error("keys unavailable"));
    sessionLookup.mockRejectedValue(new Error("storage unavailable"));
    completion.mockRejectedValue(new Error("must not credit"));
    profileLookup.mockRejectedValue(new Error("must not read balances"));
    const response = await fetch(`${url}${suffix}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(keyFetch).not.toHaveBeenCalled();
    expect(sessionLookup).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
    expect(profileLookup).not.toHaveBeenCalled();
  });

  it.each([
    "signature", "key_id", "ad_network", "ad_unit", "custom_data", "reward_amount",
    "reward_item", "timestamp", "transaction_id", "user_id", "signature%5B%5D",
    "key%5Fid",
  ])("acknowledges but does not credit an unsigned attempt with even an empty %s field", async field => {
    keyFetch.mockResolvedValue(keys);
    const response = await fetch(`${url}?${field}=`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(rejected).toHaveBeenCalledWith("[rewarded-ad] ssv_rejected missing_signature_fields");
    expect(keyFetch).toHaveBeenCalledOnce();
    expect(sessionLookup).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
  });

  it.each([
    ["tampered", "signature_mismatch"],
    ["unknown key", "unknown_verifier_key"],
    ["malformed signature", "signature_mismatch"],
    ["invalid timestamp", "invalid_timestamp"],
  ])("acknowledges %s without granting and logs %s", async (kind, reason) => {
    keyFetch.mockResolvedValue(keys);
    let query = signedCallback();
    if (kind === "tampered") query = query.replace("reward_amount=1", "reward_amount=2");
    if (kind === "unknown key") query = query.replace("key_id=123", "key_id=456");
    if (kind === "malformed signature") query = query.replace(/signature=.*/, "signature=garbage");
    if (kind === "invalid timestamp") query = signedCallback({ timestamp: String(Date.now() + 600_000) });
    const response = await fetch(`${url}?${query}`);
    expect(response.status).toBe(200);
    expect(rejected).toHaveBeenCalledWith(`[rewarded-ad] ssv_rejected ${reason}`);
    expect(sessionLookup).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
  });

  it("acknowledges a valid signature for an unknown session without granting", async () => {
    keyFetch.mockResolvedValue(keys);
    sessionLookup.mockResolvedValue(null);
    expect((await fetch(`${url}?${signedCallback()}`)).status).toBe(200);
    expect(rejected).toHaveBeenCalledWith("[rewarded-ad] ssv_rejected unknown_session");
    expect(sessionLookup).toHaveBeenCalledWith(sessionId);
    expect(completion).not.toHaveBeenCalled();
  });

  it("acknowledges expired or consumed sessions without credit", async () => {
    keyFetch.mockResolvedValue(keys);
    sessionLookup.mockResolvedValue({ id: sessionId, adUnitId, testMode: false });
    completion.mockResolvedValue({ completed: false, idempotent: false });
    expect((await fetch(`${url}?${signedCallback()}`)).status).toBe(200);
    expect(rejected).toHaveBeenCalledWith("[rewarded-ad] ssv_rejected expired_or_consumed_session");
    expect(completion).toHaveBeenCalledOnce();
  });

  it("preserves successful signed completion and idempotent acknowledgement", async () => {
    keyFetch.mockResolvedValue(keys);
    sessionLookup.mockResolvedValue({ id: sessionId, adUnitId, testMode: false });
    completion.mockResolvedValue({ completed: true, idempotent: true });
    expect((await fetch(`${url}?${signedCallback()}`)).status).toBe(200);
    expect(completion).toHaveBeenCalledOnce();
  });

  it("does not classify oversized queries as setup checks", () => {
    expect(admobSsv.isAdMobSsvSetupPing("x".repeat(8_193))).toBe(false);
  });

  it("acknowledges Google's placeholder verification payload without granting", async () => {
    keyFetch.mockResolvedValue(keys);
    const response = await fetch(`${url}?ad_unit=test&custom_data=test&reward_amount=1&reward_item=test&timestamp=0&transaction_id=test&signature=test&key_id=0`);
    expect(response.status).toBe(200);
    expect(rejected).toHaveBeenCalledWith("[rewarded-ad] ssv_rejected unknown_verifier_key");
    expect(sessionLookup).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
  });

  it("acknowledges a signed callback for the wrong ad unit without granting", async () => {
    keyFetch.mockResolvedValue(keys);
    sessionLookup.mockResolvedValue({ id: sessionId, adUnitId, testMode: false });
    expect((await fetch(`${url}?${signedCallback({ ad_unit: "9990005770" })}`)).status).toBe(200);
    expect(rejected).toHaveBeenCalledWith("[rewarded-ad] ssv_rejected ad_unit_mismatch");
    expect(completion).not.toHaveBeenCalled();
  });

  it("acknowledges key-service failures without session or wallet access", async () => {
    keyFetch.mockRejectedValue(new Error("keys unavailable"));
    expect((await fetch(`${url}?signature=test&key_id=0`)).status).toBe(200);
    expect(failed).toHaveBeenCalledWith("[rewarded-ad] ssv_failed verifier_keys_or_storage_unavailable");
    expect(sessionLookup).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
  });

  it("acknowledges session-storage failures without completing a reward", async () => {
    keyFetch.mockResolvedValue(keys);
    sessionLookup.mockRejectedValue(new Error("storage unavailable"));
    expect((await fetch(`${url}?${signedCallback()}`)).status).toBe(200);
    expect(failed).toHaveBeenCalledWith("[rewarded-ad] ssv_failed verifier_keys_or_storage_unavailable");
    expect(completion).not.toHaveBeenCalled();
  });

  it("acknowledges duplicate transaction conflicts without a second credit", async () => {
    keyFetch.mockResolvedValue(keys);
    sessionLookup.mockResolvedValue({ id: sessionId, adUnitId, testMode: false });
    completion.mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }));
    expect((await fetch(`${url}?${signedCallback()}`)).status).toBe(200);
    expect(rejected).toHaveBeenCalledWith("[rewarded-ad] ssv_rejected duplicate_transaction");
    expect(completion).toHaveBeenCalledOnce();
  });

  it("acknowledges rate-limited callbacks while blocking verification and grants", async () => {
    // Exceed the real endpoint's 120-per-minute limit. Every response is OK,
    // but excess requests must stop before key retrieval or session processing.
    for (let i = 0; i < 121; i++) {
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("OK");
    }
    rejected.mockClear();
    keyFetch.mockClear();
    sessionLookup.mockClear();
    completion.mockClear();
    expect((await fetch(`${url}?signature=test&key_id=0`)).status).toBe(200);
    expect(rejected).toHaveBeenCalledWith("[rewarded-ad] ssv_rejected rate_limited");
    expect(keyFetch).not.toHaveBeenCalled();
    expect(sessionLookup).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
  });
});