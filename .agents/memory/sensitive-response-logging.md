---
name: Sensitive response logging
description: Prevent API response capture and exception logging from exposing credentials.
---

When shared middleware logs API responses, recursively redact sensitive keys (including inside arrays) and keep the HTTP response unchanged. Avoid logging provider exception messages, request URLs, or complete error objects on paths that process credentials or purchase tokens.

**Why:** Direct console statements can be clean while response-body logging still captures a returned reset token; provider errors may also echo credential-bearing URLs or request identifiers.

**How to apply:** When handling passwords, reset/session tokens, or purchase tokens, audit shared request/response middleware and exception logs alongside direct console and engine logs.