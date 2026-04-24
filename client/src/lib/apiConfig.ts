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

/** Prefix a backend API path with the configured origin (empty = relative). */
export function apiUrl(path: string): string {
  return `${_base}${path}`;
}

/** WebSocket URL for the real-time server connection. */
export function wsUrl(): string {
  if (_base) {
    try {
      const u = new URL(_base);
      const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${u.host}/ws`;
    } catch {}
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
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
