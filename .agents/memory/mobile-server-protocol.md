---
name: Mobile and server protocol compatibility
description: Native app builds and the live poker backend can run different protocol generations.
---

Check the live backend's build provenance and protocol support before attributing missing table acknowledgements to a device or network race. Pushing GitHub or uploading a new mobile binary does not update the published backend.

**Why:** Real-device table recovery and exit failed because the newer mobile client expected correlated replies that the older published server did not implement. Browser fixtures accepting those messages and in-process tests of the new server both passed, masking the version mismatch.

**How to apply:** Verify support against the public read-only version endpoint. Never fall back to client-minted chips or unconfirmed wallet settlement for an unsupported backend. Test actual socket round trips through the real room handler as well as UI fixtures, and state explicitly when backend publishing and physical-device validation remain outstanding.