# Chain Gang Poker — Project Audit Report

**Date:** July 2, 2026
**Type:** Read-only architecture audit (no code changes made)

---

## 1. Executive Summary

Chain Gang Poker is a full-stack, server-authoritative multiplayer poker platform offering multiple virtual-chip game modes (Badugi, Dead 7, 15/35, Suits & Poker, Bonecrusher, Box Chevy, Kamikaze, Flushed Up, and a horse-racing side game called Lady Luck). The stack is a React/Vite frontend paired with an Express + WebSocket backend, backed by PostgreSQL via Drizzle ORM, and packaged for iOS/Android via Capacitor.

The product has a mature retention and monetization layer (daily rewards, subscriptions, cosmetics, a premium "Stripes" currency, crews/clubs with shared banks) and a full internal admin console for moderation and support. Real-money purchases are handled entirely through **Google Play Billing** — the Stripe integration listed in the environment is provisioned but not wired into any purchase flow. Server-side game logic is authoritative for all modes to prevent cheating, with the client acting as a thin renderer/input layer. Test coverage is strong on the server game-engine layer but absent on the React frontend.

Overall the codebase is well-organized by feature domain, uses consistent auth/session patterns, and shows evidence of iterative hardening (rate limiting, audit logs, ban/report systems, refund clawback). The main gaps are: no frontend test suite, a dormant/unused Stripe integration, and a couple of low-priority TODOs around AdMob and a snapshot feature.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS 4, shadcn/ui (Radix primitives), wouter (routing), TanStack Query |
| Backend | Node.js 20, Express 5, `ws` (WebSocket) |
| Database | PostgreSQL 16 |
| ORM | Drizzle ORM + drizzle-zod (schema validation) |
| Mobile | Capacitor 8 (Android + iOS), `cordova-plugin-purchase` for Google Play Billing |
| Auth | Custom session-token system (scrypt password hashing), no third-party auth provider |
| Email | Resend (password reset emails) |
| Billing | Google Play Billing (`@googleapis/androidpublisher`), Stripe integration installed but unused |
| Build/CI | Vite (web), Codemagic (Android AAB / iOS IPA builds) |
| Deployment | Replit VM deployment (`npm run build` → `node dist/index.cjs`) |
| Testing | Vitest-style tests under `server/__tests__/` (server/engine only) |

---

## 3. Folder Structure

```
client/               React frontend (Vite root)
  src/pages/           Route-level pages (one per game mode + core app pages)
  src/components/      UI components — atomic (ui/), domain-grouped (game/, admin/, home/, flushedUp/, badugi/, etc.)
  src/lib/             Hooks, API/session helpers, persistence, billing, progression, sounds
  public/              Static assets (see §Public Asset Folders below)
server/                Express + WebSocket backend
  routes.ts            All REST API route registrations
  rooms.ts             WebSocket connection/room management
  gameEngine.ts         Server-authoritative Badugi engine
  genericEngine.ts      Shared engine for Dead7 / 15-35 / Suits / etc.
  ladyluckEngine.ts      Lady Luck (horse racing) engine
  storage.ts            Data access layer (Drizzle queries), IStorage interface
  db.ts                 DB connection
  billing.ts            Stripes/chips/subscription/Google Play verification logic
  crews.ts              Crews (clubs) logic
  tablePersistence.ts / ladyluckPersistence.ts   Debounced state → DB writers
  middleware/           auth.ts, pubsubAuth.ts, rateLimits.ts
  __tests__/            Server/engine test suite
shared/                 Code shared between client and server
  schema.ts              Drizzle schema (source of truth for DB tables/types)
  gameTypes.ts           Core TypeScript types (GameState, Player, GameMode, etc.)
  modes/                 Per-game-mode rule engines (badugi.ts, dead7.ts, fifteen35.ts, etc.)
android/ , ios/         Capacitor native projects
codemagic.yaml          CI build config for Android/iOS releases
drizzle.config.ts       Drizzle Kit config (schema path, migrations output, dialect)
.replit                 Replit run/deploy/workflow configuration
```

---

## 4. Frontend Architecture

