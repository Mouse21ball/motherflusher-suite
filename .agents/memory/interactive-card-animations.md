---
name: Interactive card animation safeguards
description: Rules that keep shared card selection usable and table deals visible during server-driven animation updates.
---

Animated card states must preserve the same native button hit target used by the idle state. Never replace a selectable card with a visual-only motion wrapper while dealing or drawing.

**Why:** A deal-animation state can outlive its intended timer during frequent authoritative renders. If that branch has no button, every shared CardHand consumer becomes unable to select or draw.

**How to apply:** Treat interaction as independent from visual animation state. Browser coverage should click a selectable card while its deal flag is active.

Active table-deal flights should survive authoritative updates that remain in the same game phase and keep the same seated players in the same order. Any seat-list change, including an insertion, must cancel the flights even when the phase is unchanged.

**Why:** Fast same-phase snapshots from bots previously erased flights almost immediately, making deals appear as an instant flash; but a newly occupied seat can move existing destinations and make stale flight geometry land on another player.

**How to apply:** Keep a short landing hold after the calculated flight sequence and test same-phase updates, phase interruptions, and mid-flight seat-list changes separately.

Flights measured from DOM anchors should cancel on viewport or table geometry changes, revealing the authoritative cards instead of retargeting cards already mid-flight.

**Why:** A flight with stale coordinates can visually land over another seat, while the destination cards are already authoritative and safe to show immediately.

**How to apply:** Restore hidden destination cards when canceling, and detach geometry watchers along with the flight timer; do not replay the same deal solely because the layout changed.