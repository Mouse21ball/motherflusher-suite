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

Start reveal timing from the resolved snapshot that contains positive winner awards, not from initial entry into a showdown phase. Suppress the reveal when a legal rollover has no paid winner, and keep its hold duration within the server's reset window.

**Why:** Some modes enter showdown before resolution, then publish winners later; starting early can hide payout travel, show a blank rollover overlay, or truncate the reveal during reset.

**How to apply:** Cache pre-showdown balances, use each winner's positive chip delta as their displayed share, and choose the overlay delay plus hold duration to finish before authoritative reset.