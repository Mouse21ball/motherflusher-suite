---
name: Table streak ownership
description: Why per-seat streaks require private owner binding and seat reservation after restoration.
---

Persisted table streaks must remain bound to the identity that earned them. On restore, a new arrival must skip another identity's reserved seat even though no socket is connected. An unverifiable old streak must not be assigned to an arbitrary claimant.

**Why:** A process restart clears in-memory seat/session maps. If allocation simply uses the first vacant socket, someone arriving before the original player can erase or inherit that player's streak.

**How to apply:** Keep ownership metadata in persisted server state but remove it from client snapshots. Match returning identities to their old seats before choosing unowned seats; clear ownership on leave/expiry. Only a positive server-confirmed award advances a streak, not an unpaid winner flag.