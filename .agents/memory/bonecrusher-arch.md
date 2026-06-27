---
name: Bonecrusher mode architecture
description: Key decisions, gotchas, and wiring for the Bonecrusher game mode
---

## Phase sequence
`DISCARD_2 → REVEAL_1 → BET_1 → STREET_1 → BET_2 → STREET_2 → BET_3 → STREET_3 → BET_4 → SELECT_5 → FLIP_1 → BET_5 → FLIP_2 → BET_6 → FLIP_3 → BET_7 → FLIP_4 → BET_8 → DECLARE → SHOWDOWN`

## Engine wiring (genericEngine.ts)
- `isPhaseRoundOver`: DISCARD_2, SELECT_5, REVEAL_1, FLIP_* extended into the draw-phase branch
- `isRevealPhase`: extended to include STREET_*, DISCARD_2, SELECT_5, FLIP_* — this triggers getAutoTransition + no-bet reset
- SELECT_5 entry clears `table.publicCardIndicesPerPlayer = {}`
- STREET_* auto-transition tracks new card indices into publicCardIndicesPerPlayer
- Bot publicIndices applied from `result.publicIndices` in executeBotAction
- `discard` WS action: for DISCARD_2/SELECT_5, removes cards at indices, remaps pub indices
- `flip` WS action: for REVEAL_1/FLIP_*, adds index to pub, marks hasActed

## TypeScript gotchas
- `phase === 'REVEAL_1'` inside botAction after narrowing causes TS2367 — use `(phase as string) === 'REVEAL_1'`
- `BotPersonalityTraits` has required fields beyond `tier` — use `botPersonality(botId)` not `{ tier }`
- `drawsRemaining` is NOT in `DecideBetOptions` — remove it

## Client files
- `client/src/components/bonecrusher/BonecrusherTable.tsx` — table + card rendering; uses `myId` not `heroId`
- `client/src/components/bonecrusher/BonecrusherActionBar.tsx` — phase-aware action buttons; requires `isMyTurn` prop
- `client/src/components/bonecrusher/BonecrusherShowdown.tsx` — showdown overlay; uses `myId`
- `client/src/pages/BonecrusherGame.tsx` — main page; mirrors KamikazeGame pattern exactly

## Why
- Standard approach mirrors Kamikaze (same useServerMode API, handleAction, BustOutModal, ChatBox patterns)
- SWING declaration is risky — must win both halves or forfeit; resolveShowdown handles disqualification
