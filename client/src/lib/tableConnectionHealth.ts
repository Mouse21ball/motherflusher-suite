export type TableConnectionStatus = 'connecting' | 'ready' | 'failed';
export const TABLE_CONNECTION_EVENT = 'cgp:table-connection';
export const TABLE_JOIN_TIMEOUT_MS = 15_000;
export interface TableConnectionHealth {
  status: TableConnectionStatus;
  path: string;
  updatedAt: number;
}
let latest: TableConnectionHealth | null = null;
export function returnToLobby(reason = 'local') {
  try { sessionStorage.setItem('cgp_skip_welcome_back_once', '1'); } catch {}
  window.location.replace(`/?tableExit=${encodeURIComponent(reason)}`);
}
export function getTableConnectionHealth() { return latest; }
export function reportTableConnection(status: TableConnectionStatus) {
  if (typeof window === 'undefined') return;
  latest = { status, path: window.location.pathname, updatedAt: Date.now() };
  window.dispatchEvent(new CustomEvent(TABLE_CONNECTION_EVENT, { detail: latest }));
}
export function isTablePath(path: string): boolean {
  return /^\/(?:badugi|flushedup|box-chevy|ladyluck(?:\/spectate)?|join\/[^/]+)\/?$/.test(path);
}