// ─── Profile ──────────────────────────────────────────────────────────────────
// Visual rebuild matching the copper-bezel / carbon-fiber mockup design.
// All existing logic (delete account, auth, stats, achievements) is preserved
// unchanged. New features: avatar selection, name-change cooldown, guest
// 24h reset countdown.

import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { track } from '@/lib/analytics';
import {
  getProgression, getLevelInfo, getRankForLevel, getUnlockedAchievements,
  ACHIEVEMENTS, type Achievement,
} from '@/lib/progression';
import { getStreakInfo } from '@/lib/dailyReward';
import {
  ensurePlayerIdentity, savePlayerIdentity,
  getAvatarInitials, getAvatarColor, getPlayerStats, getAllChips,
} from '@/lib/persistence';
import { useServerProfile } from '@/lib/useServerProfile';
import { AuthModal } from '@/components/AuthModal';
import { apiUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';

// ─── Avatar preset definitions ────────────────────────────────────────────────

const AVATAR_OPTIONS = [
  { id: null,       label: 'Default',  src: null },
  { id: 'bear',     label: 'Bear',     src: '/emote-bear-celebrating.png' },
  { id: 'bulldog',  label: 'Bulldog',  src: '/emote-bulldog-cigar.png' },
  { id: 'cat',      label: 'Cat',      src: '/emote-cat-thinking.png' },
  { id: 'fox',      label: 'Fox',      src: '/emote-fox-smug.png' },
  { id: 'gorilla',  label: 'Gorilla',  src: '/emote-gorilla-angry.png' },
  { id: 'wolf',     label: 'Wolf',     src: '/emote-wolf-tilted.png' },
] as const;

type AvatarOptionId = typeof AVATAR_OPTIONS[number]['id'];

// ─── Constants ────────────────────────────────────────────────────────────────

const NAME_CHANGE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

const RARITY_COLORS: Record<string, string> = {
  common:    'text-white/50 border-white/10 bg-white/[0.03]',
  rare:      'text-blue-400/80 border-blue-500/20 bg-blue-500/[0.05]',
  epic:      'text-purple-400/80 border-purple-500/25 bg-purple-500/[0.07]',
  legendary: 'text-[#C9A227] border-[#C9A227]/30 bg-[#C9A227]/[0.07]',
};

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary',
};

