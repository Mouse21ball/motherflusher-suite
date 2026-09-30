---
name: AGP 9 legacy Kotlin modules
description: Interpreting Android library Gradle configuration errors after the AGP 9 built-in Kotlin change.
---

With Android Gradle Plugin 9, a legacy library module that explicitly applies `kotlin-android` can fail because AGP has already registered the Kotlin extension. A simultaneous “compileSdk not specified” error may only be a consequence: the module's script stopped before its existing compileSdk declaration ran. Once the first failure is fixed, configuration may reveal other obsolete DSL calls (legacy ProGuard defaults and `android.kotlinOptions`).

**Why:** Diagnosing the second error as a missing SDK declaration sends the fix in the wrong direction and leaves the actual plugin failure intact. The shipped rewarded-ad plugin must remain installed.

**How to apply:** For Android library build failures after an AGP upgrade, inspect the module's existing script and Gradle's earliest exception first. Prefer a version-pinned, install-time reproducible compatibility patch to disabling a shipped feature or editing ignored installed packages by hand. Verify Gradle configuration and compile with the same AGP and SDK versions as the release builder.