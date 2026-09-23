---
name: Platform-aware API URLs
description: Cross-platform rule for browser and Capacitor API requests.
---

Client API requests must resolve endpoint paths through the shared platform-aware URL helper before calling `fetch` or the authenticated fetch wrapper.

**Why:** Relative `/api/...` requests work on ordinary web origins but can throw a native URL-pattern exception under Capacitor/WebView custom origins before reaching the server.

**How to apply:** For any client request that must work in both browser and mobile shells, use the shared API URL resolver. Apply the same rule to requests that obtain WebSocket tickets; the WebSocket URL itself continues to use its dedicated resolver.