const MODE_NAMES: Record<string, string> = {
  badugi: 'Badugi', dead7: 'Dead 7', fifteen35: '15/35', suitspoker: 'Suits & Poker',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'soon';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Shared UI pieces ─────────────────────────────────────────────────────────

function CopperBezel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`w-full ${className}`}
      style={{
        background: 'linear-gradient(145deg, #d4a830 0%, #9a6c18 20%, #6b4610 45%, #c49028 65%, #8a5c14 85%, #d4a830 100%)',
        padding: '1.5px',
        borderRadius: 14,
      }}
    >
      <div style={{ background: '#1c1910', borderRadius: 12.5 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Profile() {
  const [, navigate] = useLocation();

  // ── Data sources ───────────────────────────────────────────────────────────
  const identity    = ensurePlayerIdentity();
  const progression = getProgression();
  const levelInfo   = getLevelInfo(progression.xp);
  const stats       = getPlayerStats();
  const chips       = getAllChips();
  const streakInfo  = getStreakInfo();
  const unlocked    = getUnlockedAchievements();
  const initials    = getAvatarInitials(identity.name);
  const avatarColor = getAvatarColor(identity.avatarSeed);
  const totalChips  = Object.values(chips).reduce((s, c) => s + c, 0);

  const { profile: serverProfile, refetch } = useServerProfile();

  // Server-authoritative values with localStorage fallbacks
  const displayChips = serverProfile?.chipBalance    ?? totalChips;
  const displayHands = serverProfile?.handsPlayed    ?? stats.handsPlayed;
  const displayNet   = serverProfile?.lifetimeProfit ?? stats.totalChipChange;
  const displayLevel = serverProfile?.level          ?? levelInfo.level;
  const rank         = getRankForLevel(displayLevel);

  // Current avatar (server is truth; fall back to localStorage)
  const currentAvatarId  = (serverProfile?.avatarId ?? identity.avatarId) ?? null;
  const currentAvatarSrc = AVATAR_OPTIONS.find(a => a.id === currentAvatarId)?.src ?? null;

  const progressPct = Math.round(levelInfo.progress * 100);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'overview' | 'achievements'>('overview');

  // ── Auth modal ─────────────────────────────────────────────────────────────
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
    savePlayerIdentity({ id: freshId, name: identity.name, avatarSeed: freshId.slice(0, 8), createdAt: Date.now() });
    window.location.reload();
  };

  // ── Delete account ─────────────────────────────────────────────────────────
  const [deleteOpen,        setDeleteOpen]        = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteBusy,        setDeleteBusy]        = useState(false);
  const [deleteError,       setDeleteError]       = useState<string | null>(null);

  const clearAllLocalData = () => {
    ['poker_table_identity', 'poker_table_player_name', 'poker_table_analytics_id',
     'poker_table_chips', 'poker_table_history', 'pt_daily_reward', 'pt_progression']
      .forEach(k => { try { localStorage.removeItem(k); } catch {} });
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm.');
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    const isGuest = !serverProfile?.hasAuth;
    if (isGuest) { clearAllLocalData(); window.location.href = '/'; return; }
    try {
      const { apiUrl } = await import('@/lib/apiConfig');
      const res = await apiFetch(apiUrl(`/api/players/${identity.id}`), { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (res.status !== 404) { setDeleteError(d.error ?? 'Deletion failed.'); setDeleteBusy(false); return; }
      }
      clearAllLocalData();
      window.location.href = '/';
    } catch {
      setDeleteError('Could not reach the server. Check your connection and try again.');
      setDeleteBusy(false);
    }
  };

  // ── Avatar picker ──────────────────────────────────────────────────────────
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarSaving,     setAvatarSaving]     = useState(false);

  const handleSelectAvatar = useCallback(async (avatarId: AvatarOptionId) => {
    setAvatarSaving(true);
    try {
      await apiFetch(apiUrl(`/api/players/${identity.id}/avatar`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId }),
      });
      savePlayerIdentity({ ...identity, avatarId: avatarId ?? null });
      refetch();
      setAvatarPickerOpen(false);
    } catch {
      // silent — avatar saving is non-critical
    } finally {
      setAvatarSaving(false);
    }
  }, [identity, refetch]);

  // ── Name change ────────────────────────────────────────────────────────────
  const [nameChangeOpen,  setNameChangeOpen]  = useState(false);
  const [nameChangeDraft, setNameChangeDraft] = useState('');
  const [nameChangeBusy,  setNameChangeBusy]  = useState(false);
  const [nameChangeError, setNameChangeError] = useState<string | null>(null);

  const nameChangeCooldownRemaining = serverProfile?.lastNameChangeAt
    ? Math.max(0, NAME_CHANGE_COOLDOWN_MS - (Date.now() - new Date(serverProfile.lastNameChangeAt).getTime()))
    : 0;
  const nameChangeOnCooldown = nameChangeCooldownRemaining > 0;
  const nameChangeCooldownDays = Math.ceil(nameChangeCooldownRemaining / (24 * 60 * 60 * 1000));

  const openNameChange = () => {
    setNameChangeDraft(identity.name);
    setNameChangeError(null);
    setNameChangeOpen(true);
  };

  const handleNameChange = async () => {
    const trimmed = nameChangeDraft.trim();
    if (!trimmed || trimmed === identity.name) { setNameChangeOpen(false); return; }
    setNameChangeBusy(true);
    setNameChangeError(null);
    try {
      const res = await apiFetch(apiUrl(`/api/players/${identity.id}/name`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json() as { displayName?: string; error?: string };
      if (!res.ok) { setNameChangeError(data.error ?? 'Failed to update name'); return; }
      savePlayerIdentity({ ...identity, name: data.displayName ?? trimmed });
      refetch();
      setNameChangeOpen(false);
    } catch {
      setNameChangeError('Could not reach server. Try again.');
    } finally {
      setNameChangeBusy(false);
    }
  };

  // ── Guest reset countdown ──────────────────────────────────────────────────
  const [resetCountdownMs, setResetCountdownMs] = useState(0);
  useEffect(() => {
    if (!serverProfile?.nextResetAt || serverProfile.hasAuth) return;
    const update = () => {
      setResetCountdownMs(Math.max(0, new Date(serverProfile.nextResetAt!).getTime() - Date.now()));
    };
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [serverProfile?.nextResetAt, serverProfile?.hasAuth]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{ background: '#0c0b08' }}
    >
      {/* Carbon-fiber texture overlay */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            repeating-linear-gradient(45deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 10px),
            repeating-linear-gradient(-45deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 10px)
          `,
          zIndex: 0,
        }}
      />

      {/* Ambient rank glow */}
      <div aria-hidden className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[500px] h-[400px] rounded-full"
          style={{ background: `radial-gradient(ellipse, ${rank.color}14 0%, transparent 70%)` }}
        />
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 w-full px-4 py-3 flex items-center gap-3 border-b"
        style={{ backgroundColor: 'rgba(12,11,8,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(180,130,40,0.12)', position: 'relative', zIndex: 40 }}
      >
        <button
          onClick={() => navigate('/')}
          className="text-[10px] font-mono uppercase tracking-widest transition-colors"
          style={{ color: 'rgba(180,130,40,0.55)' }}
          data-testid="link-back-home"
        >
          ‹ Lobby
        </button>
        <span style={{ color: 'rgba(180,130,40,0.20)' }}>·</span>
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'rgba(180,130,40,0.40)' }}>
          ⛓️ CGP Profile
        </span>
      </header>

      {/* ── Scrollable body ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center px-4 py-5 gap-3 max-w-lg mx-auto w-full" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Profile card (copper bezel) ─────────────────────────────────── */}
        <CopperBezel>
          <div className="p-4 flex items-center gap-4">
            {/* Avatar with edit affordance */}
            <div className="relative shrink-0" style={{ width: 72, height: 72 }}>
              {/* Metal frame around avatar */}
              <div
                style={{
                  position: 'absolute',
                  inset: -2,
                  background: 'linear-gradient(145deg, #c49028 0%, #7a4e10 50%, #c49028 100%)',
                  borderRadius: 14,
                  zIndex: 0,
                }}
              />
              <button
                onClick={() => setAvatarPickerOpen(true)}
                data-testid="button-avatar-change"
                style={{
                  position: 'relative',
                  zIndex: 1,
                  width: 72,
                  height: 72,
                  borderRadius: 12,
                  background: avatarColor + '22',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {currentAvatarSrc ? (
                  <img
                    src={currentAvatarSrc}
                    alt="avatar"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span
                    className="font-bold font-mono text-xl text-white"
                    data-testid="avatar-player"
                  >
                    {initials}
                  </span>
                )}
              </button>
              {/* Edit pencil badge */}
              <div
                aria-hidden
                onClick={() => setAvatarPickerOpen(true)}
                style={{
                  position: 'absolute',
                  bottom: -4,
                  right: -4,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #c49028 0%, #8a5c14 100%)',
                  border: '1.5px solid #0c0b08',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                  zIndex: 2,
                }}
              >
                ✏
              </div>
              {/* Level badge */}
              <div
                className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold font-mono border-2"
                style={{ backgroundColor: rank.color, color: '#0c0b08', borderColor: '#0c0b08', zIndex: 2 }}
                data-testid="badge-level"
              >
                {displayLevel}
              </div>
            </div>

            {/* Identity info */}
            <div className="flex-1 min-w-0">
              {/* Name with edit icon */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className="font-bold text-base font-sans truncate"
                  style={{ color: 'rgba(255,255,255,0.90)' }}
                  data-testid="text-profile-name"
                >
                  {identity.name}
                </span>
                <button
                  onClick={openNameChange}
                  data-testid="button-name-change"
                  style={{
                    fontSize: '0.65rem',
                    color: 'rgba(180,130,40,0.50)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 2px',
                    lineHeight: 1,
                  }}
                  title="Change display name"
                >
                  ✏
                </button>
              </div>

              {/* Rank + streak badges */}
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full"
                  style={{ color: rank.color, backgroundColor: rank.bg, border: `1px solid ${rank.border}` }}
                  data-testid="badge-rank"
                >
                  {rank.name}
                </span>
                {streakInfo.streak > 0 && (
                  <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.30)' }}>
                    🔥 {streakInfo.streak}d streak
                  </span>
                )}
              </div>

              {/* XP bar */}
              <div>
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: 'rgba(180,130,40,0.45)' }}>
                    Level {levelInfo.level} · {levelInfo.xpIntoLevel.toLocaleString()} / {levelInfo.xpNeeded.toLocaleString()} XP
                  </span>
                  <span className="text-[8px] font-mono" style={{ color: 'rgba(180,130,40,0.45)' }}>{progressPct}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${progressPct}%`,
                      background: 'linear-gradient(90deg, #c49028 0%, #f0c040 50%, #c49028 100%)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </CopperBezel>

        {/* ── Account status card ─────────────────────────────────────────── */}
        {serverProfile?.hasAuth ? (
          <div
            className="w-full px-4 py-3 flex items-center gap-3 rounded-xl"
            style={{ background: '#1c1910', border: '1px solid rgba(0,200,150,0.18)' }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
              style={{ backgroundColor: 'rgba(0,200,150,0.10)', border: '1px solid rgba(0,200,150,0.22)' }}
            >
              ✓
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Saved Account
              </div>
              <div className="text-xs font-mono truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.50)' }} data-testid="text-account-email">
                {serverProfile.email ?? 'Account linked'}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-[9px] font-mono uppercase tracking-widest transition-colors shrink-0"
              style={{ color: 'rgba(255,255,255,0.20)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(220,80,80,0.70)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.20)')}
              data-testid="button-logout"
            >
              Log Out
            </button>
          </div>
        ) : (
          /* Guest account block with reset countdown */
          <div
            className="w-full rounded-xl overflow-hidden"
            style={{ background: '#1c1910', border: '1px solid rgba(180,130,40,0.18)' }}
          >
            <div className="px-4 pt-3 pb-2 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                👤
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Guest Account
                </div>
                {resetCountdownMs > 0 ? (
                  <div className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(220,140,40,0.65)' }}>
                    ⏳ Progress resets in: <strong>{formatCountdown(resetCountdownMs)}</strong>
                  </div>
                ) : (
                  <div className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                    Progress saved on this device only
                  </div>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => openAuth('login')}
                  className="text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded-lg transition-colors"
                  style={{ color: 'rgba(255,255,255,0.30)' }}
                  data-testid="button-profile-login"
                >
                  Log In
                </button>
                <button
                  onClick={() => openAuth('register')}
                  className="text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded-lg transition-all"
                  style={{
                    color: 'rgba(200,140,30,0.80)',
                    background: 'rgba(180,120,20,0.14)',
                    border: '1px solid rgba(180,120,20,0.30)',
                  }}
                  data-testid="button-profile-register"
                >
                  Save
                </button>
              </div>
            </div>
            {/* Save-progress CTA banner */}
            <button
              onClick={() => openAuth('register')}
              className="w-full px-4 py-2 text-left transition-colors"
              style={{ background: 'rgba(180,110,10,0.12)', borderTop: '1px solid rgba(180,110,10,0.18)' }}
              data-testid="button-save-progress-cta"
            >
              <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: 'rgba(200,145,40,0.65)' }}>
                ⛓ Save your progress — create a profile to keep chips, XP &amp; stats
              </span>
            </button>
          </div>
        )}

        {/* ── Stats row ───────────────────────────────────────────────────── */}
        <div className="w-full grid grid-cols-4 gap-2">
          {[
            {
              label: 'HANDS',
              value: displayHands.toString(),
              icon: '🃏',
              testId: 'stat-hands',
            },
            {
              label: 'WIN%',
              value: `${stats.winRate}%`,
              icon: '🎯',
              testId: 'stat-win%',
            },
            {
              label: 'NET',
              value: displayNet >= 0 ? `+$${displayNet.toLocaleString()}` : `-$${Math.abs(displayNet).toLocaleString()}`,
              icon: displayNet >= 0 ? '📈' : '📉',
              testId: 'stat-net',
              valueColor: displayNet > 0 ? '#40c878' : displayNet < 0 ? '#e05050' : 'rgba(255,255,255,0.75)',
            },
            {
              label: 'CHIPS',
              value: `$${displayChips.toLocaleString()}`,
              icon: '🪙',
              testId: 'stat-chips',
              valueColor: '#c49028',
            },
          ].map(({ label, value, icon, testId, valueColor }) => (
            <div
              key={label}
              className="rounded-xl flex flex-col items-center gap-0.5 py-2 px-1"
              style={{ background: '#1c1910', border: '1px solid rgba(180,130,40,0.15)' }}
            >
              <div className="text-[8px] font-mono uppercase tracking-widest" style={{ color: 'rgba(180,130,40,0.50)' }}>
                {label}
              </div>
              <div
                className="text-[11px] font-bold font-mono tabular-nums leading-tight text-center"
                style={{ color: valueColor ?? 'rgba(255,255,255,0.80)' }}
                data-testid={testId}
              >
                {value}
              </div>
              <div style={{ fontSize: '1.4rem', lineHeight: 1, marginTop: 2 }}>{icon}</div>
            </div>
          ))}
        </div>

        {/* ── Stripes balance ──────────────────────────────────────────────── */}
        <div
          className="w-full flex items-center gap-3 rounded-xl px-4 py-2.5"
          style={{ background: 'rgba(16,8,26,0.80)', border: '1px solid rgba(168,85,247,0.18)' }}
        >
          <img src="/stripes-icon.png" alt="" aria-hidden="true" style={{ width: 30, height: 30, flexShrink: 0 }} />
          <div className="flex flex-col gap-0">
            <div className="text-[8px] font-mono uppercase tracking-widest" style={{ color: 'rgba(168,85,247,0.50)' }}>STRIPES</div>
            <div
              className="text-sm font-bold font-mono tabular-nums leading-tight"
              style={{ color: '#a855f7' }}
              data-testid="stat-stripes"
            >
              {(serverProfile?.stripes ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="flex-1" />
          <div className="text-[8px] font-mono uppercase tracking-widest text-right" style={{ color: 'rgba(168,85,247,0.30)' }}>Premium Currency</div>
        </div>

        {/* ── Tab toggle ──────────────────────────────────────────────────── */}
        <div
          className="w-full flex rounded-xl p-0.5 gap-0.5"
          style={{ background: '#1c1910', border: '1px solid rgba(180,130,40,0.12)' }}
        >
          {(['overview', 'achievements'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all duration-200"
              style={{
                background: tab === t ? 'rgba(180,130,40,0.18)' : 'transparent',
                color: tab === t ? 'rgba(210,160,50,0.90)' : 'rgba(255,255,255,0.22)',
                border: tab === t ? '1px solid rgba(180,130,40,0.25)' : '1px solid transparent',
              }}
              data-testid={`tab-${t}`}
            >
              {t === 'overview' ? 'Overview' : `Achievements (${unlocked.length}/${ACHIEVEMENTS.length})`}
            </button>
          ))}
        </div>

        {/* ── Overview tab ────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="w-full space-y-3">
            {Object.entries(stats.byMode).length > 0 && (
              <div className="w-full rounded-xl p-4" style={{ background: '#1c1910', border: '1px solid rgba(180,130,40,0.12)' }}>
                <div className="text-[8px] font-mono uppercase tracking-widest mb-3" style={{ color: 'rgba(180,130,40,0.45)' }}>
                  By Game Mode
                </div>
                <div className="space-y-2.5">
                  {Object.entries(stats.byMode).map(([modeId, m]) => (
                    <div key={modeId} className="flex items-center justify-between">
                      <span className="text-sm font-sans" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        {MODE_NAMES[modeId] ?? modeId}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.28)' }}>{m.played} hands</span>
                        <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.28)' }}>
                          {m.played > 0 ? Math.round(m.wins / m.played * 100) : 0}% W
                        </span>
                        <span
                          className="text-xs font-mono tabular-nums"
                          style={{ color: m.chipChange >= 0 ? 'rgba(64,200,120,0.70)' : 'rgba(220,80,80,0.70)' }}
                        >
                          {m.chipChange >= 0 ? `+$${m.chipChange}` : `-$${Math.abs(m.chipChange)}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Streak + Best Pot */}
            <div
              className="w-full rounded-xl p-4 flex items-center justify-between"
              style={{ background: '#1c1910', border: '1px solid rgba(180,130,40,0.12)' }}
            >
              <div>
                <div className="text-[8px] font-mono uppercase tracking-widest mb-1" style={{ color: 'rgba(180,130,40,0.45)' }}>
                  Daily Streak
                </div>
                <div className="text-2xl font-bold font-mono" style={{ color: 'rgba(255,255,255,0.80)' }}>
                  {streakInfo.streak > 0 ? `${streakInfo.streak} 🔥` : '0'}
                </div>
                <div className="text-xs font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                  {streakInfo.streak > 0 ? `Day ${streakInfo.dayInCycle} of cycle` : 'Claim daily to start streak'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[8px] font-mono uppercase tracking-widest mb-1" style={{ color: 'rgba(180,130,40,0.45)' }}>
                  Best Pot
                </div>
                <div className="text-lg mb-0.5">🏆</div>
                <div className="text-sm font-bold font-mono tabular-nums" style={{ color: '#c49028' }}>
                  ${progression.biggestPot.toLocaleString()}
                </div>
              </div>
            </div>

            {stats.handsPlayed === 0 && (
              <div className="text-center py-4">
                <p className="text-sm font-mono" style={{ color: 'rgba(255,255,255,0.20)' }}>
                  No hands played yet. Start a game!
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Achievements tab ────────────────────────────────────────────── */}
        {tab === 'achievements' && (
          <div className="w-full space-y-3">
            {unlocked.length > 0 && (
              <div className="w-full rounded-xl p-4" style={{ background: '#1c1910', border: '1px solid rgba(180,130,40,0.12)' }}>
                <div className="text-[8px] font-mono uppercase tracking-widest mb-3" style={{ color: 'rgba(180,130,40,0.45)' }}>
                  Earned ({unlocked.length})
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {unlocked.map((ach: Achievement) => (
                    <div
                      key={ach.id}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border ${RARITY_COLORS[ach.rarity]}`}
                      data-testid={`achievement-${ach.id}`}
                    >
                      <span className="text-xl leading-none shrink-0">{ach.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold font-sans" style={{ color: 'rgba(255,255,255,0.80)' }}>{ach.name}</span>
                          <span className="text-[8px] font-mono uppercase tracking-widest opacity-60">{RARITY_LABEL[ach.rarity]}</span>
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.30)' }}>{ach.description}</div>
                      </div>
                      <div className="text-[10px] font-mono shrink-0" style={{ color: 'rgba(64,200,120,0.60)' }}>+{ach.xpReward} XP</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="w-full rounded-xl p-4" style={{ background: '#1c1910', border: '1px solid rgba(180,130,40,0.12)' }}>
              <div className="text-[8px] font-mono uppercase tracking-widest mb-3" style={{ color: 'rgba(180,130,40,0.45)' }}>
                Locked ({ACHIEVEMENTS.length - unlocked.length})
              </div>
              <div className="grid grid-cols-1 gap-2">
                {ACHIEVEMENTS.filter(a => !unlocked.find(u => u.id === a.id)).map((ach: Achievement) => (
                  <div
                    key={ach.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 border border-white/[0.04] bg-white/[0.01] opacity-40"
                    data-testid={`achievement-locked-${ach.id}`}
                  >
                    <span className="text-xl leading-none shrink-0 grayscale">{ach.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold font-sans" style={{ color: 'rgba(255,255,255,0.50)' }}>{ach.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.20)' }}>{ach.description}</div>
                    </div>
                    <div className="text-[10px] font-mono shrink-0" style={{ color: 'rgba(255,255,255,0.20)' }}>+{ach.xpReward} XP</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── START NEW GAME button ────────────────────────────────────────── */}
        <CopperBezel className="mt-1">
          <button
            onClick={() => navigate('/')}
            data-testid="button-start-new-game"
            className="w-full py-4 text-center active:scale-[0.98] transition-transform"
          >
            <div
              style={{
                fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                fontSize: '1rem',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(210,160,40,0.90)',
                textShadow: '0 0 12px rgba(200,140,20,0.30)',
              }}
            >
              Start New Game
            </div>
          </button>
        </CopperBezel>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="w-full space-y-3 mt-2 pb-6">
          {/* Feedback */}
          <a
            href="https://forms.gle/Vh6Uut9bB6neHA3J8"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-profile-feedback"
            onClick={() => track({ name: 'feedback_link_clicked', location: 'profile_menu' })}
            className="flex items-center justify-between w-full px-4 py-3 rounded-xl transition-colors"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div className="flex items-center gap-3">
              <span className="text-base leading-none">💬</span>
              <div>
                <div className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.65)' }}>Send Feedback</div>
                <div className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>Report a bug or suggest a feature</div>
              </div>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.9rem' }}>›</span>
          </a>

          {/* Terms / Privacy */}
          <div className="flex items-center justify-center gap-4">
            <a href="/terms" className="text-[10px] font-mono transition-colors" style={{ color: 'rgba(255,255,255,0.18)' }} data-testid="link-profile-terms">
              Terms &amp; Disclosures
            </a>
            <span style={{ color: 'rgba(255,255,255,0.10)', fontSize: '0.6rem' }}>·</span>
            <a href="/privacy" className="text-[10px] font-mono transition-colors" style={{ color: 'rgba(255,255,255,0.18)' }} data-testid="link-profile-privacy">
              Privacy Policy
            </a>
          </div>

          {/* Virtual chips compliance */}
          <p
            className="text-center text-[10px] font-mono leading-relaxed tracking-widest uppercase"
            style={{ color: 'rgba(255,255,255,0.18)' }}
            data-testid="text-chips-disclaimer"
          >
            Virtual Chips · For Entertainment Only · No Cash Value
          </p>

          {/* Delete account */}
          {!deleteOpen ? (
            <div className="flex justify-center pt-1">
              <button
                onClick={() => { setDeleteOpen(true); setDeleteError(null); setDeleteConfirmText(''); }}
                className="text-[10px] font-mono uppercase tracking-widest transition-colors"
                style={{ color: 'rgba(255,255,255,0.12)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(220,80,80,0.50)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.12)')}
                data-testid="button-delete-account-open"
              >
                {serverProfile?.hasAuth ? 'Delete Account' : 'Clear Guest Data'}
              </button>
            </div>
          ) : (
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.14)' }}>
              <div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(220,80,80,0.70)' }}>
                  {serverProfile?.hasAuth ? '⚠ Delete Account' : '⚠ Clear Guest Data'}
                </div>
                <p className="text-[11px] font-mono leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {serverProfile?.hasAuth
                    ? 'This permanently deletes your account, email, chip balance, and all stats from our servers. This cannot be undone.'
                    : 'This clears all local guest data including your chip balance, stats, and progress on this device. This cannot be undone.'}
                </p>
              </div>
              <div>
                <label className="block text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.22)' }}>
                  Type DELETE to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => { setDeleteConfirmText(e.target.value); setDeleteError(null); }}
                  placeholder="DELETE"
                  autoComplete="off"
                  className="w-full h-10 px-3 rounded-xl font-mono text-sm focus:outline-none"
                  style={{ background: '#17171F', color: 'rgba(255,255,255,0.80)', border: '1.5px solid rgba(220,38,38,0.25)' }}
                  data-testid="input-delete-confirm"
                />
              </div>
              {deleteError && (
                <p className="text-[11px] font-mono" style={{ color: 'rgba(220,80,80,0.70)' }} data-testid="text-delete-error">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setDeleteOpen(false); setDeleteError(null); setDeleteConfirmText(''); }}
                  className="flex-1 h-9 rounded-xl font-mono text-[11px] transition-colors"
                  style={{ color: 'rgba(255,255,255,0.30)', border: '1px solid rgba(255,255,255,0.06)' }}
                  data-testid="button-delete-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteBusy}
                  className="flex-1 h-9 rounded-xl font-mono text-[11px] font-bold uppercase tracking-wider transition-all active:scale-[0.97]"
                  style={{
                    background: deleteBusy ? 'rgba(220,38,38,0.15)' : 'rgba(220,38,38,0.22)',
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
      </div>

      {/* ── Avatar picker modal ──────────────────────────────────────────── */}
      {avatarPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.82)' }}
          onClick={e => { if (e.target === e.currentTarget) setAvatarPickerOpen(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: '#1c1910', border: '1px solid rgba(180,130,40,0.25)' }}
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <span
                style={{
                  fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                  fontSize: '0.75rem',
                  letterSpacing: '0.18em',
                  color: 'rgba(200,150,40,0.80)',
                  textTransform: 'uppercase',
                }}
              >
                Choose Avatar
              </span>
              <button
                onClick={() => setAvatarPickerOpen(false)}
                style={{ color: 'rgba(180,130,40,0.40)', fontSize: '1.2rem', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3 px-5 pb-5">
              {AVATAR_OPTIONS.map(opt => {
                const isSelected = currentAvatarId === opt.id;
                return (
                  <button
                    key={String(opt.id)}
                    onClick={() => void handleSelectAvatar(opt.id)}
                    disabled={avatarSaving}
                    data-testid={`button-avatar-option-${opt.id ?? 'default'}`}
                    className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  >
                    <div
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: 12,
                        background: isSelected ? 'rgba(180,130,40,0.25)' : 'rgba(255,255,255,0.04)',
                        border: isSelected
                          ? '2px solid rgba(200,150,40,0.75)'
                          : '1px solid rgba(180,130,40,0.18)',
                        boxShadow: isSelected ? '0 0 10px rgba(200,140,20,0.35)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      {opt.src ? (
                        <img src={opt.src} alt={opt.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span className="font-bold font-mono text-lg" style={{ color: avatarColor }}>
                          {initials}
                        </span>
                      )}
                      {isSelected && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 2,
                            right: 2,
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: 'rgba(200,150,40,0.90)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.5rem',
                            color: '#0c0b08',
                          }}
                        >
                          ✓
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '0.45rem', color: 'rgba(180,130,40,0.50)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Name change modal ────────────────────────────────────────────── */}
      {nameChangeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.82)' }}
          onClick={e => { if (e.target === e.currentTarget) setNameChangeOpen(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: '#1c1910', border: '1px solid rgba(180,130,40,0.25)' }}
          >
            <div className="px-5 pt-5 pb-0 flex items-center justify-between">
              <span
                style={{
                  fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                  fontSize: '0.75rem',
                  letterSpacing: '0.18em',
                  color: 'rgba(200,150,40,0.80)',
                  textTransform: 'uppercase',
                }}
              >
                Change Name
              </span>
              <button
                onClick={() => setNameChangeOpen(false)}
                style={{ color: 'rgba(180,130,40,0.40)', fontSize: '1.2rem', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {nameChangeOnCooldown ? (
                <div
                  className="rounded-xl p-4 text-center"
                  style={{ background: 'rgba(180,130,40,0.08)', border: '1px solid rgba(180,130,40,0.20)' }}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>⏳</div>
                  <div className="text-sm font-mono font-bold" style={{ color: 'rgba(200,150,40,0.80)' }}>
                    On Cooldown
                  </div>
                  <div className="text-xs font-mono mt-1" style={{ color: 'rgba(255,255,255,0.40)' }}>
                    You can change your name again in{' '}
                    <strong style={{ color: 'rgba(200,150,40,0.80)' }}>{nameChangeCooldownDays} day{nameChangeCooldownDays === 1 ? '' : 's'}</strong>
                  </div>
                  <div className="text-[9px] font-mono mt-2" style={{ color: 'rgba(255,255,255,0.22)' }}>
                    Name changes are limited to once every 90 days
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: 'rgba(180,130,40,0.50)' }}>
                      New Display Name
                    </label>
                    <input
                      type="text"
                      value={nameChangeDraft}
                      onChange={e => { setNameChangeDraft(e.target.value); setNameChangeError(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') void handleNameChange(); }}
                      maxLength={32}
                      autoFocus
                      className="w-full h-10 px-3 rounded-xl font-mono text-sm focus:outline-none"
                      style={{
                        background: '#12100d',
                        color: 'rgba(255,255,255,0.85)',
                        border: '1.5px solid rgba(180,130,40,0.25)',
                      }}
                      data-testid="input-name-change"
                    />
                    <div className="text-[8px] font-mono mt-1" style={{ color: 'rgba(255,255,255,0.20)' }}>
                      You can only change your name once every 90 days
                    </div>
                  </div>
                  {nameChangeError && (
                    <p className="text-[11px] font-mono" style={{ color: 'rgba(220,80,80,0.70)' }}>
                      {nameChangeError}
                    </p>
                  )}
                  <button
                    onClick={() => void handleNameChange()}
                    disabled={nameChangeBusy || !nameChangeDraft.trim()}
                    className="w-full h-10 rounded-xl font-mono text-sm font-bold uppercase tracking-widest transition-all active:scale-[0.97]"
                    style={{
                      background: (nameChangeBusy || !nameChangeDraft.trim())
                        ? 'rgba(180,130,40,0.15)'
                        : 'linear-gradient(135deg, rgba(180,130,40,0.85) 0%, rgba(140,95,20,0.90) 100%)',
                      color: (nameChangeBusy || !nameChangeDraft.trim())
                        ? 'rgba(180,130,40,0.35)'
                        : '#0c0b08',
                    }}
                    data-testid="button-name-change-submit"
                  >
                    {nameChangeBusy ? 'Saving…' : 'Save Name'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Auth modal ───────────────────────────────────────────────────── */}
      <AuthModal
        open={authOpen}
        defaultTab={authDefault}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
