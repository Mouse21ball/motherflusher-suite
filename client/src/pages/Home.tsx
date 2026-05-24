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
import { DailyBonusCalendarModal } from '@/components/DailyBonusCalendarModal';
import { HourlyBonusModal } from '@/components/HourlyBonusModal';
import { StarterPackModal } from '@/components/StarterPackModal';
import { useServerProfile } from '@/lib/useServerProfile';
import { apiUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';
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
  tableId:     string;
  modeId:      string;
  humanCount:  number;
  phase:       string;
  maxPlayers:  number;
  isInviteOnly: boolean;
}

const LIVE_MODE_INFO: Record<string, { name: string; abbrev: string; color: string; path: string; icon: string; stakes: string }> = {
  badugi:      { name: 'Badugi',        abbrev: 'B',  color: '#10b981', path: '/badugi',     icon: '/mode-icon-badugi.png',    stakes: '$25 ante' },
  dead7:       { name: 'Dead 7',        abbrev: 'D7', color: '#ef4444', path: '/dead7',      icon: '/mode-icon-dead7.png',     stakes: '$25 ante' },
  fifteen35:   { name: '15/35',         abbrev: '15', color: '#f59e0b', path: '/fifteen35',  icon: '/mode-icon-fifteen35.png', stakes: '$50 ante' },
  suits_poker: { name: 'Suits & Poker', abbrev: 'SP', color: '#3b82f6', path: '/suitspoker', icon: '/mode-icon-suits.png',     stakes: '$50 ante' },
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

const LIVE_TABS = [
  { id: 'all',        label: 'All'   },
  { id: 'badugi',     label: 'Badugi' },
  { id: 'dead7',      label: 'Dead 7' },
  { id: 'fifteen35',  label: '15/35'  },
  { id: 'suits_poker',label: 'Suits'  },
] as const;

function LiveTablesSection({ onJoin }: { onJoin: (modeId: string, tableId: string) => void }) {
  const [tables,    setTables]    = useState<LiveTableEntry[]>([]);
  const [ready,     setReady]     = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');

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

  const publicTables = tables
    .filter(t => !t.isInviteOnly)
    .sort((a, b) => b.humanCount - a.humanCount);

  const filteredTables = activeTab === 'all'
    ? publicTables
    : publicTables.filter(t => t.modeId === activeTab);

  const tabHasActive = (id: string) =>
    id === 'all' ? publicTables.length > 0 : publicTables.some(t => t.modeId === id);

  return (
    <div className="flex flex-col gap-2.5" data-testid="section-live-tables">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            backgroundColor: publicTables.length > 0 ? '#10b981' : '#444',
            boxShadow:        publicTables.length > 0 ? '0 0 6px #10b981' : 'none',
            animation:        publicTables.length > 0 ? 'pulse 2s infinite' : 'none',
          }}
        />
        <span className="text-sm font-bold text-white/90 tracking-wide font-sans">LIVE TABLES</span>
        <span className="text-[10px] font-mono text-white/30 ml-0.5">Join a game in progress</span>
        <div className="flex-1" />
        {publicTables.length > 0 && (
          <span className="text-[10px] font-mono text-white/35 tabular-nums">
            {publicTables.length} open
          </span>
        )}
      </div>

      {/* Mode filter tabs */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-0.5"
        style={{ scrollbarWidth: 'none' } as React.CSSProperties}
      >
        {LIVE_TABS.map(tab => {
          const active     = activeTab === tab.id;
          const modeColor  = tab.id === 'all' ? '#C9A227' : (LIVE_MODE_INFO[tab.id]?.color ?? '#C9A227');
          const hasEntries = tabHasActive(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-live-${tab.id}`}
              className="shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider transition-all active:scale-95"
              style={{
                background:  active ? modeColor + '22' : 'rgba(255,255,255,0.04)',
                border:      `1px solid ${active ? modeColor + '55' : 'rgba(255,255,255,0.08)'}`,
                color:       active ? modeColor : 'rgba(255,255,255,0.35)',
              }}
            >
              {tab.label}
              {hasEntries && (
                <span
                  className="w-1 h-1 rounded-full"
                  style={{ background: active ? modeColor : '#10b981' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredTables.length === 0 && (
        <p className="text-center text-xs font-mono text-white/30 py-2">
          {activeTab === 'all'
            ? 'No public tables open. Start one above.'
            : `No ${LIVE_MODE_INFO[activeTab]?.name ?? activeTab} tables open.`}
        </p>
      )}

      {/* Table list */}
      {filteredTables.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {filteredTables.slice(0, 8).map(table => {
            const info   = LIVE_MODE_INFO[table.modeId] ?? { name: table.modeId, abbrev: '?', color: '#A0A0B8', path: '/', icon: '', stakes: '' };
            const isFull = table.humanCount >= table.maxPlayers;
            const isOpen = table.phase === 'WAITING';
            return (
              <button
                key={`${table.modeId}-${table.tableId}`}
                onClick={() => !isFull && onJoin(table.modeId, table.tableId)}
                disabled={isFull}
                data-testid={`button-join-table-${table.tableId}`}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 border text-left transition-all active:scale-[0.98]"
                style={{
                  background:   isFull ? 'rgba(255,255,255,0.03)' : info.color + '0e',
                  borderColor:  isFull ? 'rgba(255,255,255,0.06)' : info.color + '35',
                  opacity:      isFull ? 0.55 : 1,
                  cursor:       isFull ? 'default' : 'pointer',
                }}
              >
                {/* Mode icon badge */}
                {info.icon && (
                  <img
                    src={info.icon}
                    alt={info.name}
                    className="w-8 h-8 object-contain shrink-0"
                    style={{ filter: `drop-shadow(0 0 4px ${info.color}55)` }}
                  />
                )}

                {/* Text info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 leading-none mb-1">
                    <span className="text-[12px] font-bold" style={{ color: info.color }}>
                      {info.name}
                    </span>
                    <span
                      className="font-mono text-[9px] text-white/25 tracking-widest"
                      data-testid={`text-live-table-code-${table.tableId}`}
                    >
                      {table.tableId}
                    </span>
                    {isOpen && (
                      <span
                        className="text-[8px] font-bold font-mono uppercase px-1 py-px rounded"
                        style={{ background: info.color + '22', color: info.color }}
                      >
                        OPEN
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 leading-none">
                    <span
                      className="text-[10px] font-mono tabular-nums"
                      style={{ color: 'rgba(255,255,255,0.55)' }}
                      data-testid={`text-live-players-${table.tableId}`}
                    >
                      {table.humanCount}/{table.maxPlayers} players
                    </span>
                    <span className="text-white/20 text-[9px]">·</span>
                    <span className="text-[10px] font-mono text-white/35">
                      {phaseLabel(table.phase)}
                    </span>
                    {info.stakes && (
                      <>
                        <span className="text-white/20 text-[9px]">·</span>
                        <span className="text-[10px] font-mono" style={{ color: 'rgba(201,162,39,0.50)' }}>
                          {info.stakes}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Join / Full pill */}
                <div
                  className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono uppercase"
                  style={{
                    background: isFull ? 'rgba(255,255,255,0.05)' : info.color + '22',
                    color:      isFull ? 'rgba(255,255,255,0.28)' : info.color,
                  }}
                >
                  {isFull ? 'FULL' : 'JOIN'}
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
  const [showPrivateSetup,  setShowPrivateSetup]  = useState(false);
  const [showOpenTableModal, setShowOpenTableModal] = useState(false);

  const identity    = ensurePlayerIdentity();
  const initials    = getAvatarInitials(identity.name);
  const avatarColor = getAvatarColor(identity.avatarSeed);

  useEffect(() => { syncXPFromHistory(); }, []);

  const [progression, setProgression] = useState(() => getProgression());
  const levelInfo = getLevelInfo(progression.xp);

  const { profile: serverProfile, refetch } = useServerProfile();

  const chipMap    = getAllChips();
  const stats      = getPlayerStats();
  const totalChips = Object.values(chipMap).reduce((a, b) => a + b, 0);

  const displayChips = Math.max(0, serverProfile?.chipBalance ?? totalChips);
  const serverLevel  = serverProfile?.level ?? levelInfo.level;

  const rank       = getRankForLevel(serverLevel);
  const progressPct = Math.round(levelInfo.progress * 100);

  const [dailyOpen,        setDailyOpen]        = useState(false);
  const [dailyBonusCalOpen, setDailyBonusCalOpen] = useState(false);
  const [serverBonusCanClaim, setServerBonusCanClaim] = useState<boolean | null>(null);
  const [serverBonusStreakDay, setServerBonusStreakDay] = useState(1);
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

  // Fetch server-authoritative daily bonus status on mount
  useEffect(() => {
    const identity = ensurePlayerIdentity();
    apiFetch(apiUrl(`/api/players/${identity.id}/daily-bonus/status`))
      .then(r => r.ok ? r.json() : null)
      .then((data: { canClaim: boolean; currentStreakDay: number } | null) => {
        if (data) {
          setServerBonusCanClaim(data.canClaim);
          setServerBonusStreakDay(data.currentStreakDay);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDailyBonusClaimed = useCallback(
    (_chips: number, _stripes: number, newChipBalance: number, newStripesBalance: number) => {
      setServerBonusCanClaim(false);
      // Trigger server profile refetch so header balances update
      refetch();
      // Also update localStorage chips so game modes see the new balance
      const modes = ['badugi', 'dead7', 'fifteen35', 'suitspoker'];
      for (const modeId of modes) {
        try {
          const key = `pt_chips_${modeId}`;
          localStorage.setItem(key, String(newChipBalance));
        } catch {}
      }
      void newStripesBalance; // balance visible via server profile
    },
    [refetch],
  );

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
          .filter(t => t.modeId === engineModeId && t.phase === 'WAITING' && t.humanCount > 0 && t.humanCount < (t.maxPlayers ?? 5) && !t.isInviteOnly)
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
            onClick={() => navigate('/cosmetics')}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{ background: 'rgba(0,0,0,0.40)', border: '1px solid rgba(201,162,39,0.22)', fontSize: '1rem' }}
            data-testid="link-cosmetics-header"
            title="Cosmetics"
          >
            ◆
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

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      <DailyRewardModal open={dailyOpen}   onClose={handleDailyClose}   />
      <DailyBonusCalendarModal
        open={dailyBonusCalOpen}
        onClose={() => setDailyBonusCalOpen(false)}
        onClaimed={handleDailyBonusClaimed}
      />
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
          style={{ height: '248px' }}
        >
          {/* Warm gold ceiling glow */}
          <div
            className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(ellipse, rgba(240,184,41,0.18) 0%, transparent 70%)' }}
          />
          {/* Chain logo — scaled 1.8× (70 → 126px) */}
          <img
            src="/hero-chain-logo.png"
            alt="Chain Gang Poker"
            className="relative z-10 object-contain drop-shadow-[0_4px_24px_rgba(201,162,39,0.55)]"
            style={{ height: '126px', width: 'auto', maxWidth: '252px' }}
          />
          {/* Wordmark — scaled 1.6× (60 → 96px), target 62vw wide on mobile */}
          <img
            src="/wordmark-cgp.png"
            alt="CHAIN GANG POKER"
            className="relative z-10 object-contain drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]"
            style={{ height: '96px', width: 'auto', maxWidth: '62vw', marginTop: '4px' }}
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
                {serverProfile?.activeSubscriptionTier === 'gold_pro' && (
                  <img
                    src="/cosmetics/badges/badge-gold-pro.png"
                    alt="GOLD PRO"
                    className="h-5 w-auto shrink-0 object-contain"
                    data-testid="badge-sub-gold-pro"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                {serverProfile?.activeSubscriptionTier === 'diamond_elite' && (
                  <img
                    src="/cosmetics/badges/badge-diamond-elite.png"
                    alt="DIAMOND ELITE"
                    className="h-5 w-auto shrink-0 object-contain"
                    data-testid="badge-sub-diamond-elite"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
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

            {/* Right: chips balance + stripes */}
            <div className="text-right shrink-0">
              <div
                className="text-lg sm:text-xl font-bold font-mono tabular-nums text-emerald-400 leading-none"
                data-testid="text-bankroll"
              >
                ${displayChips.toLocaleString()}
              </div>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <img src="/stripes-icon.png" alt="" aria-hidden="true" style={{ width: 18, height: 18 }} />
                <span
                  className="text-[11px] font-mono tabular-nums leading-none"
                  style={{ color: '#a855f7' }}
                  data-testid="text-stripes-lobby"
                >
                  {(serverProfile?.stripes ?? 0).toLocaleString()}
                </span>
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
              border: serverBonusCanClaim
                ? '1px solid rgba(240,184,41,0.55)'
                : '1px solid rgba(245,158,11,0.28)',
              boxShadow: serverBonusCanClaim
                ? '0 0 18px rgba(240,184,41,0.12)'
                : 'none',
            }}
          >
            {/* Top row: streak day + indicator */}
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">🔥</span>
              <span className="font-bold text-white text-sm">
                {serverBonusCanClaim !== null
                  ? `Day ${serverBonusStreakDay} Ready`
                  : streakInfo.streak > 0
                    ? `${streakInfo.streak}-Day Streak`
                    : 'Daily Streak'}
              </span>
              <div className="flex-1" />
              {serverBonusCanClaim === null && (
                <span className="text-sm font-mono font-bold" style={{ color: '#F0B829' }}>
                  Next: +${(streakInfo.nextReward?.chips ?? 500).toLocaleString()}
                </span>
              )}
              {serverBonusCanClaim === true && (
                <span
                  className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full animate-pulse"
                  style={{ background: 'rgba(240,184,41,0.18)', color: '#F0B829', border: '1px solid rgba(240,184,41,0.35)' }}
                >
                  READY
                </span>
              )}
            </div>

            {/* Middle: claim CTA or countdown */}
            <div className="mt-3">
              {serverBonusCanClaim === true ? (
                <button
                  onClick={() => setDailyBonusCalOpen(true)}
                  className="w-full py-3 rounded-xl font-black text-sm text-black tracking-wider transition-all active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, #F0B829, #C9A227)',
                    boxShadow: '0 4px 22px rgba(240,184,41,0.45)',
                    animation: 'pulse 2s ease-in-out infinite',
                  }}
                  data-testid="button-claim-daily-home"
                >
                  🎁 CLAIM DAILY BONUS
                </button>
              ) : serverBonusCanClaim === false ? (
                <button
                  onClick={() => setDailyBonusCalOpen(true)}
                  className="w-full py-2.5 rounded-xl font-semibold text-xs transition-all active:scale-[0.98]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: 'rgba(255,255,255,0.45)',
                  }}
                  data-testid="button-view-daily-streak"
                >
                  📅 View Streak Calendar · Next in {getTimeUntilMidnight()}
                </button>
              ) : rewardReady ? (
                <button
                  onClick={() => setDailyBonusCalOpen(true)}
                  className="w-full py-3 rounded-xl font-black text-sm text-black tracking-wider transition-all active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, #F0B829, #C9A227)',
                    boxShadow: '0 4px 18px rgba(240,184,41,0.38)',
                  }}
                  data-testid="button-claim-daily-home"
                >
                  ⚡ CLAIM DAILY BONUS
                </button>
              ) : (
                <button
                  onClick={() => setDailyBonusCalOpen(true)}
                  className="w-full py-2.5 rounded-xl font-semibold text-xs transition-all active:scale-[0.98]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: 'rgba(255,255,255,0.45)',
                  }}
                  data-testid="button-view-daily-streak"
                >
                  📅 View Streak Calendar · Next in {getTimeUntilMidnight()}
                </button>
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
              Open a public table in any mode, or share a private code with your crew.
            </p>

            {/* Buttons */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setShowOpenTableModal(true)}
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
                <span className="text-[9px] font-mono text-white/22 text-center">Public · pick any mode</span>
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
        <div className="w-full max-w-lg mx-auto grid grid-cols-6 h-full">

          {/* Leaderboard */}
          <button
            onClick={() => navigate('/leaderboard')}
            className="flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] transition-all active:scale-90"
            data-testid="link-leaderboard-footer"
          >
            <img src="/dock-leaderboard.png" alt="Leaderboard" className="w-6 h-6 object-contain" />
            <span className="text-[6.5px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Ranks</span>
          </button>

          {/* Shop */}
          <button
            onClick={() => navigate('/shop')}
            className="flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] transition-all active:scale-90"
            data-testid="link-shop-footer"
          >
            <img src="/dock-shop.png" alt="Shop" className="w-6 h-6 object-contain" />
            <span className="text-[6.5px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Shop</span>
          </button>

          {/* Cosmetics */}
          <button
            onClick={() => navigate('/cosmetics')}
            className="flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] transition-all active:scale-90"
            data-testid="link-cosmetics-footer"
          >
            <span className="w-6 h-6 flex items-center justify-center text-base" style={{ color: 'rgba(201,162,39,0.75)' }}>◆</span>
            <span className="text-[6.5px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Style</span>
          </button>

          {/* Home (elevated) */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] transition-all active:scale-90 -translate-y-1"
            data-testid="link-home-dock"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                border: '1px solid rgba(240,184,41,0.55)',
                boxShadow: '0 0 16px rgba(240,184,41,0.30), 0 0 6px rgba(240,184,41,0.15)',
                background: 'rgba(240,184,41,0.10)',
              }}
            >
              <img src="/dock-home.png" alt="Home" className="w-5 h-5 object-contain" />
            </div>
            <span className="text-[6.5px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.90)' }}>Home</span>
          </button>

          {/* Crews */}
          <button
            onClick={() => navigate('/crews')}
            className="flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] transition-all active:scale-90"
            data-testid="link-crews-footer"
          >
            <span className="w-6 h-6 flex items-center justify-center text-base" style={{ color: 'rgba(201,162,39,0.75)' }}>⛓</span>
            <span className="text-[6.5px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Crews</span>
          </button>

          {/* Profile */}
          <button
            onClick={() => navigate('/profile')}
            className="flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] transition-all active:scale-90"
            data-testid="link-profile-footer"
          >
            <img src="/dock-profile.png" alt="Profile" className="w-7 h-7 object-contain" />
            <span className="text-[6.5px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Profile</span>
          </button>

        </div>
      </div>

    </div>

    <PrivateTableSetup open={showPrivateSetup} onClose={() => setShowPrivateSetup(false)} />

    {/* ── Open Table Mode Picker ────────────────────────────────────────────── */}
    {showOpenTableModal && (
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={() => setShowOpenTableModal(false)}
      >
        <div
          className="w-full max-w-lg rounded-t-2xl p-5 pb-8"
          style={{
            background: 'linear-gradient(180deg, #111116 0%, #0d0d11 100%)',
            border: '1px solid rgba(245,158,11,0.18)',
            borderBottom: 'none',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

          {/* Title */}
          <div className="text-center mb-5">
            <h2
              className="text-base font-black tracking-[0.12em] text-white"
              style={{ fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif' }}
            >
              OPEN A TABLE
            </h2>
            <p className="text-[11px] font-mono text-white/40 mt-1">
              Pick a mode — a public table opens instantly
            </p>
          </div>

          {/* Mode grid */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            {MODES.map(mode => (
              <button
                key={mode.id}
                data-testid={`button-open-table-mode-${mode.id}`}
                className="flex flex-col items-center active:scale-95 transition-transform"
                style={{
                  background:   'linear-gradient(180deg, rgba(40,28,8,0.85) 0%, rgba(20,12,2,0.92) 100%)',
                  border:       '1px solid rgba(80,55,15,0.45)',
                  borderRadius: 6,
                  padding:      '8px 4px 7px',
                  cursor:       'pointer',
                }}
                onClick={() => {
                  setShowOpenTableModal(false);
                  track({ name: 'crew_table_opened', mode: mode.id as 'badugi' });
                  navigateToMode(mode.id, mode.path);
                }}
              >
                <img
                  src={mode.icon}
                  alt={mode.name}
                  style={{ width: 40, height: 40, objectFit: 'contain', filter: 'brightness(0.95)' }}
                />
                <span
                  style={{
                    fontFamily:    'Impact, "Arial Narrow Bold", Arial, sans-serif',
                    fontSize:      '0.52rem',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color:         'rgba(210,165,55,0.90)',
                    marginTop:     4,
                    textAlign:     'center',
                    lineHeight:    1.2,
                  }}
                >
                  {mode.name}
                </span>
              </button>
            ))}
          </div>

          {/* Cancel */}
          <button
            className="w-full py-2.5 rounded-xl text-xs font-bold border border-white/10 text-white/38 transition-all active:scale-[0.98]"
            style={{ background: 'rgba(255,255,255,0.04)' }}
            onClick={() => setShowOpenTableModal(false)}
            data-testid="button-open-table-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    )}
    </>
  );
}
