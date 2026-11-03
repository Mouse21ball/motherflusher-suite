import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { getTableConnectionHealth, isTablePath, returnToLobby, TABLE_CONNECTION_EVENT, TABLE_JOIN_TIMEOUT_MS, type TableConnectionHealth } from '@/lib/tableConnectionHealth';

/** Kept outside the game error boundaries: neither game state nor network is
 * needed to escape. A hard local navigation also resets a crashed router. */
export function TableEscapeGuard() {
  const [path] = useLocation();
  // Detroit 2026-10-16: was discarded — now renders a visible reconnecting overlay.
  // Detroit 2026-10-24: wording distinguishes a first connection from
  // an actual reconnect (health.hasConnectedBefore).
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const active = isTablePath(path);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const accept = (health: TableConnectionHealth | null) => {
      if (!health || health.path !== path || health.updatedAt < startedAt - 100) return;
      setConnecting(health.status === 'connecting');
      setReconnecting(!!health.hasConnectedBefore);
      if (health.status === 'failed') returnToLobby('unavailable');
      else if (health.status === 'connecting') {
        // Reconnect attempts must not indefinitely extend the same deadline.
        if (!timer) timer = setTimeout(() => returnToLobby('timeout'), TABLE_JOIN_TIMEOUT_MS);
      } else {
        if (timer) clearTimeout(timer);
        timer = undefined;
      }
    };
    const listener = (event: Event) => accept((event as CustomEvent<TableConnectionHealth>).detail);
    window.addEventListener(TABLE_CONNECTION_EVENT, listener);
    accept(getTableConnectionHealth());
    return () => { if (timer) clearTimeout(timer); window.removeEventListener(TABLE_CONNECTION_EVENT, listener); };
  }, [active, path]);
  if (!active || !connecting) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="rounded-2xl px-6 py-4 text-center" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
        <div className="text-amber-200 text-sm font-mono font-bold animate-pulse">{reconnecting ? 'Reconnecting…' : 'Connecting…'}</div>
        <div className="text-white/50 text-xs font-mono mt-1">{reconnecting ? 'Hold tight — getting you back to the table' : 'Getting you to the table'}</div>
      </div>
    </div>
  );
}