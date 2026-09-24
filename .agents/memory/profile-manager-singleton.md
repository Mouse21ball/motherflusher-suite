---
name: ProfileManager singleton pattern
description: Never call useServerProfile in more than one top-level App component — duplicate calls race on guest-init and one returns 500.
---

# ProfileManager singleton pattern

**Rule:** Keep one application-level server-profile request lifecycle and expose it through the shared profile provider. All consumers must read and refetch through that context rather than owning independent request state.

**Why:** `useServerProfile` falls through to `POST /api/auth/guest-init` for unauthenticated users. Each hook instance makes its own independent fetch. If two run in parallel for a fresh session, both try to INSERT the same profile row → one succeeds, one gets a 500.

**How to apply:** Mount the shared provider once around global managers and routed pages. `useServerProfile()` must consume that provider so concurrent consumers share profile, loading, and refetch state without duplicate `/me` or `guest-init` requests.

**Fix applied:** Profile fetching is owned by one provider above global managers and routes. Global effects and page-level consumers now share the same profile state and stable refetch callback.
