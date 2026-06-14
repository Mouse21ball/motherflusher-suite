---
name: Spectator Mode — Lady Luck
description: Architecture decisions for LadyLuck spectator mode with side bets.
---

## Rule
Spectators live in `meta.spectators: Map<string, LLSpectator>` — separate from `meta.connections` (players). Never mix the two maps.

**Why:** Players need seat-ownership auth and chip sync; spectators just watch and have optional side bets with a flat 100–2000 chip range regardless of room tier.

## How to apply
- `broadcastState()` syncs `meta.state.spectatorCount = meta.spectators.size` then sends the state payload to BOTH maps (connections + spectators).
- WS close handler in rooms.ts checks `spectatorTableId` first; if set, calls `handleLLSpectatorLeave` instead of `handleLLDisconnect`.
- Spectator side bets: validated BET/WAGER phase only, debited immediately via `debitChipsForBuyin`, stored in `spectator.sideBet`, cleared in `resolveRace`.
- Spectator payout in `resolveRace`: 2.5× gross with 5% rake via `applyRake(gross)`, logged under `gameMode: 'spectator_sidebet'`.
- Client route `/ladyluck/spectate?t=TABLEID` (must come before `/ladyluck` in App.tsx Switch).
- `getLLActiveTables` returns `isFull: boolean` — true when all 4 slots are non-open and phase ≠ LOBBY. Client hook `useLLRoomData` picks first full table per room for the WATCH button.
