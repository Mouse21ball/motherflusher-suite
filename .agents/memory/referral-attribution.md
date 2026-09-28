---
name: Referral attribution boundary
description: Product decision about when existing social invitations become reward-eligible referrals
---

An existing table link or crew invite is a way to join a game or group, not proof of a new player signup. Only an invite code supplied during a new account's registration establishes a player-level referral; participation or crew membership alone must never trigger these rewards. A shared table link can carry the sender's code, while a crew invite attributes to its captain.

**Why:** Before referral rewards, neither social mechanism stored which player invited a new account. Crediting on table or crew join would reward established players and allow repeated social actions to masquerade as signups.

**How to apply:** Keep signup attribution immutable and resolve codes server-side. Count only successfully settled hands/races, and grant each side's reward atomically with an auditable, retry-safe settlement rather than via a client claim.