import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  getProgression, getLevelInfo, getRankForLevel, getUnlockedAchievements,
  ACHIEVEMENTS, ACHIEVEMENT_MAP, type Achievement,
} from '@/lib/progression';
import { getStreakInfo } from '@/lib/dailyReward';
import { ensurePlayerIdentity, savePlayerIdentity, getAvatarInitials, getAvatarColor, getPlayerStats, getAllChips } from '@/lib/persistence';
import { useServerProfile } from '@/lib/useServerProfile';
import { AuthModal } from '@/components/AuthModal';

const RARITY_COLORS: Record<string, string> = {
  common: 'text-white/50 border-white/10 bg-white/[0.03]',
  rare: 'text-blue-400/80 border-blue-500/20 bg-blue-500/[0.05]',
  epic: 'text-purple-400/80 border-purple-500/25 bg-purple-500/[0.07]',
  legendary: 'text-[#C9A227] border-[#C9A227]/30 bg-[#C9A227]/[0.07]',
};

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary',
};

const MODE_NAMES: Record<string, string> = {
  badugi: 'Badugi', dead7: 'Dead 7', fifteen35: '15/35', suitspoker: 'Suits & Poker',
};

export default function Profile() {
  const [, navigate] = useLocation();
  const identity = ensurePlayerIdentity();
  const progression = getProgression();
  const levelInfo = getLevelInfo(progression.xp);
  const stats = getPlayerStats();
  const chips = getAllChips();
  const streakInfo = getStreakInfo();
  const unlocked = getUnlockedAchievements();
  const initials = getAvatarInitials(identity.name);
  const avatarColor = getAvatarColor(identity.avatarSeed);
  const totalChips = Object.values(chips).reduce((s, c) => s + c, 0);

  const { profile: serverProfile } = useServerProfile();

  // Use server-authoritative values when available; fall back to localStorage.
  const displayChips  = serverProfile?.chipBalance    ?? totalChips;
  const displayHands  = serverProfile?.handsPlayed    ?? stats.handsPlayed;
  const displayNet    = serverProfile?.lifetimeProfit ?? stats.totalChipChange;
  const displayLevel  = serverProfile?.level          ?? levelInfo.level;

  // Rank derived from displayLevel so badge text and rank color stay consistent.
  const rank = getRankForLevel(displayLevel);

  const [tab, setTab] = useState<'overview' | 'achievements'>('overview');

  // ── Account modal state ──────────────────────────────────────────────────────
  const [authOpen,    setAuthOpen]    = useState(false);
  const [authDefault, setAuthDefault] = useState<'login' | 'register'>('login');

  const openAuth = (t: 'login' | 'register') => { setAuthDefault(t); setAuthOpen(true); };

  const handleAuthSuccess = (displayName: string) => {
    setAuthOpen(false);
    window.location.reload();
    void displayName;
  };

  const handleLogout = () => {
    const freshId = crypto.randomUUID();
    savePlayerIdentity({
      id: freshId,
      name: identity.name,
      avatarSeed: freshId.slice(0, 8),
      createdAt: Date.now(),
    });
    window.location.reload();
  };

  // ── Delete account state ─────────────────────────────────────────────────────
  const [deleteOpen,        setDeleteOpen]        = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteBusy,        setDeleteBusy]        = useState(false);
  const [deleteError,       setDeleteError]       = useState<string | null>(null);

  const clearAllLocalData = () => {
    const keys = [
      'poker_table_identity',
      'poker_table_player_name',
      'poker_table_analytics_id',
      'poker_table_chips',
      'poker_table_history',
      'pt_daily_reward',
      'pt_progression',
    ];
    keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm.');
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);

    const isGuest = !serverProfile?.hasAuth;

    if (isGuest) {
      // Guest-only: no server record exists — just wipe local data and return to onboarding.
      clearAllLocalData();
      window.location.href = '/';
      return;
    }

    try {
      const { apiUrl } = await import('@/lib/apiConfig');
      const res = await fetch(apiUrl(`/api/players/${identity.id}`), { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        // If the server says "not found", the record is already gone — treat as success.
        if (res.status !== 404) {
          setDeleteError(d.error ?? 'Deletion failed. Try again.');
          setDeleteBusy(false);
          return;
        }
      }
      // Clear all local data regardless of server result
      clearAllLocalData();
      window.location.href = '/';
    } catch {
      setDeleteError('Could not reach the server. Check your connection and try again.');
      setDeleteBusy(false);
    }
  };

  const progressPct = Math.round(levelInfo.progress * 100);

  return (
    <div className="min-h-[100dvh] bg-[#070709] flex flex-col">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[500px] rounded-full"
          style={{ background: `radial-gradient(ellipse, ${rank.color}18 0%, transparent 70%)` }} />
      </div>
      {/* Header */}
      <header
        className="sticky top-0 z-40 w-full px-4 py-3 flex items-center gap-3 border-b"
        style={{ backgroundColor: 'rgba(7,7,9,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="text-[10px] font-mono text-white/30 hover:text-white/60 uppercase tracking-widest transition-colors"
          data-testid="link-back-home"
        >
          ‹ Lobby
        </button>
        <span className="text-white/10">·</span>
        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">⛓️ CGP Profile</span>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 py-6 gap-4 max-w-lg mx-auto w-full">
        {/* Avatar & identity */}
        <div className="w-full rounded-2xl bg-[#141417]/80 border border-white/[0.06] p-5 flex items-center gap-4">
          {/* Avatar with rank ring */}
          <div className="relative shrink-0">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-xl font-mono text-white shadow-lg"
              style={{ backgroundColor: avatarColor + '22', border: `2px solid ${rank.color}`, boxShadow: `0 0 16px ${rank.border}` }}
              data-testid="avatar-player"
            >
              {initials}
            </div>
            {/* Level badge */}
            <div
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold font-mono border-2 border-[#0B0B0D]"
              style={{ backgroundColor: rank.color, color: '#0B0B0D' }}
              data-testid="badge-level"
            >
              {displayLevel}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-bold text-white/90 text-base font-sans truncate" data-testid="text-profile-name">
              {identity.name}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full"
                style={{ color: rank.color, backgroundColor: rank.bg, border: `1px solid ${rank.border}` }}
                data-testid="badge-rank"
              >
                {rank.name}
              </span>
              {streakInfo.streak > 0 && (
                <span className="text-[10px] font-mono text-white/30">🔥 {streakInfo.streak}d streak</span>
              )}
            </div>

            {/* XP bar */}
            <div className="mt-2">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[9px] text-white/25 font-mono uppercase tracking-widest">
                  Level {levelInfo.level} · {levelInfo.xpIntoLevel.toLocaleString()} / {levelInfo.xpNeeded.toLocaleString()} XP
                </span>
                <span className="text-[9px] text-white/25 font-mono">{progressPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%`, backgroundColor: rank.color }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Account status card ─────────────────────────────────────────── */}
        {serverProfile?.hasAuth ? (
          <div className="w-full rounded-xl bg-[#141417]/80 border border-white/[0.05] px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
              style={{ backgroundColor: 'rgba(0,200,150,0.10)', border: '1px solid rgba(0,200,150,0.22)' }}>
              ✓
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest">Saved Account</div>
              <div className="text-xs font-mono text-white/55 truncate mt-0.5" data-testid="text-account-email">
                {serverProfile.email ?? 'Account linked'}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-[9px] font-mono text-white/20 hover:text-red-400/60 uppercase tracking-widest transition-colors shrink-0"
              data-testid="button-logout"
            >
              Log Out
            </button>
          </div>
        ) : (
          <div className="w-full rounded-xl bg-[#141417]/80 border border-white/[0.05] px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              👤
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest">Guest Account</div>
              <div className="text-[10px] font-mono text-white/30 mt-0.5">Progress saved on this device only</div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={() => openAuth('login')}
                className="text-[9px] font-mono text-white/30 hover:text-white/60 uppercase tracking-widest transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.04]"
                data-testid="button-profile-login"
              >
                Log In
              </button>
              <button
                onClick={() => openAuth('register')}
                className="text-[9px] font-mono uppercase tracking-widest transition-all px-2 py-1 rounded-lg"
                style={{ color: 'rgba(240,184,41,0.70)', backgroundColor: 'rgba(240,184,41,0.07)', border: '1px solid rgba(240,184,41,0.18)' }}
                data-testid="button-profile-register"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="w-full grid grid-cols-4 gap-2">
          {[
            { label: 'Hands', value: displayHands.toString() },
            { label: 'Win%', value: `${stats.winRate}%` },
            { label: 'Net', value: `${displayNet >= 0 ? '+' : ''}$${displayNet.toLocaleString()}` },
            { label: 'Chips', value: `$${displayChips.toLocaleString()}` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-[#141417]/80 border border-white/[0.05] p-3 flex flex-col items-center gap-0.5">
              <div className="text-[9px] text-white/25 font-mono uppercase tracking-widest">{label}</div>
              <div className="text-sm font-bold font-mono text-white/80 tabular-nums" data-testid={`stat-${label.toLowerCase()}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="w-full flex rounded-xl bg-[#141417]/60 border border-white/[0.04] p-1 gap-1">
          {(['overview', 'achievements'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'flex-1 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all duration-200',
                tab === t
                  ? 'bg-white/[0.06] text-white/70'
                  : 'text-white/25 hover:text-white/40',
              ].join(' ')}
              data-testid={`tab-${t}`}
            >
              {t === 'overview' ? 'Overview' : `Achievements (${unlocked.length}/${ACHIEVEMENTS.length})`}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="w-full space-y-3">
            {/* Per-mode stats */}
            {Object.entries(stats.byMode).length > 0 && (
              <div className="w-full rounded-xl bg-[#141417]/80 border border-white/[0.05] p-4">
                <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-3">By Game Mode</div>
                <div className="space-y-2.5">
                  {Object.entries(stats.byMode).map(([modeId, m]) => (
                    <div key={modeId} className="flex items-center justify-between">
                      <span className="text-sm text-white/55 font-sans">{MODE_NAMES[modeId] ?? modeId}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-white/30">{m.played} hands</span>
                        <span className="text-xs font-mono text-white/30">{m.played > 0 ? Math.round(m.wins / m.played * 100) : 0}% W</span>
                        <span className={`text-xs font-mono tabular-nums ${m.chipChange >= 0 ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                          {m.chipChange >= 0 ? '+' : ''}${m.chipChange}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Streak info */}
            <div className="w-full rounded-xl bg-[#141417]/80 border border-white/[0.05] p-4 flex items-center justify-between">
              <div>
                <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1">Daily Streak</div>
                <div className="text-2xl font-bold font-mono text-white/80">
                  {streakInfo.streak > 0 ? `${streakInfo.streak} 🔥` : '0'}
                </div>
                <div className="text-xs text-white/30 font-mono mt-0.5">
                  {streakInfo.streak > 0 ? `Day ${streakInfo.dayInCycle} of cycle` : 'Claim daily to start streak'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1">Best Pot</div>
                <div className="text-sm font-bold font-mono text-[#C9A227] tabular-nums">${progression.biggestPot}</div>
              </div>
            </div>

            {stats.handsPlayed === 0 && (
              <div className="text-center py-4">
                <p className="text-white/20 text-sm font-mono">No hands played yet. Start a game!</p>
              </div>
            )}
          </div>
        )}

        {tab === 'achievements' && (
          <div className="w-full space-y-3">
            {unlocked.length > 0 && (
              <div className="w-full rounded-xl bg-[#141417]/80 border border-white/[0.05] p-4">
                <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-3">
                  Earned ({unlocked.length})
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {unlocked.map(ach => (
                    <div
                      key={ach.id}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border ${RARITY_COLORS[ach.rarity]}`}
                      data-testid={`achievement-${ach.id}`}
                    >
                      <span className="text-xl leading-none shrink-0">{ach.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white/80 font-sans">{ach.name}</span>
                          <span className="text-[8px] font-mono uppercase tracking-widest opacity-60">
                            {RARITY_LABEL[ach.rarity]}
                          </span>
                        </div>
                        <div className="text-xs text-white/30 mt-0.5">{ach.description}</div>
                      </div>
                      <div className="text-[10px] font-mono text-emerald-400/60 shrink-0">+{ach.xpReward} XP</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Locked achievements */}
            <div className="w-full rounded-xl bg-[#141417]/80 border border-white/[0.05] p-4">
              <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-3">
                Locked ({ACHIEVEMENTS.length - unlocked.length})
              </div>
              <div className="grid grid-cols-1 gap-2">
                {ACHIEVEMENTS.filter(a => !unlocked.find(u => u.id === a.id)).map(ach => (
                  <div
                    key={ach.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 border border-white/[0.04] bg-white/[0.01] opacity-40"
                    data-testid={`achievement-locked-${ach.id}`}
                  >
                    <span className="text-xl leading-none shrink-0 grayscale">{ach.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white/50 font-sans">{ach.name}</div>
                      <div className="text-xs text-white/20 mt-0.5">{ach.description}</div>
                    </div>
                    <div className="text-[10px] font-mono text-white/20 shrink-0">+{ach.xpReward} XP</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Legal / account management footer ─────────────────────────── */}
      <div className="w-full max-w-lg mx-auto px-4 pb-8 mt-2 space-y-3">
        {/* Terms & Privacy links */}
        <div className="flex items-center justify-center gap-4">
          <a href="/terms" className="text-[10px] font-mono text-white/20 hover:text-white/45 transition-colors" data-testid="link-profile-terms">
            Terms &amp; Disclosures
          </a>
          <span className="text-white/10 text-[10px]">·</span>
          <a href="/privacy" className="text-[10px] font-mono text-white/20 hover:text-white/45 transition-colors" data-testid="link-profile-privacy">
            Privacy Policy
          </a>
        </div>

        {/* Virtual chips disclaimer */}
        <p className="text-center text-[11px] font-mono leading-relaxed" style={{ color: 'rgba(255,255,255,0.22)' }} data-testid="text-chips-disclaimer">
          Virtual chips are for entertainment only. They have no cash value, cannot be redeemed, and cannot be withdrawn.
        </p>

        {/* Delete account */}
        {!deleteOpen ? (
          <div className="flex justify-center pt-1">
            <button
              onClick={() => { setDeleteOpen(true); setDeleteError(null); setDeleteConfirmText(''); }}
              className="text-[10px] font-mono text-white/15 hover:text-red-400/50 transition-colors uppercase tracking-widest"
              data-testid="button-delete-account-open"
            >
              {serverProfile?.hasAuth ? 'Delete Account' : 'Clear Guest Data'}
            </button>
          </div>
        ) : (
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ backgroundColor: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.14)' }}
          >
            <div>
              <div className="text-[10px] font-mono font-bold text-red-400/70 uppercase tracking-widest mb-1">
                {serverProfile?.hasAuth ? '⚠ Delete Account' : '⚠ Clear Guest Data'}
              </div>
              <p className="text-[11px] font-mono text-white/35 leading-relaxed">
                {serverProfile?.hasAuth
                  ? 'This permanently deletes your account, email, chip balance, and all stats from our servers. This cannot be undone.'
                  : 'This clears all local guest data including your chip balance, stats, and progress on this device. This cannot be undone.'}
              </p>
            </div>
            <div>
              <label className="block text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1.5">
                Type DELETE to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => { setDeleteConfirmText(e.target.value); setDeleteError(null); }}
                placeholder="DELETE"
                autoComplete="off"
                className="w-full h-10 px-3 rounded-xl font-mono text-sm focus:outline-none transition-all"
                style={{
                  backgroundColor: '#17171F',
                  color: 'rgba(255,255,255,0.80)',
                  border: '1.5px solid rgba(220,38,38,0.25)',
                }}
                data-testid="input-delete-confirm"
              />
            </div>
            {deleteError && (
              <p className="text-[11px] font-mono text-red-400/70" data-testid="text-delete-error">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setDeleteOpen(false); setDeleteError(null); setDeleteConfirmText(''); }}
                className="flex-1 h-9 rounded-xl font-mono text-[11px] text-white/30 hover:text-white/60 transition-colors border border-white/[0.06]"
                data-testid="button-delete-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteBusy}
                className="flex-1 h-9 rounded-xl font-mono text-[11px] font-bold uppercase tracking-wider transition-all active:scale-[0.97]"
                style={{
                  backgroundColor: deleteBusy ? 'rgba(220,38,38,0.15)' : 'rgba(220,38,38,0.22)',
                  color: deleteBusy ? 'rgba(220,38,38,0.35)' : 'rgba(220,38,38,0.80)',
                  border: '1px solid rgba(220,38,38,0.25)',
                }}
                data-testid="button-delete-confirm"
              >
                {deleteBusy ? '…' : 'Delete Forever'}
              </button>
            </div>
          </div>
        )}
      </div>

      <AuthModal
        open={authOpen}
        defaultTab={authDefault}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
