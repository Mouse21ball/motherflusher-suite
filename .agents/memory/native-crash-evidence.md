---
name: Native crash evidence
description: Distinguishing production JavaScript bootstrap failures from Android process crashes.
---

Test the complete production entry separately from component fixtures. Classify native-plugin registration, module evaluation, and actual method invocation separately; registering a Capacitor proxy is not equivalent to initializing the native SDK.

**Why:** Component fixtures can pass without ever evaluating the production startup graph. Conversely, successful production startup with a JavaScript bridge shim verifies JavaScript sequencing and error handling only; it does not execute Android plugin classes or SDK initialization. Identical tracked native source also does not prove that generated configuration or resolved native binaries are identical.

**How to apply:** Audit changed import paths, then run isolated production bootstrap checks with native-call timing recorded and all API traffic redirected to development. Do not claim that a speculative JavaScript guard fixes Android process death. Obtain the failing device's first AndroidRuntime FATAL EXCEPTION or native Fatal signal stack before attributing the crash to a particular SDK or call.

Treat real-device bisection as evidence of a failing-build boundary even if desktop production checks pass. It does not prove that the changed source is the defect or identify the failing instruction.

**Why:** Pure source and an acyclic import graph cannot exclude a native startup failure. In a device-side investigation, DEX inspection and dependency sources identified a reflection-required generated database constructor removed by R8, despite successful matching-Chromium production checks. The apparent JavaScript regression was not the defect.

**How to apply:** Respect device evidence but distinguish identical tracked native source from identical shrunk native output. Inspect release DEX and reflection requirements when native startup fails. If crash logging is unavailable, use matching-engine probes or controlled reductions without repeatedly demanding logs. Do not infer a web-asset-size threshold in R8 without native build evidence. Keep native initialization intact when a targeted constructor preservation rule addresses the confirmed failure; removing initialization can disable required background work.

Verify an engine match from the launched browser itself, not the Playwright package version or a spoofed user agent. Matching the full Chromium version still does not match the Android embedder, CPU architecture, GPU, or V8 build flags.

**Why:** A stock sandbox browser can be a different major release from the failing device. Conversely, an exact-version desktop browser can pass a bundle that still fails in Android WebView; the desktop result must not override real-device bisection.

**How to apply:** Use an isolated official test binary when available, record the live browser version and CDP V8 version/revision, and test unchanged production boot before any instrumented component probe. Report the remaining platform gap explicitly rather than labeling a successful desktop run as a native fix.