- **Routing:** `wouter`, flat `<Switch>` route table in `client/src/App.tsx`, wrapped in `ErrorBoundary` → `WelcomeGate` (guest/auth entry gate) → `TooltipProvider`. Supports dynamic invite routes (`/join/:code`).
- **Pages** (`client/src/pages/`): one page per game mode (`BadugiGame`, `Dead7Game`, `Fifteen35Game`, `SuitsPokerGame`, `BonecrusherGame`, `BoxChevyGame`, `KamikazeGame`, `FlushedUpGame`), plus core app pages (`Home`, `Profile`, `Leaderboard`, `Shop`, `CosmeticsStore`, `Crews`, `BonusCenter`), Lady Luck pages (`LadyLuck`, `LadyLuckHistory`, `LadyLuckSpectate`), and utility/auth pages (`Admin`, `ForgotPassword`, `ResetPassword`, `JoinTable`, `DeleteAccount`, `Privacy`, `Terms`, `not-found`).
- **State management:** No global store (Redux/Zustand) — state is handled via custom hooks + TanStack Query + WebSocket-pushed state:
  - `poker/engine/useGameEngine.ts` — client-side game loop/bot fallback (used only when the server-authoritative path is unavailable) and phase transitions.
  - `useServerProfile.ts` — authoritative profile/chip-balance/cosmetics source, unifies guest and authenticated sessions.
  - `useTableRoom.ts` — WebSocket room presence/metadata.
  - `progression.ts` — XP/levels/hand counts.
  - `persistence.ts` — localStorage for guest identity and offline balances.
  - `billing.ts` — native (Capacitor) and web-stub billing router.
  - `analytics.ts`, `useGameToasts.ts`, `usePhaseSounds.ts`, `useXPWatcher.ts` — UX/telemetry hooks.
- **Component organization:** Atomic primitives in `components/ui/` (shadcn pattern); domain-grouped components under `components/game/`, `components/admin/`, `components/home/`, and per-mode folders (e.g. `components/flushedUp/`, `components/badugi/`); 3D/table rendering separated into scene components (`ThreeDTableScene`, `Fifteen35TableScene`) from 2D overlays (`ActionBar`, `ResolutionOverlay`).

### Public Asset Folders (`client/public/`)
- `/assets/` — backgrounds (cellblock, dead7), characters (guard), UI mockups/chain art
- `/cosmetics/` — avatars, backgrounds, badges, frames
- `/modes/` — per-mode backgrounds/icons (Badugi, 15/35, Suits)
- `/ladyluck/` — horse/queen mini-game assets
- Root — `chip-*.png`, `dock-*.png` (nav), `emote-*.png`, `card-back.png`, `app-icon.png`

---

## 5. Backend Architecture

- **Entry point** `server/index.ts`: sets up Express (CORS, body parsers, redacted logging), trust-proxy for Replit, seeds cosmetics catalog, ensures DB tables, runs one-time migrations (admin grants, purchase-status resets), initializes game engines, starts HTTP + WebSocket servers, and registers a graceful-shutdown handler that flushes debounced persistence writes.
- **WebSocket server** (`server/rooms.ts`): mounted on `/ws` via the `ws` library on the same HTTP server. Handshake requires a short-lived session token (`verifyClient`). 25s ping/pong heartbeat; 60s session-expiry check mid-connection. Routes room-management messages (join/leave/kick/settings) separately from game-action messages (`badugi:action`, `mode:action`, `ll:*`).
- **Game engines:**
  - `gameEngine.ts` — dedicated server-authoritative Badugi engine (state, bots, turn timers).
  - `genericEngine.ts` — shared engine driving Dead7, 15/35, Suits & Poker, Bonecrusher, Box Chevy, Kamikaze, Flushed Up via mode definitions in `shared/modes/`.
  - `ladyluckEngine.ts` — separate engine for the Lady Luck horse-racing side game (including its own spectator mode).
