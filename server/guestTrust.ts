// ─── Guest trust model (fixes the guest-init takeover and register-claim holes) ─────────
// Pure decision logic, no database or Express, so it is unit-tested on its own (test/guestTrust.test.ts)
// and the route handlers in routes.ts stay thin.
//
// The rule: a player ID is a public name, never a credential. A guest proves ownership with
//   (1) a guest secret the server issued (stored only as SHA-256), or
//   (2) a live session for that profile, or
//   (3) a push-installation binding for that profile (device-local ID, never published).
// Legacy guests (created before this fix, no secret yet) get a secret the first time they prove (2) or (3).
// Only low-value legacy guests may claim with the bare ID, and only until LEGACY_ID_CLAIM_SUNSET.

import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
export const newSecret = (): string => randomBytes(32).toString("hex");   // 256-bit, returned to the client once

export function secretMatches(secret: unknown, storedHash: string | null | undefined): boolean {
  if (typeof secret !== "string" || !storedHash) return false;
  const a = Buffer.from(sha256(secret)), b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Detroit decides the date and the value rule (see CGP-FIX-README.md). Defaults are the conservative ones.
export const LEGACY_ID_CLAIM_SUNSET = new Date(process.env.CGP_LEGACY_CLAIM_SUNSET ?? "2026-12-01T00:00:00Z");

export interface GuestFacts {
  id: string;
  hasCredentials: boolean;        // email or passwordHash set
  guestSecretHash: string | null;
  stripes: number;
  hasPurchases: boolean;          // any purchase_transactions / subscription row
}

/** Protected guests can never be claimed with the bare ID: something of real money value sits on them. */
export function isProtected(g: GuestFacts): boolean {
  return g.stripes > 0 || g.hasPurchases;
}

export type GuestInitDecision =
  | { action: "create" }                                                  // brand-new profile id: create it, issue a secret
  | { action: "resume" }                                                  // secret matched
  | { action: "claim"; via: "session" | "installation" | "legacy-id" }    // legacy guest: issue its first secret
  | { action: "refuse"; status: 403; error: string; code: string };

export function decideGuestInit(input: {
  profile: GuestFacts | null;
  secret?: unknown;
  sessionPlayerId?: string | null;     // from a valid X-Session-Token, if the caller sent one
  installationOwnerId?: string | null; // owner of the caller's installationId binding, if any
  now?: Date;
}): GuestInitDecision {
  const { profile: p } = input, now = input.now ?? new Date();
  if (!p) return { action: "create" };
  if (p.hasCredentials) return { action: "refuse", status: 403, code: "HAS_CREDENTIALS", error: "Account has credentials — use /api/auth/login" };
  if (p.guestSecretHash) {
    return secretMatches(input.secret, p.guestSecretHash) || input.sessionPlayerId === p.id
      ? { action: "resume" }
      : { action: "refuse", status: 403, code: "GUEST_PROOF_REQUIRED", error: "This guest account is locked to its device." };
  }
  // legacy guest: no secret issued yet
  if (input.sessionPlayerId === p.id) return { action: "claim", via: "session" };
  if (input.installationOwnerId === p.id) return { action: "claim", via: "installation" };
  if (isProtected(p)) return { action: "refuse", status: 403, code: "RECOVERY_REQUIRED", error: "This account needs recovery. Contact support with your Google Play receipt." };
  if (now < LEGACY_ID_CLAIM_SUNSET) return { action: "claim", via: "legacy-id" };
  return { action: "refuse", status: 403, code: "GUEST_PROOF_REQUIRED", error: "This guest account is locked to its device." };
}

export type RegisterDecision =
  | { action: "upgrade-session-profile"; playerId: string }   // the caller's own guest becomes a full account
  | { action: "create-new-profile" }                          // no session: a fresh account; never someone else's guest
  | { action: "refuse"; status: 409 | 426; error: string; code?: string };

/** The body's identityId is ignored on purpose: register acts only on the session's own profile. */
export function decideRegister(input: { sessionPlayerId: string | null; sessionProfileHasCredentials: boolean; bodyHadIdentityId?: boolean }): RegisterDecision {
  if (!input.sessionPlayerId) {
    // An old app build sends identityId and no session. Don't hand it a separate account by surprise:
    // tell it to update. (New builds send the session; with no session and no identityId it's a genuinely new account.)
    if (input.bodyHadIdentityId) return { action: "refuse", status: 426, code: "UPDATE_REQUIRED", error: "Update the app to save your account." };
    return { action: "create-new-profile" };
  }
  if (input.sessionProfileHasCredentials) return { action: "refuse", status: 409, error: "This account is already registered — log out first." };
  return { action: "upgrade-session-profile", playerId: input.sessionPlayerId };
}
