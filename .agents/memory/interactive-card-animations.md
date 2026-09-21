---
name: Interactive card animation safeguards
description: Rules that keep shared card selection usable and table deals visible during server-driven animation updates.
---

Animated card states must preserve the same native button hit target used by the idle state. Never replace a selectable card with a visual-only motion wrapper while dealing or drawing.

**Why:** A deal-animation state can outlive its intended timer during frequent authoritative renders. If that branch has no button, every shared CardHand consumer becomes unable to select or draw.

**How to apply:** Treat interaction as independent from visual animation state. Browser coverage should click a selectable card while its deal flag is active.

Active table-deal flights should survive authoritative updates that remain in the same game phase. Only a genuine phase transition, reset, missing anchor, reduced-motion preference, or unmount should cancel them.

**Why:** Fast same-phase snapshots from bots previously erased flights almost immediately, making deals appear as an instant flash.

**How to apply:** Keep a short landing hold after the calculated flight sequence and test both same-phase updates and explicit phase interruptions.