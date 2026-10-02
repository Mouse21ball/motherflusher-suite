---
name: Poker wallet accounting
description: The accounting boundary between the shared poker wallet, partial table stacks, and hand/leave settlement.
---

Keep the existing poker total-wallet model consistent: a partial table stack allocates chips already included in the persisted wallet. Join must not debit that principal and then allocate again from the remaining balance. Gameplay changes the total through persisted deltas. Reserve-to-stack transfers are not profit or new grants; externally funded grants must be recorded separately.

Serialize asynchronous financial updates with automatic hand starts as well as player actions. JavaScript's single-threaded event loop does not prevent a timer from advancing a hand while a database operation is awaiting completion.

**Why:** Mixing a buy-in debit with delta-based hand settlement double-deducts the buy-in and can lose reserved chips or produce a negative wallet. Refunding client-declared principal on leave creates a minting exploit. Moving poker to escrow would require a separate durable, atomic reservation design, not a transient map.

A durable free grant can succeed while a timer changes the hand, causing a later state check to reject its stack credit. The player then has wallet chips but no usable table stack, and retrying the grant cannot safely mint another award.

**How to apply:** Preserve additive wallet credits while settling gameplay; account for current-hand losses on intentional leave even if a prior hand was synced. A table-leave acknowledgement must follow successful, retry-safe persistence. Normal online exits should await that acknowledgement, but failed or unavailable settlement must never prevent local lobby navigation. Never fabricate wallet credits or describe the fallback as confirmed settlement. Treat Lady Luck's separately implemented escrow accounting as a different boundary rather than changing it incidentally.

The user treats “player cannot get back to the lobby” as a severity-critical bug class. Every joining, playing, watching, disconnected, rejected, timed-out, and broken-render state needs an independent, network-free lobby escape; reconnect retries must not postpone the deadline indefinitely.

**Why:** A player was stranded on a dead table after connection failure and had to force-close the app.