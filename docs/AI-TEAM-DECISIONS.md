# AI Team Decisions Log

## 2026-10-19: Showdown Card-Masking Security Fix — Staging Verification Complete

**Decision:** Security hotfix verified ready for production deployment (pending Detroit approval).

**Context:** Card data leak at showdown — folded/sitting-out players' hole cards sent to all clients over WebSocket. Fixed with allowlist approach (reveal only 'active' status).

**Evidence:**
- 36/36 masking assertions pass (both engines)
- Live staging WebSocket test: zero card rank leakage, auth enforced correctly
- Chip accounting verified (3000→3000 conserved)
- Badugi rollover behavior unchanged
- TypeScript clean, 0 errors
- Server-side only fix — no client changes, no store submissions needed

**Staging:** Isolated Replit fork created, tested, deleted. $0 marginal cost. Secrets carried over on fork (correction to earlier claim) — fork deleted to clean up.

**Alternatives considered:** Direct-to-production deploy (rejected — ChatGPT correctly argued staging was cheap and worth doing).

**Owner:** Milo (implementation + verification). ChatGPT (independent review).

**Outstanding:** Detroit approval to merge hotfix/showdown-masking → main and republish web.

## 2026-10-19: SEC-001 Production Deployment Complete

**Decision:** Security hotfix deployed to production. Vulnerability closed.

**Deployment:**
- PR #1 merged to main via merge commit 55d841ad
- Rollback reference: 5ce6013b (pre-merge main)
- Replit republished, live at commit d6e2883 (build 2026-10-19T13:52:57Z)
- Production URL: https://chainggangpoker.com

**Verification:**
- /api/version confirms hotfix commit live
- Site loads clean, no errors, WebSocket connected
- Client-side masking correct (face-down through all rounds, reveal only at showdown for active)
- 36/36 unit tests pass on deployed code
- Staging proved zero wire leakage

**Scope preserved:** No gameplay changes, no UI changes, no store submissions, no unrelated code. Only 3 security files changed.

**Staging fork:** Deleted. $0 cost.

**Owner:** Milo (authorized by Detroit).

## 2026-10-20: Turn timer is server-deadline driven; Badugi client synchronized

**Decision:** The 30-second turn timer's authority is the server deadline (`turnDeadline`, epoch ms, broadcast on state). Client countdowns must render from that deadline, never from a local fixed-duration animation.

**Findings (code + live staging measurement):**
- Both engines arm `turnDeadline = Date.now() + 30_000` for human players in interactive phases and broadcast immediately; bots get `null`. Time-bank extends the same deadline (+20s, max 1/turn). The 180s reconnect timeout is a separate mechanism.
- The Badugi client never read `turnDeadline`: its pod bar was a fixed 30s tween and the hero had no countdown at all.
- Live proof on staging: auto-advance at deadline +42ms (B1); time-bank moved the deadline exactly +20,000ms (B2); a reconnect at deadline-2.5s rejoined with the identical deadline and auto-acted at +51ms (C5).

**Fix (dev/badugi-5seat @7fa71622, client-only):** ProtoState carries `turnDeadline`; pod and hero bars render only when a deadline is armed, start at the true remaining fraction, deplete over true remaining ms, re-key on extension/new turn. Floating dealer "D" removed (pod avatar badge is the dealer indicator).

**Owner:** Milo (implementation + verification). Approved by Detroit.

## 2026-10-20: V-1 — Badugi seat cap respects configured maxPlayers

**Decision:** The legacy Badugi engine's seat enforcement respects each table's configured `maxPlayers` (rooms/table records, default 5) on every path — creation access, hand end, and restore. The 2026-10-15 hard 4-player clamp is superseded by the 2026-10-19 decision restoring 5-seat Badugi.

**Evidence:** Staging validation (real guest clients, production protocol) showed a 5th human spectated on fresh tables with and without a `maxPlayers=5` table record; the runtime clamp at `getOrCreateBadugiTable` trimmed every existing table to 4 on access. Restoration safeguards are preserved: rows are only added/removed between hands, connected humans are kept first, and restored tables are capped at seat capacity (5).

**Owner:** Milo. Approved by Detroit (dev branch only; no production deployment authorized).

## 2026-10-20: V-2 — ANTE turn timer armed on the legacy Badugi engine

**Decision:** `ANTE` is an interactive phase for turn-timer purposes on the legacy engine, matching the generic engine (2026-10-16).

**Evidence:** Staging probe B0 — a connected-but-idle first-to-act player: `turnDeadline` stayed null and the hand froze in ANTE for 80s+. Root cause: `BADUGI_INTERACTIVE_PHASES` omitted `ANTE`, so the existing auto-ante timeout branch could never fire.

**Owner:** Milo. Approved by Detroit (dev branch only).
