---
name: Mobile QA release boundaries
description: Owner-controlled backend publishing and approval for rewarded-ad implementation.
---

Do not ship iOS until build 13 clears App Store review. The four-game refactor can continue for web, Android, and the repository without being bundled into an iOS release before that approval.

**Why:** The owner explicitly separated the build 13 review fix from the larger game-lineup refactor after iOS 1.4 build 12 was rejected.

**How to apply:** Do not sync the refactored web bundle into iOS or start an iOS release while this review hold is in force. Ask for the approval status before resuming iOS release work.

The owner publishes the backend himself from the Replit website. A rebuy network error while the matching backend remains unpublished is expected; do not make network-error or publishing changes just to address that observation.

**Why:** The user explicitly stated this release process and said no action was needed on that network error.

**How to apply:** Fix and verify requested QA items, keep their commits separate, and report exact hashes without starting or suggesting backend publication for these QA passes.

Do not publish the backend until the additive analytics migration is confirmed applied to production. Explicitly confirm the production columns and indexes, or clearly report why application is blocked.

**Why:** The user explicitly required production migration confirmation before the next backend publish.

**How to apply:** Treat this as a release hold. Managed production database access is read-only for the agent and schema changes use Replit's Publish flow; do not bypass that restriction or claim development migration success proves production readiness. Explain this conflict before proposing any publication.

The owner confirmed AdMob review approval on 2026-10-02 and authorized wiring Watch Ad to the bust-out modal.

**Why:** The user explicitly lifted the earlier review hold.

**How to apply:** Reward exactly 500 chips per completed, eligible ad, at most once per authoritative bust event. No amount slider; lock playback and verification against duplicate taps. Keep commits separate, push main, and do not publish.

Use separate platform-specific production rewarded ad units; never reuse the Android rewarded unit for iOS.

**Why:** The owner explicitly corrected the shared-unit assumption.

**How to apply:** Preserve each platform's own production unit when changing rewarded-ad configuration or QA fixtures.