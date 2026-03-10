# Poker Table

## Overview
A client-side poker game platform supporting multiple poker variants, built with React + Express. Game logic runs entirely in the browser with 4 mock bot players (max 5 seats).

## Routes
- `/` — Home / mode-select lobby
- `/swing` — Mother Flusher (Swing Poker)
- `/badugi` — Badugi

## Game Modes
- **Mother Flusher (Swing Poker)**: 5 hole cards, 15-card community board (5 pairs + 5 singles with factor card), draw, declare+bet (HIGH/LOW/SWING), showdown
- **Badugi**: 4 hole cards, no community cards, 3 draw rounds, declare (HIGH/LOW/FOLD), final bet round, hi-lo showdown

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

## Key Files
- `client/src/pages/Home.tsx` — Mode-select lobby
- `client/src/pages/Game.tsx` — Swing Poker game page
- `client/src/pages/BadugiGame.tsx` — Badugi game page
- `client/src/lib/poker/modes/badugi.ts` — Badugi game mode + evaluateBadugi
- `client/src/lib/poker/modes/swing.ts` — Swing Poker game mode
- `client/src/lib/poker/engine/useGameEngine.ts` — Core game engine hook
- `client/src/lib/poker/engine/core.ts` — Deck, dealer, round helpers
- `client/src/lib/poker/types.ts` — Shared types
- `client/src/components/game/` — GameTable, BadugiTable, PlayerSeat, Card, Controls, ChatBox, DiscardPile
