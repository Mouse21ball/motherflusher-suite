import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { getTableConnectionHealth, isTablePath, returnToLobby, TABLE_CONNECTION_EVENT, TABLE_JOIN_TIMEOUT_MS, type TableConnectionHealth } from '@/lib/tableConnectionHealth';

/** Kept outside the game error boundaries: neither game state nor network is
 * needed to escape. A hard local navigation also resets a crashed router. */
export function TableEscapeGuard() {
  const [path] = useLocation();
  const [connecting, setConnecting] = useState(false);
  const active = isTablePath(path);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const accept = (health: TableConnectionHealth | null) => {
      if (!health || health.path !== path || health.updatedAt < startedAt - 100) return;
      setConnecting(health.status === 'connecting');
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
  if (!active) return null;
  return (
    <aside style={{ position: 'fixed', left: 8, bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', zIndex: 2147483647, pointerEvents: 'auto' }}>
      <button type="button" data-testid="button-emergency-lobby" onClick={() => returnToLobby('local')}
        className="min-h-11 rounded-xl border border-amber-200/60 bg-black px-3 py-2 text-xs font-bold text-amber-100 shadow-lg"
        title="Leave locally without waiting for the connection. The server remains responsible for your balance.">
        {connecting ? 'Connecting… Return to lobby' : 'Emergency lobby exit'}
      </button>
    </aside>
  );
}