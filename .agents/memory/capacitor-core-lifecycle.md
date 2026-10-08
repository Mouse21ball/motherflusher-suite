---
name: Capacitor core lifecycle compatibility
description: Check the base iOS bridge before adding an optional lifecycle plugin.
---

Do not assume that native lifecycle signals require the optional App plugin.
The inspected Capacitor iOS 8.3.1 core bridge emits document `pause` and `resume`
from UIKit background/foreground notifications through Cordova compatibility,
even when the App plugin is not installed.

**Why:** Adding a plugin solely for analytics return tracking would unnecessarily
change the native integration and require native synchronization. The existing
core already supplies the needed iOS signals.

**How to apply:** Recheck the installed core bridge when upgrading Capacitor.
Deduplicate native document signals and browser visibility signals as one
background/foreground transition. Validate actual devices separately: a bridge
shim cannot prove native delivery or SDK startup.
