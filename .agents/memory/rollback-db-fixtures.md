---
name: Rollback database fixtures
description: Prevent self-blocking locks and leaked writes in real-database tests.
---

Rollback fixtures must route all database operations, including writes hidden inside profile-read helpers, through the fixture transaction.

**Why:** Tests passed individually but timed out in the full suite when a profile read attempted a backfill on another connection while the fixture held that profile's row lock. Unrouted backfills can also escape fixture rollback.

**How to apply:** Check every database path used by storage helpers when binding them to a rollback fixture. Use real savepoints when testing application-transaction failures, and keep all fixture allocations reversible.