- **Persistence:** `tablePersistence.ts` / `ladyluckPersistence.ts` debounce table-state writes to the DB; `storage.ts` implements the `IStorage` interface as the sole data-access layer over Drizzle.
- **Middleware** (`server/middleware/`):
  - `auth.ts` — `requireAuth`, `requireSelf`, `requireAdmin`.
  - `pubsubAuth.ts` — verifies Google Cloud Pub/Sub JWTs for billing webhooks.
  - `rateLimits.ts` — tiered limits for login, registration, daily bonuses, and general API traffic.
- **`routes.ts` organization:** in-memory active-table registry → table management → player/profile API → auth routes → billing/store → crews/clubs — see full route list in §7.

---

## 6. Database Tables

PostgreSQL via Drizzle ORM. Schema source of truth: `shared/schema.ts`. Migrations output to `./migrations` (drizzle.config.ts).

| Table | Purpose |
|---|---|
| `player_profiles` | Core account record: identity, chip balance, stripes, progression, cosmetics equipped, subscription state, ban/deletion flags, admin flag, crew membership |
| `sessions` | Session token → player mapping with expiry |
| `stripe_transactions` | Audit ledger for "Stripes" (premium currency) balance changes |
| `purchase_transactions` | Real-money consumable purchase records (Google Play) |
| `daily_bonus_claims` | Daily login-streak reward history |
| `cosmetic_items` | Server-side cosmetics catalog |
| `player_inventory` | Player-owned cosmetics |
| `cosmetic_purchases` | Cosmetic purchase audit log |
| `subscriptions` | Active/past subscription records (tier, billing period, status) |
| `subscription_events` | Subscription lifecycle audit log (JSONB event data) |
| `crews` | Clubs/guilds — name, invite code, captain, chip bank |
| `crew_members` | Crew membership + role (captain/member) |
| `crew_chat_messages` | Crew chat history |
| `crew_events` | Crew audit log |
| `club_chip_requests` | Member requests for club-bank chip distributions |
| `time_bank_events` | Turn-extension usage log |
| `chip_transactions` | Immutable chip-balance audit ledger (before/after, reason, game/hand ID) |
| `users` | Legacy auth table (appears superseded by `player_profiles`) |
| `analytics_events` | Usage/session analytics events |
| `blocked_players` | Player block-list relationships |
| `player_reports` | User-submitted moderation reports |
| `admin_actions` | Full admin audit trail (before/after state) |
| `quest_progress` | Quest/progression task completion |
| `house_rake_logs` | House rake (revenue) log per hand/race |
| `ladyluck_race_results` | Lady Luck race outcome history |

---

## 7. API Routes

### Authentication
`POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me` · `GET /api/auth/ws-token` · `POST /api/auth/guest-init` · `POST /api/auth/forgot-password` · `POST /api/auth/reset-password` · `POST /api/auth/logout`

### Players & Social
`POST /api/players` · `GET /api/players/:id` · `GET /api/players/:id/reconnect` · `DELETE /api/players/:id` · `PUT /api/players/:id/avatar` · `PUT /api/players/:id/name` · `GET /api/players/:id/stripes` · `POST /api/players/:id/bonus-chips` · `POST /api/players/:id/chip-loan` · `POST /api/players/:id/claim-welcome-kit` · `GET/POST /api/players/:id/daily-bonus/*` · `GET /api/players/:id/inventory` · `POST /api/players/:id/cosmetics/purchase|equip|unequip` · `GET /api/players/:id/quests` · `POST /api/players/:id/quests/claim` · `POST/GET/DELETE /api/players/blocks*` · `POST/GET /api/players/reports*` · `GET/POST /api/players/:id/time-bank/*`

### Table Management
`POST /api/tables` · `GET /api/tables` · `GET /api/tables/badugi` · `GET /api/tables/:code` · `DELETE /api/tables/:tableId` · `GET /api/tables/mode/:modeId/join` · `POST /api/tables/:table_id/join` · `POST /api/tables/:table_id/rebuy`

### Crews (Clubs)
`GET /api/crews/preview/:code` · `POST /api/crews/create` · `POST /api/crews/join` · `GET /api/crews/:crew_id` · `GET /api/players/:id/crew` · `POST /api/crews/:crew_id/leave|kick|rename|regenerate-invite` · `GET/POST /api/crews/:crew_id/chat` · `GET /api/clubs/public` · `POST /api/crews/:id/fund-bank|distribute|request-chips|appoint-agent|remove-agent` · `POST /api/crews/:id/requests/:requestId/resolve` · `GET /api/crews/:id/chip-requests`

