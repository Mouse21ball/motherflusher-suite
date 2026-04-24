import { ensurePlayerIdentity } from './persistence';
import { apiUrl } from './apiConfig';

const SESSION_START_KEY = "poker_table_session_start";

// Returns the stable canonical player ID from the unified identity.
// Replaces the old standalone `poker_table_analytics_id` key.
// The identity is created on first call and persisted in localStorage.
function getPlayerId(): string {
  return ensurePlayerIdentity().id;
}

function fire(body: Record<string, unknown>): void {
  try {
    const payload = JSON.stringify({ ...body, playerId: getPlayerId() });
    fetch(apiUrl("/api/analytics/track"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function trackSessionStart(): void {
  sessionStorage.setItem(SESSION_START_KEY, String(Date.now()));
  fire({ eventType: "session_start" });
}

export function trackSessionEnd(): void {
  const start = sessionStorage.getItem(SESSION_START_KEY);
  const durationMs = start ? Date.now() - Number(start) : undefined;
  fire({ eventType: "session_end", durationMs });
}

export function trackModePlay(mode: string): void {
  fire({ eventType: "mode_play", mode });
}

let initialized = false;
export function initAnalytics(): void {
  if (initialized) return;
  initialized = true;
  trackSessionStart();
  window.addEventListener("beforeunload", trackSessionEnd);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      trackSessionEnd();
    }
  });
}
