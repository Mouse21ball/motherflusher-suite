import { useState, useEffect, useCallback } from 'react';
import { apiFetch as sessionFetch } from '@/lib/session';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await sessionFetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

interface BlockedPlayer {
  blockedId: string;
  displayName: string;
  blockedAt: string;
}

export function BlockList() {
  const [list, setList]           = useState<BlockedPlayer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { ok, data } = await apiFetch('/api/players/blocks');
    setLoading(false);
    if (ok) {
      setList((data as { blocked?: BlockedPlayer[] }).blocked ?? []);
    } else {
      setError('Could not load blocked players.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function unblock(id: string) {
    setUnblocking(id);
    const { ok } = await apiFetch(`/api/players/blocks/${id}`, { method: 'DELETE' });
    if (ok) {
      setList(prev => prev.filter(p => p.blockedId !== id));
    }
    setUnblocking(null);
  }

  if (loading) {
    return (
      <div
        className="text-center py-6 text-xs font-mono"
        style={{ color: 'rgba(255,255,255,0.25)' }}
        data-testid="block-list-loading"
      >
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="text-center py-4 text-xs font-mono"
        style={{ color: 'rgba(220,80,80,0.60)' }}
        data-testid="block-list-error"
      >
        {error}
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div
        className="text-center py-4 text-xs font-mono"
        style={{ color: 'rgba(255,255,255,0.25)' }}
        data-testid="block-list-empty"
      >
        You haven't blocked anyone.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="block-list">
      {list.map(p => (
        <div
          key={p.blockedId}
          className="flex items-center justify-between rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          data-testid={`block-row-${p.blockedId}`}
        >
          <span
            className="text-sm font-mono"
            style={{ color: 'rgba(255,255,255,0.60)' }}
            data-testid={`block-name-${p.blockedId}`}
          >
            {p.displayName}
          </span>
          <button
            onClick={() => unblock(p.blockedId)}
            disabled={unblocking === p.blockedId}
            className="text-xs font-mono uppercase tracking-widest px-3 py-1 rounded-lg transition-all active:scale-[0.97]"
            style={{
              background: 'rgba(220,80,80,0.10)',
              color: unblocking === p.blockedId ? 'rgba(220,80,80,0.30)' : 'rgba(220,80,80,0.65)',
              border: '1px solid rgba(220,80,80,0.15)',
              cursor: unblocking === p.blockedId ? 'default' : 'pointer',
            }}
            data-testid={`unblock-btn-${p.blockedId}`}
          >
            {unblocking === p.blockedId ? 'Removing…' : 'Unblock'}
          </button>
        </div>
      ))}
    </div>
  );
}
