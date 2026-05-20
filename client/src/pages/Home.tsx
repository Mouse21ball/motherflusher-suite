import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  ensurePlayerIdentity,
  getAvatarInitials,
  getAvatarColor,
  getAllChips,
  getHandHistory,
  getPlayerStats,
} from '@/lib/persistence';
import {
  getProgression,
  getLevelInfo,
  getRankForLevel,
  clearNewAchievements,
  initProgressionBaseline,
  ACHIEVEMENT_MAP,
  type Achievement,
} from '@/lib/progression';
import { generateTableCode } from '@/lib/tableSession';
import { PrivateTableSetup } from '@/components/PrivateTableSetup';
import {
  isRewardAvailable,
  getStreakInfo,
} from '@/lib/dailyReward';
import {
  isHourlyReady,
  shouldShowStarterPack,
} from '@/lib/retention';
import { DailyRewardModal } from '@/components/DailyRewardModal';
import { HourlyBonusModal } from '@/components/HourlyBonusModal';
import { StarterPackModal } from '@/components/StarterPackModal';
import { useServerProfile } from '@/lib/useServerProfile';
import { apiUrl } from '@/lib/apiConfig';
import { track } from '@/lib/analytics';

// ── Tier badge asset map ───────────────────────────────────────────────────────

function getTierBadgeAsset(tierName: string): string {
  const map: Record<string, string> = {
    'Bronze':   '/tier-bronze.png',
    'Silver':   '/tier-silver.png',
    'Gold':     '/tier-gold.png',
    'Platinum': '/tier-platinum.png',
    'Diamond':  '/tier-diamond.png',
    'Master':   '/tier-master.png',
  };
  return map[tierName] ?? '/tier-bronze.png';
}

// ── Time until next daily ration ─────────────────────────────────────────────

