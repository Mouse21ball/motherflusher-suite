# Chain Gang Poker — Codebase Guide

**Repo:** `Mouse21ball/motherflusher-suite`
**Last updated:** 2026-10-09 (main @ `e18c9860`)
**Purpose:** Self-sufficiency reference — everything needed to implement features without Claude.

---

## 1. Architecture Overview

### Stack

| Layer | Tech |
|---|---|
| Language | TypeScript (ES modules, `"type": "module"`) |
| Frontend | React 19, Vite 7, Tailwind CSS 4, shadcn/ui (Radix), wouter, TanStack Query, framer-motion |
| Backend | Express 5 + WebSocket (`ws` package) |
| Shared | Game types, mode logic, card evaluator, DB schema |
| Database | PostgreSQL + Drizzle ORM |
| Mobile | Capacitor 8 (`android/`, `ios/`) |
| IAP | `cordova-plugin-purchase`, `@googleapis/androidpublisher` |
| Tests | Vitest (unit/integration), Playwright (browser animation checks) |

### How the pieces fit

```
┌─────────────┐     REST /api/*      ┌──────────────┐
│   Client    │ ◄──────────────────► │    Server    │
│ React (SPA) │                      │ Express + ws │
│ client/     │     WS /ws (JSON)    │ server/      │
└─────────────┘ ◄──────────────────► └──────┬───────┘
                                           │ Drizzle
                                    ┌──────▼───────┐
                                    │  PostgreSQL  │
                                    └──────────────┘
              ┌──────────────┐
              │   shared/    │  ← imported by BOTH client and server
              │ types, modes │     (no DOM APIs, no Node APIs)
              └──────────────┘
```

**Key principle:** Server-authoritative game engines. Clients send *action intent* (`badugi:action`, `mode:action`, `ll:wager`); the server validates, mutates canonical state, and broadcasts masked snapshots. The client never decides game outcomes.

**Path aliases** (vite.config.ts + tsconfig):
- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `attached_assets/`

### Entry points

| What | File | Notes |
|---|---|---|
| Server | `server/index.ts` | Express app, WS server, engine init, cron jobs |
| Client | `client/src/main.tsx` → `client/src/App.tsx` | wouter router |
| Build | `script/build.ts` | Vite builds client → `dist/public`; esbuild bundles server → `dist/index.cjs` |
| Production start | `npm start` → `node dist/index.cjs` | |
| Server static serving | `server/static.ts` | Serves `dist/public`, SPA fallback to `index.html` |

### Server startup sequence (server/index.ts)

1. Sentry init (if `SENTRY_DSN` set)
2. Seed cosmetic items + music tracks
3. Ensure `ladyluck_race_results` table exists (direct SQL)
4. One-time purchase-transaction cleanup (rejected → failed_retryable)
5. Grant admin to `ADMIN_EMAIL` account
6. `initEngine()` — restore persisted Badugi tables
7. `initGenericEngine()` — restore persisted Flushed Up / Box Chevy tables
8. `initLadyLuckEngine()` — restore Lady Luck tables + refund crash wagers
9. `initRooms(httpServer)` — open WebSocket at `/ws`
10. `startGuestResetJob()` — 24h guest-account reset (hourly check)
11. `registerRoutes()` — all REST endpoints
12. `startPushNotificationJob()`

**Required env var:** `BADUGI_ALPHA_ENABLED=true` enables server-authoritative mode for all games. Without it, game actions are dropped.

---

## 2. Directory Map

