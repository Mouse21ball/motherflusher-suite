---
name: Authoritative table effects
description: Rules for visualizing bets, payouts, and folds without duplicating server game logic.
---

Table effects must compare consecutive authoritative snapshots and animate only observed deltas: bet increases for seat-to-pot travel, positive winner chip deltas for pot payouts, and status transitions into folded for mucking.

**Why:** Recomputing bets or split-pot shares in the client can disagree with side pots, odd-chip allocation, rollover rules, or a newer server snapshot.

**How to apply:** Keep displayed balances immediate and authoritative. Treat flights as temporary overlays, create one payout flight per server-marked winner with that winner's observed chip increase, and suppress effects when the authoritative delta is absent.

Showdown overlays should not cover payout travel the instant the winning snapshot arrives.

**Why:** A fixed full-screen reveal can make a correct table-level payout flight completely invisible.

**How to apply:** Sequence the reveal after the short payout flight while keeping the underlying showdown state and winner fields authoritative.