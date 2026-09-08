---
name: Game typography sweeps
description: How to avoid missing readable labels duplicated across phase-specific game layouts.
---

Audit every phase-specific render branch independently when applying game-wide typography rules. Do not assume changing the first matching label updates equivalent lobby, race, wager, spectator, or result layouts. Evaluate effective opacity through the full ancestor chain, not only the text color itself.

**Why:** Similar readable labels can be rendered by separate branches in the same page. Broad first-pass replacements can leave later mobile or phase-specific variants unchanged even when the component family appears covered. A readable child foreground can still become illegible when an ancestor dims the entire text-bearing container.

**How to apply:** After edits, search the resulting code again for undersized font declarations, low-alpha foreground colors, and ancestor opacity or filters. Classify each remaining match by rendered branch and literal purpose. Keep card artwork, decorative glyphs, and disabled-state styling separate from readable UI text; dim non-text visuals instead of their shared parent.