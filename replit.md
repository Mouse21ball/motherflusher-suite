# Poker Variant Engine

## Overview
A client-side poker game engine supporting multiple poker variants, built with React + Express. The game logic runs entirely in the browser with mock bot opponents.

## Game Modes
- **Swing Poker (Mother Flusher)**: Route `/` — 5 hole cards, 15-card community board (5 pairs + 5 singles with factor card), draw, declare+bet, high/low/swing showdown
- **Badugi**: Route `/badugi` — 4 hole cards, no community cards, 3 draw rounds, declare (HIGH/LOW/FOLD), final bet round, high/low showdown

## Architecture
- **Frontend**: React + Vite + Tailwind + shadcn/ui, wouter for routing
- **Backend**: Express server serves the Vite dev frontend; no database needed (game is client-side only)
- **Engine**: Shared game engine (`client/src/lib/poker/engine/`) with pluggable game modes (`client/src/lib/poker/modes/`)

## Badugi Phase Flow
`WAITING → ANTE → DEAL → DRAW_1 → BET_1 → DRAW_2 → BET_2 → DRAW_3 → DECLARE → BET_3 → SHOWDOWN`

- DECLARE is a distinct step where players choose HIGH, LOW, or FOLD
- BET_3 is the final betting round after declarations
- Hero sees a Badugi readout badge (green = valid, red = invalid with reason: "Duplicate Rank", "Duplicate Suit", etc.)
- Pot rolls over if no valid badugis are made

## Key Files
- `client/src/lib/poker/modes/badugi.ts` — Badugi game mode + evaluateBadugi function
- `client/src/lib/poker/modes/swing.ts` — Swing Poker game mode
- `client/src/lib/poker/engine/useGameEngine.ts` — Core game engine hook
- `client/src/lib/poker/engine/core.ts` — Deck, dealer, round helpers
- `client/src/lib/poker/types.ts` — Shared types (Player, GameState, GamePhase, etc.)
- `client/src/components/game/` — PlayerSeat, Controls, GameTable, Card, ChatBox
- `client/src/pages/BadugiGame.tsx` — Badugi game page
- `server/index.ts` — Express server entry point
