// ─── Session token management ─────────────────────────────────────────────────
// The server issues a session token on every login / guest init (via /api/auth/me).
// We store it in localStorage and attach it as X-Session-Token on every API call.
// Use apiFetch() as a drop-in replacement for fetch() on all authenticated endpoints.

const SESSION_KEY = "cgp_session_token";

export function getSessionToken(): string | null {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}

export function setSessionToken(token: string): void {
  try { localStorage.setItem(SESSION_KEY, token); } catch {}
}

export function clearSessionToken(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

/** Drop-in for fetch() — adds X-Session-Token header automatically. */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(options.headers as HeadersInit | undefined);
  if (token) headers.set("X-Session-Token", token);
  return fetch(url, { ...options, headers });
}
