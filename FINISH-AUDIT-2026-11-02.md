# CHAIN GANG POKER — FINISH-THE-GAME AUDIT
**Date:** 2026-11-02 · **Worktree:** `~/workspace/cgp-audit` (repo `Mouse21ball/motherflusher-suite`) · **Method:** read-only inspection + actual test/tsc runs. No game code changed.

> **READ THIS FIRST.** This worktree is **not** the shipped game. It sits on a detached HEAD from Oct 22, diverged from `main`, and the two most important production commits — the 1.8 store ship (`859c5d45`) and the guest-auth security fix (`13be4cf1`) — **do not exist in this clone at all**. Every finding below describes THIS tree. Where this tree differs from what is live in the stores, the live build wins — and the gap itself is Finding #1.

---

## TOP 15 FINDINGS, ORDERED BY PLAYER IMPACT

1. **[CRITICAL — process] The audit tree is a stale side branch, not the shipped game.** Detached HEAD `8b4c1c3` (2026-10-22, "Stabilization package"). `git merge-base` vs local `main` (`55d841a`): **112 commits in HEAD not in main, 29 in main not in HEAD** — diverged, neither contains the other. `git log 859c5d45` and `git log 13be4cf1` both return *"unknown revision"* — the 1.8 ship merge and the auth fix were never fetched into this clone. Any "finish the game" build started from this tree starts from pre-1.8 code and will collide with shipped main.

2. **[CRITICAL — security, if this line ever ships] The guest-auth fix is absent here; the original vulnerability is present.** Worktree `client/src/lib/useServerProfile.ts` still calls `POST /api/auth/guest-init` with a bare `{ profileId, displayName }` body — no guest secret, no `X-Guest-Auth: 2` header, no 403/`guest_locked` handling (diff vs `~/workspace/cgp-fix/cgpfix/patched/` versions: 11–32 lines per file, all of them the fix). Server side: **no `server/guestTrust.ts`**, migrations stop at `0016_analytics_funnel.sql` (no `0017_guest_secret`). Production was fixed Oct 26 (commit `13be4cf1`, verified live then) — but publishing THIS tree would regress it.

3. **[HIGH — work at risk] A full defect-repair package sits uncommitted in the working tree.** 15 modified files + 11 untracked files, `git diff --stat`: **793 insertions / 449 deletions**. Contents: Box Chevy + Flushed Up celebration/flight systems (`client/src/components/boxChevy/celebrationPlan.ts`, `flightPlan.ts`, `dealerOrigin.ts`, `client/src/components/flushedUp/celebrationPlan.ts` — all untracked), `BoxChevyTable.tsx` rewritten (±592 lines), `tableConnectionHealth.ts`, `useServerMode.ts`, plus 7 new test files (`galaxyDefectRepairs.pins.test.ts`, `bcFlightPlan.test.ts`, …). It is committed nowhere. The suite passes with it (see §2) — losing this checkout loses the work.

4. **[HIGH — first impression] Home-screen mode icons are placeholder art, by the code's own admission.** `client/src/lib/modePlaceholders.ts`: *"Temporary art reused by the retained modes until bespoke assets are ready."* Flushed Up, Box Chevy, and Lady Luck all reuse the **same** generic `/mode-icon-suits.png`; retained-mode backgrounds all reuse `/modes/bg-suits.png`. Used on the Home mode cards (`client/src/pages/Home.tsx:130-132`), `PrivateTableSetup.tsx`, `BoxChevyGame.tsx`. Only Badugi has a bespoke icon (`client/public/mode-icon-badugi.png`).

5. **[HIGH — performance/install size] The web bundle ships 217 MB of public assets.** `client/public` = **217 MB** (118 files). Inside it: `client/public/audio` = **70 MB across 17 MP3s** (individual tracks 4.5–6.7 MB — the full debut album), plus multiple unoptimized PNGs over 2 MB (`wordmark-cgp.png` 2.5 MB, `welcome-back-chain-gang.png` 2.2 MB, `tier-silver.png` 2.1 MB). Under Capacitor these assets ride inside the app package (the verified 1.8 AAB was 239.6 MB). This is install-size and first-load weight on exactly the mid-range Android phones the audience uses.

