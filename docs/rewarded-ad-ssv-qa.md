# Rewarded-ad production callback setup and diagnosis

The app's production credits require Google's signed server-side verification
(SSV). Passing `ssv.customData` to the SDK attaches the watch-session identifier;
it does **not** register the callback URL with AdMob.

In the AdMob console, open **each rewarded ad unit → Server-side verification**,
configure the callback URL, test it, and save:

`https://chainggangpoker.com/api/ads/admob/ssv`

This production hostname was confirmed through deployment metadata during QA.
Recheck deployment metadata if the site's hostname changes.

Configure both units separately:

- Android: `ca-app-pub-1122384597919929/4402812186`
- iOS: `ca-app-pub-1122384597919929/9990005770`

AdMob's console URL check may be bare or carry placeholder SSV fields. Every
callback handled by this endpoint is acknowledged with HTTP 200 `OK`; HTTP
success is not proof of signature validity or chip credit. Bare pings skip
verifier-key retrieval and storage entirely. Requests containing SSV fields,
including empty/test values, still undergo strict verification before any grant.

Reward callback tests must supply a valid issued session UUID as custom data.
Unsigned reward attempts, invalid signatures, or arbitrary/missing sessions
still receive no credit and log the rejection reason, despite their HTTP 200.
Never bypass reward signature checks to make a console test pass.
The console configuration cannot be inspected or changed from this repository.

Rate-limited callbacks stop before verification/storage and log `rate_limited`,
also with HTTP 200. Key-service/storage errors are logged and acknowledged too;
this policy does not signal transient failures to Google for HTTP-based retries.

## Evidence from the reported Android watch on 2026-10-03

- Production start succeeded at 11:26:21 UTC.
- SDK completion reached `/api/ads/rewarded/confirm` at 11:27:10 UTC.
- Status polling reached production and returned incomplete through 11:28:04.
- No SSV request appeared in the available deployment logs.
- The production session had `reward_requested_at` set, no completion or
  transaction, and a 30-minute validity window (11:26–11:56 UTC). Expiry did
  not explain this watch failing within its first minute.
- A direct unsigned GET to the callback returned the expected HTTP 400:
  the public callback route is reachable. This was the behavior before the
  setup-ping fix; a bare URL check now receives HTTP 200 without granting chips.

Conclusion: the SDK→client→server confirmation chain ran, but the available
evidence shows no Google→server callback. Incorrect/missing AdMob-console SSV
configuration is a configuration check to perform, **not a verified cause**.
No production chip credit or console setting was changed during diagnosis.

The owner subsequently confirmed bare pings work in production but reported
that console checks carrying placeholder SSV fields still received HTTP 400
and prevented saving both units. After the all-callback acknowledgement fix
is published by the owner, they must re-run verification and save both settings.

## Instrumentation

After the backend and native client changes are released, correlate logs:

1. Client traces: initializing, loading, loaded, showing, sdk_reward, dismissed.
   Loading and loaded timestamps expose slow SDK loads.
2. Confirmation and polling failures are traced, not silently treated as skips.
3. `ssv_received` records callback entry.
   `ssv_setup_ping` identifies a no-op console URL check, never a credited ad.
4. `ssv_rejected` states the rejection stage: malformed query, unknown key,
   signature mismatch, invalid custom data/reward/timestamp, unit mismatch,
   unknown session, or expired/consumed session.
5. `ssv_credited` records the session and whether the credit was idempotent.
6. `credited` on the client confirms it read the authoritative balance.

Client traces are authenticated, checked against the session owner, and
allowlisted. They are diagnostic claims, never proof of completion. No trace
may mint chips. Raw signed URLs, transaction IDs, native error payloads, and
credentials are not logged.

Credits remain fixed at 500 chips and require verified SSV in production.
Reproduce a physical-device watch after checking both console settings; success
requires `ssv_credited` plus a refreshed personal-wallet balance.