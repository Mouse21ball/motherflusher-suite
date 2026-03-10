# Poker Table

## Overview
A client-side poker game platform supporting multiple poker variants, built with React + Express. Game logic runs entirely in the browser with 4 mock bot players (max 5 seats).

## Routes
- `/` — Home / mode-select lobby
- `/swing` — Mother Flusher (Swing Poker)
- `/badugi` — Badugi
- `/dead7` — Dead 7
- `/fifteen35` — 15 / 35

## Game Modes
- **Mother Flusher (Swing Poker)**: 5 hole cards, 15-card community board (5 pairs + 5 singles with factor card), draw, declare+bet (HIGH/LOW/SWING), showdown
- **Badugi**: 4 hole cards, no community cards, 3 draw rounds, declare (HIGH/LOW/FOLD), final bet round, hi-lo showdown
- **Dead 7**: 4 hole cards, 3 draw rounds (3/2/1 max discards), declare (HIGH/LOW/FOLD), bet, showdown. Any 7 kills hand. HIGH needs all cards ≥8 (ace is low only). LOW needs all cards ≤6. Flush scoops pot; badugi scoops if no flush; otherwise normal hi-lo split. Best high: K-Q-J-10, best low: A-2-3-4.
- **15 / 35**: 2-card deal (1 up, 1 down), blackjack-style hit/stay/fold rounds with betting between. A=1 or 11, J/Q/K=0.5, 2-10=face. LOW qualifies 13-15 (15 best), HIGH qualifies 33-35 (35 best), >35 = bust. No declaration; auto-read at showdown. Split pot if both sides qualify; sole side wins all; no qualifiers = rollover.

## Architecture
- **Frontend**: React + Vite + Tailwind + shadcn/ui, wouter for routing
- **Backend**: Express server serves the Vite dev frontend; no database needed (game is client-side only)
- **Engine**: Shared game engine (`client/src/lib/poker/engine/`) with pluggable game modes (`client/src/lib/poker/modes/`)

## Badugi Phase Flow
`WAITING → ANTE → DEAL → DRAW_1 → BET_1 → DRAW_2 → BET_2 → DRAW_3 → DECLARE → BET_3 → SHOWDOWN`

## Payout Rules
- Folded players excluded from winner pools
- Sole active player wins full pot regardless of hand quality
- If both HIGH and LOW qualify, pot splits (odd chip to HIGH)
- If only one side qualifies, that side gets the full pot
- Rollover only when no qualifying hand exists anywhere

## 15/35 Phase Flow
`WAITING → ANTE → DEAL → BET_1 → HIT_1 → BET_2 → HIT_2 → ... → SHOWDOWN`
(up to 8 HIT/BET rounds; `getNextPhase` skips to SHOWDOWN when all players have stayed/folded/busted)

## Key Files
- `client/src/pages/Home.tsx` — Mode-select lobby
- `client/src/pages/Game.tsx` — Swing Poker game page
- `client/src/pages/BadugiGame.tsx` — Badugi game page
- `client/src/pages/Dead7Game.tsx` — Dead 7 game page
- `client/src/pages/Fifteen35Game.tsx` — 15/35 game page
- `client/src/lib/poker/modes/badugi.ts` — Badugi game mode + evaluateBadugi
- `client/src/lib/poker/modes/swing.ts` — Swing Poker game mode
- `client/src/lib/poker/modes/dead7.ts` — Dead 7 game mode + evaluateDead7
- `client/src/lib/poker/modes/fifteen35.ts` — 15/35 game mode
- `client/src/lib/poker/engine/useGameEngine.ts` — Core game engine hook
- `client/src/lib/poker/engine/core.ts` — Deck, dealer, round helpers
- `client/src/lib/poker/types.ts` — Shared types (includes HIT_1-8, BET_4-8 phases, STAY/BUST declarations)
- `client/src/lib/poker/engine/types.ts` — GameMode interface (includes optional getNextPhase for custom phase routing)
- `client/src/components/game/` — GameTable, BadugiTable, PlayerSeat, Card, Controls, ChatBox, DiscardPile
