# Poker Table

## Overview
A client-side poker game platform supporting five custom poker variants, built with React + Express. Game logic runs entirely in the browser with 4 mock bot players (max 5 seats). Unified launch-shell with shared GameHeader, rules drawer, and polished lobby.

## Routes
- `/` — Home / mode-select lobby
- `/swing` — Mother Flusher (Swing Poker)
- `/badugi` — Badugi
- `/dead7` — Dead 7
- `/fifteen35` — 15 / 35
- `/suitspoker` — Suits & Poker

## Game Modes
- **Mother Flusher (Swing Poker)**: 5 hole cards, 15-card community board (5 pairs + 5 singles with factor card), draw, declare+bet (HIGH/LOW/SWING), showdown
- **Badugi**: 4 hole cards, no community cards, 3 draw rounds, declare (HIGH/LOW/FOLD), final bet round, hi-lo showdown
- **Dead 7**: 4 hole cards, 3 draw rounds (3/2/1 max discards), declare (HIGH/LOW/FOLD), bet, showdown. Any 7 kills hand. HIGH needs all cards ≥8 (ace is low only). LOW needs all cards ≤6. Flush scoops pot; badugi scoops if no flush; otherwise normal hi-lo split.
- **15 / 35**: 2-card deal (1 up, 1 down), blackjack-style hit/stay/fold rounds with betting between. A=1 or 11, J/Q/K=0.5, 2-10=face. LOW qualifies 13-15 (15 best), HIGH qualifies 33-35 (35 best), >35 = bust. No declaration; auto-read at showdown. Split pot if both sides qualify; sole side wins all; no qualifiers = rollover.
- **Suits & Poker**: 5 hole cards, 12-card community board (Side A 3 + Side B 3 + Center 3-2-1 path). Draw 0-2 cards. Reveal in stages. Declare+bet (POKER/SUITS/SWING). Legal paths: (A+Center) or (B+Center), never A+B mixed. Swing must win both poker and suits on the SAME path.

## Architecture
- **Frontend**: React + Vite + Tailwind + shadcn/ui, wouter for routing
- **Backend**: Express server serves the Vite dev frontend; no database needed (game is client-side only)
- **Engine**: Shared game engine (`client/src/lib/poker/engine/`) with pluggable game modes (`client/src/lib/poker/modes/`)

## Local Identity (Closed Alpha)
- **WelcomeGate** (`client/src/components/WelcomeGate.tsx`): wraps the entire Router in App.tsx. On first visit (no `poker_table_player_name` in localStorage), shows a closed-alpha welcome screen explaining the test group and asking for a display name (2–16 chars). After entry, the name is saved and the app loads normally. Returning users skip straight to the lobby.
- Display name is stored as a plain string in `localStorage` key `poker_table_player_name`.
- `persistence.ts` exports `getPlayerName()` and `setPlayerName()`.
- The hero player name in `createMockPlayers` reads from `getPlayerName()` (falls back to 'You').
- Home page shows the player name below the title.
- No passwords, emails, cloud accounts, or multiplayer auth. Device-local only.

## Phase Flows
- **Badugi/Dead7**: `WAITING → ANTE → DEAL → DRAW_1 → BET_1 → DRAW_2 → BET_2 → DRAW_3 → DECLARE → BET_3 → SHOWDOWN`
- **15/35**: `WAITING → ANTE → DEAL → BET_1 → HIT_1 → BET_2 → ... → SHOWDOWN` (up to 8 HIT/BET rounds; skips to SHOWDOWN when all stayed/busted)
- **Suits & Poker**: `WAITING → ANTE → DEAL → REVEAL_TOP_ROW → DRAW → BET_1 → REVEAL_SECOND_ROW → BET_2 → REVEAL_LOWER_CENTER → BET_3 → REVEAL_FACTOR_CARD → DECLARE_AND_BET → SHOWDOWN`

## Payout Rules
- Folded players excluded from winner pools
- Sole active player wins full pot regardless of hand quality
- If both HIGH and LOW (or POKER and SUITS) qualify, pot splits (odd chip to HIGH/POKER)
- If only one side qualifies, that side gets the full pot
- Rollover only when no qualifying hand exists anywhere

## Persistence
- **Chip balances** persist per mode in localStorage (`poker_table_chips`). Hero starts at $1000 per mode; saved after every showdown and rollover-winner event.
- **Hand history** stored in localStorage (`poker_table_history`), last 50 hands. Each record includes: mode, timestamp, pot size, chip change, result type (win/loss/push/rollover/folded), and summary text.
- **Rebuy**: When hero reaches $0, a "Rebuy $1000" button appears at SHOWDOWN and WAITING phases. Rebuy resets that mode's saved balance to $1000.
- **Lobby displays**: Per-mode chip balance shown on each mode card; global hand count and net result shown above mode list with access to full history drawer.
- `client/src/lib/persistence.ts` — localStorage read/write for chips and hand history (getChips, saveChips, getAllChips, getHandHistory, addHandRecord, resetChips, resetAllData). All setItem calls wrapped in try/catch via `safePersist()` to prevent QuotaExceededError crashes.

