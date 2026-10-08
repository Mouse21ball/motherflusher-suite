---
name: Lady Luck house economics
description: Why bot bankrolls and the house reserve are tracked separately.
---

Treat each Lady Luck bot stack as house-owned chips temporarily held in that bot's ledger account, not as free or virtual chips. The house reserve is only the unallocated portion; a chip-conservation check must include player accounts, bot accounts, the reserve, and any unsettled main pot.

**Why:** The user chose auditable house-funded bots so bot wagers and wins have the same accounting as players, without silently minting chips. Future paid chip packs may require different subsidies or stakes; do not quietly switch back to virtual bot money.

**How to apply:** When changing Lady Luck funding, settlement, recovery, or rebuys, preserve double-entry movements between the reserve and bot accounts and check the aggregate across multiple hands.

Internal house and bot ledger accounts must be excluded from guest-account lifecycle resets even though they have no login credentials.

**Why:** Production guest resets erased the Lady Luck reserve, reducing it to a normal guest allowance; subsequent bot transfers ran out of funds and stalled solo lobbies.

**How to apply:** Apply this boundary to both reset candidate selection and the actual mutation, including background-job defenses. Historical reserve recovery must reverse only recorded reset adjustments, be serialized and idempotent, and never replenish genuine game losses.