6. **[MEDIUM-HIGH — unfinished surface] Cosmetics Store is visibly half-built.** `client/src/pages/CosmeticsStore.tsx:46`: *"Placeholder previews (shown until real assets are uploaded)"* — avatar items render emoji placeholders (`AVATAR_PLACEHOLDERS`, fallback `'?'`); line 570 shows players the literal text **"Tiers coming soon — everything selectable for now."**

7. **[MEDIUM — dead surface in production code] A prototype UNO game is a live route.** `client/src/App.tsx:15-18,164-165`: `/proto-uno` renders `pages/ProtoUno.tsx` and **bypasses the WelcomeGate** like the practice route. It is not DEV-gated (the 5-seat preview pages correctly are: `App.tsx:140-142`). Anyone with the URL reaches an unrelated prototype inside the shipped poker app.

8. **[MEDIUM — coverage honesty] The green suite skips every DB-backed integration area.** Actual run: **741 passed / 0 failed / 30 skipped**. The 30 skips are whole files: `friends.integration`, `referralRewards.integration` (3), `leaderboardEndpoint` (2), `reviewState.integration`, `tableLeaveDelta.integration`, `friends` (2) — i.e., friends, referrals, leaderboard endpoint, review state, and table-leave money deltas are **unverified by the suite as run** (they need a live DB). Green ≠ covered.

9. **[MEDIUM — settings/accessibility fragmented] No dedicated Settings screen exists.** No `/settings` route in `App.tsx`. Settings live as components (`client/src/components/settings/NotificationSettings.tsx`, in-game settings in `HostControls.tsx`, Profile sections). Reduced motion: honored in `ColdStartSplash` (`prefers-reduced-motion` in TSX + CSS) and Badugi table effects (`useReducedMotion`, `BadugiTableEffects.tsx:431`) — **partially verified**; no tree-wide audit of every animation against the setting was possible in this pass.

10. **[MEDIUM — unverified] Disconnect/abandon handling is thin in evidence.** `server/rooms.ts:9` documents host transfer on disconnect ("host status transfers to the longest-seated human"). Grep for `abandon|forfeit` across `server/rooms.ts` + `server/gameEngine.ts`: **zero hits**. What provably exists: 30 s server turn timers (`BADUGI_TURN_TIMEOUT_MS = 30_000`, `gameEngine.ts:106`) and the HEAD commit's "stranded-table start healing." A dedicated abandon/forfeit path was **not found** — marked unverified, not missing, pending a deeper engine read.

11. **[LOW-MEDIUM — log noise] `console.log` in shipped paths: 22 in `client/src`, 227 in `server`.** Server logging at that volume is partly by design (`responseLogger.ts`, `engineLog.ts` exist), but 22 client-side logs in production bundles is sloppy and can leak state to any webview console. Not individually triaged in this pass.

