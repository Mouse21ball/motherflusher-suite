---
name: Preview API routing
description: Safe browser verification when the development preview is configured with a production API base.
---

Before using the Replit development preview for authenticated or game-flow verification, check the effective `VITE_API_BASE_URL`. The frontend can be served from the development domain while its API base still points to production.

**Why:** App startup can create guest profiles, and entering a game can create or join a table. Testing those flows against production causes persistent production writes.

**How to apply:** Route API requests and WebSocket connections to the development host in the test browser before loading the app. Confirm the development workflow receives the requests, and never log session tokens or WebSocket tickets.