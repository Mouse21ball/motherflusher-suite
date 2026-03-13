const PLAYER_ID_KEY = "poker_table_analytics_id";
const SESSION_START_KEY = "poker_table_session_start";

function getPlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

function fire(body: Record<string, unknown>): void {
  try {
    const payload = JSON.stringify({ ...body, playerId: getPlayerId() });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/track", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
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
