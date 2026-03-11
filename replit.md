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

## Key Files
- `client/src/pages/Home.tsx` — Mode-select lobby with quick-facts tags and descriptions
- `client/src/pages/Game.tsx` — Swing Poker game page
- `client/src/pages/BadugiGame.tsx` — Badugi game page
- `client/src/pages/Dead7Game.tsx` — Dead 7 game page
- `client/src/pages/Fifteen35Game.tsx` — 15/35 game page
- `client/src/pages/SuitsPokerGame.tsx` — Suits & Poker game page
- `client/src/components/game/GameHeader.tsx` — Shared header across all game pages (mode badge, rules drawer, lobby link, chip stack). Contains MODE_INFO with full rules text for each mode.
- `client/src/lib/poker/modes/badugi.ts` — Badugi game mode + evaluateBadugi
- `client/src/lib/poker/modes/swing.ts` — Swing Poker game mode (DO NOT EDIT)
- `client/src/lib/poker/modes/dead7.ts` — Dead 7 game mode + evaluateDead7
- `client/src/lib/poker/modes/fifteen35.ts` — 15/35 game mode
- `client/src/lib/poker/modes/suitspoker.ts` — Suits & Poker game mode
- `client/src/lib/poker/engine/useGameEngine.ts` — Core game engine hook
- `client/src/lib/poker/engine/core.ts` — Deck, dealer, round helpers
- `client/src/lib/poker/types.ts` — Shared types
- `client/src/lib/poker/engine/types.ts` — GameMode interface
- `client/src/components/game/` — GameTable (DO NOT EDIT), BadugiTable, SuitsPokerTable, PlayerSeat, Card, Controls, ChatBox, DiscardPile

## Engine Details
- `processActionEnd` uses proper `isRoundOver` logic: betting phases require `allActed && allBetsMatch`; draw/declare/hit phases require only `allActed`. This correctly handles re-raises.
- Controls renders SHOWDOWN/REVEAL/DEAL phases before the `!isMyTurn` guard so all players see correct status regardless of turn.
- The 8s auto-reset timer guards with `phase !== 'SHOWDOWN'` to prevent double-reset when hero clicks "Next Hand" first.
- 15/35 bot messages do NOT include hidden card totals (information integrity).

## Constraints
- `swing.ts` and `GameTable.tsx` must never be modified
- All game logic is client-side only
- 4 bot players (Alice, Bob, Charlie) + 1 hero (You)
- Mobile-first design with 5-player ring seating
