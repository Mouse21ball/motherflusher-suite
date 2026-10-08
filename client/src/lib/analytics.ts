import { ensurePlayerIdentity } from './persistence';
import { apiUrl } from './apiConfig';
import { isPracticeBadugiRoute } from './practiceRoute';

const SESSION_START_KEY = "poker_table_session_start";

function getPlayerId(): string {
  return ensurePlayerIdentity().id;
}

function fire(body: Record<string, unknown>): void {
  if (isPracticeBadugiRoute()) return;
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
  if (isPracticeBadugiRoute()) return;
  sessionStorage.setItem(SESSION_START_KEY, String(Date.now()));
  fire({ eventType: "session_start" });
}

export function trackSessionEnd(): void {
  // Existing app-wide unload/visibility listeners can outlive navigation into
  // practice, so guard before touching sessionStorage, identity, or the API.
  if (isPracticeBadugiRoute()) return;
  const start = sessionStorage.getItem(SESSION_START_KEY);
  const durationMs = start ? Date.now() - Number(start) : undefined;
  fire({ eventType: "session_end", durationMs });
}

export function trackModePlay(mode: string): void {
  fire({ eventType: "mode_play", mode });
}

let initialized = false;
export function initAnalytics(): void {
  if (isPracticeBadugiRoute()) return;
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
  | { name: 'mode_started';         mode: 'badugi' }
  | { name: 'hand_played';          mode: string; outcome: 'win' | 'loss' | 'fold' }
  | { name: 'hourly_bonus_claimed'; chips_awarded: number }
  | { name: 'account_created';      from: 'guest' | 'fresh' }
  | { name: 'crew_table_opened';    mode: 'badugi' }
  | { name: 'crew_private_created'; mode: string }
  | { name: 'bust_modal_shown';     mode: string }
  | { name: 'bonus_page_visited' }
  | { name: 'feedback_link_clicked'; location: 'home_footer' | 'profile_menu' }
  | { name: 'review_prompt_shown'; location: 'big_win' }
  | { name: 'review_prompt_dismissed'; location: 'big_win' }
  | { name: 'review_flow_completed'; location: 'menu' | 'big_win' };

export function track(event: AnalyticsEvent): void {
  if (isPracticeBadugiRoute()) return;
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const { name, ...params } = event as { name: string } & Record<string, unknown>;
  window.gtag('event', name, params);
}

export function setUserId(userId: string | null): void {
  if (isPracticeBadugiRoute()) return;
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (userId) {
    window.gtag('config', 'G-6FFDK5JX95', { user_id: userId });
  }
}

export function getModeFromPath(): string {
  const p = typeof window !== 'undefined' ? window.location.pathname : '';
  if (p.startsWith('/badugi'))     return 'badugi';
  return 'unknown';
}