### Shop & Billing
`GET /api/cosmetics/catalog` · `POST /api/billing/verify-purchase` · `POST /api/billing/verify-subscription` · `GET /api/players/:id/subscription` · `POST /api/players/:id/subscription/cancel` · `POST /api/billing/play-webhook` · `POST /api/billing/refund-webhook` · `POST /api/billing/subscription-webhook`

### Lady Luck
`POST /api/ladyluck/tables` · `GET /api/ladyluck/tables` · `GET /api/ladyluck/history`

### Admin (all `requireAdmin`-protected)
`GET /api/analytics/stats` · `GET /api/admin/rake-stats` · `GET /api/admin/players/search` · `GET /api/admin/players/:id` · `GET /api/admin/players/:id/chip-history|stripes-history|admin-actions` · `POST /api/admin/players/:id/grant-chips|debit-chips|grant-stripes|debit-stripes|grant-cosmetic|revoke-cosmetic|grant-subscription|revoke-subscription|ban|unban|reset-password` · `DELETE /api/admin/players/:id` · `GET /api/admin/audit-log`

### WebSocket Messages (`/ws`)
- **Client → Server:** `join`, `leave`, `ping`, `host:kick`, `host:settings`, `badugi:action`, `mode:action`, `ll:join`, `ll:start`, `ll:select`, `ll:wager`, `ll:sidebet`, `ll:spectate`, `ll:spectator_sidebet`, `ll:spectator_leave`
- **Server → Client:** `room_update`, `host_update`, `host_kicked`, `session_expired`, `pong`, `error`, `ll:error`

---

## 8. Authentication and Permissions

- **Guest-first model:** every player starts as a guest — client generates a UUID stored in `localStorage` (`cgp_player_identity`), calls `POST /api/auth/guest-init`, receives a **7-day session token**. Guests are reset every 24h (`server/guestReset.ts`) until they register.
- **Registration/login:** `POST /api/auth/register` links email + scrypt-hashed password to the existing guest profile (preserving chip history), issuing a **30-day session token**. `POST /api/auth/login` validates credentials and checks ban/deletion status before issuing a token.
- **Session storage:** `sessions` table maps token → `playerId` + `expiresAt`. `GET /api/auth/me` refreshes TTL on each app-mount call. All authenticated requests carry the token via `X-Session-Token` header.
- **WebSocket auth:** client first fetches a short-lived token from `GET /api/auth/ws-token`, then passes it as a query parameter on the WS upgrade request.
- **Middleware-based authorization** (`server/middleware/auth.ts`):
  - `requireAuth` — validates session token, blocks banned/deleted accounts.
  - `requireSelf` — restricts a route to the token owner's own `:id`.
  - `requireAdmin` — additionally checks the `isAdmin` boolean on `player_profiles`.
  - `pubsubAuth.ts` — verifies Google Cloud Pub/Sub JWTs for billing webhook authenticity.
- **Crew/club roles** (captain/member/agent) are checked ad hoc in route handlers against `crew_members`, not via shared middleware.
- **No third-party auth/OAuth provider** — fully custom, first-party session system.

---

## 9. Payments / Billing

