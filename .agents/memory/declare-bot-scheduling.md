---
name: DECLARE phase bot scheduling
description: Bot botAction() for DECLARE phases must return a valid nextPlayerId, not undefined, or multi-bot declare stalls.
---

After a bot fires its DECLARE action, the engine at executeBotAction() dispatches:
- `if (roundOver)` → advance phase
- `else if (nextPlayerId)` → update activePlayerId + scheduleNextBot
- else → nothing (stall!)

If a mode's botAction() returns `{ ..., nextPlayerId: undefined }` for the DECLARE case and roundOver=false (more bots still need to declare), the engine does nothing — no subsequent bots are scheduled.

**Why:** DECLARE is logically simultaneous but bots execute sequentially. Each bot action must hand off to the next undeclared active player via nextPlayerId.

**How to apply:** In any game mode with a DECLARE phase, the bot action for DECLARE must compute:
```typescript
const roundOver = activePlayers.every(p => p.hasActed);
let nextPlayerId: string | undefined;
if (!roundOver) {
  const nextUndeclared = newPlayers.find(p => p.status === 'active' && !p.hasActed);
  nextPlayerId = nextUndeclared?.id;
}
return { stateUpdates: { players: newPlayers }, message, roundOver, nextPlayerId };
```

Dead7 avoids this by not having an early return for DECLARE — it falls through to the main return which computes nextPlayerId normally. Kamikaze had an early return that missed this.
