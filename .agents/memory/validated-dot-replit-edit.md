---
name: Validated .replit edits
description: Required workspace flow for changing the protected .replit configuration file.
---

Stage the complete updated TOML in a temporary file inside the workspace, then call `verifyAndReplaceDotReplit` with its absolute path. Remove the temporary file after a successful replacement.

**Why:** Direct patch edits to `.replit` are rejected; the validated replacement checks the configuration before applying it.

**How to apply:** Use this flow for future `.replit` changes. Do not replace the protected config through ordinary file edits.