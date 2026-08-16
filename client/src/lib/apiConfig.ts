// ─── API / WebSocket configuration ────────────────────────────────────────────
// Set VITE_API_BASE_URL at build time for Capacitor mobile builds so every
// request reaches the deployed backend instead of the Capacitor WebView origin
// (which is `capacitor://localhost` on iOS / `http://localhost` on Android).
//
// Example .env for a mobile build:
//   VITE_API_BASE_URL=https://yourapp.replit.app
//
// Leave unset for web development — relative URLs work as-is.

const _base: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

// ── Capacitor safety guard ────────────────────────────────────────────────────
// If this code is running inside a Capacitor WebView (Android or iOS) but
// VITE_API_BASE_URL was not injected at build time, every API call would
// silently resolve against the device's loopback (http://localhost or
// capacitor://localhost) and fail with a JSON parse error. Throw immediately
// so the failure is obvious and not buried in individual screen errors.
if (!_base && typeof window !== 'undefined') {
  const origin = window.location.origin;
  if (origin === 'http://localhost' || origin === 'capacitor://localhost') {
    throw new Error(
      '[apiConfig] VITE_API_BASE_URL is not set but the app is running inside a ' +
      'Capacitor WebView (' + origin + '). All API calls would silently fail. ' +
      'Set VITE_API_BASE_URL=https://your-deployed-backend.replit.app in the ' +
      'Codemagic (or local) build environment before building the APK/IPA.'
    );
  }
}

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