- **Primary rail: Google Play Billing** (native, via `cordova-plugin-purchase` on the client and `@googleapis/androidpublisher` on the server). The Stripe integration provisioned in the environment (`stripe:1.0.0`) is **not referenced anywhere in the codebase** — no Stripe SDK import, checkout session, or webhook handler exists. It appears to be installed but currently dormant/unused.
- **Virtual currency ("Stripes"):** 5 consumable packs, $0.99–$99.99 (100–15,000 Stripes). Client purchases via `NativeBillingPlugin` (Android) or `WebBillingStub` (dev/testing with `test_` tokens); server verifies the `purchaseToken` via `POST /api/billing/verify-purchase`, credits Stripes, then acknowledges/consumes the Google Play product.
- **Club chips:** a separate consumable product line credits a Crew's shared bank instead of an individual player.
- **Subscriptions:** two tiers — `gold_pro` and `diamond_elite` (monthly/yearly). Benefits: signup Stripe bonus, daily chip multiplier (2x/3x), XP multiplier (1.5x/2x), exclusive animated cosmetic frame auto-equipped while active.
- **Security:** `obfuscatedExternalAccountId` returned by Google (set from the player's UUID at purchase time) is cross-checked against `sessionPlayerId` server-side to prevent receipt-swapping/replay attacks.
- **Webhooks:** unified `POST /api/billing/play-webhook` handles Google RTDN events (`RENEWED`, `CANCELED`, `EXPIRED`, `ON_HOLD`, `RECOVERED`, `REVOKED`); separate `refund-webhook` and `subscription-webhook` endpoints, all Pub/Sub-JWT authenticated. Refunded/charged-back purchases trigger automatic Stripes clawback.
- **House rake:** a flat rake is applied to hand pots and Lady Luck side-bets, logged to `house_rake_logs`, visible in the admin console.

---

## 10. Admin Functions

Admin console at `client/src/pages/Admin.tsx`, gated by `requireAdmin` on all backing routes.

- **Analytics tab:** DAU, session counts/duration, per-mode play breakdown (`GET /api/analytics/stats`).
- **House rake monitor:** revenue/rake logs per mode (`GET /api/admin/rake-stats`).
- **Global audit log:** all administrative actions (`GET /api/admin/audit-log`), individually also visible per-player (`admin-actions`).
- **Player lookup & management panel:**
  - Search by name/email/ID; full profile + internal state view.
  - Manual chip/Stripes grant and debit, with ledger history (`chip-history`, `stripes-history`).
  - Cosmetic grant/revoke.
  - Subscription tier grant/revoke override.
  - Ban/unban (temporary or permanent) and manual password reset.
  - Soft-delete account.
- All mutating admin actions are recorded with before/after state snapshots in `admin_actions`.

---

## 11. Deployment and Build Process

- **Dev run:** `npm run dev` → `tsx server/index.ts` (Express serves API + WS; Vite handles client in middleware mode). Workflow "Start application" binds to port 5000.
- **Build:** `npm run build` → `tsx script/build.ts` (bundles client + server to `dist/`).
- **Production start:** `npm run start` → `node dist/index.cjs`.
- **Replit deployment:** `.replit` configures a **VM deployment target** — `build: npm run build`, `run: node ./dist/index.cjs`, port 5000 → external port 80.
- **Schema migrations:** `npm run db:push` (drizzle-kit push, schema-driven, no versioned migration files checked in beyond the `migrations` output directory).
- **Mobile builds (Codemagic, `codemagic.yaml`):**
  - `android-release` workflow: Java 17, Node 20 → npm install (forces public npm registry, clears lockfile) → `npm run build` → `npx cap sync android` → Gradle `bundleRelease` → produces a signed AAB (uses the `chaingang_keystore` signing identity). Injects `VITE_API_BASE_URL` and `VITE_SHARE_ORIGIN` (both currently `https://chainggangpoker.com`) at build time.
  - `ios-release` workflow: Xcode/CocoaPods → `npx cap sync ios` → unsigned IPA archive/export. Same `VITE_API_BASE_URL`/`VITE_SHARE_ORIGIN` injection.
- **Environment variables (names only, no values shown):**

  | Variable | Used in |
  |---|---|
  | `DATABASE_URL` | Server — Postgres connection |
  | `PORT` | Server — HTTP bind port |
  | `NODE_ENV` | Server — dev/prod mode switch |
  | `REPL_ID`, `REPLIT_DEV_DOMAIN`, `REPLIT_INTERNAL_APP_DOMAIN` | Server — Replit environment detection/CORS |
  | `BADUGI_ALPHA_ENABLED` | Server — enables server-authoritative mode for all games |
  | `MODES_ALPHA_ENABLED` | Server — mode-engine feature flag |
  | `GUEST_RESET_DRY_RUN` | Server — guest reset job safety flag |
  | `GOOGLE_PLAY_PACKAGE_NAME` | Server — Play Billing verification |
  | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Server — Play Billing service account credential |
  | `BILLING_TEST_MODE`, `BILLING_TEST_SECRET` | Server — test-mode billing bypass |
  | `RESEND_API_KEY`, `Resend_key_secret` | Server — password-reset emails |
  | `VITE_API_BASE_URL` | Client (build-time) — backend origin for Capacitor builds |
  | `VITE_SHARE_ORIGIN` | Client (build-time) — public origin for invite links |
  | `VITE_BADUGI_ALPHA` | Client (build-time) — feature flag mirror |
  | `DEV` | Client — Vite built-in dev flag |

---

## 12. Security Notes

- Session tokens are opaque random strings (not JWTs) stored server-side with expiry — reduces token-forgery risk but requires a DB lookup per authenticated request.
- Passwords hashed with `scrypt` (no bcrypt/argon2 dependency present) — acceptable but worth confirming salt/params are per-install strong.
- Billing receipt verification cross-checks `obfuscatedExternalAccountId` against the requesting session — a deliberate anti-fraud control worth preserving in any billing refactor.
- Pub/Sub webhook endpoints are JWT-verified (`pubsubAuth.ts`) rather than relying on network-level trust, which is appropriate for public webhook URLs.
- Rate limiting is applied to login, registration, and daily-bonus endpoints — mitigates brute-force and reward-farming abuse.
- Admin actions are fully audited with before/after JSONB snapshots — good forensic trail.
- The **Stripe integration is provisioned but unused** — if it's not needed, consider removing it from `.replit` integrations to reduce attack surface / confusion; if it is planned for future use (e.g. web payments), it currently has zero implementation.
- No dedicated automated security test suite (e.g. fuzzing auth endpoints, SQL-injection regression tests) beyond the reconnect-security test — reasonable given the DB access is entirely through parameterized Drizzle queries, but not verified by this audit at the query level.
- `client/src/pages/DeleteAccount.tsx` and the `DELETE /api/players/:id` / `DELETE /api/admin/players/:id` routes indicate App Store–compliance account-deletion support is in place.

---

## 13. Known Issues

- **TODO: AdMob integration** — `client/src/components/game/BustOutModal.tsx` (3 call sites, currently stubbed behind `console.log`).
- **TODO: snapshot feature** — `client/src/components/game/GameStatusBar.tsx` (stubbed behind `console.log`).
- **Dormant Stripe integration** — installed in the environment but not used by any code path; all real-money flow is Google Play only, so there is currently no web/iOS purchase path outside of native Play Billing.
- **No frontend automated tests** — zero `.test.tsx`/`.spec.tsx` files across `client/src`; all UI regressions are currently caught manually.
- **Legacy `users` table** — appears superseded by `player_profiles` but still present in the schema; worth confirming it's fully unused before removal.
- **No versioned SQL migration files** — schema changes are pushed directly via `drizzle-kit push`, which is fine for a single-environment app but offers no rollback/history trail for production schema changes.

---

## 14. Recommended Next Steps

1. **Add frontend test coverage** — even light smoke tests (page renders, key user flows like guest login → join table) would catch regressions the current server-only suite can't.
2. **Resolve the Stripe integration** — either remove it from the project if Google Play Billing is the permanent strategy, or scope out its intended use (e.g., web-based purchases) so it isn't a maintenance question mark.
3. **Introduce versioned SQL migrations** — even a lightweight migration log alongside `drizzle-kit push` would make production schema changes auditable and reversible.
4. **Close out the two open TODOs** (AdMob, snapshot feature) or formally deprioritize/remove the stubs so they don't accumulate as dead code.
5. **Audit the legacy `users` table** for any remaining references before considering removal, to keep the schema lean.
6. **Consider extracting crew-role authorization into shared middleware** (mirroring `requireAdmin`) rather than checking `crew_members` roles ad hoc in each route handler — would reduce duplication and risk of an inconsistent check being missed on a new crew route.
7. **Document the environment variable list** (names only, as above) in `replit.md` or a `.env.example` file so future contributors have a single reference point without needing to grep the codebase.
