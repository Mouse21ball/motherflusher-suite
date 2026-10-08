import { ensurePlayerIdentity, consumeNewIdentityForAnalytics } from './persistence';
import { Capacitor } from '@capacitor/core';
import { APP_RELEASE_INFO } from './buildInfo';
import { analyticsMode, type FunnelEventType } from '@shared/analytics';
import { apiUrl } from './apiConfig';
import { isPracticeBadugiRoute } from './practiceRoute';

const SESSION_START_KEY = "poker_table_session_start";
let funnelSessionId: string | undefined;
let sessionPlayerId: string | undefined;

// Additive first-party instrumentation. Never pass names, emails or credentials.
export function fire2(eventType: FunnelEventType, props: Record<string, unknown> = {}): void {
  if (isPracticeBadugiRoute()) return;
  try {
    const mode = analyticsMode(props.mode);
    if (props.mode !== undefined && !mode) return;
    const playerId = getPlayerId();
    funnelSessionId ??= crypto.randomUUID();
    sessionPlayerId ??= playerId;
    const platform = Capacitor.getPlatform() as "ios" | "android" | "web";
    const release = APP_RELEASE_INFO[platform];
    fetch(apiUrl("/api/analytics/track"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        eventType, playerId, mode,
        durationMs: typeof props.durationMs === "number" ? props.durationMs : undefined,
        properties: {
          ...props, ...(mode ? { mode } : {}),
          session_id: funnelSessionId, session_player_id: sessionPlayerId,
          build_number: release.build,
        },
        platform, appVersion: release.version,
      }),
    }).catch(() => {});
  } catch { /* Measurement must never interrupt onboarding or play. */ }
}

export function trackHomeViewed(): void {
  const identity = getPlayerId();
  const key = `cgp_first_home:${identity}`;
  let isFirstHome = true;
  try {
    isFirstHome = localStorage.getItem(key) !== "1";
    localStorage.setItem(key, "1");
  } catch {}
  fire2("home_viewed", { is_first_home: isFirstHome });
}

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
  fire2("table_joined", { mode });
}

let initialized = false;
export function initAnalytics(): void {
  if (isPracticeBadugiRoute()) return;
  if (initialized) return;
  initialized = true;
  trackSessionStart();
  fire2("app_open", { first_open: consumeNewIdentityForAnalytics() });
  window.addEventListener("beforeunload", trackSessionEnd);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      trackSessionEnd();
    } else {
      // A retained native WebView can resume a day later without remounting App.
      funnelSessionId = undefined;
      sessionPlayerId = undefined;
      fire2("app_open", { first_open: false });
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
  if (p.startsWith('/flushedup'))  return 'flushed_up';
  if (p.startsWith('/box-chevy'))  return 'box_chevy';
  if (p.startsWith('/ladyluck'))   return 'lady_luck';
  return 'unknown';
}
