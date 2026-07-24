// ─── Session token management ─────────────────────────────────────────────────
// The server issues a session token on every login / guest init (via /api/auth/me).
// We store it in localStorage and attach it as X-Session-Token on every API call.
// Use apiFetch() as a drop-in replacement for fetch() on all authenticated endpoints.
//
// iOS Safari private browsing mode throws on localStorage.setItem (quota = 0).
// To survive that, we keep an in-memory fallback.  The fallback is cleared on a
// full page reload but persists across SPA navigations — enough for a play session.

const SESSION_KEY = "cgp_session_token";

// In-memory fallback for environments where localStorage is unavailable (e.g.
// iOS Safari private browsing).
let _memoryToken: string | null = null;

export function getSessionToken(): string | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) return stored;
  } catch {}
  return _memoryToken;
}

export function setSessionToken(token: string): void {
  _memoryToken = token; // always set memory copy first
  try { localStorage.setItem(SESSION_KEY, token); } catch {}
}

export function clearSessionToken(): void {
  _memoryToken = null;
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

/** Drop-in for fetch() — adds X-Session-Token header automatically. */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(options.headers as HeadersInit | undefined);
  if (token) headers.set("X-Session-Token", token);
  return fetch(url, { ...options, headers });
}
