---
name: Game typography sweeps
description: How to avoid missing readable labels duplicated across phase-specific game layouts.
---

Audit every phase-specific render branch independently when applying game-wide typography rules. Do not assume changing the first matching label updates equivalent lobby, race, wager, spectator, or result layouts.

**Why:** Similar readable labels can be rendered by separate branches in the same page. Broad first-pass replacements can leave later mobile or phase-specific variants unchanged even when the component family appears covered.

**How to apply:** After edits, search the resulting code again for undersized font declarations and low-alpha foreground colors, then classify each remaining match by rendered branch and literal purpose. Keep card artwork, decorative glyphs, and disabled-state styling separate from readable UI text.