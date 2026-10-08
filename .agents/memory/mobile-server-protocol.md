---
name: Mobile and server protocol compatibility
description: Native app builds and the live poker backend can run different protocol generations.
---

Check the live backend's build provenance and protocol support before attributing missing table acknowledgements to a device or network race. Pushing GitHub or uploading a new mobile binary does not update the published backend.

**Why:** An older published server lacked the newer client's correlated replies. Later device QA also confirmed that rebuy grants existed but were invisible until restart and that double submissions could pay twice. Fixtures that always broadcast a snapshot before an acknowledgement, and tests that submit only once, can mask those defects. Version mismatch alone is not a sufficient diagnosis for new device evidence.

**How to apply:** Verify support against the public read-only version endpoint, but independently examine authoritative balances and duplicate grants. Test acknowledgement-only responses, same-tick client submissions, and concurrent requests with different client IDs through the real room handler. Grant eligibility belongs to the server-owned bust episode, not a transient hand number or a client-generated UUID. Never fall back to client-minted chips or unconfirmed wallet settlement. State explicitly when backend publishing and physical-device validation remain outstanding.

Backend publishing must preserve compatibility with production mobile clients still in use, including Android 1.3, unless the owner explicitly accepts a break.

**Why:** The user confirmed that real players are using production 1.3 and made publishing approval conditional on backward compatibility. New-client capability checks do not protect old clients from a server that stops accepting their existing messages.

**How to apply:** Compare all shipped-client HTTP and WebSocket contracts against the proposed backend. Treat rejection of a formerly supported game action as a breaking change even if endpoint names and JSON envelopes are unchanged. Check legacy join, rebuy, leave, authentication, and wallet behavior rather than relying on tests of the new client alone.

Hold the four-game backend publication until the owner decides on compatibility handling or a staged rollout for installed nine-mode native apps. Do not treat publishing web UI as updating installed native UI.

**Why:** The owner explicitly made publication conditional on safety for older native clients and requested a report before publishing if their UI is bundled locally.

**How to apply:** Report the old-client risk first; do not publish merely to apply the analytics schema additions. Get a rollout decision before implementing a compatibility shim or resuming publication.

Trace what the old client actually consumes before declaring an accounting correction a protocol break.

**Why:** A review initially classified removing the HTTP buy-in debit as incompatible, but the old slider only checks success and forwards its selected amount to the socket join; it neither decrements its own balance nor requires a debit response. Restoring the debit would reintroduce the confirmed total-wallet accounting defect. Likewise, preventing a one-player poker hand is an intentional eligibility correction, not a removed message contract.

**How to apply:** Preserve valid old-client request sequences and response fields while retaining the financial and eligibility fixes. Legacy rebuys do not identify their funding kind, so never interpret their ambiguous amount as permission to mint another loan or award when existing wallet chips can fund the stack.