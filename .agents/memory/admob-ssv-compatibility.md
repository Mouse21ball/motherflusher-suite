---
name: AdMob SSV compatibility
description: Google's signed callback representation is not identical to native SDK reward configuration.
---

Accept the documented numeric ad-unit slot as well as the full SDK ad-unit ID, without accepting a different publisher's full ID. Treat a positive signed provider reward as completion eligibility, not as the application's chip amount.

**Why:** Google's SSV example uses a numeric ad_unit and configurable reward_amount/reward_item. The earlier scaffold required the full SDK ID and exactly "500 chips", which rejected valid documented payloads and default reward settings.

**How to apply:** Verify the untouched signed query first, then match its unit to the issued session. Keep the fixed chip amount in the wallet transaction, independent of Google's reward configuration. Reference: https://developers.google.com/admob/android/ssv