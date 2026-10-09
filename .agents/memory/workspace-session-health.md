---
name: Workspace session health
description: Leave the development server running and reachable before ending each work session.
---

Before finishing a work session in this project, confirm the workspace server is running and reachable. If it needs a restart, verify that it is back up before stopping.

**Why:** The user reported that the preview went down during a previous session and explicitly asked for this check going forward.

**How to apply:** After the final coherent change batch, check the configured application workflow and request a public development endpoint through the workspace domain. Do not confuse keeping preview running with permission to publish.
