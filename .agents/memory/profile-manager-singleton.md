---
name: ProfileManager singleton pattern
description: Multiple independent profile bootstrap owners can race on guest creation; context consumers must share one owner.
---

# ProfileManager singleton pattern

**Rule:** Keep one application-level server-profile request lifecycle and expose it through the shared profile provider. All consumers must read and refetch through that context rather than owning independent request state.

**Why:** Before profile fetching was shared, independent hook instances could both fall through to guest initialization and try to insert the same profile row. One succeeded and the other returned 500. Reading the shared context from multiple components does not create that race.

**How to apply:** Mount the shared provider once around global managers and routed pages. `useServerProfile()` must consume that provider so concurrent consumers share profile, loading, and refetch state without duplicate `/me` or `guest-init` requests.

**Rule:** Keep low-level table identity and card presentation helpers independent of the application profile provider; pass the player data they display as props.

**Why:** The standalone game browser harnesses intentionally render actual table components without the application shell. A profile-context dependency in hero chrome crashed those harnesses before their card interaction and animation checks could run.

**How to apply:** Read the profile context in application-level headers and pages, not in reusable hero/seat presentation components.
