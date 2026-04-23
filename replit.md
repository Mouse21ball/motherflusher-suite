# Chain Gang Poker

## Overview
Chain Gang Poker (CGP) is a premium poker platform built with React + Express. Brand: "Prison rules. No mercy." Five exclusive game modes, all with real multiplayer support for up to 5 players. Bots fill empty seats automatically so games start instantly.

Colors: `#05050A` bg · `#F0B829` gold · `#FF6B00` orange · `#00C896` emerald · `#9B5DE5` purple · `#A0A0B8` silver

## Routes
- `/` — Home lobby (all 5 modes, XP/rank, daily reward, live feed)
- `/badugi` — Badugi (server-authoritative, up to 5 players)
- `/dead7` — Dead 7 (server-authoritative, up to 5 players)
- `/fifteen35` — 15 / 35 (server-authoritative, up to 5 players)
- `/swing` — Mother Flusher / Swing Poker (server-authoritative, up to 5 players)
- `/suitspoker` — Suits & Poker (server-authoritative, up to 5 players)
- `/join/:code` — Universal table join redirect → `/{mode}?t=CODE`
- `/profile` — Player profile (XP, rank, achievements, per-mode stats)
- `/leaderboard` — Daily leaderboard
- `/shop` — Merch shop (clothing, accessories — no payment integration)
- `/terms` — Terms of service
- `/admin` — Admin panel

## Game Modes
- **Badugi**: 4 hole cards, 3 draw rounds, declare (HIGH/LOW/FOLD), bet, showdown. Build perfect 4-suit hand.
- **Dead 7**: 4 hole cards, 3 draw rounds. Any 7 kills hand immediately. Flush scoops; otherwise hi-lo split.
- **15 / 35**: 2-card deal (1 up, 1 down), blackjack-style hit/stay. A=1 or 11, J/Q/K=0.5. LOW: 13-15; HIGH: 33-35.
- **Mother Flusher (Swing Poker)**: 5 hole cards, 15-card board (5 stacked pairs + 5 single factor cards). Declare HIGH/LOW/SWING all.
- **Suits & Poker**: 5 hole cards, 12-card community board. Declare POKER/SUITS/SWING. Legal paths: A+Center or B+Center.

## Player Persistence & Auth
- `player_profiles` DB table: `id` (stable UUID from client localStorage), `displayName`, `chipBalance` (global bankroll), `activeTableId/SeatId/ModeId` (reconnect info), `handsPlayed`, `handsWon`, `lifetimeProfit`, `email` (unique, nullable), `passwordHash` (nullable)
- Auth: Email+password layer on top of guest identity. Password hashing via Node.js `crypto.scrypt` (no external deps). On register: links credentials to existing guest profile. On login: client adopts returned `profileId` as localStorage identity for cross-device restoration.
- Chip sync points: (1) end of every hand in `resetToAnte` (with per-hand `deltaChips` for `lifetimeProfit`), (2) disconnect in `removeBadugiConnection`/`removeGenericConnection`
- Per-hand profit: `chipsAtHandStart` Map in GenericTable tracks chip balance at hand start per seat; delta computed in `resetToAnte` and written to `lifetimeProfit` via SQL increment
- Session stats: `sessionStats` Map in GenericTable tracks `startChips`, `handsPlayed`, `biggestPotWon`, `winStreak`, `lossStreak` per seat (in-memory per session); included in `mode:init` and `mode:snapshot` as `sessionStats` field
- Level formula: `Math.floor(handsPlayed / 50)` — computed on fly in API responses (not stored)
- Join flow: client sends `identityId` (stable UUID) alongside `playerId` (session UUID); server loads canonical chip balance from DB and applies it to seat within 1 async tick
- Anti-exploit: `wasReserved` gate prevents chip reload on in-session reconnects; `lastChipSyncHand` prevents duplicate hand-end syncs; intentional leave (msg.type='leave') calls `removeGenericConnection(..., intentional=true)` — mid-hand seat converts to bot, chips already synced
- API: `POST /api/players`, `GET /api/players/:id`, `GET /api/players/:id/reconnect`, `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me/:profileId`, `GET /api/tables/mode/:modeId/join`