function getTimeUntilMidnight(): string {
  const now      = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const msLeft  = midnight.getTime() - now.getTime();
  const h       = Math.floor(msLeft / (1000 * 60 * 60));
  const m       = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Mode definitions ──────────────────────────────────────────────────────────

const MODES = [
  {
    id: 'badugi',
    name: 'BADUGI',
    tagline: 'The OG draw game',
    path: '/badugi',
    color: '#10b981',
    icon: '/mode-icon-badugi.png',
  },
  {
    id: 'dead7',
    name: 'DEAD 7',
    tagline: 'Snitches get stitches',
    path: '/dead7',
    color: '#ef4444',
    icon: '/mode-icon-dead7.png',
  },
  {
    id: 'fifteen35',
    name: '15 / 35',
    tagline: 'Hit or go home',
    path: '/fifteen35',
    color: '#f59e0b',
    icon: '/mode-icon-fifteen35.png',
  },
  {
    id: 'suitspoker',
    name: 'SUITS & POKER',
    tagline: 'Two paths, one winner',
    path: '/suitspoker',
    color: '#3b82f6',
    icon: '/mode-icon-suits.png',
  },
] as const;

// ── Live table browser ────────────────────────────────────────────────────────

interface LiveTableEntry {
  tableId:    string;
  modeId:     string;
  humanCount: number;
  phase:      string;
}

const LIVE_MODE_INFO: Record<string, { name: string; abbrev: string; color: string; path: string }> = {
  badugi:      { name: 'Badugi',        abbrev: 'B',  color: '#10b981', path: '/badugi'     },
  dead7:       { name: 'Dead 7',        abbrev: 'D7', color: '#ef4444', path: '/dead7'      },
  fifteen35:   { name: '15/35',         abbrev: '15', color: '#f59e0b', path: '/fifteen35'  },
  suits_poker: { name: 'Suits & Poker', abbrev: 'SP', color: '#3b82f6', path: '/suitspoker' },
};

function phaseLabel(phase: string): string {
  if (phase === 'WAITING') return 'Open · Join Now';
  if (phase === 'ANTE' || phase === 'DEAL') return 'Starting';
  if (phase.startsWith('DRAW')) return 'Draw';
  if (phase.startsWith('BET')) return 'Betting';
  if (phase.startsWith('HIT')) return 'In Play';
  if (phase === 'DECLARE' || phase === 'DECLARE_AND_BET') return 'Declare';
  if (phase === 'SHOWDOWN') return 'Showdown';
  return 'In Play';
}

function LiveTablesSection({ onJoin }: { onJoin: (modeId: string, tableId: string) => void }) {
  const [tables, setTables] = useState<LiveTableEntry[]>([]);
  const [ready,  setReady]  = useState(false);

  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/tables'));
      if (res.ok) setTables(await res.json());
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    fetchTables();
    const id = setInterval(fetchTables, 8000);
    return () => clearInterval(id);
  }, [fetchTables]);

  if (!ready) return null;

  const hasActive = tables.length > 0;

  return (
    <div className="flex flex-col gap-2.5" data-testid="section-live-tables">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            backgroundColor: hasActive ? '#10b981' : '#444',
            boxShadow: hasActive ? '0 0 6px #10b981' : 'none',
            animation: hasActive ? 'pulse 2s infinite' : 'none',
          }}
        />
        <span className="text-sm font-bold text-white/90 tracking-wide font-sans">LIVE TABLES</span>
        <span className="text-[10px] font-mono text-white/30 ml-0.5">Join a game in progress</span>
        <div className="flex-1" />
      </div>

      {/* Empty state */}
      {!hasActive && (
        <p className="text-center text-xs font-mono text-white/30 py-2">
          No tables open. Start one from a mode above.
        </p>
      )}

      {/* Horizontal scroll row */}
      {hasActive && (
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          {tables.slice(0, 8).map(table => {
            const info    = LIVE_MODE_INFO[table.modeId] ?? { name: table.modeId, abbrev: '?', color: '#A0A0B8', path: '/' };
            const isOpen  = table.phase === 'WAITING';
            return (
              <button
                key={`${table.modeId}-${table.tableId}`}
                onClick={() => onJoin(table.modeId, table.tableId)}
                className="flex-shrink-0 flex flex-col gap-1.5 rounded-xl p-3 border text-left transition-all active:scale-[0.96]"
                style={{ minWidth: '110px', background: info.color + '12', borderColor: info.color + '40' }}
                data-testid={`button-join-table-${table.tableId}`}
              >
                <div className="flex items-center gap-1.5">
                  {isOpen && <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: info.color }} />}
                  <span className="text-[11px] font-bold leading-none" style={{ color: info.color }}>{info.name}</span>
                </div>
                <span
                  className="font-mono font-bold text-[11px] tracking-widest leading-none"
                  style={{ color: info.color + 'bb' }}
                  data-testid={`text-live-table-code-${table.tableId}`}
                >
                  {table.tableId}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: info.color + 'cc' }}>
                    {table.humanCount}/5
                  </span>
                  <span className="text-[9px] font-mono text-white/30">{phaseLabel(table.phase)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── XP sync ───────────────────────────────────────────────────────────────────

function syncXPFromHistory(): void {
  const history = getHandHistory();
  initProgressionBaseline(history.length);
}

// ── Home ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const [, navigate] = useLocation();
  const [showPrivateSetup, setShowPrivateSetup] = useState(false);

  const identity    = ensurePlayerIdentity();
  const initials    = getAvatarInitials(identity.name);
  const avatarColor = getAvatarColor(identity.avatarSeed);

  useEffect(() => { syncXPFromHistory(); }, []);

  const [progression, setProgression] = useState(() => getProgression());
  const levelInfo = getLevelInfo(progression.xp);

  const { profile: serverProfile } = useServerProfile();

  const chipMap    = getAllChips();
  const stats      = getPlayerStats();
  const totalChips = Object.values(chipMap).reduce((a, b) => a + b, 0);

  const displayChips = Math.max(0, serverProfile?.chipBalance ?? totalChips);
  const serverLevel  = serverProfile?.level ?? levelInfo.level;

  const rank       = getRankForLevel(serverLevel);
  const progressPct = Math.round(levelInfo.progress * 100);

  const [dailyOpen,        setDailyOpen]        = useState(false);
  const [hourlyOpen,       setHourlyOpen]        = useState(false);
  const [starterOpen,      setStarterOpen]       = useState(false);
  const [rewardReady,      setRewardReady]       = useState(isRewardAvailable);
  const [hourlyReady,      setHourlyReady]       = useState(isHourlyReady);
  const [starterAvailable, setStarterAvailable]  = useState(shouldShowStarterPack);
  const streakInfo = getStreakInfo();

  // Live tables (for LIVE pill count in top bar, 30s poll)
  const [liveTables, setLiveTables] = useState<LiveTableEntry[]>([]);
  useEffect(() => {
    const fetchLive = async () => {
      try {
        const res = await fetch(apiUrl('/api/tables'));
        if (res.ok) setLiveTables(await res.json());
      } catch {}
    };
    fetchLive();
    const id = setInterval(fetchLive, 30000);
    return () => clearInterval(id);
  }, []);
  const realPlayerCount = liveTables.reduce((sum, t) => sum + (t.humanCount ?? 0), 0);

  const [newAchievements, setNewAchievements] = useState<Achievement[]>(() => {
    const p = getProgression();
    return (p.newAchievements ?? []).map(id => ACHIEVEMENT_MAP.get(id)!).filter(Boolean);
  });

  // Auto-show starter pack for very new players
  useEffect(() => {
    if (shouldShowStarterPack() && stats.handsPlayed < 5) {
      const timer = setTimeout(() => setStarterOpen(true), 1800);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDailyClose = useCallback(() => {
    setDailyOpen(false);
    setRewardReady(false);
    setProgression(getProgression());
  }, []);

  const handleHourlyClose = useCallback(() => {
    setHourlyOpen(false);
    setHourlyReady(isHourlyReady());
  }, []);

  const handleStarterClose = useCallback(() => {
    setStarterOpen(false);
    setStarterAvailable(false);
  }, []);

  const handleJoinTable = useCallback((modeId: string, tableId: string) => {
    const info = LIVE_MODE_INFO[modeId];
    if (!info) return;
    navigate(`${info.path}?t=${tableId}`);
  }, [navigate]);

  const MODE_ENGINE_ID: Record<string, string> = {
    badugi: 'badugi', dead7: 'dead7', fifteen35: 'fifteen35',
    suitspoker: 'suits_poker',
  };

  const navigateToMode = useCallback(async (modeId: string, path: string) => {
    const modeMap: Record<string, 'badugi' | 'dead7' | 'fifteen35' | 'suits'> = {
      badugi: 'badugi', dead7: 'dead7', fifteen35: 'fifteen35', suitspoker: 'suits',
    };
    if (modeMap[modeId]) track({ name: 'mode_started', mode: modeMap[modeId] });
    try {
      const engineModeId = MODE_ENGINE_ID[modeId] ?? modeId;
      const res = await fetch(apiUrl('/api/tables'));
      if (res.ok) {
        const all: LiveTableEntry[] = await res.json();
        const joinable = all
          .filter(t => t.modeId === engineModeId && t.phase === 'WAITING' && t.humanCount > 0 && t.humanCount < 5)
          .sort((a, b) => b.humanCount - a.humanCount)[0];
        if (joinable) { navigate(`${path}?t=${joinable.tableId}`); return; }
      }
    } catch {}
    const newCode = generateTableCode();
    navigate(`${path}?t=${newCode}&qp=1`);
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissAchievement = useCallback((id: string) => {
    setNewAchievements(prev => prev.filter(a => a.id !== id));
    clearNewAchievements();
  }, []);

  return (
    <>
    <div
      className="min-h-[100dvh] flex flex-col relative overflow-x-hidden"
      style={{
        backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.45) 50%, rgba(5,5,10,0.80) 100%), url('/prison-bg.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat',
      }}
    >

      {/* ── Fixed top bar ────────────────────────────────────────────────────── */}
      <div
        className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-3"
        style={{
          background: 'rgba(0,0,0,0.42)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(245,158,11,0.18)',
        }}
      >
        {/* LIVE pill */}
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(0,0,0,0.40)', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: '#10b981', boxShadow: '0 0 5px #10b981', animation: 'pulse 2s infinite' }}
          />
          <span className="text-[10px] font-mono text-white/75 tracking-wider" data-testid="text-live-count">
            {realPlayerCount > 0 ? `Live · ${realPlayerCount}` : 'Live'}
          </span>
        </div>

        <div className="flex-1" />

        {/* Right icon buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigate('/leaderboard')}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{ background: 'rgba(0,0,0,0.40)', border: '1px solid rgba(201,162,39,0.22)' }}
            data-testid="link-leaderboard-header"
          >
            <img src="/dock-leaderboard.png" alt="Leaderboard" className="w-5 h-5 object-contain" />
          </button>
          <button
            onClick={() => navigate('/shop')}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{ background: 'rgba(0,0,0,0.40)', border: '1px solid rgba(201,162,39,0.22)' }}
            data-testid="link-shop-header"
          >
            <img src="/dock-shop.png" alt="Shop" className="w-5 h-5 object-contain" />
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold font-mono transition-transform active:scale-90"
            style={{ background: avatarColor + '50', border: '1px solid rgba(245,158,11,0.40)' }}
            data-testid="button-open-profile"
          >
            <span style={{ color: rank.color }}>{initials}</span>
          </button>
        </div>
      </div>

      {/* ── Achievement toasts (fixed top-right) ─────────────────────────────── */}
      {newAchievements.length > 0 && (
        <div className="fixed top-16 right-3 z-50 flex flex-col gap-2 max-w-[280px]">
          {newAchievements.map(ach => (
            <button
              key={ach.id}
              onClick={() => dismissAchievement(ach.id)}
              className="flex items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-2xl text-left w-full"
              style={{ background: 'rgba(10,10,16,0.94)', backdropFilter: 'blur(16px)', borderColor: 'rgba(201,162,39,0.30)' }}
              data-testid={`toast-achievement-${ach.id}`}
            >
              <span className="text-xl leading-none shrink-0">{ach.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[8px] font-mono uppercase tracking-widest mb-0.5" style={{ color: 'rgba(201,162,39,0.75)' }}>
                  Achievement Unlocked
                </div>
                <div className="text-xs font-bold text-white/90 font-sans truncate">{ach.name}</div>
                <div className="text-[9px] text-white/30 truncate">{ach.description}</div>
              </div>
              <div className="text-[10px] font-mono font-bold shrink-0 text-emerald-400">
                +{ach.xpReward} XP
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Modals (logic unchanged) ──────────────────────────────────────────── */}
      <DailyRewardModal open={dailyOpen}   onClose={handleDailyClose}   />
      <HourlyBonusModal  open={hourlyOpen}  onClose={handleHourlyClose}  />
      <StarterPackModal  open={starterOpen} onClose={handleStarterClose} />

      {/* ── Main scrollable content ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center pt-14 pb-24">

        {/* ════════════════════════════════════════════════════════════════════
            1. HERO SECTION (~28vh phone, ~35vh tablet)
        ════════════════════════════════════════════════════════════════════ */}
        {/* Hero — hard pixel height so mobile vh units can't misbehave */}
        <div
          className="relative w-full flex flex-col items-center justify-center shrink-0 overflow-hidden"
          style={{ height: '192px' }}
        >
          {/* Warm gold ceiling glow */}
          <div
            className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(ellipse, rgba(240,184,41,0.18) 0%, transparent 70%)' }}
          />
          {/* Chain logo */}
          <img
            src="/hero-chain-logo.png"
            alt="Chain Gang Poker"
            className="relative z-10 object-contain drop-shadow-[0_4px_24px_rgba(201,162,39,0.55)]"
            style={{ height: '70px', width: 'auto', maxWidth: '140px' }}
          />
          {/* Wordmark */}
          <img
            src="/wordmark-cgp.png"
            alt="CHAIN GANG POKER"
            className="relative z-10 object-contain drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]"
            style={{ height: '60px', width: 'auto', maxWidth: '300px', marginTop: '8px' }}
          />
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            CONTENT STACK — max-w-lg, horizontal padding
        ════════════════════════════════════════════════════════════════════ */}
        <div className="w-full max-w-lg px-3 sm:px-4 flex flex-col gap-4 mt-2">

          {/* ── 2. GAME MODE GRID ──────────────────────────────────────────── */}
          <div>
            {/* Section label */}
            <div className="flex items-center justify-center mb-3">
              <span
                className="text-[10px] font-mono uppercase tracking-[0.25em]"
                style={{ color: 'rgba(240,184,41,0.40)' }}
              >
                ⛓ The Games
              </span>
            </div>

            {/* Grid: 2×2 phone, 4×1 tablet+ — frameless floating tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
              {MODES.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => navigateToMode(mode.id, mode.path)}
                  className="flex flex-col items-center transition-transform duration-150 active:scale-95"
                  data-testid={`button-mode-${mode.id}`}
                >
                  {/* Glow halo + icon */}
                  <div className="relative flex items-center justify-center">
                    {/* Radial glow — 1.5× icon, bleeds beyond edges for atmosphere */}
                    <div
                      className="absolute rounded-full pointer-events-none w-[180px] h-[180px] md:w-[240px] md:h-[240px]"
                      style={{
                        background: `radial-gradient(ellipse at 50% 50%, ${mode.color}40 0%, ${mode.color}18 45%, transparent 70%)`,
                      }}
                    />
                    <img
                      src={mode.icon}
                      alt={mode.name}
                      className="relative z-10 object-contain w-[120px] h-[120px] md:w-[160px] md:h-[160px]"
                      style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }}
                    />
                  </div>

                  {/* Mode name */}
                  <div
                    className="mt-2 text-xl md:text-2xl font-black text-white text-center tracking-wide leading-tight"
                    data-testid={`text-mode-name-${mode.id}`}
                  >
                    {mode.name}
                  </div>

                  {/* Tagline */}
                  <div
                    className="mt-0.5 text-xs md:text-sm font-medium text-center leading-snug"
                    style={{ color: mode.color }}
                  >
                    {mode.tagline}
                  </div>

                  {/* PLAY pill — content-sized, not full-width */}
                  <div
                    className="mt-3 px-6 py-2 md:px-8 md:py-2.5 rounded-full text-sm md:text-base font-bold text-white"
                    style={{
                      backgroundColor: mode.color,
                      boxShadow: `0 4px 16px ${mode.color}66`,
                    }}
                  >
                    PLAY →
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── 3. LIVE TABLES ─────────────────────────────────────────────── */}
          <div
            className="rounded-2xl p-3 sm:p-4"
            style={{
              background: 'rgba(0,0,0,0.40)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <LiveTablesSection onJoin={handleJoinTable} />
          </div>

          {/* ── 4. PLAYER PROFILE STRIP ────────────────────────────────────── */}
          <button
            onClick={() => navigate('/profile')}
            className="w-full flex items-center gap-3 rounded-2xl p-3 sm:p-3.5 transition-all active:scale-[0.98]"
            style={{
              background: 'rgba(0,0,0,0.42)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(245,158,11,0.20)',
              minHeight: '80px',
            }}
            data-testid="button-profile-strip"
          >
            {/* Avatar */}
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: avatarColor + '28',
                border: '2px solid rgba(245,158,11,0.55)',
              }}
            >
              <span className="text-lg font-bold font-mono" style={{ color: '#F0B829' }}>{initials}</span>
            </div>

            {/* Middle: name + tier + level + xp bar */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="font-bold text-white text-sm sm:text-base truncate leading-none"
                  data-testid="text-player-name"
                >
                  {identity.name}
                </span>
                <img
                  src={getTierBadgeAsset(rank.name)}
                  alt={rank.name}
                  className="h-5 w-auto shrink-0 object-contain"
                  data-testid="badge-rank-home"
                />
              </div>
              <div
                className="text-[10px] sm:text-xs font-mono mt-1 leading-none"
                style={{ color: 'rgba(201,162,39,0.65)' }}
              >
                Level {serverLevel} · {levelInfo.xpIntoLevel}/{levelInfo.xpNeeded} XP
              </div>
              {/* XP progress bar */}
              <div
                className="h-[3px] rounded-full mt-1.5 overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${progressPct}%`,
                    background: 'linear-gradient(90deg, #C9A227, #F0B829)',
                  }}
                />
              </div>
            </div>

            {/* Right: chips balance */}
            <div className="text-right shrink-0">
              <div
                className="text-lg sm:text-xl font-bold font-mono tabular-nums text-emerald-400 leading-none"
                data-testid="text-bankroll"
              >
                ${displayChips.toLocaleString()}
              </div>
            </div>
          </button>

          {/* ── 5. STREAK / BONUS CONSOLIDATED CARD ───────────────────────── */}
          <div
            className="rounded-2xl p-4"
            style={{
              background: 'linear-gradient(135deg, rgba(120,53,15,0.38) 0%, rgba(0,0,0,0.42) 100%)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(245,158,11,0.28)',
            }}
          >
            {/* Top row: streak + next reward amount */}
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">🔥</span>
              <span className="font-bold text-white text-sm">
                {streakInfo.streak > 0 ? `${streakInfo.streak}-Day Streak` : 'Daily Streak'}
              </span>
              <div className="flex-1" />
              <span className="text-sm font-mono font-bold" style={{ color: '#F0B829' }}>
                Next: +${(streakInfo.nextReward?.chips ?? 1250).toLocaleString()}
              </span>
            </div>

            {/* Middle: claim CTA or countdown */}
            <div className="mt-3">
              {rewardReady ? (
                <button
                  onClick={() => setDailyOpen(true)}
                  className="w-full py-3 rounded-xl font-black text-sm text-black tracking-wider transition-all active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, #F0B829, #C9A227)',
                    boxShadow: '0 4px 18px rgba(240,184,41,0.38)',
                  }}
                  data-testid="button-claim-daily-home"
                >
                  ⚡ CLAIM DAILY RATION
                </button>
              ) : (
                <div
                  className="text-center text-xs font-mono py-2"
                  style={{ color: 'rgba(255,255,255,0.32)' }}
                >
                  Next ration in {getTimeUntilMidnight()}
                </div>
              )}
            </div>

            {/* Bottom row: secondary buttons */}
            <div className={`grid gap-2 mt-2 ${starterAvailable ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <button
                onClick={() => setHourlyOpen(true)}
                className="py-2.5 rounded-xl text-[11px] font-bold border transition-all active:scale-[0.97]"
                style={{
                  background: hourlyReady ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.05)',
                  borderColor: hourlyReady ? 'rgba(245,158,11,0.40)' : 'rgba(255,255,255,0.12)',
                  color: hourlyReady ? '#F0B829' : 'rgba(255,255,255,0.40)',
                }}
                data-testid="button-hourly-home"
              >
                ⚡ Hourly Bonus
              </button>
              <button
                onClick={() => navigate('/bonus')}
                className="py-2.5 rounded-xl text-[11px] font-bold border border-white/12 transition-all active:scale-[0.97]"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)' }}
                data-testid="link-bonus-center-home"
              >
                ⚡ All Bonuses
              </button>
              {starterAvailable && (
                <button
                  onClick={() => setStarterOpen(true)}
                  className="py-2.5 rounded-xl text-[11px] font-bold border transition-all active:scale-[0.97]"
                  style={{
                    background: 'rgba(245,158,11,0.14)',
                    borderColor: 'rgba(245,158,11,0.40)',
                    color: '#F0B829',
                  }}
                  data-testid="button-starter-home"
                >
                  🆕 Starter Kit
                </button>
              )}
            </div>
          </div>

          {/* ── 6. CREW MODE CARD ──────────────────────────────────────────── */}
          <div
            className="rounded-2xl p-4"
            style={{
              background: 'linear-gradient(135deg, rgba(6,78,59,0.38) 0%, rgba(0,0,0,0.42) 100%)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(16,185,129,0.28)',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base leading-none">⛓</span>
              <span
                className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold"
                style={{ color: 'rgba(201,162,39,0.75)' }}
              >
                Crew Mode
              </span>
            </div>
            <p className="text-xs text-white/45 leading-relaxed mb-3">
              Open a public Badugi table or share a private code with your crew.
            </p>

            {/* Buttons */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => { track({ name: 'crew_table_opened', mode: 'badugi' }); navigate('/badugi'); }}
                  className="w-full h-11 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                  style={{
                    backgroundColor: '#10b981',
                    color: '#05050A',
                    boxShadow: '0 2px 12px rgba(16,185,129,0.40)',
                  }}
                  data-testid="button-create-table"
                >
                  Open a Table
                </button>
                <span className="text-[9px] font-mono text-white/22 text-center">Public · anyone can join</span>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setShowPrivateSetup(true)}
                  className="w-full h-11 rounded-xl text-sm font-bold border transition-all active:scale-[0.97]"
                  style={{
                    background: 'rgba(109,40,217,0.18)',
                    border: '1px solid rgba(139,92,246,0.35)',
                    color: '#a78bfa',
                  }}
                  data-testid="button-private-table"
                >
                  ⛓ Host a Table
                </button>
                <span className="text-[9px] font-mono text-white/22 text-center">Pick mode, max players & more</span>
              </div>
            </div>
          </div>

          {/* ── 7. FOOTER FINE PRINT ──────────────────────────────────────── */}
          <div className="flex items-center justify-center gap-3 py-1">
            <a href="/terms" className="text-[9px] sm:text-[10px] font-mono tracking-wider hover:text-white/35 transition-colors" style={{ color: 'rgba(255,255,255,0.15)' }} data-testid="link-home-footer-terms">Terms</a>
            <span style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
            <a href="/privacy" className="text-[9px] sm:text-[10px] font-mono tracking-wider hover:text-white/35 transition-colors" style={{ color: 'rgba(255,255,255,0.15)' }} data-testid="link-home-footer-privacy">Privacy</a>
            <span style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
            <a
              href="https://forms.gle/Vh6Uut9bB6neHA3J8"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] sm:text-[10px] font-mono tracking-wider hover:text-white/35 transition-colors"
              style={{ color: 'rgba(255,255,255,0.15)' }}
              data-testid="link-home-footer-feedback"
              onClick={() => track({ name: 'feedback_link_clicked', location: 'home_footer' })}
            >Feedback</a>
          </div>
          <p
            className="text-center text-[9px] sm:text-[10px] font-mono py-1 tracking-wider"
            style={{ color: 'rgba(255,255,255,0.10)' }}
            data-testid="text-home-chips-disclaimer"
          >
            VIRTUAL CHIPS · FOR ENTERTAINMENT ONLY · NO CASH VALUE
          </p>

        </div>
      </div>

      {/* ── Fixed bottom dock ─────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 h-[76px] flex items-center"
        style={{
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(245,158,11,0.18)',
        }}
      >
        <div className="w-full max-w-lg mx-auto grid grid-cols-4 h-full">

          {/* Leaderboard */}
          <button
            onClick={() => navigate('/leaderboard')}
            className="flex flex-col items-center justify-center gap-1 h-full min-h-[44px] transition-all active:scale-90"
            data-testid="link-leaderboard-footer"
          >
            <img src="/dock-leaderboard.png" alt="Leaderboard" className="w-8 h-8 object-contain" />
            <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Leaderboard</span>
          </button>

          {/* Shop */}
          <button
            onClick={() => navigate('/shop')}
            className="flex flex-col items-center justify-center gap-1 h-full min-h-[44px] transition-all active:scale-90"
            data-testid="link-shop-footer"
          >
            <img src="/dock-shop.png" alt="Shop" className="w-8 h-8 object-contain" />
            <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Shop</span>
          </button>

          {/* Home (elevated) */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex flex-col items-center justify-center gap-1 h-full min-h-[44px] transition-all active:scale-90 -translate-y-1"
            data-testid="link-home-dock"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                border: '1px solid rgba(240,184,41,0.55)',
                boxShadow: '0 0 16px rgba(240,184,41,0.30), 0 0 6px rgba(240,184,41,0.15)',
                background: 'rgba(240,184,41,0.10)',
              }}
            >
              <img src="/dock-home.png" alt="Home" className="w-6 h-6 object-contain" />
            </div>
            <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.90)' }}>Home</span>
          </button>

          {/* Profile */}
          <button
            onClick={() => navigate('/profile')}
            className="flex flex-col items-center justify-center gap-1 h-full min-h-[44px] transition-all active:scale-90"
            data-testid="link-profile-footer"
          >
            <img src="/dock-profile.png" alt="Profile" className="w-8 h-8 object-contain" />
            <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Profile</span>
          </button>

        </div>
      </div>

    </div>

    <PrivateTableSetup open={showPrivateSetup} onClose={() => setShowPrivateSetup(false)} />
    </>
  );
}
