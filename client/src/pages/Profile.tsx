// ─── Profile ──────────────────────────────────────────────────────────────────
// Full redesign — prison-vault bg, new hero layout, stat cards, trophy panel.
// All existing logic (delete account, auth, stats, achievements, avatar picker,
// name-change cooldown, guest countdown) preserved unchanged.

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { apiFetch, clearSessionToken } from '@/lib/session';
import { queryClient } from '@/lib/queryClient';
import { BlockList } from '@/components/settings/BlockList';

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

function formatChipBadge(n: number): string {
  if (n >= 1_000_000) return `${Math.floor(n / 1_000_000)}M`;
  if (n >= 1_000)     return `${Math.floor(n / 1_000)}K`;
  return String(n);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Profile() {
  const [, navigate] = useLocation();
  const footerRef   = useRef<HTMLDivElement>(null);

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

  const displayChips = serverProfile?.chipBalance    ?? totalChips;
  const displayHands = serverProfile?.handsPlayed    ?? stats.handsPlayed;
  const displayNet   = serverProfile?.lifetimeProfit ?? stats.totalChipChange;
  const displayLevel = serverProfile?.level          ?? levelInfo.level;
  const rank         = getRankForLevel(displayLevel);

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
    clearSessionToken();
    queryClient.clear();
    try { localStorage.setItem('just_logged_out', '1'); } catch {}
    window.location.href = '/';
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
  const [avatarPickerTab,  setAvatarPickerTab]  = useState<'free' | 'premium'>('free');

  // ── Cosmetics inventory ────────────────────────────────────────────────────
  const [cosInventory, setCosInventory] = useState<{ id: string; category: string; displayName: string; assetPath: string; colorValue: string | null }[]>([]);
  const [cosEquipped,  setCosEquipped]  = useState<{ avatarId: string | null; frameId: string | null; nameColorId: string | null }>({ avatarId: null, frameId: null, nameColorId: null });

  useEffect(() => {
    apiFetch(apiUrl(`/api/players/${identity.id}/inventory`))
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (d?.items) setCosInventory(d.items);
        if (d?.equipped) setCosEquipped(d.equipped);
      })
      .catch(() => {});
  }, [identity.id]);

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
      className="min-h-[100dvh] text-white"
      style={{
        backgroundImage: "url('/cosmetics/backgrounds/cosmetics-bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        position: 'relative',
      }}
    >
      {/* ── Dark overlay ──────────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 0, pointerEvents: 'none' }} />

      {/* ── Content wrapper ───────────────────────────────────────────────── */}
      <div className="flex flex-col min-h-[100dvh]" style={{ position: 'relative', zIndex: 1 }}>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* HEADER BAR                                                         */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <header className="flex items-center gap-3 px-4 pt-4 pb-2">
          {/* Back button */}
          <button
            onClick={() => navigate('/')}
            data-testid="link-back-home"
            style={{
              width: 40, height: 40, borderRadius: '50%',
              border: '2px solid rgba(255,215,0,0.50)',
              background: 'rgba(15,10,25,0.50)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FFD700', fontSize: 20, cursor: 'pointer', flexShrink: 0,
              lineHeight: 1,
            }}
          >
            ‹
          </button>

          {/* Title */}
          <div className="flex-1 flex items-center gap-1.5 min-w-0">
            <span style={{ color: 'rgba(201,162,39,0.65)', fontSize: 11, letterSpacing: '0.12em', fontFamily: 'monospace', fontWeight: 600 }}>LOBBY</span>
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>·</span>
            <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: 11 }}>⛓</span>
            <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, letterSpacing: '0.12em', fontFamily: 'monospace', fontWeight: 700 }}>CGP PROFILE</span>
          </div>

          {/* Settings gear */}
          <button
            onClick={() => footerRef.current?.scrollIntoView({ behavior: 'smooth' })}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              border: '2px solid rgba(255,215,0,0.50)',
              background: 'rgba(15,10,25,0.50)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FFD700', fontSize: 18, cursor: 'pointer', flexShrink: 0,
            }}
          >
            ⚙
          </button>
        </header>

        {/* ── Scrollable body ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col px-4 gap-4 max-w-md mx-auto w-full pb-10">

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* HERO PROFILE SECTION                                             */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <div className="flex items-start gap-4 pt-2">

            {/* LEFT: Avatar circle + badges */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <button
                onClick={() => setAvatarPickerOpen(true)}
                data-testid="button-avatar-change"
                style={{
                  width: 140, height: 140, borderRadius: '50%',
                  border: '3px solid #FFD700',
                  boxShadow: '0 0 24px rgba(255,215,0,0.6)',
                  background: avatarColor + '33',
                  overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, position: 'relative',
                }}
              >
                {currentAvatarSrc ? (
                  <img src={currentAvatarSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontWeight: 700, fontSize: 44, color: '#fff' }} data-testid="avatar-player">{initials}</span>
                )}
                {/* Edit pencil overlay */}
                <div style={{
                  position: 'absolute', bottom: 8, right: 8,
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #c49028, #8a5c14)',
                  border: '2px solid rgba(0,0,0,0.60)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11,
                }}>✏</div>
              </button>

              {/* Chip + link badges */}
              <div className="flex gap-2">
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  border: '1.5px solid rgba(255,215,0,0.55)',
                  background: 'rgba(15,10,25,0.75)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 900, color: '#FFD700', fontFamily: 'monospace',
                }}>
                  {formatChipBadge(displayChips)}
                </div>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  border: '1.5px solid rgba(255,215,0,0.55)',
                  background: 'rgba(15,10,25,0.75)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15,
                }}>
                  🔗
                </div>
              </div>
            </div>

            {/* RIGHT: Player info + watermark */}
            <div className="flex-1 min-w-0 relative pt-1">
              {/* CGP Laurel watermark — behind text */}
              <img
                src="/profile/cgp-laurel.png"
                alt=""
                aria-hidden
                style={{
                  position: 'absolute', top: -24, right: -16,
                  width: 180, height: 180,
                  opacity: 0.15, zIndex: 0,
                  pointerEvents: 'none', objectFit: 'contain',
                }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />

              <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Player name + pencil */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    style={{ fontWeight: 700, fontSize: 30, color: '#fff', lineHeight: 1.1, wordBreak: 'break-word' }}
                    data-testid="text-profile-name"
                  >
                    {identity.name}
                  </span>
                  <button
                    onClick={openNameChange}
                    data-testid="button-name-change"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,215,0,0.50)', fontSize: 15, padding: '0 2px', flexShrink: 0 }}
                    title="Change display name"
                  >
                    ✏
                  </button>
                </div>

                {/* Tier badge pill */}
                <button
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'transparent',
                    border: '1px solid rgba(139,90,43,0.55)',
                    borderRadius: 20, padding: '4px 10px',
                    cursor: 'default', marginBottom: 12,
                  }}
                  data-testid="badge-rank"
                >
                  <img
                    src="/tier-bronze.png"
                    alt="Bronze"
                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span style={{ color: '#C4955A', fontWeight: 700, fontSize: 12, fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                    {rank.name.toUpperCase()}
                  </span>
                </button>

                {/* XP bar */}
                <div>
                  <div className="flex justify-between items-baseline mb-1">
                    <span style={{ fontSize: 11, color: '#FFD700', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                      LEVEL {displayLevel} · {levelInfo.xpIntoLevel.toLocaleString()} / {levelInfo.xpNeeded.toLocaleString()} XP
                    </span>
                    <span style={{ fontSize: 11, color: '#FFD700', fontFamily: 'monospace' }}>{progressPct}%</span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.10)', borderRadius: 4, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        background: 'linear-gradient(90deg, #FFD700, #FFA500)',
                        borderRadius: 4,
                        transition: 'width 0.7s ease',
                      }}
                      data-testid="badge-level"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* EQUIPPED COSMETICS                                               */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <div style={{ background: 'rgba(15,10,25,0.45)', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#FFD700', letterSpacing: '0.14em', fontFamily: 'monospace', fontWeight: 700, marginBottom: 10 }}>
              ◇◆ EQUIPPED COSMETICS
            </div>

            {/* Frame slot */}
            <div style={{
              border: '2px dashed rgba(157,125,200,0.50)',
              borderRadius: 12, height: 60,
              display: 'flex', alignItems: 'center',
              padding: '0 16px', gap: 10,
            }}>
              <span style={{ color: 'rgba(157,125,200,0.60)', fontSize: 14 }}>⛓</span>
              {cosEquipped.frameId ? (
                <span style={{ color: 'rgba(201,162,39,0.80)', fontSize: 13, fontFamily: 'monospace' }}>
                  {cosInventory.find(i => i.id === cosEquipped.frameId)?.displayName ?? cosEquipped.frameId.replace('frame_','').replace(/_/g,' ')}
                </span>
              ) : (
                <span style={{ color: 'rgba(157,125,200,0.40)', fontSize: 13, fontFamily: 'monospace' }}>No frame equipped</span>
              )}
              {cosEquipped.nameColorId && (() => {
                const item = cosInventory.find(i => i.id === cosEquipped.nameColorId);
                return item ? (
                  <span className="flex items-center gap-1 ml-3" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: item.colorValue ?? '#fff', flexShrink: 0 }} />
                    <span style={{ color: item.colorValue ?? 'rgba(255,255,255,0.50)' }}>{item.displayName}</span>
                  </span>
                ) : null;
              })()}
            </div>

            {/* STORE → button */}
            <button
              onClick={() => navigate('/shop')}
              data-testid="link-cosmetics-from-profile"
              className="transition-all duration-200 active:scale-[0.97]"
              style={{
                marginTop: 12, width: '100%',
                padding: '14px 24px',
                border: '2px solid #FFD700',
                borderRadius: 10,
                background: 'transparent',
                color: '#FFD700',
                fontWeight: 700, fontSize: 15,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                boxShadow: '0 0 16px rgba(255,215,0,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
              }}
            >
              STORE →
            </button>
          </div>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* GUEST ACCOUNT BANNER                                             */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {!serverProfile?.hasAuth && (
            <div style={{
              background: 'rgba(15,10,25,0.55)',
              border: '1px solid rgba(255,215,0,0.30)',
              borderRadius: 16, padding: 16,
            }}>
              <div className="flex items-center gap-3">
                {/* Left icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(155,89,182,0.20)',
                  border: '1px solid rgba(155,89,182,0.40)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>
                  👤
                </div>

                {/* Middle */}
                <div className="flex-1 min-w-0">
                  <div style={{ color: '#FFD700', fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', fontFamily: 'monospace' }}>
                    GUEST ACCOUNT
                  </div>
                  {resetCountdownMs > 0 ? (
                    <div style={{ color: '#FF8C42', fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>
                      ⏳ Progress resets in: <strong>{formatCountdown(resetCountdownMs)}</strong>
                    </div>
                  ) : (
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>
                      Progress saved on this device only
                    </div>
                  )}
                </div>

                {/* Right: Log In + Save buttons */}
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openAuth('login')}
                    data-testid="button-profile-login"
                    style={{
                      background: 'transparent',
                      border: '1px solid #FFD700',
                      color: '#FFD700',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'monospace',
                      minHeight: 44, minWidth: 60,
                    }}
                  >
                    LOG IN
                  </button>
                  <button
                    onClick={() => openAuth('register')}
                    data-testid="button-profile-register"
                    style={{
                      background: '#FFD700',
                      border: 'none',
                      color: '#0B0B0D',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'monospace',
                      minHeight: 44, minWidth: 60,
                    }}
                  >
                    SAVE
                  </button>
                </div>
              </div>

              {/* Save-progress CTA */}
              <button
                onClick={() => openAuth('register')}
                data-testid="button-save-progress-cta"
                style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ color: 'rgba(255,215,0,0.60)', fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.10em' }}>
                  ◇◆ SAVE YOUR PROGRESS — CREATE A PROFILE TO KEEP CHIPS, XP &amp; STATS
                </span>
              </button>
            </div>
          )}

          {/* Saved account bar */}
          {serverProfile?.hasAuth && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'rgba(15,10,25,0.45)', border: '1px solid rgba(34,197,94,0.18)' }}>
              <div>
                <div style={{ fontSize: 9, color: 'rgba(34,197,94,0.60)', fontFamily: 'monospace', letterSpacing: '0.12em' }}>SAVED ACCOUNT</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', fontFamily: 'monospace', marginTop: 2 }} data-testid="text-account-email">
                  {serverProfile.email ?? 'Account linked'}
                </div>
              </div>
              <button
                onClick={handleLogout}
                data-testid="button-logout"
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.22)', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}
              >
                Log Out
              </button>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STAT CARDS — 5 across                                            */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {/* HANDS */}
            <div
              style={{
                background: 'rgba(15,10,25,0.65)',
                border: '1px solid rgba(255,215,0,0.20)',
                borderRadius: 12, padding: '12px 4px',
                minHeight: 170,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
              data-testid="stat-hands"
            >
              <div style={{ fontSize: 9, color: '#FFD700', letterSpacing: '0.10em', fontFamily: 'monospace', fontWeight: 700 }}>HANDS</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: 'monospace', lineHeight: 1.1 }}>
                {displayHands}
              </div>
              <img src="/profile/icons/stat-icon-hands.png" alt="" aria-hidden style={{ width: 80, height: 80, objectFit: 'contain', marginTop: 8 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>

            {/* WIN% */}
            <div
              style={{
                background: 'rgba(15,10,25,0.65)',
                border: '1px solid rgba(255,215,0,0.20)',
                borderRadius: 12, padding: '12px 4px',
                minHeight: 170,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
              data-testid="stat-win%"
            >
              <div style={{ fontSize: 9, color: '#FFD700', letterSpacing: '0.10em', fontFamily: 'monospace', fontWeight: 700 }}>WIN%</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: 'monospace', lineHeight: 1.1 }}>
                {stats.winRate}%
              </div>
              <img src="/profile/icons/stat-icon-winrate.png" alt="" aria-hidden style={{ width: 80, height: 80, objectFit: 'contain', marginTop: 8 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>

            {/* NET */}
            <div
              style={{
                background: 'rgba(15,10,25,0.65)',
                border: '1px solid rgba(255,215,0,0.20)',
                borderRadius: 12, padding: '12px 4px',
                minHeight: 170,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
              data-testid="stat-net"
            >
              <div style={{ fontSize: 9, color: '#FFD700', letterSpacing: '0.10em', fontFamily: 'monospace', fontWeight: 700 }}>NET</div>
              <div style={{
                fontSize: 18, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1.1, textAlign: 'center',
                color: displayNet > 0 ? '#4ade80' : displayNet < 0 ? '#f87171' : 'rgba(255,255,255,0.80)',
              }}>
                {displayNet >= 0 ? `+$${displayNet.toLocaleString()}` : `-$${Math.abs(displayNet).toLocaleString()}`}
              </div>
              <img src="/profile/icons/stat-icon-net.png" alt="" aria-hidden style={{ width: 80, height: 80, objectFit: 'contain', marginTop: 8 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>

            {/* CHIPS */}
            <div
              style={{
                background: 'rgba(15,10,25,0.65)',
                border: '1px solid rgba(255,215,0,0.20)',
                borderRadius: 12, padding: '12px 4px',
                minHeight: 170,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
              data-testid="stat-chips"
            >
              <div style={{ fontSize: 9, color: '#FFD700', letterSpacing: '0.10em', fontFamily: 'monospace', fontWeight: 700 }}>CHIPS</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#FFD700', fontFamily: 'monospace', lineHeight: 1.1, textAlign: 'center' }}>
                ${displayChips.toLocaleString()}
              </div>
              <img src="/profile/icons/stat-icon-chips.png" alt="" aria-hidden style={{ width: 80, height: 80, objectFit: 'contain', marginTop: 8 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>

            {/* STRIPES — purple tint */}
            <div
              style={{
                background: 'rgba(40,20,60,0.65)',
                border: '1px solid rgba(181,123,232,0.30)',
                borderRadius: 12, padding: '12px 4px',
                minHeight: 170,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
              data-testid="stat-stripes"
            >
              <div style={{ fontSize: 9, color: '#B57BE8', letterSpacing: '0.10em', fontFamily: 'monospace', fontWeight: 700 }}>STRIPES</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#a855f7', fontFamily: 'monospace', lineHeight: 1.1 }}>
                {(serverProfile?.stripes ?? 0).toLocaleString()}
              </div>
              <img src="/profile/icons/stat-icon-stripes.png" alt="" aria-hidden style={{ width: 80, height: 80, objectFit: 'contain', marginTop: 8 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* OVERVIEW / ACHIEVEMENTS TABS                                     */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <div className="flex gap-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {(['overview', 'achievements'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                data-testid={`tab-${t}`}
                className="flex-1 py-3 transition-all duration-200"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: tab === t ? '2px solid #FFD700' : '2px solid transparent',
                  color: tab === t ? '#FFD700' : 'rgba(255,255,255,0.35)',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  textShadow: tab === t ? '0 0 8px rgba(255,215,0,0.40)' : 'none',
                  textTransform: 'uppercase',
                }}
              >
                {t === 'overview' ? 'OVERVIEW' : `ACHIEVEMENTS (${unlocked.length}/${ACHIEVEMENTS.length})`}
              </button>
            ))}
          </div>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* OVERVIEW TAB                                                      */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {tab === 'overview' && (
            <div className="flex flex-col gap-4">

              {/* By-mode breakdown (if any hands played) */}
              {Object.entries(stats.byMode).length > 0 && (
                <div style={{ background: 'rgba(15,10,25,0.55)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 9, color: 'rgba(201,162,39,0.55)', fontFamily: 'monospace', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                    By Game Mode
                  </div>
                  <div className="space-y-2">
                    {Object.entries(stats.byMode).map(([modeId, m]) => (
                      <div key={modeId} className="flex items-center justify-between">
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.60)' }}>{MODE_NAMES[modeId] ?? modeId}</span>
                        <div className="flex items-center gap-3">
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', fontFamily: 'monospace' }}>{m.played} hands</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', fontFamily: 'monospace' }}>
                            {m.played > 0 ? Math.round(m.wins / m.played * 100) : 0}% W
                          </span>
                          <span
                            style={{ fontSize: 11, fontFamily: 'monospace', color: m.chipChange >= 0 ? 'rgba(64,200,120,0.70)' : 'rgba(220,80,80,0.70)' }}
                          >
                            {m.chipChange >= 0 ? `+$${m.chipChange}` : `-$${Math.abs(m.chipChange)}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DAILY STREAK + BEST POT trophy panel */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  minHeight: 200,
                  backgroundImage: "url('/profile/trophy-best-pot.png')",
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderRadius: 16,
                  border: '1px solid rgba(255,215,0,0.30)',
                  overflow: 'hidden',
                }}
              >
                {/* Left+right edge dark overlay for readability */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, rgba(0,0,0,0.75) 0%, transparent 35%, transparent 65%, rgba(0,0,0,0.75) 100%)',
                  zIndex: 1,
                }} />
                {/* Bottom gradient for extra legibility */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.50) 100%)',
                  zIndex: 1,
                }} />

                {/* LEFT: Daily Streak */}
                <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 2 }}>
                  <div style={{ fontSize: 11, color: '#FFD700', letterSpacing: '0.12em', fontFamily: 'monospace', fontWeight: 700, marginBottom: 4 }}>
                    DAILY STREAK
                  </div>
                  <div style={{ fontSize: 52, fontWeight: 900, color: '#fff', lineHeight: 1, fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif' }}>
                    {streakInfo.streak > 0 ? streakInfo.streak : 0}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', marginTop: 4, maxWidth: 120 }}>
                    {streakInfo.streak > 0 ? `Day ${streakInfo.dayInCycle} of cycle` : 'Claim daily to start streak'}
                  </div>
                </div>

                {/* RIGHT: Best Pot */}
                <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 2, textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#FFD700', letterSpacing: '0.12em', fontFamily: 'monospace', fontWeight: 700, marginBottom: 4 }}>
                    BEST POT
                  </div>
                  <div style={{ fontSize: 22, marginBottom: 2 }}>🏆</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#FFD700', lineHeight: 1, fontFamily: 'monospace' }}>
                    ${progression.biggestPot.toLocaleString()}
                  </div>
                </div>

                {/* Spacer so panel has height */}
                <div style={{ height: 200 }} />
              </div>

              {/* START A GAME CTA (only when 0 hands) */}
              {stats.handsPlayed === 0 ? (
                <button
                  onClick={() => navigate('/')}
                  data-testid="button-start-new-game"
                  className="w-full text-center active:scale-[0.97] transition-transform py-6"
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 15, color: 'rgba(107,63,160,0.80)', letterSpacing: '0.18em', fontStyle: 'italic', fontFamily: 'monospace', marginBottom: 4 }}>
                    NO HANDS PLAYED YET.
                  </div>
                  <div style={{
                    fontSize: 40,
                    fontWeight: 900,
                    fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                    letterSpacing: '0.06em',
                    background: 'linear-gradient(180deg, #B57BE8 0%, #6B3FA0 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    textShadow: 'none',
                    filter: 'drop-shadow(0 0 16px rgba(181,123,232,0.6))',
                    lineHeight: 1.05,
                  }}>
                    START A GAME!
                  </div>
                  <div style={{ fontSize: 20, color: '#FFD700', marginTop: 8 }}>♛</div>
                </button>
              ) : (
                <div style={{ background: 'rgba(15,10,25,0.55)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 9, color: 'rgba(201,162,39,0.55)', fontFamily: 'monospace', letterSpacing: '0.12em', marginBottom: 6 }}>RECENT ACTIVITY</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>{displayHands} hands played</div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* ACHIEVEMENTS TAB                                                  */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {tab === 'achievements' && (
            <div className="flex flex-col gap-3">
              {unlocked.length > 0 && (
                <div style={{ background: 'rgba(15,10,25,0.55)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 9, color: 'rgba(201,162,39,0.55)', fontFamily: 'monospace', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Earned ({unlocked.length})
                  </div>
                  <div className="flex flex-col gap-2">
                    {unlocked.map((ach: Achievement) => (
                      <div
                        key={ach.id}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border ${RARITY_COLORS[ach.rarity]}`}
                        data-testid={`achievement-${ach.id}`}
                      >
                        <span className="text-xl leading-none shrink-0">{ach.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.80)' }}>{ach.name}</span>
                            <span style={{ fontSize: 8, fontFamily: 'monospace', letterSpacing: '0.08em', opacity: 0.60, textTransform: 'uppercase' }}>{RARITY_LABEL[ach.rarity]}</span>
                          </div>
                          <div style={{ fontSize: 11, marginTop: 2, color: 'rgba(255,255,255,0.30)' }}>{ach.description}</div>
                        </div>
                        <div style={{ fontSize: 10, fontFamily: 'monospace', flexShrink: 0, color: 'rgba(64,200,120,0.65)' }}>+{ach.xpReward} XP</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ background: 'rgba(15,10,25,0.55)', border: '1px solid rgba(255,215,0,0.12)', borderRadius: 16, padding: 16 }}>
                <div style={{ fontSize: 9, color: 'rgba(201,162,39,0.55)', fontFamily: 'monospace', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Locked ({ACHIEVEMENTS.length - unlocked.length})
                </div>
                <div className="flex flex-col gap-2">
                  {ACHIEVEMENTS.filter(a => !unlocked.find(u => u.id === a.id)).map((ach: Achievement) => (
                    <div
                      key={ach.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 opacity-40"
                      style={{ border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}
                      data-testid={`achievement-locked-${ach.id}`}
                    >
                      <span className="text-xl leading-none shrink-0 grayscale">{ach.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.50)' }}>{ach.name}</div>
                        <div style={{ fontSize: 11, marginTop: 2, color: 'rgba(255,255,255,0.20)' }}>{ach.description}</div>
                      </div>
                      <div style={{ fontSize: 10, fontFamily: 'monospace', flexShrink: 0, color: 'rgba(255,255,255,0.20)' }}>+{ach.xpReward} XP</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* FOOTER                                                            */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {/* BLOCKED PLAYERS                                                    */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <div style={{ background: 'rgba(15,10,25,0.55)', border: '1px solid rgba(255,215,0,0.12)', borderRadius: 16, padding: 16, marginTop: 12 }}>
            <div
              style={{ fontSize: 9, color: 'rgba(201,162,39,0.55)', fontFamily: 'monospace', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}
              data-testid="section-blocked-players"
            >
              Blocked Players
            </div>
            <BlockList />
          </div>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* ADMIN PANEL (only visible when isAdmin === true)                 */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {serverProfile?.isAdmin === true && (
            <button
              onClick={() => navigate('/admin')}
              data-testid="button-admin-panel"
              className="w-full h-12 rounded-xl font-mono text-sm font-bold uppercase tracking-widest transition-all active:scale-[0.97]"
              style={{
                background: 'rgba(10,8,18,0.85)',
                border: '1.5px solid rgba(255,215,0,0.55)',
                color: '#FFD700',
                cursor: 'pointer',
              }}
            >
              ⚙️ Admin Panel
            </button>
          )}

          <div ref={footerRef} className="flex flex-col gap-3 mt-2">
            {/* Feedback */}
            <a
              href="https://forms.gle/Vh6Uut9bB6neHA3J8"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-profile-feedback"
              onClick={() => track({ name: 'feedback_link_clicked', location: 'profile_menu' })}
              className="flex items-center justify-between w-full px-4 py-3 rounded-xl transition-colors"
              style={{ background: 'rgba(15,10,25,0.40)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: '1rem' }}>💬</span>
                <div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>Send Feedback</div>
                  <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>Report a bug or suggest a feature</div>
                </div>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.9rem' }}>›</span>
            </a>

            {/* Terms / Privacy */}
            <div className="flex items-center justify-center gap-4">
              <a href="/terms" style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.20)' }} data-testid="link-profile-terms">Terms &amp; Disclosures</a>
              <span style={{ color: 'rgba(255,255,255,0.10)', fontSize: '0.6rem' }}>·</span>
              <a href="/privacy" style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.20)' }} data-testid="link-profile-privacy">Privacy Policy</a>
            </div>

            {/* Virtual chips disclaimer */}
            <p
              className="text-center uppercase tracking-widest"
              style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.18)', lineHeight: 1.6 }}
              data-testid="text-chips-disclaimer"
            >
              Virtual Chips · For Entertainment Only · No Cash Value
            </p>

            {/* Delete account */}
            {!deleteOpen ? (
              <div className="flex justify-center pt-1 pb-4">
                <button
                  onClick={() => { setDeleteOpen(true); setDeleteError(null); setDeleteConfirmText(''); }}
                  data-testid="button-delete-account-open"
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(220,80,80,0.55)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.12)')}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.12)', fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.10em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  {serverProfile?.hasAuth ? 'Delete Account' : 'Clear Guest Data'}
                </button>
              </div>
            ) : (
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.14)' }}>
                <div>
                  <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(220,80,80,0.70)', marginBottom: 4 }}>
                    {serverProfile?.hasAuth ? '⚠ Delete Account' : '⚠ Clear Guest Data'}
                  </div>
                  <p style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
                    {serverProfile?.hasAuth
                      ? 'This permanently deletes your account, email, chip balance, and all stats from our servers. This cannot be undone.'
                      : 'This clears all local guest data including your chip balance, stats, and progress on this device. This cannot be undone.'}
                  </p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', marginBottom: 6 }}>
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
                  <p style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(220,80,80,0.70)' }} data-testid="text-delete-error">{deleteError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setDeleteOpen(false); setDeleteError(null); setDeleteConfirmText(''); }}
                    data-testid="button-delete-cancel"
                    className="flex-1 h-9 rounded-xl font-mono text-xs transition-colors"
                    style={{ color: 'rgba(255,255,255,0.30)', border: '1px solid rgba(255,255,255,0.06)', background: 'transparent', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteBusy}
                    data-testid="button-delete-confirm"
                    className="flex-1 h-9 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.97]"
                    style={{
                      background: deleteBusy ? 'rgba(220,38,38,0.15)' : 'rgba(220,38,38,0.22)',
                      color: deleteBusy ? 'rgba(220,38,38,0.35)' : 'rgba(220,38,38,0.80)',
                      border: '1px solid rgba(220,38,38,0.25)',
                      cursor: 'pointer',
                    }}
                  >
                    {deleteBusy ? '…' : 'Delete Forever'}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>{/* end scrollable body */}
      </div>{/* end content wrapper */}

      {/* ── Avatar picker modal ──────────────────────────────────────────────── */}
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
              <span style={{ fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif', fontSize: '0.75rem', letterSpacing: '0.18em', color: 'rgba(200,150,40,0.80)', textTransform: 'uppercase' }}>
                Choose Avatar
              </span>
              <button
                onClick={() => { setAvatarPickerOpen(false); setAvatarPickerTab('free'); }}
                style={{ color: 'rgba(180,130,40,0.40)', fontSize: '1.2rem', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div className="flex mx-5 mb-3 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(180,130,40,0.18)' }}>
              {(['free', 'premium'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setAvatarPickerTab(t)}
                  data-testid={`button-avatar-tab-${t}`}
                  className="flex-1 py-1.5 text-[9px] font-mono uppercase tracking-wider transition-colors"
                  style={{
                    background: avatarPickerTab === t ? 'rgba(180,130,40,0.18)' : 'transparent',
                    color: avatarPickerTab === t ? 'rgba(220,170,50,0.90)' : 'rgba(255,255,255,0.28)',
                    borderRight: t === 'free' ? '1px solid rgba(180,130,40,0.18)' : 'none',
                    cursor: 'pointer',
                    border: 'none',
                  }}
                >
                  {t === 'free' ? 'Free' : '◆ Premium'}
                </button>
              ))}
            </div>

            {avatarPickerTab === 'free' && (
              <div className="grid grid-cols-4 gap-3 px-5 pb-5">
                {AVATAR_OPTIONS.map(opt => {
                  const isSelected = currentAvatarId === opt.id && !cosEquipped.avatarId;
                  return (
                    <button
                      key={String(opt.id)}
                      onClick={() => void handleSelectAvatar(opt.id)}
                      disabled={avatarSaving}
                      data-testid={`button-avatar-option-${opt.id ?? 'default'}`}
                      className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                    >
                      <div style={{ width: 60, height: 60, borderRadius: 12, background: isSelected ? 'rgba(180,130,40,0.25)' : 'rgba(255,255,255,0.04)', border: isSelected ? '2px solid rgba(200,150,40,0.75)' : '1px solid rgba(180,130,40,0.18)', boxShadow: isSelected ? '0 0 10px rgba(200,140,20,0.35)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                        {opt.src ? (
                          <img src={opt.src} alt={opt.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span className="font-bold font-mono text-lg" style={{ color: avatarColor }}>{initials}</span>
                        )}
                        {isSelected && (
                          <div style={{ position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: 'rgba(200,150,40,0.90)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', color: '#0c0b08' }}>✓</div>
                        )}
                      </div>
                      <span style={{ fontSize: '0.45rem', color: 'rgba(180,130,40,0.50)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {avatarPickerTab === 'premium' && (() => {
              const premiumAvatars = cosInventory.filter(i => i.category === 'avatar');
              return (
                <div className="px-5 pb-5">
                  {premiumAvatars.length === 0 ? (
                    <div className="py-6 flex flex-col items-center gap-3">
                      <span style={{ fontSize: '2rem' }}>👑</span>
                      <p className="text-[10px] font-mono text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        No premium avatars owned yet.<br />Spend Stripes in the Cosmetics Store.
                      </p>
                      <button
                        onClick={() => { setAvatarPickerOpen(false); window.location.href = '/cosmetics'; }}
                        className="text-[9px] font-mono uppercase tracking-wider px-4 py-1.5 rounded-lg transition-colors"
                        style={{ background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.35)', color: 'rgba(201,162,39,0.85)', cursor: 'pointer' }}
                        data-testid="button-avatar-cosmetics-store"
                      >
                        ◆ Open Cosmetics Store
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {premiumAvatars.map(item => {
                          const isEquipped = cosEquipped.avatarId === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={async () => {
                                if (isEquipped) return;
                                try {
                                  await apiFetch(apiUrl(`/api/players/${identity.id}/cosmetics/equip`), {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ cosmetic_item_id: item.id }),
                                  });
                                  setCosEquipped(e => ({ ...e, avatarId: item.id }));
                                  refetch();
                                } catch {}
                              }}
                              data-testid={`button-premium-avatar-${item.id}`}
                              className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                            >
                              <div style={{ width: 72, height: 72, borderRadius: 12, background: isEquipped ? 'rgba(201,162,39,0.20)' : 'rgba(255,255,255,0.04)', border: isEquipped ? '2px solid rgba(201,162,39,0.75)' : '1px solid rgba(201,162,39,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', position: 'relative', overflow: 'hidden' }}>
                                {item.assetPath ? (
                                  <img src={item.assetPath} alt={item.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <span>👑</span>
                                )}
                                {isEquipped && (
                                  <div style={{ position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: 'rgba(201,162,39,0.90)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', color: '#0c0b08' }}>✓</div>
                                )}
                              </div>
                              <span style={{ fontSize: '0.45rem', color: 'rgba(201,162,39,0.55)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.displayName}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => { setAvatarPickerOpen(false); window.location.href = '/cosmetics'; }}
                        className="w-full text-[9px] font-mono uppercase tracking-wider py-1.5 rounded-lg"
                        style={{ background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.20)', color: 'rgba(201,162,39,0.55)', cursor: 'pointer' }}
                      >
                        ◆ More in Cosmetics Store
                      </button>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Name change modal ────────────────────────────────────────────────── */}
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
              <span style={{ fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif', fontSize: '0.75rem', letterSpacing: '0.18em', color: 'rgba(200,150,40,0.80)', textTransform: 'uppercase' }}>
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
                <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(180,130,40,0.08)', border: '1px solid rgba(180,130,40,0.20)' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>⏳</div>
                  <div className="text-sm font-mono font-bold" style={{ color: 'rgba(200,150,40,0.80)' }}>On Cooldown</div>
                  <div className="text-xs font-mono mt-1" style={{ color: 'rgba(255,255,255,0.40)' }}>
                    You can change your name again in{' '}
                    <strong style={{ color: 'rgba(200,150,40,0.80)' }}>{nameChangeCooldownDays} day{nameChangeCooldownDays === 1 ? '' : 's'}</strong>
                  </div>
                  <div className="text-[9px] font-mono mt-2" style={{ color: 'rgba(255,255,255,0.22)' }}>Name changes are limited to once every 90 days</div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: 'rgba(180,130,40,0.50)' }}>New Display Name</label>
                    <input
                      type="text"
                      value={nameChangeDraft}
                      onChange={e => { setNameChangeDraft(e.target.value); setNameChangeError(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') void handleNameChange(); }}
                      maxLength={32}
                      autoFocus
                      className="w-full h-10 px-3 rounded-xl font-mono text-sm focus:outline-none"
                      style={{ background: '#12100d', color: 'rgba(255,255,255,0.85)', border: '1.5px solid rgba(180,130,40,0.25)' }}
                      data-testid="input-name-change"
                    />
                    <div className="text-[8px] font-mono mt-1" style={{ color: 'rgba(255,255,255,0.20)' }}>You can only change your name once every 90 days</div>
                  </div>
                  {nameChangeError && (
                    <p className="text-[11px] font-mono" style={{ color: 'rgba(220,80,80,0.70)' }}>{nameChangeError}</p>
                  )}
                  <button
                    onClick={() => void handleNameChange()}
                    disabled={nameChangeBusy || !nameChangeDraft.trim()}
                    className="w-full h-10 rounded-xl font-mono text-sm font-bold uppercase tracking-widest transition-all active:scale-[0.97]"
                    style={{
                      background: (nameChangeBusy || !nameChangeDraft.trim())
                        ? 'rgba(180,130,40,0.15)'
                        : 'linear-gradient(135deg, rgba(180,130,40,0.85) 0%, rgba(140,95,20,0.90) 100%)',
                      color: (nameChangeBusy || !nameChangeDraft.trim()) ? 'rgba(180,130,40,0.35)' : '#0c0b08',
                      cursor: nameChangeBusy || !nameChangeDraft.trim() ? 'default' : 'pointer',
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

      {/* ── Auth modal ───────────────────────────────────────────────────────── */}
      <AuthModal
        open={authOpen}
        defaultTab={authDefault}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
