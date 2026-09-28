---
name: Claimed paid-offer fulfillment
description: Eligibility policy for purchases that complete after an account's paid-offer claim.
---

A first-purchase bundle requires no prior settled purchase when the player claims the offer. After that claim, a verified receipt purchased within the persisted offer window must still be fulfilled even if a separate purchase settles before the bundle verification callback arrives.

**Why:** Native store checkout is asynchronous. Revoking eligibility after the store has charged the player creates an unfulfilled purchase that cannot safely be retried.

**How to apply:** Enforce eligibility before launching checkout, bind the receipt to the account, use the verified store purchase timestamp for the fixed expiration window, and keep idempotent grant/refund processing. Do not add post-payment account-history checks that downgrade a valid receipt.