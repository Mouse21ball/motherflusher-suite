---
name: Mode eligibility on early folds
description: Qualification rules can be bypassed when a shared engine settles a hand early.
---

When a game mode requires a qualifying hand for any payout, check the shared engine's early fold settlement as well as its normal showdown resolver. The fold shortcut must not turn an ineligible sole survivor into a winner.

**Why:** Flushed Up's showdown correctly rolled over pots without a five-card flush, but an early all-opponents-folded path bypassed showdown and awarded a non-flush hand.

**How to apply:** When adding or tightening mode-specific payout eligibility, trace every terminal path that awards chips (including fold/no-actor shortcuts) and test at least one early settlement through the server path.