12. **[UNVERIFIED — store compliance] The two Play "recommended" SDK-35 items cannot be settled from this tree.** This tree already targets **SDK 36** (`android/variables.gradle`: compile/target 36 — ahead of the shipped vc32's SDK 35), and a repo-wide grep finds **no `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES` / `windowLayoutInDisplayCutoutMode` usage anywhere** — so the deprecated-cutout item appears already absent here, and CSS safe-area insets are handled in `GameScreen.tsx:52-56`. Whether the *shipped binary* matches is unverifiable from this worktree (see Finding #1).

13. **[POSITIVE — verified present] Detroit's Oct 15 loading/reconnect asks are built in this tree.** Cold-start loading screen: `ColdStartSplash` exists and is mounted (`App.tsx:236-240`). New-version prompt: `VersionCheckBanner` mounted (`App.tsx:230`) + `useVersionCheck.ts` (polls `/api/version`). Visible reconnect state: `TableEscapeGuard.tsx:41` renders **"Reconnecting…" / "Connecting…"** off `tableConnectionHealth.ts`. All three items from the Oct 15 list are present — in this tree.

14. **[POSITIVE — verified present] The four modes are real, server-engineered systems.** Dedicated server engines: `server/gameEngine.ts` (Badugi), `server/flushedUpEngine.ts`, `server/boxChevyEngine.ts`, `server/ladyluckEngine.ts`, plus `shared/modes/{badugi,boxchevy,flushedUp,ladyluck}.ts`. Real-time transport is `ws` with server-held connections/spectators/waitlist (`gameEngine.ts:416-440`). Bots exist inside the engines (practice + table fill), and a labeled practice route exists (`/practice/badugi`, Home button `button-practice-badugi`).

15. **[LOW — trap for the reader] This branch is internally healthy, which makes Finding #1 easy to miss.** `npx tsc`: **clean, exit 0**. Vitest: **741/0/30**. 80,347 lines of TS/TSX across client+server+shared, zero `TODO`/`FIXME`/`HACK` markers in source. A healthy-looking tree that is nonetheless 5+ days and two production events behind the real game. Any status report generated from this checkout without the branch check would be confidently wrong.

---

## 1. REPO STATE

| Item | Evidence |
|---|---|
| Branch | **Detached HEAD** (`git status`: "HEAD (no branch)") |
| HEAD | `8b4c1c3` — 2026-10-22 14:45 ET, "Stabilization package (Detroit 2026-10-22)…" |
| vs store ship `859c5d45` (1.8/vc32, iOS build 17) | **Object does not exist in this clone** (`fatal: unknown revision`). Cannot diff. |
| vs auth fix `13be4cf1` | **Object does not exist in this clone.** Fix absence proven independently by file diff (Finding #2). |
| Local/remote main | Both at `55d841a` (the pre-merge rollback ref). HEAD diverged: 112 commits ahead, 29 behind. |
| Uncommitted changes | 15 modified + 11 untracked files, 793 insertions / 449 deletions (Finding #3). |
| Environment note | `node_modules` in this worktree is a symlink to `~/workspace/cgp-repo/node_modules`. |

## 2. TEST SUITE (actual runs, 2026-11-02)

- `npx vitest run` (the `npm test` command): **Test Files 97 passed | 8 skipped (105) — Tests 741 passed | 30 skipped (771)**, duration 49.13 s, **0 failures**.
- `npx tsc` (`npm run check`): **exit 0, no errors**.
- Skipped files (from run output): `friends.integration.test.ts` (2), `leaderboardEndpoint.test.ts` (2), `referralRewards.integration.test.ts` (3), `reviewState.integration.test.ts` (1), `tableLeaveDelta.integration.test.ts` (1), + others totaling 30 — DB-dependent integration tests that do not run in this environment.
- Playwright suites (`test:browser`) exist in `package.json` but were **not run** in this audit — browser/device verification is **unverified** here.
- The staging harness (`scripts/staging-harness.ts`) exists and is modified in the working tree; it was not run (it targets the staging fork, out of scope for a read-only local audit).

## 3. SCREEN INVENTORY (from `client/src/App.tsx` routes + `client/src/pages/`)

| Route | Screen | Status | Evidence |
|---|---|---|---|
| `/`, `/missions` | Home | Finished, except mode icons (Finding #4) | `pages/Home.tsx`; `/missions` is an alias rendering Home |
| (gate) | WelcomeGate + AuthModal | Finished **but pre-fix client** (Finding #2) | `components/WelcomeGate.tsx`, `components/AuthModal.tsx` |
| `/profile` | Profile | Finished | `pages/Profile.tsx` |
| `/friends` | Friends | Finished UI; endpoint tests skipped (§2) | `pages/Friends.tsx` |
| `/leaderboard` | Leaderboard | Finished; real API data (`/api/leaderboard`, `Leaderboard.tsx:78`) | — |
| `/shop` | Shop | Finished | `pages/Shop.tsx`, `server/billing.ts` |
| `/cosmetics` | Cosmetics Store | **Partial** — placeholder previews, "Tiers coming soon" (Finding #6) | `CosmeticsStore.tsx:46,570` |
| `/crews` | Crews (clubs) | Finished | `pages/Crews.tsx`, `server/crews.ts` |
| `/bonus` | Bonus Center | Finished | `pages/BonusCenter.tsx` |
| `/badugi` | Badugi table | Finished | `pages/BadugiGame.tsx`, engine + effects |
| `/practice/badugi` | Practice Badugi | Finished (labeled, separate) | `pages/PracticeBadugiPage.tsx` |
| `/flushedup` | Flushed Up table | Finished; celebration work uncommitted (Finding #3) | `pages/FlushedUpGame.tsx` |
| `/box-chevy` | Box Chevy table | Finished; celebration/flight work uncommitted | `pages/BoxChevyGame.tsx` |
| `/ladyluck` | Lady Luck | Finished | `pages/LadyLuck.tsx`, `server/ladyluckEngine.ts` |
| `/ladyluck/history` | Lady Luck History | Finished | `pages/LadyLuckHistory.tsx` |
| `/ladyluck/spectate` | Lady Luck Spectate | Finished | `pages/LadyLuckSpectate.tsx` |
| `/join/:code` | Join Table | Finished | `pages/JoinTable.tsx` |
| `/proto-uno` | ProtoUno prototype | **Placeholder/prototype — live route, gate bypass** (Finding #7) | `App.tsx:15-18` |
| `/dev/5seat`, `/dev/bc5seat` | 5-seat previews | Dev-only, correctly gated | `App.tsx:140-142` (`import.meta.env.DEV`) |
| `/admin` | Admin | Finished (staff tool) | `pages/Admin.tsx` |
| `/terms`, `/privacy`, `/delete-account`, `/forgot-password`, `/reset-password` | Legal/account | Finished | pages present + routed |
| (404) | NotFound | Finished | `pages/not-found.tsx` |
| — | Settings | **No dedicated screen** (Finding #9) | No route; components only |

Dead-control sweep: no `TODO/FIXME/HACK` markers anywhere in `client/src`, `server`, `shared` (grep counts: TODO 0, FIXME 0, HACK 0, XXX 1). The unfinished surfaces above were found by reading, not markers.

## 4. SYSTEMS CHECKLIST

| System | Status | Evidence |
|---|---|---|
| Auth + guest access | **Working, but this tree carries the pre-fix (vulnerable) guest flow** | Routes `server/routes.ts:1342` register, `:1394` login, `:1458` /me, `:1521` guest-init; Finding #2 |
| Lobby / matchmaking | Working | `server/rooms.ts`, table listing + waitlist in `gameEngine.ts:440,1853` |
| Real-time sync | Working | `ws` transport; server-held connections/spectators (`gameEngine.ts:416-440`) |
| Server-authoritative state | Working | Dedicated server engines per mode; client consumes via `useServerMode.ts` |
| Turn timers | Working | `BADUGI_TURN_TIMEOUT_MS = 30_000` (`gameEngine.ts:106`), per-table timer+generation guard (`:457-458,1610`) |
| Scoring / win conditions — Badugi | Working (test-pinned) | `shared/modes/badugi.ts`, `server/gameEngine.ts`, suite green |
| — Flushed Up | Working (test-pinned) | `shared/modes/flushedUp.ts`, `server/flushedUpEngine.ts` |
| — Box Chevy | Working (test-pinned) | `shared/modes/boxchevy.ts`, `server/boxChevyEngine.ts`, `heroHandValidity.ts` |
| — Lady Luck | Working (test-pinned) | `shared/modes/ladyluck.ts`, `server/ladyluckEngine.ts` + persistence |
| Match completion / results | Working | Showdown summaries `shared/modes/showdownSummary.ts`; settle paths exercised by harness scenarios per commit history |
| Reconnection | Working (in this tree) | `tableConnectionHealth.ts`, `TableEscapeGuard.tsx` "Reconnecting…" state; stranded-table healing in HEAD commit |
| Disconnect / abandon | **Partial / unverified** | Host transfer documented (`rooms.ts:9`); no abandon/forfeit path found by grep (Finding #10) |
| Progression / persistence | Working | Drizzle/Postgres (`server/storage.ts`, `tablePersistence.ts`, migrations to 0016); guest accounts reset on republish is a Replit-hosting behavior, not a code path found here |
| Clubs / social | Working | Crews pages+server, Friends, chat (`components/game/ChatBox.tsx`, `server/chatFilter.ts`), reactions (`reactionAuthorization.ts`) |
| Shop / IAP | Working | `pages/Shop.tsx`, `server/billing.ts`, `cordova-plugin-purchase`, first-purchase + rewarded-ad systems (`firstPurchase.ts`, `rewardedAdConfig.ts`, `admobSsv.ts`) |
| Settings / accessibility | **Partial** | Finding #9 — no settings route; reduced-motion honored in splash + Badugi effects, not tree-verified |
| Error states | Working (spot-checked) | NotFound route, TableEscapeGuard connection states, Sentry deps (`@sentry/react`, `@sentry/node`) present |

## 5. KNOWN OPEN ITEMS — ACTUAL STATE IN THIS WORKTREE

**(a) 1.9 client patch (`~/workspace/cgp-fix/cgpfix/`) — NOT PRESENT.** All four patched client files differ from the worktree files, and every difference is the fix itself: patched `useServerProfile.ts` sends `guestSecret` + `X-Guest-Auth: 2`, handles 403 by writing `localStorage 'guest_locked'`, and saves server-issued secrets via `saveGuestSecret` (patched `persistence.ts`); the worktree versions have none of it. `grep guest_locked|RECOVERY_REQUIRED` across the worktree: **zero hits**. Server half also absent (no `guestTrust.ts`, no migration 0017). The Dec 1, 2026 sunset clock applies to production, which HAS the server fix; the client half is what 1.9 still owes — and it is not staged in this tree.

**(b) Android SDK 35 edge-to-edge items — CANNOT BE SETTLED HERE / LIKELY MOOT IN THIS TREE.** This tree targets SDK 36, not 35. `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`: **zero occurrences repo-wide** — nothing to remove. Insets: CSS safe-area handled in `GameScreen.tsx:52-56`. Native `WindowInsets` handling: not found. Verdict: the cutout item is absent-by-grep in this tree; the shipped vc32 binary's state is unverifiable from here.

**(c) Loading / reconnect UX — PRESENT (all three).** Cold-start splash: `ColdStartSplash.tsx` + mounted in `App.tsx`. Reconnecting state: `TableEscapeGuard.tsx:41`. New-version prompt: `VersionCheckBanner.tsx` + `useVersionCheck.ts`, mounted in `App.tsx:230`. (Caveat: presence in this diverged tree does not prove presence in the shipped 1.8 build — that check belongs against the ship commit this clone doesn't have.)

## 6. DEFECT SWEEP

- **TODO/FIXME/HACK:** 0 / 0 / 0 across `client/src`, `server`, `shared`. One `XXX` hit (client). Cleanest marker profile possible — unfinished work here is announced in prose comments, not markers.
- **Placeholder material that reaches players:** `modePlaceholders.ts` (Finding #4); `CosmeticsStore.tsx` emoji placeholder previews + literal "Tiers coming soon — everything selectable for now." (`:570`); `BoxChevyGame.tsx:309` comment references a "local fixture (demo names, placeholder cards, wrong min bet)" — flagged for a follow-up read to confirm the fixture itself is unreachable in production flow (**unverified** in this pass).
- **console.log:** client 22, server 227 (see Finding #11).
- **Invented/fake stats (Oct 29 data rule):** Leaderboard reads real data from `/api/leaderboard` (`Leaderboard.tsx:78`). Grep for hardcoded stat literals (`winRate: <n>`, `gamesPlayed: <n>`, `totalWinnings: <n>`) in `client/src`: **zero hits**. No fake-stats surface found in this sweep. (Not a proof of absence — a full render audit of Profile/Home stat tiles was out of scope.)
- **WebBillingStub** note (`App.tsx:173`): web/dev billing is a no-op stub by design; native billing runs through `cordova-plugin-purchase`. Not a defect; recorded so nobody "discovers" it later.

## 7. PERFORMANCE

- **Bundle weight is the story:** `client/public` = **217 MB**; audio alone **70 MB / 17 MP3s** (4.5–6.7 MB each); several PNGs >2 MB unoptimized (Finding #5). `attached_assets` adds another 181 MB in-repo (not shipped, but bloats the project). `client/src/assets` = 12 MB.
- **Architecture:** single Vite SPA + Capacitor shell (`vite.config.ts`, `capacitor.config.ts`); code-splitting posture not audited in this pass — **unverified**. Server is a single Express + `ws` process (`server/index.ts`, `dist/index.cjs` bundle via `script/build.ts`).
- **Animation stack:** `framer-motion` 12 + custom table effects; reduced-motion honored in spots (Finding #9). Frame-pacing on a Galaxy-class device: **unverified** — no device run was part of this audit.
- **Positive:** fonts are self-hosted subsets (`@fontsource/dm-sans`, `@fontsource/oswald`); no external font CDN dependency found.

---

### Audit limits (what this report does NOT claim)
No live-server, staging-fork, or device runs were performed. Playwright suites were not executed. Production state is described only where prior verified records exist (ship + auth fix, Oct 25–26) — this clone cannot speak for production, and Finding #1 is the reason "finish the game" work must start by reconciling this tree with shipped `main` (`859c5d45` + `13be4cf1`) before any new building.
