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
, first_completions AS (
  SELECT DISTINCT ON (e.actor_id) e.actor_id, e.created_at, e.mode,
    e.properties->>'table_id' AS table_id, e.properties->>'hand_id' AS hand_id
  FROM events e JOIN cohorts c USING (actor_id)
  WHERE e.event_type = 'hand_completed' AND e.created_at >= c.installed_at
  ORDER BY e.actor_id, e.created_at, e.id
), hand_counts AS (
  SELECT f.actor_id, COUNT(e.id) AS hands_to_completion
  FROM first_completions f JOIN cohorts c USING (actor_id)
  LEFT JOIN events e ON e.actor_id = f.actor_id AND e.event_type = 'hand_started'
    AND e.created_at >= c.installed_at AND (e.created_at <= f.created_at
      OR (e.mode = f.mode AND e.properties->>'table_id' = f.table_id AND e.properties->>'hand_id' = f.hand_id))
  GROUP BY f.actor_id
), player_steps AS (
  SELECT c.actor_id,
    BOOL_OR(e.event_type = 'age_gate_accepted') AS age_accepted,
    BOOL_OR(e.event_type = 'signup_completed') AS signup,
    BOOL_OR(e.event_type = 'home_viewed') AS home,
    BOOL_OR(e.event_type = 'mode_selected') AS mode_selected,
    BOOL_OR(e.event_type = 'table_joined') AS table_joined,
    BOOL_OR(e.event_type = 'hand_started') AS first_hand,
    BOOL_OR(e.event_type = 'hand_completed') AS completed,
    BOOL_OR(e.event_type = 'hand_completed' AND e.properties->>'session_id' = c.first_session_id) AS session1_completed,
    BOOL_OR(e.event_date::date = c.install_day + 1) AS day1_return
  FROM cohorts c LEFT JOIN events e ON e.actor_id = c.actor_id AND e.created_at >= c.installed_at
  GROUP BY c.actor_id
)
SELECT COUNT(*) AS installs,
  COUNT(*) FILTER (WHERE age_accepted) AS age_accepted,
  COUNT(*) FILTER (WHERE signup) AS signup_completed,
  COUNT(*) FILTER (WHERE home) AS home_viewed,
  COUNT(*) FILTER (WHERE mode_selected) AS mode_selected,
  COUNT(*) FILTER (WHERE table_joined) AS table_joined,
  COUNT(*) FILTER (WHERE first_hand) AS first_hand,
  COUNT(*) FILTER (WHERE completed) AS first_game_complete,
  COUNT(*) FILTER (WHERE day1_return) AS day1_return,
  COUNT(*) FILTER (WHERE session1_completed) AS session1_activated,
  ROUND(100.0 * COUNT(*) FILTER (WHERE session1_completed) / NULLIF(COUNT(*), 0), 2) AS session1_activation_pct,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY NULLIF(h.hands_to_completion, 0)) AS median_hands_to_completion
FROM player_steps p LEFT JOIN hand_counts h USING (actor_id);
