---
name: All-in turn policy
description: All-in players skip betting immediately but retain required non-betting actions and pot eligibility.
---
An all-in player must never spend a betting turn waiting for a human action timer or a bot think delay. If no player can still bet, advance immediately rather than assigning an all-in fallback actor.

**Why:** The user reproduced a real Badugi stall in every hand: a zero-stack player had no betting controls but still received the entire action countdown.

**How to apply:** Enforce this in authoritative engines, not just the UI. Keep all-in players active and eligible for pots, draws, hits, reveals, and declarations. A zero table stack in a committed hand is not the same as a new zero-wallet spectator entry. Do not skip mandatory combined declaration/betting actions solely because the stack is zero.