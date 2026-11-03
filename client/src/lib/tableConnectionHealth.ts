export type TableConnectionStatus = 'connecting' | 'ready' | 'failed';
export const TABLE_CONNECTION_EVENT = 'cgp:table-connection';
export const TABLE_JOIN_TIMEOUT_MS = 15_000;
export interface TableConnectionHealth {
  status: TableConnectionStatus;
  path: string;
  updatedAt: number;
  /** True once this path has reached 'ready' at least once this
   *  session. Distinguishes a FIRST connection ("Connecting…") from an
   *  actual re-connection ("Reconnecting…") — Detroit 2026-10-24: the
   *  guard previously called every initial connect a reconnect. */
  hasConnectedBefore: boolean;
}
let latest: TableConnectionHealth | null = null;
const readyPaths = new Set<string>();
export function returnToLobby(reason = 'local') {
  try { sessionStorage.setItem('cgp_skip_welcome_back_once', '1'); } catch {}
  window.location.replace(`/?tableExit=${encodeURIComponent(reason)}`);
}
export function getTableConnectionHealth() { return latest; }
export function reportTableConnection(status: TableConnectionStatus) {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  if (status === 'ready') readyPaths.add(path);
  latest = { status, path, updatedAt: Date.now(), hasConnectedBefore: readyPaths.has(path) };
  window.dispatchEvent(new CustomEvent(TABLE_CONNECTION_EVENT, { detail: latest }));
}
export function isTablePath(path: string): boolean {
  return /^\/(?:badugi|flushedup|box-chevy|ladyluck(?:\/spectate)?|join\/[^/]+)\/?$/.test(path);
}
