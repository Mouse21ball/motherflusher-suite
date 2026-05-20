import { ensurePlayerIdentity } from './persistence';
import { apiUrl } from './apiConfig';

const SESSION_START_KEY = "poker_table_session_start";

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

// ── GA4 Custom Event Wrapper ──────────────────────────────────────────────────

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export type AnalyticsEvent =
  | { name: 'age_gate_accepted' }
  | { name: 'mode_started';         mode: 'badugi' | 'dead7' | 'fifteen35' | 'suits' }
  | { name: 'hand_played';          mode: string; outcome: 'win' | 'loss' | 'fold' }
  | { name: 'daily_ration_claimed'; streak_day: number; chips_awarded: number }
  | { name: 'hourly_bonus_claimed'; chips_awarded: number }
  | { name: 'account_created';      from: 'guest' | 'fresh' }
  | { name: 'crew_table_opened';    mode: 'badugi' }
  | { name: 'crew_private_created'; mode: string }
  | { name: 'bust_modal_shown';     mode: string }
  | { name: 'bonus_page_visited' }
  | { name: 'feedback_link_clicked'; location: 'home_footer' | 'profile_menu' };

export function track(event: AnalyticsEvent): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const { name, ...params } = event as { name: string } & Record<string, unknown>;
  window.gtag('event', name, params);
}

export function setUserId(userId: string | null): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (userId) {
    window.gtag('config', 'G-6FFDK5JX95', { user_id: userId });
  }
}

export function getModeFromPath(): string {
  const p = typeof window !== 'undefined' ? window.location.pathname : '';
  if (p.startsWith('/badugi'))     return 'badugi';
  if (p.startsWith('/dead7'))      return 'dead7';
  if (p.startsWith('/fifteen35'))  return 'fifteen35';
  if (p.startsWith('/suitspoker')) return 'suits';
  return 'unknown';
}
