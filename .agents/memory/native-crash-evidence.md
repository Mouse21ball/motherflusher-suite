---
name: Native crash evidence
description: Distinguishing production JavaScript bootstrap failures from Android process crashes.
---

Test the complete production entry separately from component fixtures. Classify native-plugin registration, module evaluation, and actual method invocation separately; registering a Capacitor proxy is not equivalent to initializing the native SDK.

**Why:** Component fixtures can pass without ever evaluating the production startup graph. Conversely, successful production startup with a JavaScript bridge shim verifies JavaScript sequencing and error handling only; it does not execute Android plugin classes or SDK initialization. Identical tracked native source also does not prove that generated configuration or resolved native binaries are identical.

**How to apply:** Audit changed import paths, then run isolated production bootstrap checks with native-call timing recorded and all API traffic redirected to development. Do not claim that a speculative JavaScript guard fixes Android process death. Obtain the failing device's first AndroidRuntime FATAL EXCEPTION or native Fatal signal stack before attributing the crash to a particular SDK or call.