// ─── API / WebSocket configuration ────────────────────────────────────────────
// Set VITE_API_BASE_URL at build time for Capacitor mobile builds so every
// request reaches the deployed backend instead of the Capacitor WebView origin
// (which is `capacitor://localhost` on iOS / `http://localhost` on Android).
//
// Example .env for a mobile build:
//   VITE_API_BASE_URL=https://yourapp.replit.app
//
// Leave unset for web development — relative URLs work as-is.

// ── Capacitor safety guard ────────────────────────────────────────────────────
// If this code is running inside a Capacitor WebView (Android or iOS) but
// VITE_API_BASE_URL was not injected at build time, fall back to the known
// production URL so the app stays functional. A missing env var must never
// crash the app — Apple reviewers and real users must be able to log in even
// if the Codemagic build forgot to set the variable.
const PRODUCTION_FALLBACK = 'https://chainggangpoker.com';

const _base: string = (() => {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin === 'http://localhost' || origin === 'capacitor://localhost') {
      console.warn(
        '[apiConfig] VITE_API_BASE_URL is not set in this Capacitor build. ' +
        `Falling back to ${PRODUCTION_FALLBACK}. ` +
        'Add VITE_API_BASE_URL to the ios-release vars in codemagic.yaml.'
      );
      return PRODUCTION_FALLBACK;
    }
  }
  return '';
})();

/** Prefix a backend API path with the configured origin (empty = relative). */
export function apiUrl(path: string): string {
  return `${_base}${path}`;
}

/** WebSocket URL for the real-time server connection.
 *  Pass the short-lived WS ticket (obtained from GET /api/auth/ws-ticket)
 *  to append it as ?ticket= so the server can authenticate the upgrade.
 *  The ticket — not the long-lived session token — is used here so that
 *  the session credential never appears in server/proxy access logs. */
export function wsUrl(ticket?: string | null): string {
  let base: string;
  if (_base) {
    try {
      const u = new URL(_base);
      const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      base = `${proto}//${u.host}/ws`;
    } catch {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      base = `${proto}//${window.location.host}/ws`;
    }
  } else {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    base = `${proto}//${window.location.host}/ws`;
  }
  return ticket ? `${base}?ticket=${encodeURIComponent(ticket)}` : base;
}

/** Origin for shareable invite links.
 *  In a Capacitor WebView window.location.origin is `capacitor://localhost`
 *  — not a valid public URL. This function always returns a web-accessible
 *  origin so copied invite links open in a browser correctly. */
export function shareOrigin(): string {
  if (_base) {
    try { return new URL(_base).origin; } catch {}
  }
  return window.location.origin;
}
