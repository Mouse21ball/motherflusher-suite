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
  flushedup: '/flushedup',
  flushed_up: '/flushedup',
  'box-chevy': '/box-chevy',
  box_chevy: '/box-chevy',
  boxchevy: '/box-chevy',
  ladyluck: '/ladyluck',
};

function Avatar({ player }: { player: PlayerSummary }) {
  const src = resolveAvatarSrc(null, player.avatarId);
  return src
    ? <img src={src} alt="" className="h-11 w-11 rounded-full object-cover" style={{ border: '1px solid rgba(201,162,39,.25)' }} />
    : <div aria-hidden className="h-11 w-11 rounded-full flex items-center justify-center font-bold text-amber-200"
        style={{ border: '1px solid rgba(201,162,39,.25)', background: 'linear-gradient(145deg, rgba(38,30,52,.9), rgba(20,16,30,.92))' }}>
        {player.displayName.slice(0, 1).toUpperCase()}
      </div>;
}

// Obsidian Cut section container
const obsidianSection: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(201,162,39,.20)',
  background: 'linear-gradient(145deg, rgba(28,22,38,.88), rgba(14,11,20,.92))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07), inset 0 -1px 0 rgba(0,0,0,.45), 0 4px 16px rgba(0,0,0,.4)',
  backdropFilter: 'blur(12px)',
  padding: 16,
};

const obsidianButton: React.CSSProperties = {
  borderRadius: 10,
  border: '1px solid rgba(201,162,39,.25)',
  background: 'linear-gradient(145deg, rgba(38,30,52,.9), rgba(20,16,30,.92))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.09), inset 0 -1px 0 rgba(0,0,0,.45), 0 3px 10px rgba(0,0,0,.4)',
  color: '#F2C14E',
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'monospace',
  letterSpacing: '.08em',
  cursor: 'pointer',
};

export default function Friends() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<FriendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

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

  const loadInviteCode = useCallback(async () => {
    try {
      const res = await apiFetch(apiUrl('/api/friends/invite-code'));
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.code) setInviteCode(body.code);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { void loadFriends(); void loadInviteCode(); }, [loadFriends, loadInviteCode]);

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

  const redeemCode = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setBusy('redeem');
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch(apiUrl('/api/friends/by-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error ?? 'Could not send friend request.');
      setNotice(`Friend request sent! You both get 2,500 chips when they accept.`);
      setCodeInput('');
      await loadFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send friend request.');
    } finally {
      setBusy(null);
    }
  };

  const copyCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      setError('Could not copy. Your code is: ' + inviteCode);
    }
  };

  const shareCode = async () => {
    if (!inviteCode) return;
    const text = `Add me on Chain Gang Poker! My invite code is ${inviteCode}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Chain Gang Poker', text }); } catch { /* dismissed */ }
    } else {
      void copyCode();
    }
  };

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
    <section style={obsidianSection}>
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

  return (
    <main className="min-h-[100dvh] px-4 py-5 text-white" style={{ background: '#09080b' }}>
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <header className="flex items-center gap-3">
          <button
            style={{ ...obsidianButton, borderRadius: 999, padding: '8px 14px' }}
            onClick={() => navigate('/profile')}
            aria-label="Back to profile">‹</button>
          <div className="flex-1">
            <p className="font-mono text-[10px] tracking-[0.2em] text-amber-200/60">LOBBY · SOCIAL</p>
            <h1 className="text-xl font-bold tracking-wide">Friends</h1>
          </div>
          <button style={obsidianButton} onClick={() => void loadFriends()} disabled={loading}>Refresh</button>
        </header>

        {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
        {notice && <p role="status" className="rounded-lg border border-emerald-400/25 bg-emerald-950/25 p-3 text-sm text-emerald-200">{notice}</p>}
        {loading && !data && <p className="py-8 text-center text-sm text-white/50">Loading friends…</p>}

        {/* ── Invite code ── */}
        <section style={obsidianSection}>
          <h2 className="mb-3 font-mono text-xs tracking-[0.18em] text-amber-200/80 uppercase">Your Invite Code</h2>
          {inviteCode ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.2em] text-amber-100"
                  style={{ background: 'rgba(0,0,0,.4)', border: '1px solid rgba(201,162,39,.25)' }}>
                  {inviteCode}
                </div>
              </div>
              <div className="flex gap-2">
                <button style={{ ...obsidianButton, flex: 1 }} onClick={() => void copyCode()}>
                  {codeCopied ? '✓ COPIED' : 'COPY'}
                </button>
                <button style={{ ...obsidianButton, flex: 1 }} onClick={() => void shareCode()}>SHARE</button>
              </div>
              <p className="text-xs text-white/45 text-center">Share your code. You both get <span className="text-amber-200 font-bold">2,500 chips</span> when they accept.</p>
            </div>
          ) : (
            <p className="text-sm text-white/45">Loading your code…</p>
          )}
        </section>

        {/* ── Enter a code ── */}
        <section style={obsidianSection}>
          <h2 className="mb-3 font-mono text-xs tracking-[0.18em] text-amber-200/80 uppercase">Add by Code</h2>
          <div className="flex gap-2">
            <input
              value={codeInput}
              onChange={e => setCodeInput(e.target.value.toUpperCase())}
              placeholder="Enter friend's code"
              maxLength={16}
              className="flex-1 rounded-lg px-4 py-2.5 font-mono text-sm tracking-[0.15em] text-white placeholder:text-white/30 outline-none"
              style={{ background: 'rgba(0,0,0,.4)', border: '1px solid rgba(201,162,39,.25)' }}
            />
            <button style={obsidianButton} disabled={busy === 'redeem' || !codeInput.trim()} onClick={() => void redeemCode()}>
              {busy === 'redeem' ? '...' : 'ADD'}
            </button>
          </div>
        </section>

        {data && <>
          {section('FRIENDS', data.friends.length
            ? data.friends.map(friend => personRow(
                friend,
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] font-mono ${friend.online ? 'text-emerald-300' : 'text-white/35'}`}>
                    {friend.online ? (friend.inTable ? 'IN TABLE' : 'ONLINE') : 'OFFLINE'}
                  </span>
                  {friend.online && friend.inTable && friend.joinTable && MODE_ROUTES[friend.joinTable.modeId] &&
                    <button style={obsidianButton} onClick={() => joinFriend(friend)}>JOIN</button>}
                </div>,
              ))
            : <p className="py-2 text-sm text-white/45">No friends yet. Share your invite code above.</p>,
          data.friends.length)}

          {section('RECEIVED REQUESTS', data.received.length
            ? data.received.map(request => personRow(request.player,
                <div className="flex gap-2">
                  <button style={obsidianButton} disabled={busy === `accept-${request.id}`} onClick={() => void act(`accept-${request.id}`, `/api/friends/requests/${encodeURIComponent(request.id)}/accept`)}>Accept</button>
                  <button
                    style={{ ...obsidianButton, color: 'rgba(255,255,255,.65)', borderColor: 'rgba(255,255,255,.15)' }}
                    disabled={busy === `decline-${request.id}`}
                    onClick={() => void act(`decline-${request.id}`, `/api/friends/requests/${encodeURIComponent(request.id)}/decline`)}>Decline</button>
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
                    ? <button style={obsidianButton} disabled={busy === `add-${player.id}`} onClick={() => void sendRequest(player.id)}>ADD</button>
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
