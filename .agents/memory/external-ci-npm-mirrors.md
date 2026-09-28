---
name: External CI npm mirrors
description: Why clean npm installs on GitHub can fail when a Replit-authored lockfile contains mirror URLs.
---

When running npm CI outside Replit, avoid assuming `npm ci` completed merely because its workflow step is green. A lockfile can contain tarball URLs pointing at Replit-only package-firewall hosts; public GitHub runners cannot fetch those. In one observed GitHub run, npm logged "Exit handler never called!" but the step was marked successful, and the subsequent TypeScript check used an incompatible compiler rather than the pinned local one.

**Why:** That combination produces misleading configuration errors in otherwise passing code, and browser tests never execute. The failure is in installation/toolchain selection, not evidence that the application's TypeScript configuration or animations regressed.

**How to apply:** For external CI, resolve mirrored public packages through the public npm registry (or normalize the lockfile), preserve lockfile integrity checks, assert the local compiler binary and version match the pinned package and lockfile before checks, and upload npm debug logs when installation fails. Do not change application compiler options to satisfy an unintended global compiler.