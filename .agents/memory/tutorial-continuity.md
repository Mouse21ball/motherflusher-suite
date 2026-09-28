---
name: Tutorial continuity
description: First-visit modal walkthroughs across phase-specific game screens
---

Mount a multi-page tutorial in a stable parent of a game that renders different components for different phases.

**Why:** Mounting a separate tutorial instance in each phase branch resets its current slide whenever the live game advances. The user may still be reading when that happens, even if the tutorial itself has not been dismissed.

**How to apply:** Keep one modal instance alive across phase changes. Gate its first display on the appropriate player context, while offering a separate way to reopen full rules after dismissal.