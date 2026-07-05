---
name: Dead 7 mode gotchas
description: Phase ordering and showdown pot-award pitfalls specific to shared/modes/dead7.ts
---

## Phase array order is the actual turn order
`server/genericEngine.ts`'s `advanceToNextPhase()` steps linearly through `mode.phases` (`phases[(idx + 1) % phases.length]`). There's no separate sequencing config — whatever order the array lists is the order the table plays in. A phase listed out of order (e.g. `DECLARE` before the final bet round) silently changes game rules for every hand without any error, since every phase name in the array is still "valid."

**Why:** Found `DECLARE` sitting before `BET_3` in Dead7's phases array, causing players to declare HIGH/LOW before the final betting round instead of after — looked like "broken split pots" downstream even though the split logic itself was correct.

**How to apply:** When a mode's round-count or turn-order is reported as wrong, check the `phases` array ordering in `shared/modes/<mode>.ts` first before auditing per-phase logic.

## Dead 7 has no SWING declaration
Only `HIGH` and `LOW` are valid Dead7 declarations (see botAction's `DECLARE` branch and the client Dead7 UI). `SWING` exists as a `Declaration` union member but is only used by the (removed) Swing Poker / Mother Flusher mode — don't add SWING-specific pot logic to Dead7 based on a user report; verify first.

## Sole-survivor showdown must award the FULL pot
In `resolveShowdown`, when only one active (non-folded) player remains, they must receive `totalSidePotAmount(sidePots)` in full — not just the sum of side-pot slices they were technically "eligible" for by contribution level. A folded player who contributed more chips than the eventual sole survivor creates a side-pot level the survivor isn't "eligible" for; since nobody else can claim it, awarding only the eligible slices leaves the remainder sitting in the returned `pot` value, which `resetToAnte()` then silently discards once a winner is flagged (`isRollover = pot > 0 && !hadWinner` — false when there's a winner). Net effect: chips vanish from the game on exactly the big/all-in pots that create side pots.
