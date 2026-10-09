---
name: Lady Luck house economics
description: System-funded bot stakes, ledger boundaries, and lobby recovery.
---

Treat each Lady Luck bot stack as system-funded chips held in that bot's ledger account. Bot stakes must not depend on a permanently finite house balance. Track explicit system grants separately; chip-conservation checks must include those grants, player accounts, bot accounts, the house float, and unsettled pots.

**Why:** The user explicitly replaced the earlier finite-house requirement after drained reserves stalled solo lobbies. They authorized synthetic/system-generated bot funding or an auto-replenishing float, while requiring real player-vs-player conservation to remain untouched.

**How to apply:** Restrict new supply to auditable bot-funding subsidies. Preserve double-entry bot allocation and ordinary player transfers. Never silently fabricate stacks only in table state or replenish an insufficient real-player transfer.

Internal house and bot ledger accounts must be excluded from guest-account lifecycle resets even though they have no login credentials.

**Why:** Production guest resets erased the Lady Luck reserve, reducing it to a normal guest allowance; subsequent bot transfers ran out of funds and stalled solo lobbies.

**How to apply:** Apply this boundary to reset candidate selection and mutations, including background-job defenses. Historical recovery must reverse only recorded resets, be serialized and idempotent, and stay separate from authorized bot-funding subsidies.

A bot-fill warning is not permission to stop retries after a fixed failure limit.

**Why:** The user requires recovery on the normal two-second cadence; stopping after repeated failures recreates the solo-lobby soft-lock even if an error has been displayed.

**How to apply:** Preserve retries while the lobby has a connected player, cancel them on leave/start, and retain a visible exit. Review incoming hardening changes against this requirement.