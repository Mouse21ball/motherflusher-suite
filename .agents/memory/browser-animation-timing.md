---
name: Browser animation timing assertions
description: How to keep browser-level animation timing checks stable while still catching regressions.
---

Browser animation tests should start timing after the expected flight elements are rendered, not at the click that triggers a large-table rerender. The assertion should include a small, explicit allowance for browser rendering and locator polling beyond the calculated animation path.

**Why:** A full-table deal can spend measurable time rendering many animated nodes before the browser begins observing the sequence, and DOM polling adds bounded observation delay. Timing from the trigger alone made a valid animation look slower and produced unstable coverage.

**How to apply:** Keep the production sequence calculation authoritative, then set a documented browser cap that is tight enough to catch regressions but accounts for the test runner’s observation overhead.