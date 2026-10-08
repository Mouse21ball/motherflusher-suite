WITH identity_links AS (
  -- Bind a new anonymous identity to its FIRST successful account login/signup.
  SELECT DISTINCT ON (properties->>'session_player_id')
    properties->>'session_player_id' AS anonymous_id, player_id AS account_id
  FROM analytics_events
  WHERE event_type = 'signup_completed'
    AND properties->>'method' IN ('login', 'create_account')
    AND COALESCE(properties->>'session_player_id', '') <> ''
    AND properties->>'session_player_id' <> player_id
  ORDER BY properties->>'session_player_id', created_at, id
), raw_events AS (
  SELECT a.*, COALESCE(l.account_id, a.player_id) AS actor_id
  FROM analytics_events a LEFT JOIN identity_links l ON l.anonymous_id = a.player_id
), events AS (
  -- A reconnect/remount must not count the same physical hand twice.
  SELECT DISTINCT ON (actor_id, event_type,
    CASE WHEN event_type IN ('hand_started', 'hand_completed') AND properties ? 'hand_id'
      THEN jsonb_build_array(mode, properties->>'table_id', properties->>'hand_id')::text
      ELSE id::text END) *
  FROM raw_events
  ORDER BY actor_id, event_type,
    CASE WHEN event_type IN ('hand_started', 'hand_completed') AND properties ? 'hand_id'
      THEN jsonb_build_array(mode, properties->>'table_id', properties->>'hand_id')::text
      ELSE id::text END, created_at, id
), cohorts AS (
  SELECT DISTINCT ON (actor_id) actor_id, event_date::date AS install_day,
    created_at AS installed_at, properties->>'session_id' AS first_session_id
  FROM events
  WHERE event_type = 'app_open' AND properties->>'first_open' = 'true'
  ORDER BY actor_id, created_at, id
)
SELECT c.install_day, COUNT(*) AS installs,
  COUNT(*) FILTER (WHERE c.install_day <= (now() AT TIME ZONE 'UTC')::date - 1) AS d1_eligible,
  COUNT(*) FILTER (WHERE c.install_day <= (now() AT TIME ZONE 'UTC')::date - 1 AND r.d1) AS d1_returns,
  ROUND(100.0 * COUNT(*) FILTER (WHERE c.install_day <= (now() AT TIME ZONE 'UTC')::date - 1 AND r.d1)
    / NULLIF(COUNT(*) FILTER (WHERE c.install_day <= (now() AT TIME ZONE 'UTC')::date - 1), 0), 2) AS d1_pct,
  COUNT(*) FILTER (WHERE c.install_day <= (now() AT TIME ZONE 'UTC')::date - 7 AND r.d7) AS d7_returns,
  ROUND(100.0 * COUNT(*) FILTER (WHERE c.install_day <= (now() AT TIME ZONE 'UTC')::date - 7 AND r.d7)
    / NULLIF(COUNT(*) FILTER (WHERE c.install_day <= (now() AT TIME ZONE 'UTC')::date - 7), 0), 2) AS d7_pct,
  COUNT(*) FILTER (WHERE c.install_day <= (now() AT TIME ZONE 'UTC')::date - 30 AND r.d30) AS d30_returns,
  ROUND(100.0 * COUNT(*) FILTER (WHERE c.install_day <= (now() AT TIME ZONE 'UTC')::date - 30 AND r.d30)
    / NULLIF(COUNT(*) FILTER (WHERE c.install_day <= (now() AT TIME ZONE 'UTC')::date - 30), 0), 2) AS d30_pct
FROM cohorts c LEFT JOIN LATERAL (
  SELECT BOOL_OR(e.event_date::date = c.install_day + 1) AS d1,
    BOOL_OR(e.event_date::date = c.install_day + 7) AS d7,
    BOOL_OR(e.event_date::date = c.install_day + 30) AS d30
  FROM events e WHERE e.actor_id = c.actor_id
) r ON true GROUP BY c.install_day ORDER BY c.install_day;