```
├── client/                    # React frontend
│   ├── src/
│   │   ├── App.tsx            # Router (wouter), providers, layout
│   │   ├── main.tsx           # React root
│   │   ├── index.css          # Base styles (Tailwind 4)
│   │   ├── yard-reskin.css    # ← Purple+gold reskin theme (432 lines)
│   │   ├── pages/             # Route components
│   │   │   ├── Home.tsx               # 4-game home screen
│   │   │   ├── BadugiGame.tsx         # → UnifiedGamePage
│   │   │   ├── FlushedUpGame.tsx      # Own page (custom header)
│   │   │   ├── BoxChevyGame.tsx       # Own page
│   │   │   ├── LadyLuck.tsx           # Race interface
│   │   │   ├── BonusCenter.tsx        # Bonuses, VIP, starter kit
│   │   │   ├── Shop.tsx / CosmeticsStore.tsx
│   │   │   ├── Crews.tsx              # Clubs
│   │   │   ├── Profile.tsx / Friends.tsx / Leaderboard.tsx
│   │   │   └── Admin.tsx              # Admin panel
│   │   ├── components/
│   │   │   ├── game/          # Shared game chrome (TableBoard, seats, action bars)
│   │   │   ├── badugi/        # Badugi table + action bar
│   │   │   ├── flushedUp/     # Flushed Up table + animations
│   │   │   ├── boxChevy/      # Box Chevy table + action bar
│   │   │   ├── ui/            # shadcn/ui primitives
│   │   │   ├── celebrations/  # Win animations
│   │   │   ├── admin/ / settings/ / practice/
│   │   │   ├── YardBottomNav.tsx      # ← Reskin bottom nav
│   │   │   ├── YardPlayerHeader.tsx   # ← Reskin header
│   │   │   ├── YardRewardFlight.tsx   # ← Reskin reward animation
│   │   │   └── DailyBonusCalendarModal.tsx / HourlyBonusModal.tsx / StarterPackModal.tsx
│   │   ├── lib/
│   │   │   ├── poker/engine/  # ← WS game hooks
│   │   │   │   ├── useServerGame.ts   # Badugi hook
│   │   │   │   ├── useServerMode.ts   # Flushed Up / Box Chevy hook
│   │   │   │   ├── useGameEngine.ts   # Legacy client-side engine
│   │   │   │   ├── tableProtocol.ts   # Capability assertion
│   │   │   │   └── rebuyConfirmation.ts / singleRebuyFlight.ts
│   │   │   ├── poker/modes/   # Legacy client mode definitions
│   │   │   ├── apiConfig.ts   # API/WS URL config (Capacitor-aware)
│   │   │   ├── session.ts     # Session token (localStorage + memory fallback)
│   │   │   ├── queryClient.ts # TanStack Query client
│   │   │   ├── useServerProfile.ts    # ← Server profile context (chips, level, etc.)
│   │   │   ├── useTableRoom.ts        # Older room hook
│   │   │   ├── analytics.ts / handAnalytics.ts
│   │   │   ├── retention.ts   # Hourly bonus, starter pack, VIP logic
│   │   │   ├── billing.ts / rewardedAds.ts
│   │   │   └── sounds.ts / music.ts
│   │   ├── hooks/             # use-mobile, use-toast
│   │   └── assets/images/     # Generated yard artwork
│   ├── index.html
│   └── public/
├── server/                    # Express + WebSocket backend
│   ├── index.ts               # Entry, startup sequence
│   ├── routes.ts              # ← ALL REST endpoints (4,484 lines)
│   ├── rooms.ts               # ← WebSocket server, message routing (1,021 lines)
│   ├── gameEngine.ts          # ← Badugi authoritative engine (2,765 lines)
│   ├── genericEngine.ts       # ← Flushed Up + Box Chevy engine (2,884 lines)
│   ├── modeEngine.ts          # ModeEngine interface (ports for generic engine)
│   ├── flushedUpEngine.ts     # FlushedUpEngine: ModeEngine port (120 lines)
│   ├── boxChevyEngine.ts      # BoxChevyEngine: ModeEngine port (24 lines)
│   ├── ladyluckEngine.ts      # ← Lady Luck engine (1,294 lines, separate system)
│   ├── ladyluckPersistence.ts # Lady Luck table persistence
│   ├── tablePersistence.ts    # Badugi/generic table persistence (debounced)
│   ├── guestReset.ts          # ← 24h guest-reset job
│   ├── storage.ts             # ← MemStorage class (Drizzle/Postgres, 5,188 lines)
│   ├── db.ts                  # Drizzle DB connection
│   ├── wsTickets.ts           # Short-lived WS auth tickets
│   ├── billing.ts             # IAP verification (Apple + Google Play)
│   ├── admobSsv.ts            # AdMob rewarded-ad SSV verification
│   ├── pushNotifications.ts   # Firebase push job
│   ├── crews.ts               # Clubs/crews logic
│   ├── chatFilter.ts          # Obscenity filter for chat
│   ├── activity.ts            # Meaningful-activity tracking
│   ├── tableRebuyRequests.ts  # Idempotent rebuy flow
│   ├── tableWinStreaks.ts     # Win-streak tracking per seat
│   ├── reactionAuthorization.ts / reactionEntitlements.ts
│   ├── referralCodes.ts / personalChipGifts.ts / firstPurchase.ts / bustRescue.ts
│   ├── notificationDeviceBindings.ts / notificationLocks.ts
│   ├── leaderboardRoutes.ts
│   ├── engineLog.ts / responseLogger.ts / buildInfo.ts
│   ├── middleware/rateLimits.ts
│   ├── utils/                 # botPlayer, botBanter, rake, secureShuffle, badugiDraw, etc.
│   └── __tests__/             # Server tests (NOT in default `npm test` run)
├── shared/                    # Imported by both client and server
│   ├── gameTypes.ts           # ← Core types: GameState, Player, GameMode, GamePhase
│   ├── schema.ts              # ← Drizzle DB schema (all tables)
│   ├── modes/
│   │   ├── badugi.ts          # BadugiMode: GameMode (deal, botAction, showdown)
│   │   ├── flushedUp.ts       # FlushedUpMode
│   │   ├── boxchevy.ts        # BoxChevyMode
│   │   ├── ladyluck.ts        # LadyLuckMode (types only)
│   │   └── heroHandValidity.ts
│   ├── engine/                # Shared engine utilities
│   │   ├── core.ts / bettingTurns.ts / sidePots.ts / botUtils.ts / avatarMap.ts
│   ├── evaluator.ts           # Card hand evaluator
│   ├── badugiDraw.ts
│   ├── stakeTiers.ts          # Stake tier definitions (minBet, buy-in bounds)
│   ├── tableStartEligibility.ts
│   ├── analytics.ts           # Funnel event types + zod schemas
│   ├── billingProducts.ts     # IAP product definitions
│   ├── featureFlags.ts        # SERVER_AUTHORITATIVE_BADUGI
│   └── progressionRules.ts / leaderboard.ts / practiceGuide.ts / etc.
├── migrations/                # Drizzle SQL migrations (0000–0016)
├── tests/                     # ← Vitest tests (default `npm test` run)
│   └── browser/               # Playwright specs (animation checks)
├── android/ / ios/            # Capacitor native projects
├── scripts/                   # One-off migration/verification scripts
├── docs/                      # analytics/ (SQL), design/ (reskin specs)
├── .github/workflows/
│   ├── ios-upload.yml         # Detroit uploads IPA → App Store Connect
│   └── browser-animation-checks.yml  # CI: check + test + test:browser
├── codemagic.yaml             # Builds IPA (iOS) + AAB (Android)
├── capacitor.config.ts        # Capacitor config (NO server.url — bundles UI locally)
├── drizzle.config.ts
└── replit.md                  # ⚠️ Says Prisma — OUT OF DATE. It's Drizzle.
```

