---
name: Artwork hit targets
description: Native review regressions caused by poster artwork and transparent controls using different coordinate frames.
---

Keep a poster's embedded action artwork and its interactive hit area in the same uncropped coordinate frame across portrait, landscape, and rotation.

**Why:** Apple reported a returning guest's Play now doing nothing on an iPad Air. A viewport-relative transparent control did not move with a portrait poster's object-cover cropping, so the visible button missed its hit area. A locator click could still succeed and conceal the problem.

**How to apply:** Test taps at the painted action's image coordinates with restored guest storage, not only at the DOM locator's center. Verify the resulting application screen and console errors. Browser viewport checks are evidence of layout behavior, not a substitute for the requested native iPad simulator upgrade test; explicitly report when Xcode/simulator access is unavailable.
