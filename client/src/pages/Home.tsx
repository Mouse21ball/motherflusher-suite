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
import { getRecentTable, generateTableCode, getSessionResult, getStreakLabel } from '@/lib/tableSession';
import {
  isRewardAvailable,
  getStreakInfo,
} from '@/lib/dailyReward';
import {
  isHourlyReady,
  shouldShowStarterPack,
  getVipTier,
} from '@/lib/retention';
import { DailyRewardModal } from '@/components/DailyRewardModal';
import { HourlyBonusModal } from '@/components/HourlyBonusModal';
import { StarterPackModal } from '@/components/StarterPackModal';
import { useServerProfile } from '@/lib/useServerProfile';
import { apiUrl } from '@/lib/apiConfig';

// ─── Chain Gang Poker · Color tokens ─────────────────────────────────────────
// Prison-authentic aesthetic: chain silver, fire orange, gold, money green.
// Psychology: darkness = power, orange = urgency/danger, gold = winning.

const C = {
  gold:    '#F0B829',
  orange:  '#FF6B00',
  emerald: '#00C896',
  purple:  '#9B5DE5',
  silver:  '#A0A0B8',
  red:     '#DC2626',
  pink:    '#FF1493',
  bg:      '#05050A',
} as const;

// ─── Mode definitions ─────────────────────────────────────────────────────────

const MODES = [
  {
    id: 'badugi',
    name: 'Badugi',
    tagline: 'The OG draw game',
    description: 'The classic. Build the perfect 4-suit hand across three draws. Up to 5 players — invite your crew.',
    path: '/badugi',
    icon: '♦',
    color: '#00C896',
    glow: 'rgba(0,200,150,',
    bg: 'linear-gradient(135deg, rgba(0,200,150,0.12) 0%, rgba(0,200,150,0.03) 100%)',
    border: 'rgba(0,200,150,0.22)',
    borderHover: 'rgba(0,200,150,0.55)',
    isMultiplayer: true,
    isHero: true,
    badge: '⛓️ Live · Up to 5',
    badgeColor: 'rgba(0,200,150,',
    difficulty: 'Classic Draw',
  },
  {
    id: 'dead7',
    name: 'Dead 7',
    tagline: 'Snitches get stitches',
    description: '7s are dead — the snitch card busts you on the spot. Flush scoops. No mercy.',
    path: '/dead7',
    icon: '💀',
    color: '#F03A2F',
    glow: 'rgba(240,58,47,',
    bg: 'linear-gradient(135deg, rgba(240,58,47,0.12) 0%, rgba(240,58,47,0.03) 100%)',
    border: 'rgba(240,58,47,0.22)',
    borderHover: 'rgba(240,58,47,0.55)',
    isMultiplayer: true,
    isHero: false,
    badge: '⛓️ Up to 5',
    badgeColor: 'rgba(240,58,47,',
    difficulty: 'Cutthroat',
  },
  {
    id: 'fifteen35',
    name: '15 / 35',
    tagline: 'Hit or go home',
    description: 'Chase 15 or 35 exactly. Go over and you bust — just like crossing the wrong line.',
    path: '/fifteen35',
    icon: '15',
    color: '#F59E0B',
    glow: 'rgba(245,158,11,',
    bg: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.03) 100%)',
    border: 'rgba(245,158,11,0.22)',
    borderHover: 'rgba(245,158,11,0.55)',
    isMultiplayer: true,
    isHero: false,
    badge: '⛓️ Up to 5',
    badgeColor: 'rgba(245,158,11,',
    difficulty: 'Easy Hustle',
  },
  {
    id: 'suitspoker',
    name: 'Suits & Poker',
    tagline: 'Two paths, one winner',
    description: 'Fork the board. Pick Poker, Suits, or Swing both to scoop the whole pot.',
    path: '/suitspoker',
    icon: '♠',
    color: '#3B82F6',
    glow: 'rgba(59,130,246,',
    bg: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0.03) 100%)',
    border: 'rgba(59,130,246,0.22)',
    borderHover: 'rgba(59,130,246,0.55)',
    isMultiplayer: true,
    isHero: false,
    badge: '⛓️ Up to 5',
    badgeColor: 'rgba(59,130,246,',
    difficulty: 'Advanced',
  },
] as const;

// ─── Live table browser ────────────────────────────────────────────────────────
// Polls /api/tables every 8s. Only renders when at least one human-occupied table
// exists across any mode. Badugi tables appear first (hero priority).

interface LiveTableEntry {
  tableId: string;
  modeId: string;
  humanCount: number;
  phase: string;
}

