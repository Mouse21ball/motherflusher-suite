---
name: Poker wallet accounting
description: The accounting boundary between the shared poker wallet, partial table stacks, and hand/leave settlement.
---

Keep the existing poker total-wallet model consistent: a partial table stack allocates chips already included in the persisted wallet. Join must not debit that principal and then allocate again from the remaining balance. Gameplay changes the total through persisted deltas. Reserve-to-stack transfers are not profit or new grants; externally funded grants must be recorded separately.

**Why:** Mixing a buy-in debit with delta-based hand settlement double-deducts the buy-in and can lose reserved chips or produce a negative wallet. Refunding client-declared principal on leave creates a minting exploit. Moving poker to escrow would require a separate durable, atomic reservation design, not a transient map.

**How to apply:** Preserve additive wallet credits while settling gameplay; account for current-hand losses on intentional leave even if a prior hand was synced. A table-leave acknowledgement must follow successful, retry-safe persistence, and navigation/home refresh must follow that acknowledgement. Treat Lady Luck's separately implemented escrow accounting as a different boundary rather than changing it incidentally.