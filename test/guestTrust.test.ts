// node --experimental-strip-types test/guestTrust.test.ts
import { decideGuestInit, decideRegister, newSecret, sha256, secretMatches, isProtected, type GuestFacts } from "../server/guestTrust.ts";
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { c ? pass++ : (fail++, console.log("FAIL", m)); };
const g = (o: Partial<GuestFacts> = {}): GuestFacts => ({ id: "victim", hasCredentials: false, guestSecretHash: null, stripes: 0, hasPurchases: false, ...o });
const before = new Date("2026-11-01T00:00:00Z"), after = new Date("2027-01-01T00:00:00Z");

// hole 1 — guest-init by ID
ok(decideGuestInit({ profile: null }).action === "create", "unknown id creates a new profile");
const s = newSecret(), secured = g({ guestSecretHash: sha256(s) });
ok(decideGuestInit({ profile: secured, secret: s }).action === "resume", "owner with secret resumes");
ok(decideGuestInit({ profile: secured }).action === "refuse", "attacker with the ID alone is refused once a secret exists");
ok(decideGuestInit({ profile: secured, secret: newSecret() }).action === "refuse", "wrong secret refused");
ok(decideGuestInit({ profile: secured, sessionPlayerId: "victim" }).action === "resume", "owner with live session resumes even without the secret");
ok(decideGuestInit({ profile: secured, sessionPlayerId: "attacker" }).action === "refuse", "someone else's session doesn't help");
ok(decideGuestInit({ profile: g({ hasCredentials: true }), secret: s }).action === "refuse", "credentialed accounts must log in");
// legacy migration
const legacyRich = g({ stripes: 250 }), legacyPaid = g({ hasPurchases: true }), legacyPlain = g();
ok((decideGuestInit({ profile: legacyRich, sessionPlayerId: "victim" }) as any).via === "session", "legacy owner with session claims (even with Stripes)");
ok((decideGuestInit({ profile: legacyPaid, installationOwnerId: "victim" }) as any).via === "installation", "legacy owner with installation binding claims");
ok((decideGuestInit({ profile: legacyRich, now: before }) as any).code === "RECOVERY_REQUIRED", "attacker can't claim a guest holding Stripes with the bare ID");
ok((decideGuestInit({ profile: legacyPaid, now: before }) as any).code === "RECOVERY_REQUIRED", "attacker can't claim a guest with purchases with the bare ID");
ok((decideGuestInit({ profile: legacyPlain, now: before }) as any).via === "legacy-id", "low-value legacy guest can still be claimed by ID before the sunset");
ok(decideGuestInit({ profile: legacyPlain, now: after }).action === "refuse", "after the sunset the bare-ID path is closed");
ok(decideGuestInit({ profile: legacyRich, installationOwnerId: "someone-else", now: before }).action === "refuse", "someone else's binding doesn't help");
ok(isProtected(legacyRich) && isProtected(legacyPaid) && !isProtected(legacyPlain), "value gate");
// hole 2 — register
ok(decideRegister({ sessionPlayerId: null, sessionProfileHasCredentials: false }).action === "create-new-profile", "no session: fresh account, never someone else's guest");
ok((decideRegister({ sessionPlayerId: null, sessionProfileHasCredentials: false, bodyHadIdentityId: true }) as any).code === "UPDATE_REQUIRED", "old build (identityId, no session) is told to update, not given a surprise account");
ok(decideRegister({ sessionPlayerId: "me", sessionProfileHasCredentials: false, bodyHadIdentityId: true }).action === "upgrade-session-profile", "a body identityId never overrides the session");
const up = decideRegister({ sessionPlayerId: "me", sessionProfileHasCredentials: false });
ok(up.action === "upgrade-session-profile" && (up as any).playerId === "me", "session upgrades only its own profile");
ok(decideRegister({ sessionPlayerId: "me", sessionProfileHasCredentials: true }).action === "refuse", "already-registered session refused");
// secrets
ok(s.length === 64 && secretMatches(s, sha256(s)) && !secretMatches(s.slice(1), sha256(s)) && !secretMatches(undefined, sha256(s)), "secret helpers");
console.log(`guestTrust: ${fail ? "FAIL" : "PASS"} ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
