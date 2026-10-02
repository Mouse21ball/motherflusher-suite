---
name: Mobile and server protocol compatibility
description: Native app builds and the live poker backend can run different protocol generations.
---

Check the live backend's build provenance and protocol support before attributing missing table acknowledgements to a device or network race. Pushing GitHub or uploading a new mobile binary does not update the published backend.

**Why:** An older published server lacked the newer client's correlated replies. Later device QA also confirmed that rebuy grants existed but were invisible until restart and that double submissions could pay twice. Fixtures that always broadcast a snapshot before an acknowledgement, and tests that submit only once, can mask those defects. Version mismatch alone is not a sufficient diagnosis for new device evidence.

**How to apply:** Verify support against the public read-only version endpoint, but independently examine authoritative balances and duplicate grants. Test acknowledgement-only responses, same-tick client submissions, and concurrent requests with different client IDs through the real room handler. Grant eligibility belongs to the server-owned bust episode, not a transient hand number or a client-generated UUID. Never fall back to client-minted chips or unconfirmed wallet settlement. State explicitly when backend publishing and physical-device validation remain outstanding.