---

## 3. The 4 Game Modes

### Mode ID reference

| Mode | Mode ID | Display name | Route | Engine |
|---|---|---|---|---|
| Badugi | `badugi` | Badugi | `/badugi` | `server/gameEngine.ts` (dedicated) |
| Flushed Up | `flushedup` | Flushed Up | `/flushedup` | `server/genericEngine.ts` + `flushedUpEngine.ts` port |
| Lady Luck | `ladyluck` | Lady Luck | `/ladyluck` | `server/ladyluckEngine.ts` (separate system) |
| Box Chevy | `box-chevy` | Box Chevy | `/box-chevy` | `server/genericEngine.ts` + `boxChevyEngine.ts` port |

### 3a. Badugi — `server/gameEngine.ts` (2,765 lines)

**Dedicated engine** (not through the generic engine). The original game; its engine predates the ModeEngine abstraction.

**Key exports:**
- `initEngine()` — restore persisted tables on startup
- `handleBadugiAction(tableId, playerId, action, payload)` — process player actions
- `maskStateForPlayer(state, playerId)` — hide opponents' cards
- `rebuyBadugiSeat(...)` — seat rebuy flow
- `resetToAnte(table)` — reset table between hands

**Hand flow** (phases from `shared/modes/badugi.ts`):
```
WAITING → ANTE → DEAL → DRAW_1 → BET_1 → DRAW_2 → BET_2 → DRAW_3 → DECLARE → BET_3 → SHOWDOWN
```

