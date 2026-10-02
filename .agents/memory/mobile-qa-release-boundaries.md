---
name: Mobile QA release boundaries
description: Owner-controlled backend publishing and the rewarded-ad implementation hold.
---

The owner publishes the backend himself from the Replit website. A rebuy network error while the matching backend remains unpublished is expected; do not make network-error or publishing changes just to address that observation.

**Why:** The user explicitly stated this release process and said no action was needed on that network error.

**How to apply:** Fix and verify requested QA items, keep their commits separate, and report exact hashes without starting or suggesting backend publication for these QA passes.

Do not build the Watch Ad rewarded-ad button, even partially, until the owner confirms AdMob approval.

**Why:** The user said AdMob is still in Google's review process and ads cannot serve yet.

**How to apply:** Leave rewarded-ad work on hold; do not add ad SDK wiring, reward callbacks, placeholders, or new ad UI while fixing unrelated recovery controls.