## Bot AI
- **Shared utility** (`client/src/lib/poker/engine/botUtils.ts`): `decideBet()` — pot-odds-aware betting with strength-based fold/check/call/raise thresholds, occasional bluffs (~8%), and proper raise sizing relative to pot. `applyBetDecision()` — translates a decision into state updates. Used by all 4 editable modes.
- **Badugi**: Stand pat with valid badugi; otherwise discard conflicting cards (low-first greedy, capped by draw round limits). Strength: valid badugi ≤5 = 0.92, ≤7 = 0.75, ≤9 = 0.55, ≤11 = 0.4, ≤13 = 0.3; 3-card partial = 0.18; junk = 0.06. Declare HIGH ≥9, LOW ≤8, FOLD if invalid.
- **Dead 7**: Always discard 7s first, then duplicate ranks, then wrong-side cards. Strength: flush = 0.95, badugi = 0.85, valid high/low ball = 0.35-0.65 (scaled by kicker quality), 3-of-target partial = 0.15, dead = 0.02. Declare based on hand qualification.
- **15/35**: Hit/stay considers bust probability — always stay at qualifying ranges (13-15, 33-35), always hit ≤11; at 28-32 calculates danger-card count vs remaining deck and uses bust-risk weighting with card-count awareness. Strength: perfect 15/35 = 0.9, near-perfect = 0.7, qualifying = 0.5, close-to-qualifying = 0.15-0.25, far away = 0.08.
- **Suits & Poker**: Draw keeps poker-contributing cards (pair+), suits-contributing cards (score > 25), and same-suit groups of 3+. Declaration: SWING only with two-pair+ AND suits ≥ 45 (or decent poker + strong suits at 30% chance). SWING strength uses min(poker, suits) instead of average, making SWING appropriately risky. Betting via shared utility.
- **Swing**: Random draw/declare (swing.ts is read-only).

## Onboarding & Phase Hints
- **ModeIntro overlay**: First-visit overlay per mode showing objective + 4-step flow. Stored in localStorage (`poker_table_intro_seen`). Dismissable, only shows once per mode.
- **Phase hints**: Contextual 1-line tips shown in the Controls area during draw, declare, hit, and betting phases. Mode-specific. Defined in `client/src/lib/phaseHints.ts`.

## Sound & Animation System
- **Sounds** (`client/src/lib/sounds.ts`): Web Audio API synthesized — cardDeal, cardFlip, chipClink, fold, win, lose, check, declare, reveal.
- **Phase sounds** (`client/src/lib/usePhaseSounds.ts`): Hook that plays sounds on phase transitions (deal, reveal, showdown, ante).
- **CSS animations** (`client/src/index.css`): card-deal-in, card-flip, chip-toss, winner-glow, loser-fade, pot-collect, reveal-flash with `.anim-*` utility classes.

## Key Files
- `client/src/pages/Home.tsx` — Mode-select lobby with per-mode chip balances and global history access
- `client/src/pages/Game.tsx` — Swing Poker game page
- `client/src/pages/BadugiGame.tsx` — Badugi game page
- `client/src/pages/Dead7Game.tsx` — Dead 7 game page
- `client/src/pages/Fifteen35Game.tsx` — 15/35 game page
- `client/src/pages/SuitsPokerGame.tsx` — Suits & Poker game page
- `client/src/components/game/GameHeader.tsx` — Shared header across all game pages (mode badge, rules drawer, history drawer, lobby link, chip stack). Contains MODE_INFO with full rules text for each mode.
- `client/src/components/game/ModeIntro.tsx` — First-visit intro overlay with MODE_INTROS data for each mode.
- `client/src/components/game/HandHistory.tsx` — Hand history Sheet drawer with per-mode filtering, net result summary, and per-hand detail rows.
- `client/src/lib/persistence.ts` — localStorage persistence for chips and hand history.
- `client/src/lib/phaseHints.ts` — Contextual phase hints per mode, shown during gameplay.
- `client/src/lib/sounds.ts` — Web Audio API sound effects.
- `client/src/lib/usePhaseSounds.ts` — Phase transition sound hook.
- `client/src/lib/poker/modes/badugi.ts` — Badugi game mode + evaluateBadugi
- `client/src/lib/poker/modes/swing.ts` — Swing Poker game mode (DO NOT EDIT)
- `client/src/lib/poker/modes/dead7.ts` — Dead 7 game mode + evaluateDead7
- `client/src/lib/poker/modes/fifteen35.ts` — 15/35 game mode
- `client/src/lib/poker/modes/suitspoker.ts` — Suits & Poker game mode
- `client/src/lib/poker/engine/useGameEngine.ts` — Core game engine hook (initializes from saved chips, records history at showdown)
- `client/src/lib/poker/engine/core.ts` — Deck, dealer, round helpers
- `client/src/lib/poker/types.ts` — Shared types
- `client/src/lib/poker/engine/types.ts` — GameMode interface
- `client/src/components/game/` — GameTable (DO NOT EDIT), BadugiTable, SuitsPokerTable, PlayerSeat, Card, Controls, ChatBox, DiscardPile