1. **WAITING**: Bot-fill (`scheduleBadugiBotFill`) seats bots until 2+ players, then auto-starts after 3s.
2. **ANTE**: Each player posts ante (default 25, scaled by stake tier).
3. **DEAL**: 4 cards each via `BadugiMode.deal()`.
4. **DRAW_1/2/3**: Players discard and draw (caps: 3/2/1 cards). Bots use `BadugiMode.botAction()`.
5. **DECLARE** (Detroit's rule): Players without a valid Badugi are auto-folded — but they **stay for the rollover** (see below). This is `onPhaseEnter` logic.
6. **BET_1/2/3**: Betting rounds. Hard cap: 3 raises per round (4 heads-up). 15s turn timer → auto-act on timeout.
7. **SHOWDOWN**: `resolveShowdown()` evaluates Badugis (4 unique ranks + 4 unique suits; lower is better).

**Detroit's Badugi rollover rule** (2026-10-09):
- A valid Badugi must be made to win.
- If nobody has one, the pot **rolls over** to the next hand.
- Players auto-folded at DECLARE for lacking a valid hand **return** for the rollover hand.
- Voluntary folders stay out.
- Dealer does not move on rollover.
- Zero-active-player fallback exists as a loudly-logged last resort (table would otherwise die).

**Rake:** Applied via `applyRake()` in `server/utils/rake.ts`. Logged to `house_rake_logs`.

### 3b. Flushed Up — `server/genericEngine.ts` + `server/flushedUpEngine.ts`

**Runs on the generic engine** through the `ModeEngine` port interface (`server/modeEngine.ts`):

```typescript
interface ModeEngine {
  mode: GameMode;
  drawCap(phase: string): number | null;
  onPhaseEnter?(state, addMessage): GameState;
  canWinUncontested?(player): boolean;
  resolveUncontested?(state, winner, netPot): GameState;
  scheduleBotFill?(key, host): void;
}
```

**FlushedUpEngine** (`server/flushedUpEngine.ts`, 120 lines):
- `drawCap`: DRAW_1→3, DRAW_2→2, DRAW_3→1
- `canWinUncontested`: player must have a flush to win uncontested
- `resolveUncontested`: fold-only → pot rolls over ("No qualifying hands — $X rolls over!")
- `scheduleBotFill`: Custom bot-fill with `FLUSHED_UP_BOT_NAMES` (Slick, Vega, Rosie, Duke, Nyx, Bones, Cleo, Remy)

**Game rules** (`shared/modes/flushedUp.ts`):
- Players dealt cards, draw to make a **flush** (5 cards same suit).
- `evaluateFlushedUpHand()` checks for flush.
- No qualifying flush at showdown → pot rolls over (same pattern as Badugi).

**Client:** `client/src/pages/FlushedUpGame.tsx` → `useServerMode('flushedup')` → `client/src/components/flushedUp/FlushedUpTable.tsx`.

### 3c. Box Chevy — `server/genericEngine.ts` + `server/boxChevyEngine.ts`

**Runs on the generic engine** through `BoxChevyEngine` (`server/boxChevyEngine.ts`, 24 lines):
- `drawCap`: DRAW_1→3, DRAW_2→2, DRAW_3→1
- `onPhaseEnter`: At DECLARE, players without a **made lowball hand** are auto-folded (same pattern as Badugi's rollover rule).

**Game rules** (`shared/modes/boxchevy.ts`):
- 10-card lowball (per the lobby: "BOX CHEVY 10-CARD LOWBALL").
- `hasMadeHand(cards, communityCards)` determines declaration eligibility.
- Lowest hand wins (lowball).

**Client:** `client/src/pages/BoxChevyGame.tsx` → `useServerMode('box-chevy')` → `client/src/components/boxChevy/BoxChevyTable.tsx`.

### 3d. Lady Luck — `server/ladyluckEngine.ts` (1,294 lines)

**Completely separate system** — not a poker table, not on the generic engine. It's a **suit-race betting game**.

**How it works:**
1. Player joins a Lady Luck table (`handleLLJoin`) — picks a room type.
2. Bot-fill (`scheduleBotFill`) fills empty seats with bots (each funded to `LADY_LUCK_BOT_STACK` = 10,000 chips from the house).
3. Players **select a suit** (`handleLLSelect`) — hearts/diamonds/clubs/spades.
4. Players **wager** on their suit (`handleLLWager`). Bots auto-bet (`scheduleBotAutobet`).
5. Optional **side bets** (`handleLLSideBet`).
6. **Race starts** (`startRace`) — cards flip, suits advance.
7. **Resolution** (`resolveRace`) — winning suit's bettors split the pot (minus rake via `settleLadyLuckPot`).
8. `startNextRound` — next race.

**Key functions:**
- `createLLTable(tableId, roomType, hostId)` / `findOrCreateLLTable(roomType, hostId)`
- `handleLLJoin`, `handleLLStart`, `handleLLSelect`, `handleLLWager`, `handleLLSideBet`
- `handleLLSpectate`, `handleLLSpectatorSideBet`, `handleLLSpectatorLeave`
- `handleLLDisconnect`
- `initLadyLuckEngine()` — restore tables + refund crash wagers on startup

**Chip economy** (critical — see §6):
- House account: `__ladyluck_house__` (constant `LADY_LUCK_HOUSE_ID` in `server/storage.ts`)
- Bot accounts: `bot_*` prefix
- `isInternalChipAccount(id)` returns true for house + `bot_*`
- Bot funding: `fundLadyLuckBot()` → `rebalanceLadyLuckBot()` → `transferLadyLuckChips()` with `ladyluck_bot_rebuy` source
- Every chip movement is double-entry ledger-recorded in `chip_transactions`

**Client:** `client/src/pages/LadyLuck.tsx` (race interface) + `LadyLuckSpectate.tsx` + `LadyLuckHistory.tsx`.

### Retired modes (the 9→4 cut)

Five modes were retired 2026-10-08: `dead7`, `fifteen35`, `suits_poker`, `kamikaze`, `bonecrusher`.

**`RETIRED_MODES`** in `server/genericEngine.ts` (line ~1500):
- When a client requests a retired mode, the server sends **both**:
  - `mode:retired` (new protocol — carries store URLs for one-tap update)
  - `mode:error` with `reason: 'unknown-mode'` (legacy — old clients exit immediately instead of spinning)
- **Why dual-send:** Installed native apps (iOS b13, Android vc28) bundle the old 9-mode UI locally. They don't understand `mode:retired` and would spin for 15s. The legacy `mode:error` makes them exit cleanly.
- **Do not remove** until new native builds ship and old clients age out.

---

## 4. Component Patterns

### The reskin system (purple + gold, "DIFFERENT GAMES. SAME YARD.")

**Theme CSS:** `client/src/yard-reskin.css` (432 lines)
- All reskin styles prefixed with `yard-`.
- CSS custom properties for the palette:
  - `--color-gold: #F59E0B`, `--color-gold-light: #FDE68A`
  - `--color-surface: #150A2E` (deep purple), `--color-panel: #1E1040`, `--color-elevated: #2D1B69`
- Fonts: Oswald (display/headings), DM Sans (body) — loaded via `@fontsource`.
- Yard backdrop: `./assets/images/yard-backdrop.jpg` (prison-yard scenery).

**Shared table board:** `client/src/components/game/TableBoard.tsx`
- Presentational component — takes `gameAccent`, `title`, `subtitle`, `phase`, `phaseSteps`, `centerReadout`, `heroCards`, `opponentSeats`, `pot`, `children`.
- `YardGameAccent` type: `'#8B5CF6'` (Badugi, purple) | `'#D946EF'` (Flushed Up, magenta) | `'#F97316'` (Box Chevy, orange).
- Renders: hanging glass panel (`.yard-table-glass`), suspension chains, phase tracker, pot slot, opponent seats, hero slot.
- **Important:** Per-game containers (`BadugiTable`, `FlushedUpTable`, `BoxChevyTable`) supply game logic; `TableBoard` handles all chrome. Don't put game rules in it.

**Reskin components:**
| Component | Purpose |
|---|---|
| `TableBoard.tsx` | Shared table chrome for Badugi/Flushed Up/Box Chevy |
| `ChainBezel.tsx` | Decorative chain border on the glass panel |
| `YardBottomNav.tsx` | Fixed bottom nav (72px, safe-area aware) |
| `YardPlayerHeader.tsx` | Top player header (avatar, chips, bell) |
| `YardHeroIdentity.tsx` | Hero seat identity block |
| `YardOpponentSeat.tsx` | Opponent seat component |
| `YardRewardFlight.tsx` | Flying reward animation |

**Per-game table components:**
| Game | Table | Action bar |
|---|---|---|
| Badugi | `components/badugi/BadugiTable.tsx` | `components/badugi/BadugiActionBar.tsx` |
| Flushed Up | `components/flushedUp/FlushedUpTable.tsx` | `components/flushedUp/FlushedUpActionBar.tsx` |
| Box Chevy | `components/boxChevy/BoxChevyTable.tsx` | `components/boxChevy/BoxChevyActionBar.tsx` |

**Shared game chrome** (`components/game/`):
- `BettingControls.tsx`, `BuyInSlider.tsx`, `Card.tsx`, `PlayerSeat.tsx`, `ChatBox.tsx`, `ReactionBar.tsx`, `GameStatusBar.tsx`, `HandHistory.tsx`, `ShowdownReveal.tsx`, `ResolutionOverlay.tsx`, `WinCelebration.tsx`, `BustOutModal.tsx`, `HostControls.tsx`, `TableEscapeGuard.tsx`, `SpectatorBanner.tsx`, `FiveSeatPokerTable.tsx`, `GameTable.tsx`

### Page → hook → table pattern

```
Page (e.g. FlushedUpGame.tsx)
  → useServerMode('flushedup')    # WS connection, state, handleAction
    → FlushedUpTable              # Renders TableBoard + game-specific UI
      → TableBoard                # Shared chrome
```

- `BadugiGame.tsx` → `UnifiedGamePage` → `useServerBadugi(tableId)` → `BadugiFullPage` → `BadugiTable`
- `FlushedUpGame.tsx` → `useServerMode` → `FlushedUpTable`
- `BoxChevyGame.tsx` → `useServerMode` → `BoxChevyTable`
- `LadyLuck.tsx` → own WS logic (`ll:` messages)

### Styling approach

- Tailwind CSS 4 (utility-first) for layout.
- `yard-reskin.css` for theme (loaded globally).
- shadcn/ui (Radix) primitives in `components/ui/` for dialogs, buttons, etc.
- Inline `style={{}}` is common in game components (dynamic values).
- `data-testid` attributes on interactive elements (used by Playwright + QA).

---

## 5. State Management

### Client state — three layers

**1. Server profile (authoritative player data)**
- `client/src/lib/useServerProfile.ts` — React context.
- Provides: `chipBalance`, `stripes`, `handsPlayed`, `lifetimeProfit`, `level`, `xp`, `displayName`, `avatarId`, equipped cosmetics, cooldowns.
- Fetched from `GET /api/players/:id` on mount.
- Falls back to `null` (callers use localStorage as fallback).

**2. Game state (WebSocket-driven)**
- `useServerGame` (Badugi) / `useServerMode` (Flushed Up, Box Chevy) in `client/src/lib/poker/engine/`.
- Flow: mount → WS connect → send `join` → server sends `mode:init` (or `badugi:init`) → hook stores assigned seat → server sends `mode:snapshot` on every state change → hook updates React state.
- `handleAction(action, payload)` → sends `mode:action` or `badugi:action`.
- Session UUID per mode stored in `sessionStorage` (`cgp_session_<modeId>`).
- **Masking:** Server sends `maskStateForPlayer()` output — opponents' cards are hidden (`isHidden: true`).

**3. REST data (TanStack Query)**
- `client/src/lib/queryClient.ts` — `apiRequest()` helper, `queryClient` instance.
- `staleTime: Infinity`, `refetchOnWindowFocus: false` — data is fetched on demand, not polled.
- Used for: profile, quests, bonuses, friends, leaderboard, shop, etc.

### Server state

- **In-memory tables:** `Map<string, AuthTable>` (Badugi), `Map<string, GenericTable>` (Flushed Up/Box Chevy), Lady Luck tables in `ladyluckEngine.ts`.
- **Debounced persistence:** `tablePersistence.ts` (`scheduleSave`) — tables persist to `game_table_snapshots` on a debounce; flushed on graceful shutdown (SIGTERM/SIGINT).
- **Chip balances:** Canonical in `player_profiles.chipBalance`. Synced to DB at end of every hand and on disconnect.
- **Lady Luck:** Financial state persisted per-transaction (not debounced) — `saveFinancialState()`.

### Auth flow

1. Guest: `POST /api/auth/guest-init` → creates profile, returns session token.
2. Register/Login: `POST /api/auth/register` / `POST /api/auth/login` → session token.
3. Client stores token via `setSessionToken()` (localStorage + in-memory fallback for iOS private browsing).
4. API calls use `apiFetch()` which attaches `X-Session-Token` header.
5. WebSocket: `GET /api/auth/ws-ticket` → single-use ticket (60s TTL) → connect to `/ws?ticket=...`.
6. WS handshake verifies ticket synchronously (no DB round-trip), attaches `authenticatedPlayerId`.
7. Every game action checks **seat ownership**: `getSeatOwner(tableId, seatPid) === authenticatedPlayerId`. A malicious client can't act as another player's seat.

---

## 6. Backend Services

### `server/storage.ts` — Data layer (5,188 lines)

**Despite the name `MemStorage`, this is the Drizzle/Postgres data layer.** (Historical name — don't be confused.)

Key exports:
- `storage` — singleton instance
- `LADY_LUCK_HOUSE_ID = '__ladyluck_house__'`
- `LADY_LUCK_BOT_STACK = 10_000`
- `isInternalChipAccount(id)` — true for house + `bot_*` prefix
- `IStorage` interface — all DB operations (profiles, chips, quests, cosmetics, crews, etc.)

### Chip economy

**Core rule (Detroit):** No consumable chip packs for sale. Chips come from:
- Daily bonus (7-day chain)
- Hourly bonus
- Starter kit (welcome)
- Bust rebuys (free)
- Referral rewards (2,500 chips + 100 stripes both sides)

**Ledger:** Every chip movement is recorded in `chip_transactions` (double-entry: `beforeBalance`, `amountChange`, `afterBalance`, `reason`, `source`, `gameId`, `handId`, `metadata`).

**Lady Luck house float** (the hardened system):
- `ensureLadyLuckHouse()` — idempotent; creates house account on first run with a genesis ledger entry. Also **repairs past guest-reset damage** by reversing the net `guestReset` ledger adjustments (idempotent via `ladyluck_guest_reset_recovery` entries).
- `transferLadyLuckChips(from, to, amount, source, tableId)` — atomic double-entry transfer with row locking.
- **Auto-replenishing:** If the house can't cover a bot-stake funding (`ladyluck_bot_rebuy` source only), the shortfall is minted as a system grant (`ladyluck_house_float_grant`) inside the same locked transaction. **Player transfers, refunds, and sweeps are NOT eligible** — they still fail on insufficient balance.
- `fundLadyLuckBot(botId, tableId)` → `rebalanceLadyLuckBot()` — ensures each bot has exactly 10,000 chips. Surplus is swept back to the house.

### `server/guestReset.ts` — 24h guest-reset job

- Runs hourly (`startGuestResetJob()`).
- Resets guest accounts (no email, no password hash, inactive 24h+) to 25,000 chips.
- **Critical fix (2026-10-09):** Now excludes internal chip accounts via `isInternalChipAccount()`. Previously it wiped `__ladyluck_house__` and `bot_*` accounts to exactly 25,000 — this was the true root cause of the Lady Luck bot-fill outage (not faucet drain).
- `RESET_BALANCE = 25000`.

### Bot system

- **Table bots:** `makeBotPlayer()` in `server/utils/botPlayer.ts`. Named bots with personalities (`botBanter.ts`, `botUtils.ts`).
- **Bot-fill:** Each engine has a bot-fill scheduler that seats bots in `WAITING` phase until 2+ players, then auto-starts.
  - Badugi: `scheduleBadugiBotFill` (gameEngine.ts)
  - Flushed Up: `scheduleFlushedUpBotFill` (flushedUpEngine.ts) — custom names
  - Generic fallback: `scheduleUniversalBotFill` (genericEngine.ts)
  - Lady Luck: `scheduleBotFill` (ladyluckEngine.ts) — with retry/diagnostics
- **Bot actions:** `executeBotAction()` per engine; bot logic in `shared/modes/*/botAction()`.
- **Bot think delay:** `getBotThinkDelay()` — randomized to feel human.

### Other services

| File | Purpose |
|---|---|
| `billing.ts` | Apple/Google IAP verification, subscriptions, webhooks |
| `admobSsv.ts` | AdMob rewarded-ad server-side verification |
| `pushNotifications.ts` | Firebase push notification job |
| `crews.ts` | Clubs/crews (tournaments, chat, chip bank) |
| `chatFilter.ts` | Obscenity filtering (`obscenity` package) |
| `tableRebuyRequests.ts` | Idempotent rebuy flow (free/reserve/borrow) |
| `referralCodes.ts` | Referral code generation + rewards |
| `personalChipGifts.ts` | Gift seats (personal chip packs to friends) |
| `bustRescue.ts` / `firstPurchase.ts` | Monetization offers |
| `notificationDeviceBindings.ts` | Push device registration |
| `leaderboardRoutes.ts` | Leaderboard endpoints |
| `activity.ts` | "Meaningful activity" tracking (for retention) |

---

## 7. API / Socket Contracts

### REST endpoints (server/routes.ts — 4,484 lines)

**Auth:**
- `POST /api/auth/register` / `POST /api/auth/login` / `POST /api/auth/guest-init`
- `GET /api/auth/me` / `GET /api/auth/ws-ticket` (issues WS ticket)
- `POST /api/auth/logout` / `POST /api/auth/forgot-password` / `POST /api/auth/reset-password`

**Players:**
- `GET /api/players/:id` — profile
- `PUT /api/players/:id/avatar` / `PUT /api/players/:id/name`
- `GET /api/players/:id/stripes`
- `POST /api/players/:id/bonus-chips` — persist bonus to DB bankroll
- `GET /api/players/:id/rewards/status`
- `POST /api/players/:id/rewards/hourly/claim`
- `POST /api/players/:id/chip-loan`
- `POST /api/players/:id/claim-welcome-kit`
- `GET /api/players/:id/daily-bonus/status` / `POST /api/players/:id/daily-bonus/claim`
- `GET /api/players/:id/quests` / `POST /api/players/:id/quests/claim`
- `GET /api/players/:id/inventory` (cosmetics)
- `GET /api/players/:id/time-bank/status` / `POST /api/players/:id/time-bank/use`

**Tables:**
- `POST /api/tables` / `GET /api/tables` / `GET /api/tables/badugi` / `GET /api/tables/:code`
- `DELETE /api/tables/:tableId`
- `GET /api/tables/mode/:modeId/join` — quick-play join
- `POST /api/tables/:table_id/join` / `POST /api/tables/:table_id/rebuy`
- `POST /api/tables/:table_id/personal-gifts`

**Lady Luck:**
- `POST /api/ladyluck/tables` / `GET /api/ladyluck/tables` / `GET /api/ladyluck/history`

**Billing:**
- `POST /api/billing/verify-purchase` / `verify-apple-purchase` / `verify-subscription`
- `POST /api/billing/apple-server-notifications` / `play-webhook` / `refund-webhook` / `subscription-webhook`
- `POST /api/billing/bust-rescue-offer` / `first-purchase-offer` (+ `/claim`)

**Social:**
- `GET /api/friends` / `POST /api/friends/requests` (+ `/accept`, `/decline`)
- `POST /api/players/blocks` / `DELETE /api/players/blocks/:blockedId`
- `POST /api/players/reports`
- `GET/POST /api/crews/*` — clubs (create, join, leave, kick, chat, fund-bank, distribute, etc.)
- `GET /api/clubs/public`

**Meta:**
- `GET /api/version` — returns build commit + version
- `POST /api/analytics/track` — funnel events
- `POST /api/ads/rewarded/start` / `/confirm` — rewarded ads
- `GET /api/admin/*` — admin panel (requires `isAdmin`)

### WebSocket protocol (`/ws`)

**Client → Server:**

| Type | Purpose |
|---|---|
| `join` | Join table: `{ tableId, modeId, playerId, name, seatId, identityId, ... }` |
| `leave` | Leave table |
| `ping` | Keepalive |
| `badugi:action` | Badugi game action: `{ tableId, playerId, action, payload }` |
| `mode:action` | Flushed Up / Box Chevy action: `{ tableId, modeId, playerId, action, payload }` |
| `table:rebuy` | Rebuy request: `{ tableId, modeId, playerId, requestId, kind }` |
| `host:kick` / `host:settings` | Private table host controls |
| `ll:join` / `ll:start` / `ll:select` / `ll:wager` / `ll:sidebet` | Lady Luck actions |

**Server → Client:**

| Type | Purpose |
|---|---|
| `room_update` | Room seats, human count, host |
| `host_update` | Host settings |
| `mode:init` / `badugi:init` | Initial state + assigned seat on join |
| `mode:snapshot` / `badugi:snapshot` | Full state update (masked per player) |
| `mode:retired` | Retired mode response (with store URLs) |
| `mode:error` | Legacy error (dual-sent with `mode:retired` for old clients) |
| `error` | Action error message |
| `session_expired` | Session expired, connection closing |
| `ll:*` | Lady Luck state broadcasts |

**Game actions** (sent as `action` in `badugi:action` / `mode:action`):
- `fold`, `check`, `call`, `bet`, `raise`, `allin`
- `discard` (Badugi/Box Chevy/Flushed Up draw phases — payload: card indices)
- `declare` (Badugi DECLARE phase)
- `rebuy` (special-cased in rooms.ts)

---

## 8. Build / Deploy

### Commands

| What | Command | Notes |
|---|---|---|
| Install | `npm ci --include=dev` | |
| Dev (full stack) | `npm run dev` | Port 5000. Needs `BADUGI_ALPHA_ENABLED=true` |
| Dev (client only) | `npm run dev:client` | Vite on port 5000 |
| Typecheck | `npm run check` | `tsc` — must be clean |
| Unit/integration | `npm test` | Vitest, `tests/**/*.test.ts` |
| Single test | `npx vitest run tests/<file>.test.ts` | |
| Server tests | `npx vitest run --dir server/__tests__` | NOT in default run |
| Browser tests | `npm run test:browser` | Playwright, `tests/browser/*.spec.ts` |
| Production build | `npm run build` | `script/build.ts` |
| Start production | `npm start` | `node dist/index.cjs` |
| DB push | `npm run db:push` | **Changes live DB. Ask Detroit first.** |

**Full suite (CI):** `npm run check && npm test && npm run test:browser`
CI workflow: `.github/workflows/browser-animation-checks.yml` runs these three on every PR.

### Replit publish (web)

1. Push to GitHub main.
2. In Replit: `git pull` (plain git — **do not use Replit Agent** for git mechanics).
3. Replit auto-builds via `.replit` deployment config: `npm run build` → `node ./dist/index.cjs`.
4. Click **Publish** in Replit UI.
5. Production URL: `https://chaing-gang-poker.replit.app` (also `chainggangpoker.com`).

**What a backend publish updates:** API + web client. **Does NOT update** installed native apps (they bundle UI locally).

### Native builds

**iOS:**
1. Codemagic `ios-release` workflow (`codemagic.yaml`) builds the IPA.
2. Detroit uploads via `.github/workflows/ios-upload.yml` (manual dispatch with `ipa_url` input).
3. Workflow downloads IPA → writes App Store Connect API key → `xcrun altool --upload-app`.

**Android:**
1. Codemagic `android-release` workflow builds the AAB.
2. Release via Play Publishing API (service account key at `~/workspace/cgp-builds/play-publisher-key.json`, uploader at `~/workspace/cgp-builds/play_upload_v20.py`).
3. **Gotcha:** Egress proxy drops empty-body POSTs to Google — always send a JSON body (`{}`).

**Capacitor config** (`capacitor.config.ts`):
- `appId: 'com.dgmentertainment.poker'`
- `webDir: 'dist/public'`
- **No `server.url`** — native apps load UI from the local bundle, NOT from the server. This is why backend publishes don't update native app UI.
- `VITE_API_BASE_URL` must be set at build time (Codemagic vars) so API calls hit production. Fallback to `https://chainggangpoker.com` if missing.

---

## 9. Gotchas

### Naming inconsistencies
- **"FLUSH RUSH" vs "Flushed Up":** The mode ID is `flushedup`, the display name is "Flushed Up". Some code (older headers, help text) says "FLUSH RUSH". The canonical name is **Flushed Up**. (Being fixed on `milo/reskin-fixes`.)
- **Box Chevy route** is `/box-chevy` but the mode ID in some contexts is `box_chevy` or `boxchevy`. Check `shared/analytics.ts` → `analyticsMode()` for the normalization map.
- **`MemStorage` is Postgres-backed.** The name is historical. Don't assume in-memory.

### Legacy shims (do not remove without checking)
- **Retired-mode dual-send** (`server/genericEngine.ts`): `mode:retired` + legacy `mode:error`. Old native clients (iOS b13, Android vc28) need the legacy message to exit cleanly. Remove only after new native builds ship and old clients age out.
- **Legacy `mode:error` for rebuy:** `rooms.ts` has a legacy rebuy path (`parseLegacyRebuyAmount`) for old clients.
- **`replit.md` says Prisma** — it's wrong. The ORM is Drizzle. Don't follow `replit.md` for DB work.

### Test quirks
- Tests in `server/__tests__/` are **NOT** in the default `npm test` run. Run explicitly with `npx vitest run --dir server/__tests__`.
- New tests go in `tests/` as `<name>.test.ts` so CI picks them up.
- Playwright needs the pre-installed Chromium in the sandbox. Don't run `playwright install`.
- 2 integration tests are skipped by default (need live infra).

### Game logic landmines
- **Raise cap:** Hard cap of 3 raises per betting round (4 heads-up), enforced for bots AND humans. In `shared/engine/bettingTurns.ts`.
- **Chip sync:** Player chips sync to DB at end of every hand + on disconnect. `lastChipSyncHand` is seeded to `table.handId` at join — a pre-hand-end disconnect must never overwrite DB with a placeholder.
- **Bonus chips:** Daily/hourly/starter bonuses MUST call `POST /api/players/:id/bonus-chips` to persist to DB. Without this, bonuses are silently lost on refresh (localStorage only).
- **Server-restart reconnects:** If `sessionStats` are absent (server restarted), chips reload from DB when phase is `WAITING`/`ANTE`. Mid-hand reconnects trust live table chips.
- **Badugi DECLARE auto-fold:** Players without a valid Badugi are auto-folded but return for rollover hands. Voluntary folders stay out.
- **Turn timers:** 15s. Server enforces auto-action on timeout. Client renders countdown from `turnDeadline`.
- **Lady Luck internal accounts:** Never treat `__ladyluck_house__` or `bot_*` as regular players. `isInternalChipAccount()` is the guard. The guest-reset job, admin tools, and any chip operations must exclude them.

### Reskin notes
- All reskin CSS is in `client/src/yard-reskin.css`, prefixed `yard-`. Don't put theme styles in `index.css`.
- `TableBoard` is presentational — game logic lives in per-game containers.
- Per-game accent colors: Badugi `#8B5CF6`, Flushed Up `#D946EF`, Box Chevy `#F97316`. Set via `--table-accent` CSS var.
- **Weekly Missions** shows an empty state — the API only provides daily quests + career milestones, not weekly data. Adding weekly data is a backend/API decision.
- The `"?"` buttons on home game cards are placeholders (being removed on `milo/reskin-fixes`).
- Lady Luck keeps its race interface — the reskin does NOT touch it.

### Mobile/Capacitor
- `VITE_API_BASE_URL` must be set at Codemagic build time. There's a production fallback but don't rely on it.
- `VITE_SHARE_ORIGIN` for invite links in mobile builds.
- iOS Safari private browsing throws on `localStorage.setItem` — `session.ts` has an in-memory fallback.
- Push: Firebase "Chain Gang Poker" project (`chain-gang-poker-b7a08`). APNs `.p8` uploaded. Physical-device delivery confirmed.

### Money rules (Detroit's standing orders)
- **Never** change IAP products, prices, or chip economy numbers (buy-ins, bonuses, rewards, payouts) without asking.
- **Never** run `npm run db:push` against production without asking.
- **Never** use paid services or upgrade tiers without asking.
- Gameplay/business-logic changes require Detroit's decision. Visual/layout fixes don't.

---

## Quick Reference: "Where do I change X?"

| I want to... | Look at... |
|---|---|
| Change Badugi rules | `shared/modes/badugi.ts` (mode) + `server/gameEngine.ts` (engine) |
| Change Flushed Up / Box Chevy rules | `shared/modes/flushedUp.ts` / `boxchevy.ts` + `server/flushedUpEngine.ts` / `boxChevyEngine.ts` |
| Change Lady Luck rules | `server/ladyluckEngine.ts` + `shared/modes/ladyluck.ts` |
| Add a WS message type | `server/rooms.ts` (`ClientMessage` union + handler) |
| Add a REST endpoint | `server/routes.ts` |
| Change DB schema | `shared/schema.ts` → `npm run db:generate` → migration in `migrations/` |
| Change table UI | `client/src/components/game/TableBoard.tsx` + `yard-reskin.css` |
| Change home/missions/chips UI | `client/src/pages/Home.tsx` + `yard-reskin.css` |
| Change bot behavior | `shared/modes/*/botAction()` + `server/utils/botUtils.ts` |
| Change chip rewards/bonuses | **Ask Detroit first.** Then `server/routes.ts` + `client/src/lib/retention.ts` |
| Debug WS issues | Server logs: `[CGP][server]`, `[WS AUTH]`, `[WS AUTHZ]` prefixes |
| Debug Lady Luck funding | Server logs: `[LL]` prefix. Check `chip_transactions` ledger. |
