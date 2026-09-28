---
name: Google Play product ID format
description: Why new Google Play in-app products use underscores rather than hyphens.
---

New Google Play in-app product identifiers should use underscores, while existing Apple identifiers and subscription IDs must remain unchanged unless the store catalog changes independently.

**Why:** The store rejected newly submitted hyphenated in-app product IDs, and the owner recreated those products with underscore-separated identifiers.

**How to apply:** When adding or changing Google Play in-app products, confirm the exact IDs against the products already created in Play Console before updating shared billing constants; keep client registration, server verification, and tests aligned through those constants.