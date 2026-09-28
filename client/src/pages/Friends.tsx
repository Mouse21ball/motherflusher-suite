import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { apiUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';
import { ensurePlayerIdentity, resolveAvatarSrc } from '@/lib/persistence';

type PlayerSummary = { id: string; displayName: string; avatarId: string | null };
type Friend = PlayerSummary & {
  online: boolean;
  inTable: boolean;
  joinTable?: { tableId: string; modeId: string };
};
type FriendRequest = { id: string; player: PlayerSummary };
type FriendsResponse = {
  friends: Friend[];
  received: FriendRequest[];
  sent: FriendRequest[];
  recent: Array<{ player: PlayerSummary; lastPlayedAt: string }>;
};

const MODE_ROUTES: Record<string, string> = {
  badugi: '/badugi',
  dead7: '/dead7',
  fifteen35: '/fifteen35',
  suitspoker: '/suitspoker',
  suits_poker: '/suitspoker',
  flushedup: '/flushedup',
  flushed_up: '/flushedup',
  kamikaze: '/kamikaze',
  bonecrusher: '/bonecrusher',
  'box-chevy': '/box-chevy',
  box_chevy: '/box-chevy',
  boxchevy: '/box-chevy',
};

function Avatar({ player }: { player: PlayerSummary }) {
  const src = resolveAvatarSrc(null, player.avatarId);
  return src
    ? <img src={src} alt="" className="h-11 w-11 rounded-full object-cover border border-white/15" />
    : <div aria-hidden className="h-11 w-11 rounded-full border border-white/15 bg-white/10 flex items-center justify-center font-bold text-amber-200">{player.displayName.slice(0, 1).toUpperCase()}</div>;
}

export default function Friends() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<FriendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(apiUrl('/api/friends'));
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not load friends.');
      setData(body as FriendsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load friends.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadFriends(); }, [loadFriends]);

  const act = async (key: string, path: string, method = 'POST', body?: unknown) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch(apiUrl(path), {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error ?? 'That action could not be completed.');
      setNotice('Friend list updated.');
      await loadFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That action could not be completed.');
    } finally {
      setBusy(null);
    }
  };

  const sendRequest = (playerId: string) =>
    act(`add-${playerId}`, '/api/friends/requests', 'POST', { recipientId: playerId });

  const joinFriend = (friend: Friend) => {
    const route = friend.joinTable && MODE_ROUTES[friend.joinTable.modeId];
    if (!route || !friend.joinTable?.tableId) return;
    navigate(`${route}?t=${encodeURIComponent(friend.joinTable.tableId)}`);
  };

  const identity = ensurePlayerIdentity();
  const friendIds = new Set(data?.friends.map(friend => friend.id) ?? []);
  const pendingIds = new Set([
    ...(data?.sent.map(request => request.player.id) ?? []),
    ...(data?.received.map(request => request.player.id) ?? []),
  ]);
  const recentPlayers = data?.recent.filter((entry, index, entries) =>
    entries.findIndex(candidate => candidate.player.id === entry.player.id) === index
  ) ?? [];

  const section = (title: string, children: React.ReactNode, count?: number) => (
    <section className="rounded-2xl border border-white/10 bg-black/45 p-4">
      <h2 className="mb-3 flex items-center justify-between font-mono text-xs tracking-[0.18em] text-amber-200/80 uppercase">
        {title}<span className="text-white/35">{count ?? 0}</span>
      </h2>
      {children}
    </section>
  );

  const personRow = (person: PlayerSummary, trailing: React.ReactNode, key = person.id) => (
    <div key={key} className="flex items-center gap-3 py-2.5">
      <Avatar player={person} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{person.displayName}</span>
      {trailing}
    </div>
  );

  const buttonClass = 'rounded-lg border border-amber-300/30 px-3 py-2 text-xs font-mono font-bold tracking-wider text-amber-100 hover:bg-amber-200/10 disabled:opacity-40';

  return (
    <main className="min-h-[100dvh] bg-[#09080b] px-4 py-5 text-white">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <header className="flex items-center gap-3">
          <button className="rounded-full border border-amber-300/40 px-3 py-2 text-amber-200" onClick={() => navigate('/profile')} aria-label="Back to profile">‹</button>
          <div className="flex-1">
            <p className="font-mono text-[10px] tracking-[0.2em] text-amber-200/60">LOBBY · SOCIAL</p>
            <h1 className="text-xl font-bold tracking-wide">Friends</h1>
          </div>
          <button className={buttonClass} onClick={() => void loadFriends()} disabled={loading}>Refresh</button>
        </header>

        {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
        {notice && <p role="status" className="rounded-lg border border-emerald-400/25 bg-emerald-950/25 p-3 text-sm text-emerald-200">{notice}</p>}
        {loading && !data && <p className="py-8 text-center text-sm text-white/50">Loading friends…</p>}

        {data && <>
          {section('FRIENDS', data.friends.length
            ? data.friends.map(friend => personRow(
                friend,
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] font-mono ${friend.online ? 'text-emerald-300' : 'text-white/35'}`}>
                    {friend.online ? (friend.inTable ? 'IN TABLE' : 'ONLINE') : 'OFFLINE'}
                  </span>
                  {friend.online && friend.inTable && friend.joinTable && MODE_ROUTES[friend.joinTable.modeId] &&
                    <button className={buttonClass} onClick={() => joinFriend(friend)}>JOIN</button>}
                </div>,
              ))
            : <p className="py-2 text-sm text-white/45">No friends yet. Add someone from your recent games.</p>,
          data.friends.length)}

          {section('RECEIVED REQUESTS', data.received.length
            ? data.received.map(request => personRow(request.player,
                <div className="flex gap-2">
                  <button className={buttonClass} disabled={busy === `accept-${request.id}`} onClick={() => void act(`accept-${request.id}`, `/api/friends/requests/${encodeURIComponent(request.id)}/accept`)}>Accept</button>
                  <button className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/65 disabled:opacity-40" disabled={busy === `decline-${request.id}`} onClick={() => void act(`decline-${request.id}`, `/api/friends/requests/${encodeURIComponent(request.id)}/decline`)}>Decline</button>
                </div>, request.id))
            : <p className="py-2 text-sm text-white/45">No incoming requests.</p>,
          data.received.length)}

          {section('SENT REQUESTS', data.sent.length
            ? data.sent.map(request => personRow(request.player, <span className="text-xs text-white/40">Pending</span>, request.id))
            : <p className="py-2 text-sm text-white/45">No pending sent requests.</p>,
          data.sent.length)}

          {section('RECENT PLAYERS', recentPlayers.length
            ? recentPlayers.map(({ player, lastPlayedAt }) => {
                const canAdd = player.id !== identity.id && !friendIds.has(player.id) && !pendingIds.has(player.id);
                return personRow(player,
                  canAdd
                    ? <button className={buttonClass} disabled={busy === `add-${player.id}`} onClick={() => void sendRequest(player.id)}>ADD</button>
                    : <span className="text-[10px] text-white/35">{friendIds.has(player.id) ? 'FRIEND' : pendingIds.has(player.id) ? 'PENDING' : ''}</span>,
                  `${player.id}-${lastPlayedAt}`,
                );
              })
            : <p className="py-2 text-sm text-white/45">Recent opponents will appear here after a game.</p>,
          recentPlayers.length)}
        </>}
      </div>
    </main>
  );
}