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
, bonus_types(type) AS (VALUES ('any'), ('daily_calendar'), ('hourly'), ('welcome_kit'), ('starter_pack')),
comparison AS (
  SELECT c.actor_id, t.type,
    EXISTS (SELECT 1 FROM events e WHERE e.actor_id = c.actor_id AND e.event_type = 'bonus_claimed'
      AND e.event_date::date = c.install_day
      AND (t.type = 'any' OR e.properties->>'type' = t.type OR e.properties->>'reward_type' = t.type)) AS claimed,
    EXISTS (SELECT 1 FROM events e WHERE e.actor_id = c.actor_id AND e.event_date::date = c.install_day + 1) AS returned_d1
  FROM cohorts c CROSS JOIN bonus_types t
  WHERE c.install_day <= (now() AT TIME ZONE 'UTC')::date - 1
)
SELECT type, claimed, COUNT(*) AS installs, COUNT(*) FILTER (WHERE returned_d1) AS d1_returns,
  ROUND(100.0 * COUNT(*) FILTER (WHERE returned_d1) / NULLIF(COUNT(*), 0), 2) AS d1_pct
FROM comparison GROUP BY type, claimed ORDER BY type, claimed DESC;