## Architecture
- **Frontend**: React + Vite + Tailwind + shadcn/ui, wouter routing
- **Backend**: Express + WebSocket server (ws) on port 5000
- **Two engine modes**: Server-authoritative (real multiplayer) or client-only fallback
- Feature flag: `BADUGI_ALPHA_ENABLED=true` enables all server-authoritative modes

## Multiplayer Infrastructure
- **Server engines**: `server/gameEngine.ts` (Badugi) and `server/genericEngine.ts` (Dead7/Fifteen35/Swing/SuitsPoker)
- **Seats**: p1-p5 (up to 5 humans per table; bots auto-fill empty seats)
- **Default bot roster**: You (p1/human), Alice (p2), Bob (p3), Charlie (p4/dealer), Daisy (p5)
- **WebSocket protocol**:
  - Badugi: `badugi:init` / `badugi:snapshot` / `badugi:action`
  - All other modes: `mode:init` / `mode:snapshot` / `mode:action`
- **Invite links**: Each game page generates a `?t=TABLEID` URL; InviteBanner on every game page
- **Client hook**: `client/src/lib/poker/engine/useServerMode.ts` — generic WS hook for all non-Badugi modes
- **Join flow**: `/join/:code` → looks up modeId → redirects to `/{mode}?t=CODE`
- **Table persistence**: Badugi tables persist to disk via `server/tablePersistence.ts` (survives restarts)

## Phase Flows
- **Badugi/Dead7**: `WAITING → ANTE → DEAL → DRAW_1 → BET_1 → DRAW_2 → BET_2 → DRAW_3 → DECLARE → BET_3 → SHOWDOWN`
- **15/35**: `WAITING → ANTE → DEAL → BET_1 → HIT_1 → BET_2 → HIT_2 → ... → SHOWDOWN`
- **Suits & Poker**: `WAITING → ANTE → DEAL → REVEAL_TOP_ROW → DRAW → BET_1 → REVEAL_SECOND_ROW → BET_2 → REVEAL_LOWER_CENTER → BET_3 → REVEAL_FACTOR_CARD → DECLARE_AND_BET → SHOWDOWN`

## Key Shared Files
- `shared/gameTypes.ts` — All TypeScript types (GameState, Player, GameMode, etc.)
- `shared/modes/` — Server-side mode definitions (dead7, fifteen35, swing, suitspoker, badugi)
- `shared/engine/core.ts` — Shared engine utilities (createDeck, getNextActivePlayerIndex, etc.)
- `shared/featureFlags.ts` — Code-level feature flags

## UI Components
- `BadugiTable.tsx` — Used by Badugi, Dead7, Fifteen35 — supports 1-5 players dynamically
- `GameTable.tsx` — Used by Mother Flusher (Swing) — 5 fixed seat positions, oval layout
- `SuitsPokerTable.tsx` — Used by Suits & Poker — supports 1-5 players
- `PlayerSeat.tsx` — Generic player seat component
- `Controls.tsx` — Phase-aware action controls
- `ChatBox.tsx` — Real-time chat (server-synced)
- `ReactionBar.tsx` — Emoji reactions (synced to all players)

## Persistence (Client-Side)
- Chip balances per mode in localStorage (`poker_table_chips`)
- Hand history last 50 hands (`poker_table_history`)
- XP and achievements (`poker_table_progression`)
- Player identity (`poker_table_player_id`, `poker_table_player_name`)
- All localStorage writes wrapped in try/catch (QuotaExceededError safe)

## Bot AI
- `shared/engine/botUtils.ts` — `decideBet()` with pot-odds-aware fold/check/call/raise + ~8% bluffs
- Each mode implements `botAction()` with mode-specific draw/declare logic
- Bot think time: 700-1800ms (varies by phase to feel human)
- Bots rebuy to $1000 automatically when busted

## Monetization (Non-Casino)
- **Merch shop** at `/shop` — clothing, accessories (no payment processing integrated)
- **No gambling/casino mechanics** — chips are play-money only, no real-money wagering
- **No Stripe or payment integration** — merch is display-only, ready for future integration

## Environment Variables
- `BADUGI_ALPHA_ENABLED=true` — enables server-authoritative mode for ALL 5 games
- `MODES_ALPHA_ENABLED=true` — alternative flag for generic modes only
- `FEATURES.SERVER_AUTHORITATIVE_BADUGI` — code-level flag in `shared/featureFlags.ts`
