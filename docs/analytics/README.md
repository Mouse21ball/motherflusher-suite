# First-party onboarding and retention

The four kept modes are `badugi`, `flushed_up`, `lady_luck`, and `box_chevy`.
The PostgreSQL events are independent of GA4. GA4's `track()` wrapper and path
mapping remain unchanged. Legacy `session_start`, `session_end`, and `mode_play`
still accept the same payloads; their new columns are nullable.

## Rollout

1. Publish the backend with migration `0016_analytics_funnel.sql` **before**
   distributing clients that emit the new events. The old validator rejects them.
   The migration has been applied to development only, not production.
2. New native packages must build their web assets from this code. Existing
   installed packages do not gain client instrumentation from a backend publish.
3. Do not publish an iOS release before build 13 clears review. This work neither
   changes native release numbers nor syncs/copies assets into the iOS project.
4. Verify actual iPad/Android lifecycle callbacks and database arrivals after
   rollout. Browser viewport tests and JavaScript fixtures are not device tests.

The four-mode backend removes server support for the cut modes. Coordinate that
rollout with native packages still showing the old nine-mode lineup; publishing
the backend does not update their bundled screens.

## Event contract

Every new event includes `session_id`, `session_player_id`, and `build_number`
inside `properties`, plus top-level `platform` and `appVersion`.
The app version/build come from the iOS/Android native project manifests, not the
unrelated npm package version. Web uses the Android release metadata.

| Event | Specific properties / timing |
|---|---|
| `app_open` | `first_open`: true only for newly created identities, not migrated guest names; also emitted on a real background/foreground transition |
| `age_gate_accepted` | After confirmation |
| `signup_completed` | `method`: guest/login/create_account; integer `name_length`, never the name |
| `welcome_back_dismissed` | `via`: play_now/auto; actual button callback or the existing automatic skip |
| `home_viewed` | `is_first_home`; once per Home mount, guarded against effect replay |
| `mode_selected` | Canonical `mode`; card/button/keyboard selection, including Lady Luck |
| `table_joined` | Paired with legacy `mode_play`; Lady Luck added when the local human is seated |
| `hand_started` | `mode`, `table_id`, `hand_id`, `event_key`; only a dealt local player or a paid Lady Luck race |
| `hand_completed` | Same identifiers plus `outcome`: win/loss/fold; folds do not require showdown |
| `bust_shown` | `mode`, `tier`, `chips_before`; once per modal opening |
| `bonus_claimed` | `type`, integer `chips`, integer `streak_day`; successful server responses only |
| `session_end` | Existing legacy event, unchanged |

Poker can advance past DEAL before broadcasting a snapshot. The first live
snapshot with the local player's cards also counts as the deal. Outcomes come
from authoritative winner/fold flags, not hand evaluation in analytics. Hand
numbers are observational snapshot metadata. Lady Luck uses its authoritative
race ID and winning suit. Watchers, undealt and sitting-out players do not emit
hand events; all-in players still do. A rollover is marked in properties.

Hand events are deduplicated across snapshots, render surfaces and reconnects
using a bounded in-memory/session-storage cache. The SQL also deduplicates by
canonical actor + mode/table/hand/event, including identity changes.

`chips_before` means the last observed positive **table stack**, not a recreated
wallet amount or an estimate of the pot. Zero means no prior positive snapshot
was available. The fifth analytics tier means at least three busts in the current
session. The original four offer UI branches are not changed:

1. First lifetime bust, never purchased.
2. Repeated session bust, purchased before.
3. Repeated session bust, never purchased.
4. Other bust.
5. Three or more session busts (takes precedence for analytics).

Calendar claims use the server's granted chips and new streak day. Non-calendar
claims use `streak_day: 0`. Starter Pack is currently the welcome-kit endpoint,
so it emits **one** claim with `type: starter_pack`, `reward_type: welcome_kit`,
and the actual server amount. Those category cohorts overlap intentionally;
do not sum them as two grants.

## Read-only queries

Run the standalone `.sql` files in this directory. They read only
`analytics_events`; no player-profile, game-history, or wallet tables are needed.

- `retention.sql`: UTC cohort dates and exact-day D1/D7/D30 returns using **any**
  event. Immature cohorts return NULL percentages, not artificial zero retention.
- `funnel.sql`: onboarding/activation stage counts, first-session activation
  percentage, and median observed hands to first completion. Use `table_joined`,
  not `table_joined + mode_play`. Missing starts yield an unknown median input.
- `bust-loop.sql`: busts per recorded app-open session and legacy session ends
  within two minutes; an intervening new session excludes an unrelated end.
- `bonus-loop.sql`: D1 return for install-day claimers versus non-claimers, by
  type and overall. Limiting claims to install day avoids using later behavior
  to classify an earlier retention outcome.

A successful login can replace an anonymous UUID with an account UUID. The
first successful signup/login's `session_player_id` links the earlier anonymous
events to that account. Queries normalize this link before choosing the first
`app_open` with `first_open: true`. They do not merge two registered accounts
merely because both used the same device session.

These are best-effort client events, not accounting records. A disconnected
client cannot report a hand end it never receives, and there is no offline
delivery queue. Legacy session-end visibility/unload scheduling is preserved.
Actual native background/end delivery needs device QA. Stage counts represent
observed conversions, not a guaranteed strictly ordered path for every user.

## Verification

`npx tsx scripts/verifyAnalyticsQueries.ts` executes the four reports against
synthetic CTE rows that shadow the real table. It never reads or changes real
player data. Coverage includes guest-to-login attribution, duplicate hands,
legacy continuity, pre-showdown folds, mature/immature cohorts, and bonus aliases.
