---
name: ProfileManager singleton pattern
description: Never call useServerProfile in more than one top-level App component — duplicate calls race on guest-init and one returns 500.
---

# ProfileManager singleton pattern

**Rule:** Only one top-level App-level component may call `useServerProfile()`. Multiple sibling components calling it simultaneously trigger concurrent `guest-init` inserts for the same player ID, causing a DB unique-constraint violation (500).

**Why:** `useServerProfile` falls through to `POST /api/auth/guest-init` for unauthenticated users. Each hook instance makes its own independent fetch. If two run in parallel for a fresh session, both try to INSERT the same profile row → one succeeds, one gets a 500.

**How to apply:** Merge any sibling components that each need the server profile into a single component (`ProfileManager`). Pass the profile down as props, or use a context/event if siblings are deeply nested. Never add a second `useServerProfile()` call at the App root level.

**Fix applied:** Merged `DiamondBackground` (active subscription tier → diamond-elite body class) and `MusicManager` (route → music track URL) into a single `ProfileManager` that calls `useServerProfile()` once and handles both side-effects via two separate `useEffect` calls.
