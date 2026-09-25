---
name: Authoritative table effects
description: Rules for visualizing bets, payouts, and folds without duplicating server game logic.
---

Table effects must compare consecutive authoritative snapshots and animate only observed deltas: bet increases for seat-to-pot travel, positive winner chip deltas for pot payouts, and status transitions into folded for mucking.

**Why:** Recomputing bets or split-pot shares in the client can disagree with side pots, odd-chip allocation, rollover rules, or a newer server snapshot.

**How to apply:** Keep displayed balances immediate and authoritative. Treat flights as temporary overlays, create one payout flight per server-marked winner with that winner's observed chip increase, and suppress effects when the authoritative delta is absent.

For global celebrations, an unbroadcast final bet can make the net winner chip delta smaller than the award, or zero for an all-in winner. Use the change in the server's cumulative bet alongside the chip delta to observe the gross award; never calculate side-pot shares on the client. Treat reconnect/init snapshots as a new baseline, not a fresh win.

**Why:** Some engines publish the resolved showdown without a separate snapshot for the final bet. Reconnects can also skip the payout transition entirely.

**How to apply:** Compare the two server snapshots, require server-marked winners, and suppress celebration derivation for init/reconnect messages.

A full-screen result overlay must not leave celebration flights or winning-card glow aimed at hidden table geometry. Either sequence it after the short payout flight or expose visible winner, pot, and card anchors for the global host to prefer.

**Why:** A result screen may mount immediately or during a celebration; table coordinates can then be obscured or removed.

**How to apply:** Mark actual rendered winner result groups and cards with semantic anchors, and move glow to them when the result screen mounts. Keep effects within the server's reset window and suppress them for unpaid rollovers.