## Engine Details
- `processActionEnd` uses proper `isRoundOver` logic: betting phases require `allActed && allBetsMatch`; draw/declare/hit phases require only `allActed`. This correctly handles re-raises.
- Controls renders SHOWDOWN/REVEAL/DEAL phases before the `!isMyTurn` guard so all players see correct status regardless of turn. ANTE phase is NOT forced as isMyTurn; the hero sees "Waiting..." until it's actually their turn to ante.
- The 8s auto-reset timer guards with `phase !== 'SHOWDOWN'` to prevent double-reset when hero clicks "Next Hand" first.
- 15/35 bot messages do NOT include hidden card totals (information integrity).
- All nested `setTimeout` calls in `useGameEngine` use `safeTimeout()` which auto-cancels on unmount via `mountedRef` + `pendingTimers` ref set, preventing stale state updates when navigating away mid-hand.
- **All-in during HIT phases**: Players with 0 chips are NOT skipped during HIT phases (they can still hit/stay). `skipAllIn` is false for HIT, DRAW, and DECLARE phases. Controls shows Hit/Stay/Fold buttons during HIT phases regardless of chip count (all-in auto-check only applies to BET phases).
- **Bot failsafe**: If `activePlayerId` points to a non-active (folded/busted) player, the engine automatically advances to the next valid player or triggers phase advance instead of freezing.
- **Two-player auto-stay (15/35)**: When exactly 2 active players remain and one has STAY with a qualifying hand on one side (LOW or HIGH), the other player auto-stays when they hit into a qualifying hand on the opposite side. Implemented via `checkAutoStay` method on GameMode interface.
- **LOW winner sort (15/35)**: Among LOW qualifiers (13-15), highest total wins (15 is best). Sort is descending by total.

## Stats View
- `StatsView` component (`client/src/components/game/StatsView.tsx`): Sheet drawer showing computed stats from hand history.
- Available from GameHeader (per-mode stats) and Home lobby (overall stats).
- Stats computed: hands played, wins, losses, folds, rollovers, pushes, win rate, net result, biggest win/loss/pot, current stack.
- Overall view includes per-mode breakdown with bar charts showing hands played and net result per mode.

## Toast Notifications
- `useGameToasts` hook (`client/src/lib/useGameToasts.ts`): Fires unobtrusive toasts on key game events.
- Events: win notifications, big pot alerts (>$20), rollover announcements, rebuy confirmation (detects 0→1000 chip change), hot streak alerts (+$100 session gain), hand count milestones (10/25/50).
- Wired into all 5 game pages. Uses existing shadcn/ui Toaster with TOAST_LIMIT=3, auto-dismiss after 3-4s.

## Exit Confirmation
- GameHeader's Lobby button checks if the current phase is mid-hand (any phase except WAITING/SHOWDOWN).
- Mid-hand exit shows an AlertDialog warning about forfeiting the current hand and pot claim.
- On confirm, saves the hero's current chip balance (forfeiting any chips already in the pot) and navigates to lobby.
- Safe phases (WAITING, SHOWDOWN) navigate directly without warning.
- GameHeader accepts optional `phase`, `pot`, and `onForfeit` props from game pages.

## Analytics
- **Database**: PostgreSQL via Drizzle ORM. Single `analytics_events` table with columns: `id` (serial PK), `event_type` (text), `player_id` (text), `mode` (text, nullable), `duration_ms` (int, nullable), `event_date` (text YYYY-MM-DD), `created_at` (timestamp).
- **Schema**: `shared/schema.ts` defines `analyticsEvents` table + insert schema.
- **DB connection**: `server/db.ts` — Drizzle + pg pool using `DATABASE_URL`.
- **Storage**: `server/storage.ts` — `insertAnalyticsEvent()` and `getDailyStats(days)` methods on `MemStorage` (which now also writes to DB for analytics).
- **API routes** (`server/routes.ts`):
  - `POST /api/analytics/track` — accepts `{eventType, playerId, mode?, durationMs?}`, writes to DB, returns 204.
  - `GET /api/analytics/stats` — returns last 30 days of aggregated daily stats (DAU, sessions, avg duration, mode breakdown, returning players).
- **Client tracker** (`client/src/lib/analytics.ts`): Invisible module initialized once in `App.tsx`. Generates a persistent anonymous `analytics_id` in localStorage. Fires `session_start` on load, `session_end` on unload/visibility-hidden (with duration). Uses `navigator.sendBeacon` for reliable unload tracking. Each game page fires `trackModePlay(modeId)` on mount.
- **Admin view**: `/admin` — plain-numbers dashboard showing today's DAU, session count, avg session length, mode breakdown, and 30-day daily table with retention column. Auto-refreshes every 30s. Link back to lobby.

## Constraints
- `swing.ts` must never be modified; `GameTable.tsx` visual-only edits permitted (no game logic changes)
- All game logic is client-side only
- 4 bot players (Alice, Bob, Charlie) + 1 hero (You)
- Mobile-first design with 5-player ring seating
