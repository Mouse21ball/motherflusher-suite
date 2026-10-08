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
, sessions AS (
  SELECT actor_id, properties->>'session_id' AS session_id, MIN(created_at) AS started_at
  FROM events WHERE event_type = 'app_open' AND properties->>'session_id' IS NOT NULL
  GROUP BY actor_id, properties->>'session_id'
), per_session AS (
  SELECT s.*, COUNT(b.id) AS busts,
    COUNT(b.id) FILTER (WHERE EXISTS (
      SELECT 1 FROM events ending WHERE ending.actor_id = s.actor_id AND ending.event_type = 'session_end'
        AND ending.created_at >= b.created_at AND ending.created_at <= b.created_at + INTERVAL '2 minutes'
        AND NOT EXISTS (SELECT 1 FROM sessions newer WHERE newer.actor_id = s.actor_id
          AND newer.started_at > b.created_at AND newer.started_at <= ending.created_at)
    )) AS quit_within_2m
  FROM sessions s LEFT JOIN events b ON b.actor_id = s.actor_id AND b.event_type = 'bust_shown'
    AND b.properties->>'session_id' = s.session_id GROUP BY s.actor_id, s.session_id, s.started_at
)
SELECT COUNT(*) AS sessions, COALESCE(SUM(busts), 0) AS busts,
  ROUND(AVG(busts), 4) AS busts_per_session,
  COUNT(*) FILTER (WHERE busts > 0) AS sessions_with_bust,
  COALESCE(SUM(quit_within_2m), 0) AS busts_followed_by_end_within_2m,
  ROUND(100.0 * SUM(quit_within_2m) / NULLIF(SUM(busts), 0), 2) AS rage_quit_proxy_pct
FROM per_session;
