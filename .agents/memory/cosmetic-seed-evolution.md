---
name: Cosmetic seed evolution
description: Why subscription cosmetic display updates must handle previously seeded and partial catalogs.
---

Subscription-only cosmetics may be absent from older, partially seeded installations. An empty-table seed cannot reliably add or rename one on existing installations; use a targeted, idempotent upsert for the specific item while preserving existing entitlement IDs, ownership, and asset paths.

**Why:** A development installation already had cosmetic rows but lacked the subscription frame. Renaming only the seed definition or updating an existing row would not affect that installation. The public cosmetics catalog intentionally excludes subscription-only rows, so it cannot verify this case.

**How to apply:** For future subscription-cosmetic copy or catalog additions, handle existing/partial datasets separately from initial seeding. Verify subscription-only rows via a narrowly scoped read-only database query rather than the public catalog endpoint.