const LIVE_MODE_INFO: Record<string, { name: string; abbrev: string; color: string; path: string }> = {
  badugi:      { name: 'Badugi',         abbrev: 'B',  color: '#00C896', path: '/badugi'    },
  dead7:       { name: 'Dead 7',         abbrev: 'D7', color: '#F03A2F', path: '/dead7'     },
  fifteen35:   { name: '15/35',          abbrev: '15', color: '#F59E0B', path: '/fifteen35' },
  suits_poker: { name: 'Suits & Poker',  abbrev: 'SP', color: '#3B82F6', path: '/suitspoker'},
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

function LiveTablesSection({ onJoin, serverChips }: { onJoin: (modeId: string, tableId: string) => void; serverChips?: number }) {
  const [tables, setTables] = useState<LiveTableEntry[]>([]);
  const [ready, setReady] = useState(false);

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
  const visible = tables.slice(0, 6);
  const overflow = tables.length - visible.length;

  /* Rejoin row — check if the player's last table is still live */
  const recent = getRecentTable();
  const rejoinEntry = recent ? tables.find(t => t.tableId === recent.tableId) ?? null : null;

  return (
    <div
      className="w-full rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#0A0A0F',
        border: hasActive ? '1px solid rgba(0,200,150,0.18)' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: hasActive ? '0 0 0 1px rgba(0,200,150,0.06) inset' : 'none',
      }}
      data-testid="section-live-tables"
    >
      {/* Section header */}
      <div
        className="px-4 py-3 flex items-center gap-2.5 border-b"
        style={{ borderColor: hasActive ? 'rgba(0,200,150,0.10)' : 'rgba(255,255,255,0.05)' }}
      >
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            backgroundColor: hasActive ? '#00C896' : '#333',
            boxShadow: hasActive ? '0 0 6px #00C896' : 'none',
            animation: hasActive ? 'pulse 2s infinite' : 'none',
          }}
        />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold text-white/88 font-sans">Live Tables</span>
          <span className="ml-2 text-[10px] font-mono text-white/30">
            {hasActive ? 'Real players — join any game in progress' : 'Join or start a game to appear here'}
          </span>
        </div>
        {hasActive && (
          <span
            className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full tabular-nums"
            style={{ backgroundColor: 'rgba(0,200,150,0.12)', color: '#00C896', border: '1px solid rgba(0,200,150,0.25)' }}
          >
            {tables.length} open
          </span>
        )}
      </div>

      {/* Rejoin row — pinned at top when the player's last table is still live */}
      {rejoinEntry && (() => {
        const info = LIVE_MODE_INFO[rejoinEntry.modeId] ?? { name: rejoinEntry.modeId, color: '#C9A227', path: '/' };
        const sessionResult = getSessionResult();
        const sessionDelta = sessionResult && Math.abs(sessionResult.delta) >= 10 ? sessionResult.delta : null;
        const streakLabel = getStreakLabel();
        return (
          <div
            className="px-4 py-3 flex items-center gap-3 border-b"
            style={{ borderColor: 'rgba(201,162,39,0.14)', background: 'rgba(201,162,39,0.04)' }}
            data-testid="row-rejoin-table"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: '#C9A227', boxShadow: '0 0 5px rgba(201,162,39,0.7)' }} />
                <span className="text-[11px] font-mono font-bold" style={{ color: 'rgba(201,162,39,0.85)' }}>Your table is still live</span>
                <span className="font-mono text-[10px]" style={{ color: info.color + 'bb' }}>{info.name} · {rejoinEntry.tableId}</span>
              </div>
              {(sessionDelta !== null || streakLabel) && (
                <p className="text-[9px] font-mono mt-0.5 tracking-wide pl-3.5" style={{
                  color: sessionDelta !== null
                    ? (sessionDelta > 0 ? 'rgba(52,211,153,0.55)' : 'rgba(248,113,113,0.55)')
                    : 'rgba(255,255,255,0.30)'
                }} data-testid="text-session-pnl">
                  {sessionDelta !== null && (
                    sessionDelta > 0 ? `Up $${sessionDelta} this run` : `Down $${Math.abs(sessionDelta)} this run`
                  )}
                  {sessionDelta !== null && streakLabel && (
                    <span style={{ color: 'rgba(255,255,255,0.22)', marginLeft: '0.45em' }}>· {streakLabel}</span>
                  )}
                  {sessionDelta === null && streakLabel}
                </p>
              )}
            </div>
            {serverChips != null && (
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <div className="text-[8px] font-mono text-white/20 uppercase tracking-widest">Bank</div>
                <div className="text-sm font-bold font-mono tabular-nums" style={{ color: '#C9A227' }} data-testid="text-rejoin-chips">${serverChips.toLocaleString()}</div>
              </div>
            )}
            <button
              onClick={() => onJoin(rejoinEntry.modeId, rejoinEntry.tableId)}
              className="shrink-0 text-[11px] font-mono font-bold px-3.5 py-1.5 rounded-lg transition-all duration-200 hover:opacity-85 active:scale-95"
              style={{ color: '#05050A', backgroundColor: 'rgba(201,162,39,0.82)', border: '1px solid rgba(201,162,39,0.55)', boxShadow: '0 2px 8px rgba(201,162,39,0.25)' }}
              data-testid="button-rejoin-table"
            >
              Back In →
            </button>
          </div>
        );
      })()}

      {/* Last session recall — only when no live rejoin entry */}
      {!rejoinEntry && (() => {
        const sr = getSessionResult();
        if (!sr || !sr.ts) return null;
        const ageMs = Date.now() - sr.ts;
        if (ageMs > 48 * 60 * 60 * 1000) return null; // hide after 48h
        const resultColor =
          sr.result === 'WINNING SESSION' ? 'rgba(52,211,153,0.78)'
          : sr.result === 'LOSING SESSION' ? 'rgba(248,113,113,0.75)'
          : 'rgba(255,255,255,0.32)';
        const deltaText = sr.delta === 0 ? null : sr.delta > 0 ? `+$${sr.delta}` : `-$${Math.abs(sr.delta)}`;
        return (
          <div
            className="px-4 py-2.5 flex items-center gap-3 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}
            data-testid="row-last-session"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-white/25">Last Session</span>
                <span className="font-mono text-[10px] font-bold" style={{ color: resultColor }} data-testid="text-last-session-result">{sr.result}</span>
                {deltaText && (
                  <span className="font-mono text-[9px]" style={{ color: resultColor, opacity: 0.65 }} data-testid="text-last-session-delta">{deltaText}</span>
                )}
              </div>
              {sr.hands > 0 && (
                <p className="text-[9px] font-mono text-white/20 mt-0.5 pl-0" data-testid="text-last-session-hands">{sr.hands} hands played</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Empty state */}
      {!hasActive && (
        <div className="px-4 py-6 flex flex-col items-center gap-1.5 text-center">
          <span className="text-sm font-mono text-white/55">Be the first to open a table</span>
          <span className="text-[11px] font-mono text-white/35">Tables appear here instantly — others can join yours.</span>
        </div>
      )}

      {/* Table rows */}
      {hasActive && (
        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
          {visible.map(table => {
            const info = LIVE_MODE_INFO[table.modeId] ?? { name: table.modeId, abbrev: '?', color: '#A0A0B8', path: '/' };
            const isWaiting = table.phase === 'WAITING';
            return (
              <div
                key={`${table.modeId}-${table.tableId}`}
                className="px-4 py-3 flex items-center gap-3"
                style={isWaiting ? { backgroundColor: 'rgba(0,200,150,0.03)' } : undefined}
              >
                {/* Mode color badge */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-mono font-bold shrink-0"
                  style={{ backgroundColor: info.color + '18', border: `1px solid ${info.color}35`, color: info.color }}
                >
                  {info.abbrev}
                </div>

                {/* Mode name + table code — visible on all screen sizes */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-white/75 font-sans">{info.name}</span>
                    {isWaiting && (
                      <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(0,200,150,0.12)', color: '#00C896' }}>
                        Open
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-mono text-white/25">Code:</span>
                    <span
                      className="font-mono font-bold text-[11px] tracking-widest"
                      style={{ color: info.color + 'bb' }}
                      data-testid={`text-live-table-code-${table.tableId}`}
                    >
                      {table.tableId}
                    </span>
                  </div>
                </div>

                {/* Player count + phase */}
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: info.color + '90' }} />
                    <span className="text-xs font-mono font-bold tabular-nums" style={{ color: info.color + 'bb' }}>
                      {table.humanCount} / 5
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-white/30">{phaseLabel(table.phase)}</span>
                </div>

                {/* Join button — deliberate sizing for easy tap */}
                <button
                  onClick={() => onJoin(table.modeId, table.tableId)}
                  className="shrink-0 text-[10px] font-mono font-bold uppercase tracking-wider px-3 py-2 rounded-xl border transition-all duration-150 active:scale-[0.97]"
                  style={{
                    backgroundColor: info.color + '18',
                    borderColor: info.color + '55',
                    color: info.color,
                    minWidth: '72px',
                  }}
                  data-testid={`button-join-table-${table.tableId}`}
                >
                  Join Table
                </button>
              </div>
            );
          })}

          {overflow > 0 && (
            <div className="px-4 py-2 text-center">
              <span className="text-[9px] font-mono text-white/25">+{overflow} more table{overflow !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function syncXPFromHistory(): void {
  const history = getHandHistory();
  initProgressionBaseline(history.length);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [, navigate] = useLocation();

  const identity   = ensurePlayerIdentity();
  const initials   = getAvatarInitials(identity.name);
  const avatarColor = getAvatarColor(identity.avatarSeed);

  useEffect(() => { syncXPFromHistory(); }, []);

  const [progression, setProgression] = useState(() => getProgression());
  const levelInfo = getLevelInfo(progression.xp);

  const { profile: serverProfile } = useServerProfile();

  const chipMap    = getAllChips();
  const stats      = getPlayerStats();
  const totalChips = Object.values(chipMap).reduce((a, b) => a + b, 0);

  // Use server-authoritative values when available; fall back to localStorage.
  const displayChips   = serverProfile?.chipBalance    ?? totalChips;
  const displayNet     = serverProfile?.lifetimeProfit ?? stats.totalChipChange;
  const displayHands   = serverProfile?.handsPlayed    ?? stats.handsPlayed;
  const serverLevel    = serverProfile?.level          ?? levelInfo.level;

  // Rank is derived from serverLevel so the badge text and rank color stay consistent.
  const rank = getRankForLevel(serverLevel);

  const [dailyOpen,   setDailyOpen]   = useState(false);
  const [hourlyOpen,  setHourlyOpen]  = useState(false);
  const [starterOpen, setStarterOpen] = useState(false);
  const [rewardReady,      setRewardReady]      = useState(isRewardAvailable);
  const [hourlyReady,      setHourlyReady]      = useState(isHourlyReady);
  const [starterAvailable, setStarterAvailable] = useState(shouldShowStarterPack);
  const streakInfo = getStreakInfo();
  const vip = getVipTier(serverLevel);

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
  const getModeRealCount = (modeId: string): number => {
    const engineId = modeId === 'suitspoker' ? 'suits_poker' : modeId;
    return liveTables.filter(t => t.modeId === engineId).length;
  };

  const [newAchievements, setNewAchievements] = useState<Achievement[]>(() => {
    const p = getProgression();
    return (p.newAchievements ?? []).map(id => ACHIEVEMENT_MAP.get(id)!).filter(Boolean);
  });

  // Auto-show starter pack once for very new players (< 5 hands played)
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

  // Maps the MODES id (client) → engine modeId (server) for table lookup.
  const MODE_ENGINE_ID: Record<string, string> = {
    badugi: 'badugi', dead7: 'dead7', fifteen35: 'fifteen35',
    suitspoker: 'suits_poker',
  };

  // Quick Play routing: joins an existing WAITING table with other humans if one
  // exists, otherwise creates a new table with 3 instant bots + 1 open seat so
  // the player starts immediately instead of waiting for the staged bot timer.
  const navigateToMode = useCallback(async (modeId: string, path: string) => {
    try {
      const engineModeId = MODE_ENGINE_ID[modeId] ?? modeId;
      const res = await fetch(apiUrl('/api/tables'));
      if (res.ok) {
        const liveTables: LiveTableEntry[] = await res.json();
        // Sort descending by humanCount so the first match is always the table
        // with the most real players already seated — keeps players together.
        const joinable = liveTables
          .filter(t => t.modeId === engineModeId && t.phase === 'WAITING' && t.humanCount > 0 && t.humanCount < 5)
          .sort((a, b) => b.humanCount - a.humanCount)[0];
        if (joinable) {
          navigate(`${path}?t=${joinable.tableId}`);
          return;
        }
      }
    } catch {}
    // No joinable table found — create a new Quick Play table.
    // ?qp=1 tells the server to immediately fill 3 bots, leaving 1 open seat.
    const newCode = generateTableCode();
    navigate(`${path}?t=${newCode}&qp=1`);
  }, [navigate]);

  const dismissAchievement = useCallback((id: string) => {
    setNewAchievements(prev => prev.filter(a => a.id !== id));
    clearNewAchievements();
  }, []);

  const progressPct  = Math.round(levelInfo.progress * 100);
  const totalNet     = stats.totalChipChange;

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';

  const biggestPot = getProgression().biggestPot ?? 0;
  const winRate = stats.handsPlayed > 0 ? Math.round((stats.wins / stats.handsPlayed) * 100) : 0;

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-x-hidden" style={{ backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 50%, rgba(10,10,14,0.85) 100%), url('/home-hero.jpg')", backgroundSize: "cover", backgroundPosition: "center top", backgroundAttachment: "fixed", backgroundRepeat: "no-repeat" }}>

      {/* ── Deep multi-layer ambience ─────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Primary warm ceiling — gold depth anchor */}
        <div className="absolute -top-52 left-1/2 -translate-x-1/2 w-[940px] h-[640px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(240,184,41,0.22) 0%, rgba(240,184,41,0.06) 44%, transparent 70%)' }} />
        {/* Right mid: emerald depth plane */}
        <div className="absolute top-[26%] -right-40 w-[440px] h-[440px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(0,200,150,0.11) 0%, transparent 70%)' }} />
        {/* Bottom left: orange ember warmth */}
        <div className="absolute bottom-0 -left-20 w-80 h-80 rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(255,107,0,0.07) 0%, transparent 70%)' }} />
        {/* Center anchor: subtle glow behind game card area */}
        <div className="absolute top-[46%] left-1/2 -translate-x-1/2 w-[520px] h-[320px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(0,200,150,0.05) 0%, transparent 70%)' }} />
        {/* Bottom vignette: grounds the page */}
        <div className="absolute bottom-0 inset-x-0 h-52"
          style={{ background: 'linear-gradient(to top, rgba(5,5,10,0.65) 0%, transparent 100%)' }} />
      </div>

      {/* ── Achievement toasts ─────────────────────────────────────────────── */}
      {newAchievements.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
          {newAchievements.map(ach => (
            <button
              key={ach.id}
              onClick={() => dismissAchievement(ach.id)}
              className="flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl text-left animate-slide-in-right w-full"
              style={{ backgroundColor: '#13131A', borderColor: `${C.gold}45` }}
              data-testid={`toast-achievement-${ach.id}`}
            >
              <span className="text-2xl leading-none shrink-0">{ach.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-mono uppercase tracking-widest mb-0.5" style={{ color: `${C.gold}90` }}>
                  Achievement Unlocked
                </div>
                <div className="text-sm font-bold text-white/85 font-sans truncate">{ach.name}</div>
                <div className="text-[10px] text-white/35 truncate">{ach.description}</div>
              </div>
              <div className="text-[10px] font-mono font-bold shrink-0" style={{ color: C.emerald }}>
                +{ach.xpReward} XP
              </div>
            </button>
          ))}
        </div>
      )}

      <DailyRewardModal open={dailyOpen}   onClose={handleDailyClose}   />
      <HourlyBonusModal  open={hourlyOpen}  onClose={handleHourlyClose}  />
      <StarterPackModal  open={starterOpen} onClose={handleStarterClose} />

      <div className="flex-1 flex flex-col items-center relative">
        {/* Ambient atmosphere orbs — fixed-position, pointer-events-none */}
        <div className="lobby-orb-gold" style={{ top: '-60px', left: '-80px' }} aria-hidden="true" />
        <div className="lobby-orb-emerald" style={{ top: '30vh', right: '-60px' }} aria-hidden="true" />
        <div className="lobby-orb-pink" style={{ top: '62vh', left: '-40px' }} aria-hidden="true" />
        <div className="lobby-orb-gold" style={{ bottom: '40px', right: '8vw', width: '200px', height: '200px', opacity: 0.7 }} aria-hidden="true" />

        {/* ── HERO SPACE — transparent window into fixed wallpaper ─────────── */}
        <div className="relative w-full h-[50vh] sm:h-[55vh] flex flex-col max-w-lg">

          {/* Top floating nav bar */}
          <div className="flex items-center justify-between px-3 pt-3 z-20">
            <div className="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: C.emerald }} />
              <span className="text-[9px] font-mono text-white/70 tracking-wider uppercase" data-testid="text-live-count">
                {realPlayerCount > 0 ? `${realPlayerCount} live` : 'Live'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/leaderboard')}
                className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-sm active:scale-95 transition-transform"
                data-testid="link-leaderboard-header"
              >🏆</button>
              <button
                onClick={() => navigate('/shop')}
                className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-sm active:scale-95 transition-transform"
                data-testid="link-shop-header"
              >🛍️</button>
              <button
                onClick={() => navigate('/profile')}
                className="w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center text-xs font-bold font-mono text-white active:scale-95 transition-transform"
                style={{ backgroundColor: avatarColor + '80', borderColor: rank.color + '90' }}
                data-testid="button-open-profile"
              >{initials}</button>
            </div>
          </div>

          {/* Spacer — lets the chain hex art breathe */}
          <div className="flex-1" />

          {/* Quick Play CTA anchored to bottom of hero space */}
          <div className="px-4 pb-4 z-20">
            <button
              onClick={() => navigateToMode('badugi', '/badugi')}
              className="w-full bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] rounded-2xl py-4 font-black text-xl tracking-wider uppercase border border-[#D4B44A]/60 shadow-[0_0_24px_rgba(201,162,39,0.55)] hover:shadow-[0_0_36px_rgba(201,162,39,0.75)] transition-all flex flex-col items-center gap-0.5 active:scale-[0.98]"
              data-testid="button-quick-play-hero"
            >
              <span>QUICK PLAY →</span>
              <span className="text-[9px] font-mono tracking-[0.18em] opacity-70 normal-case">Auto-fills with bots</span>
            </button>
          </div>

        </div>

        <div className="w-full max-w-lg px-4 pb-10 flex flex-col gap-3 mt-2 relative z-10">

          {/* ── PLAYER CARD ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-3 py-2.5 bg-black/45 backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <div className="absolute inset-0 anim-shimmer pointer-events-none rounded-xl opacity-30" />
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold font-mono text-white shrink-0 relative"
              style={{ backgroundColor: avatarColor + '30', border: `1.5px solid ${rank.color}65` }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0 relative">
              <div className="flex items-center gap-1.5">
                <span className="text-white/90 font-semibold text-sm truncate font-sans" data-testid="text-player-name">{identity.name}</span>
                <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
                  style={{ color: rank.color, backgroundColor: rank.bg, border: `1px solid ${rank.border}` }}
                  data-testid="badge-rank-home">Lv {serverLevel}</span>
              </div>
              <div className="text-[9px] font-mono text-white/35 uppercase tracking-wider mt-0.5">
                {rank.name} · {levelInfo.xpIntoLevel}/{levelInfo.xpNeeded} XP
              </div>
            </div>
            <div className="text-right shrink-0 relative">
              <div className="text-base font-bold font-mono tabular-nums" style={{ color: C.gold }} data-testid="text-bankroll">
                ${displayChips.toLocaleString()}
              </div>
              {displayHands > 0 && (
                <div className={`text-[9px] font-mono tabular-nums ${displayNet >= 0 ? 'text-emerald-400/65' : 'text-red-400/60'}`} data-testid="text-lifetime-net">
                  {displayNet >= 0 ? `+$${displayNet.toLocaleString()}` : `-$${Math.abs(displayNet).toLocaleString()}`}
                </div>
              )}
            </div>
          </div>

          {/* ── DAILY BONUS ───────────────────────────────────────────────── */}
          {rewardReady ? (
            <button
              onClick={() => setDailyOpen(true)}
              className="w-full rounded-2xl px-4 py-4 flex items-center gap-3.5 transition-all duration-200 active:scale-[0.99] group relative overflow-hidden bg-orange-950/50 backdrop-blur-md border border-orange-500/30"
              data-testid="button-claim-daily-home"
            >
              <div className="absolute inset-0 anim-shimmer pointer-events-none rounded-2xl opacity-50" />
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 anim-float-coin relative"
                style={{ backgroundColor: 'rgba(255,107,0,0.12)', border: '1px solid rgba(255,107,0,0.25)' }}>
                🎁
              </div>
              <div className="flex-1 text-left relative">
                <div className="text-sm font-bold font-sans" style={{ color: C.orange }}>Daily Ration Ready</div>
                <div className="text-[11px] text-white/45 font-mono mt-0.5">
                  {streakInfo.streak > 0 ? `Day ${streakInfo.dayInCycle} · ` : 'Start your run · '}
                  <span style={{ color: C.emerald }} className="font-bold">+${streakInfo.nextReward.chips.toLocaleString()} chips</span>
                  {streakInfo.streak > 0 && <span className="ml-1">🔥 {streakInfo.streak}</span>}
                </div>
              </div>
              <div className="text-xl relative" style={{ color: C.orange }}>›</div>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs bg-[#1a1208]/60 backdrop-blur-xl border border-[#C9A227]/25">
              <span style={{ color: C.gold }}>{streakInfo.streak > 0 ? '🔥' : '⏰'}</span>
              <span className="text-white/70 flex-1 font-sans">
                {streakInfo.streak > 0 ? `${streakInfo.streak}-Day Streak` : 'Daily Ration'}
              </span>
              <span className="font-mono text-[10px]" style={{ color: `${C.gold}90` }}>
                Tomorrow: +${(streakInfo.nextReward?.chips ?? 250).toLocaleString()}
              </span>
            </div>
          )}

          {/* ── RETENTION STRIP ──────────────────────────────────────────── */}
          <div className={`grid gap-1.5 ${starterAvailable ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {/* Hourly Bonus */}
            <button
              onClick={() => setHourlyOpen(true)}
              className="rounded-xl py-2.5 px-2 flex flex-col items-center justify-center text-center gap-0.5 bg-black/40 backdrop-blur-md border active:scale-[0.97] transition-transform relative"
              style={{ borderColor: hourlyReady ? 'rgba(240,184,41,0.40)' : 'rgba(255,255,255,0.10)' }}
              data-testid="button-hourly-home"
            >
              {hourlyReady && (
                <span
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#05050A]"
                  style={{ backgroundColor: C.pink }}
                />
              )}
              <div className="text-sm leading-none">{hourlyReady ? '⚡' : '⏰'}</div>
              <div className="text-[10px] font-bold font-sans uppercase tracking-wider" style={{ color: hourlyReady ? C.gold : 'rgba(255,255,255,0.40)' }}>
                {hourlyReady ? 'Claim' : 'Hourly'}
              </div>
            </button>

            {/* Starter Kit — only if unclaimed */}
            {starterAvailable && (
              <button
                onClick={() => setStarterOpen(true)}
                className="rounded-xl py-2.5 px-2 flex flex-col items-center justify-center text-center gap-0.5 bg-black/40 backdrop-blur-md border border-[#F0B829]/30 active:scale-[0.97] transition-transform relative"
                data-testid="button-starter-home"
              >
                <span
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#05050A]"
                  style={{ backgroundColor: C.pink }}
                />
                <div className="text-sm leading-none">🎁</div>
                <div className="text-[10px] font-bold font-sans uppercase tracking-wider" style={{ color: C.gold }}>Starter</div>
              </button>
            )}

            {/* Bonus Center */}
            <button
              onClick={() => navigate('/bonus')}
              className="rounded-xl py-2.5 px-2 flex flex-col items-center justify-center text-center gap-0.5 bg-black/40 backdrop-blur-md border border-white/10 active:scale-[0.97] transition-transform"
              data-testid="link-bonus-center-home"
            >
              <div className="text-sm leading-none">⚡</div>
              <div className="text-[10px] font-bold font-sans uppercase tracking-wider text-white/40">Bonuses</div>
            </button>
          </div>

          {/* ── STATS TILES — per-tile visibility, no empty placeholders ────── */}
          {(() => {
            const showBestWin = biggestPot > 0;
            const showWinRate = stats.handsPlayed > 0;
            const showStreak  = streakInfo.streak > 1;
            const count = [showBestWin, showWinRate, showStreak].filter(Boolean).length;
            if (count === 0) return null;
            const colClass = count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : 'grid-cols-3';
            return (
              <div className={`grid ${colClass} gap-2`}>
                {showBestWin && (
                  <div className="rounded-xl p-2.5 flex flex-col items-center text-center bg-black/40 backdrop-blur-md border border-[#F0B829]/15">
                    <div className="text-sm mb-0.5">🏆</div>
                    <div className="text-[8px] font-mono text-white/25 uppercase tracking-widest mb-0.5">Best Win</div>
                    <div className="text-xs font-bold font-mono tabular-nums" style={{ color: C.gold }}>${biggestPot.toLocaleString()}</div>
                  </div>
                )}
                {showWinRate && (
                  <div className="rounded-xl p-2.5 flex flex-col items-center text-center bg-black/40 backdrop-blur-md border border-[#00C896]/15">
                    <div className="text-sm mb-0.5">📈</div>
                    <div className="text-[8px] font-mono text-white/25 uppercase tracking-widest mb-0.5">Win Rate</div>
                    <div className="text-xs font-bold font-mono tabular-nums" style={{ color: C.emerald }}>{winRate}%</div>
                  </div>
                )}
                {showStreak && (
                  <div className="rounded-xl p-2.5 flex flex-col items-center text-center bg-black/40 backdrop-blur-md border border-[#FF6B00]/15">
                    <div className="text-sm mb-0.5">⛓️</div>
                    <div className="text-[8px] font-mono text-white/25 uppercase tracking-widest mb-0.5">Streak</div>
                    <div className="text-xs font-bold font-mono tabular-nums" style={{ color: C.orange }}>{streakInfo.streak} days</div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── SECTION LABEL ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-1">
            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(240,184,41,0.18))' }} />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">⛓️ The Games</span>
            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(240,184,41,0.18), transparent)' }} />
          </div>

          {/* ── 2×2 GAME MODES GRID ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            {([...MODES] as Array<typeof MODES[number]>).map(mode => {
              const tbl = getModeRealCount(mode.id);
              // TODO: wire up per-seat live player count when server exposes it
              const cardSubtitle = tbl > 0 ? `${tbl} playing now` : 'Tap to play';
              return (
                <button
                  key={mode.id}
                  onClick={() => navigateToMode(mode.id, mode.path)}
                  className="text-left rounded-2xl relative overflow-hidden transition-all duration-200 active:scale-[0.98] group flex flex-col backdrop-blur-md"
                  style={{ background: mode.bg, border: `1px solid ${mode.border}`, minHeight: '120px' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = mode.borderHover)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = mode.border)}
                  data-testid={`button-mode-${mode.id}`}
                >
                  <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at top right, ${mode.glow}0.22) 0%, transparent 70%)` }} />
                  <div className="relative p-3 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold font-mono text-sm"
                        style={{ backgroundColor: `${mode.glow}0.15)`, border: `1px solid ${mode.glow}0.30)`, color: mode.color }}>
                        {mode.icon}
                      </div>
                      <div className="text-[7px] font-mono font-bold px-1.5 py-0.5 rounded-full"
                        style={{ color: mode.color, backgroundColor: `${mode.glow}0.10)`, border: `1px solid ${mode.glow}0.22)` }}>
                        {mode.difficulty}
                      </div>
                    </div>
                    <div className="font-bold text-sm text-white/90 font-sans mb-0.5" data-testid={`text-mode-name-${mode.id}`}>{mode.name}</div>
                    <div className="text-[10px] font-mono leading-tight" style={{ color: mode.color + 'bb' }}>{mode.tagline}</div>
                    <div className="flex items-center justify-between mt-auto pt-2.5">
                      <div className="flex items-center gap-1">
                        {tbl > 0 && <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: mode.color }} />}
                        <span className="text-[9px] font-mono" style={{ color: tbl > 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)' }}>{cardSubtitle}</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-xl"
                        style={{ color: '#05050A', backgroundColor: mode.color, boxShadow: `0 2px 8px ${mode.glow}0.40)` }}>
                        Play →
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── MORE DIVIDER ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[9px] font-mono uppercase tracking-widest text-white/30">More</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* ── LIVE TABLES BROWSER ───────────────────────────────────────── */}
          <div className="rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 overflow-hidden">
            <LiveTablesSection onJoin={handleJoinTable} serverChips={serverProfile?.chipBalance} />
          </div>

          {/* ── CREW INVITE (Multiplayer spotlight) ───────────────────────── */}
          <div className="w-full rounded-2xl p-4 relative overflow-hidden bg-emerald-950/35 backdrop-blur-xl border border-emerald-500/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-white/25 mb-1">⛓️ Crew Mode</div>
                <p className="text-xs text-white/55 leading-relaxed">
                  Open a public Badugi table or share a private code with your crew.
                </p>
              </div>
              <div className="text-2xl shrink-0">⛓️</div>
            </div>
            <div className="mt-3 flex gap-2">
              <div className="flex-1 flex flex-col gap-0.5">
                <button
                  onClick={() => navigate('/badugi')}
                  className="w-full h-10 rounded-xl text-sm font-bold transition-all duration-200 active:scale-[0.98]"
                  style={{ backgroundColor: C.emerald, color: '#05050A', boxShadow: `0 2px 12px ${C.emerald}70` }}
                  data-testid="button-create-table"
                >
                  Open a Table
                </button>
                <span className="text-[9px] font-mono text-white/25 text-center">Public · listed · anyone can join</span>
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <button
                  onClick={() => { const code = generateTableCode(); navigate(`/badugi?t=${code}&private=1`); }}
                  className="w-full h-10 rounded-xl text-sm font-bold border transition-all duration-200 active:scale-[0.98]"
                  style={{ backgroundColor: 'rgba(155,93,229,0.07)', border: '1px solid rgba(155,93,229,0.22)', color: C.purple }}
                  data-testid="button-private-table"
                >
                  Private Table
                </button>
                <span className="text-[9px] font-mono text-white/25 text-center">Code-only · not listed</span>
              </div>
            </div>
          </div>

          {/* ── STATS STRIP ───────────────────────────────────────────────── */}
          {stats.handsPlayed > 0 && (
            <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-4 bg-black/40 backdrop-blur-md border border-white/[0.06]">
              <div className="flex items-center gap-2.5 flex-wrap">
                {[
                  { label: 'Hands', value: String(stats.handsPlayed), color: 'text-white/55' },
                  { label: 'Wins',  value: String(stats.wins),  color: 'text-emerald-400/65' },
                  { label: 'Net',   value: `${totalNet >= 0 ? '+' : ''}$${totalNet}`, color: totalNet >= 0 ? 'text-emerald-400/65' : 'text-red-400/55' },
                ].map((stat, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    {i > 0 && <div className="w-px h-5 bg-white/[0.05]" />}
                    <div className="text-center">
                      <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest">{stat.label}</div>
                      <div className={`text-sm font-bold font-mono tabular-nums ${stat.color}`}>{stat.value}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate('/profile')}
                className="text-[10px] font-mono uppercase tracking-widest shrink-0"
                style={{ color: `${C.gold}70` }}
                data-testid="link-profile-strip"
              >
                Stats ›
              </button>
            </div>
          )}

          {/* ── BOTTOM NAV ────────────────────────────────────────────────── */}
          <div className="flex flex-wrap justify-around items-center gap-y-2 px-2 py-3 bg-black/30 backdrop-blur-md border-t border-white/5 rounded-2xl">
            {[
              { label: '🏆 Leaderboard', path: '/leaderboard', color: C.gold,    id: 'link-leaderboard-footer' },
              { label: '🛍️ Shop & Merch', path: '/shop',        color: C.orange,  id: 'link-shop-footer'        },
              { label: '👤 Profile',     path: '/profile',     color: C.silver,  id: 'link-profile-footer'     },
            ].map(item => (
              <button key={item.path} onClick={() => navigate(item.path)}
                className="px-3 py-1.5 rounded-xl text-[10px] font-mono transition-all hover:bg-white/[0.04]"
                style={{ color: item.color }}
                data-testid={item.id}>
                {item.label}
              </button>
            ))}
            <a href="/terms" className="px-3 py-1.5 text-[10px] font-mono text-white/12 hover:text-white/30 transition-colors" data-testid="link-terms">Terms</a>
            <a href="/privacy" className="px-3 py-1.5 text-[10px] font-mono text-white/12 hover:text-white/30 transition-colors" data-testid="link-privacy">Privacy</a>
          </div>
          <p className="text-center text-[10px] font-mono pb-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.12)' }} data-testid="text-home-chips-disclaimer">
            Virtual chips are for entertainment only. They have no cash value, cannot be redeemed, and cannot be withdrawn.
          </p>

        </div>
      </div>
    </div>
  );
}
