import { useState, useEffect, useCallback, useMemo } from 'react';
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
  getSimulatedPlayerCount,
  getModeTableCount,
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

// ─── Live feed ────────────────────────────────────────────────────────────────

const FEED_TEMPLATES = [
  (n: string) => `${n} is on a 4-win streak — untouchable 🔥`,
  (n: string) => `${n} hit a clean Badugi — nobody saw it coming`,
  (n: string) => `${n} busted in Dead 7 — snitch card hit`,
  (n: string) => `${n} climbed to Silver rank`,
  (n: string) => `${n} claimed the daily bonus ($750 chips)`,
  (n: string) => `${n} swung both sides and scooped $640 💯`,
  (n: string) => `${n} just unlocked "Hat Trick" 🎩`,
  (n: string) => `${n} ran a 7-win streak 🚀`,
  (n: string) => `${n} reached Gold — Level 21 ⛓️`,
  (n: string) => `${n} hit 100 hands — Century Club member`,
  (n: string) => `${n} won the 15/35 pot with a perfect 35`,
  (n: string) => `${n} created a private Badugi table — crew only`,
];

const FEED_NAMES = ['AceHunter','BluffKing','CardShark','DeckMaster','FlushQueen',
  'GoldStrike','IronSuit','JackWild','KingBluff','MidStack',
  'PotSweeper','RiverRat','TiltKing','UltBadugi','VegasGhost'];

function buildFeed(seed: number): string[] {
  return Array.from({ length: 14 }, (_, i) => {
    const n = FEED_NAMES[(seed + i * 7) % FEED_NAMES.length];
    const t = FEED_TEMPLATES[(seed + i * 13) % FEED_TEMPLATES.length];
    return t(n);
  });
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

  const [playerCount, setPlayerCount] = useState(getSimulatedPlayerCount);
  useEffect(() => {
    const id = setInterval(() => setPlayerCount(getSimulatedPlayerCount()), 30000);
    return () => clearInterval(id);
  }, []);

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
  const feedSeed     = Math.floor(Date.now() / (1000 * 60 * 5));
  const feedItems    = useMemo(() => buildFeed(feedSeed), [feedSeed]);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';

  const dayKey       = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const dailyJackpot = 8000 + ((dayKey * 137) % 14000);
  const weeklyPrize  = 45000 + ((dayKey * 53) % 30000);

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-x-hidden" style={{ backgroundColor: C.bg }}>

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

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 w-full px-4 py-2.5 flex items-center gap-3 cgp-header-glass"
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 mr-auto">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold font-mono text-xs"
            style={{ background: `linear-gradient(135deg, rgba(240,184,41,0.22) 0%, rgba(255,107,0,0.12) 100%)`, border: `1px solid rgba(240,184,41,0.30)`, color: C.gold }}
          >
            ⛓️
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xs font-bold font-sans text-white/80 tracking-tight">Chain Gang Poker</span>
            <span className="text-[8px] font-mono text-white/25 tracking-widest uppercase">Prison rules. No mercy.</span>
          </div>
        </div>

        {/* Live count */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
          style={{ backgroundColor: 'rgba(0,200,150,0.07)', border: '1px solid rgba(0,200,150,0.15)' }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: C.emerald, boxShadow: `0 0 6px ${C.emerald}` }} />
          <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: C.emerald }} data-testid="text-live-count">
            {playerCount.toLocaleString()} live
          </span>
        </div>

        {/* Nav */}
        <div className="flex items-center gap-1">
          <button onClick={() => navigate('/leaderboard')} className="w-8 h-8 rounded-lg flex items-center justify-center text-sm hover:bg-white/[0.05] transition-all" title="Leaderboard" data-testid="link-leaderboard-header">🏆</button>
          <button onClick={() => navigate('/shop')}        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm hover:bg-white/[0.05] transition-all" title="Shop"        data-testid="link-shop-header">🛍️</button>
          <button
            onClick={() => navigate('/profile')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold font-mono text-white hover:opacity-80 shrink-0"
            style={{ backgroundColor: avatarColor + '28', border: `1.5px solid ${rank.color}55` }}
            data-testid="button-open-profile"
          >
            {initials}
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center relative">
        {/* Ambient atmosphere orbs — fixed-position, pointer-events-none */}
        <div className="lobby-orb-gold" style={{ top: '-60px', left: '-80px' }} aria-hidden="true" />
        <div className="lobby-orb-emerald" style={{ top: '30vh', right: '-60px' }} aria-hidden="true" />
        <div className="lobby-orb-pink" style={{ top: '62vh', left: '-40px' }} aria-hidden="true" />
        <div className="lobby-orb-gold" style={{ bottom: '40px', right: '8vw', width: '200px', height: '200px', opacity: 0.7 }} aria-hidden="true" />

        <div className="w-full max-w-lg px-4 pt-5 pb-10 flex flex-col gap-4">

          {/* ── PLAYER CARD ───────────────────────────────────────────────── */}
          <div
            className="w-full rounded-2xl p-4 relative overflow-hidden home-player-card"
            style={{
              background: `linear-gradient(135deg, rgba(240,184,41,0.10) 0%, rgba(255,107,0,0.045) 60%, rgba(0,200,150,0.045) 100%)`,
              border: `1px solid rgba(240,184,41,0.24)`,
            }}
          >
            <div className="absolute inset-0 anim-shimmer pointer-events-none rounded-2xl opacity-60" />
            <div className="relative flex items-center gap-3">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-base font-bold font-mono text-white shrink-0"
                style={{ backgroundColor: avatarColor + '30', border: `2px solid ${rank.color}65`, boxShadow: `0 0 18px ${rank.color}22` }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest">{greeting}, inmate</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-base font-bold text-white/90 font-sans truncate" data-testid="text-player-name">{identity.name}</span>
                  <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-md shrink-0"
                    style={{ color: rank.color, backgroundColor: rank.bg, border: `1px solid ${rank.border}` }}
                    data-testid="badge-rank-home">
                    Lv {serverLevel} · {rank.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${rank.color}, ${C.gold})` }} />
                  </div>
                  <span className="text-[9px] font-mono text-white/20 shrink-0 tabular-nums">{levelInfo.xpIntoLevel}/{levelInfo.xpNeeded} XP</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest">Bankroll</div>
                <div className="text-lg font-bold font-mono tabular-nums" style={{ color: C.gold }} data-testid="text-bankroll">${displayChips.toLocaleString()}</div>
                {displayHands > 0 && (
                  <div className={`text-[10px] font-mono font-bold tabular-nums ${displayNet >= 0 ? 'text-emerald-400/70' : 'text-red-400/60'}`} data-testid="text-lifetime-net">
                    {displayNet >= 0 ? '+' : ''}${displayNet.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── DAILY BONUS ───────────────────────────────────────────────── */}
          {rewardReady ? (
            <button
              onClick={() => setDailyOpen(true)}
              className="w-full rounded-2xl px-4 py-4 flex items-center gap-3.5 transition-all duration-200 active:scale-[0.99] group relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, rgba(255,107,0,0.14) 0%, rgba(240,184,41,0.08) 100%)`, border: `1px solid rgba(255,107,0,0.35)` }}
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
            <div className="w-full rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="text-xl leading-none">{streakInfo.streak > 0 ? '🔥' : '⏰'}</div>
              <div>
                <div className="text-xs font-semibold text-white/40 font-sans">
                  {streakInfo.streak > 0 ? `${streakInfo.streak}-Day Streak Running` : 'Daily Ration'}
                </div>
                <div className="text-[10px] text-white/20 font-mono mt-0.5">
                  Claimed · Come back tomorrow for +${(streakInfo.nextReward?.chips ?? 250).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* ── RETENTION STRIP ──────────────────────────────────────────── */}
          <div className={`grid gap-2 ${starterAvailable ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {/* Hourly Bonus */}
            <button
              onClick={() => setHourlyOpen(true)}
              className="rounded-xl p-3 flex flex-col items-center text-center gap-1 transition-all duration-200 active:scale-[0.97] relative"
              style={hourlyReady
                ? { background: 'linear-gradient(135deg, rgba(240,184,41,0.14) 0%, rgba(240,184,41,0.05) 100%)', border: '1px solid rgba(240,184,41,0.35)' }
                : { backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.05)' }
              }
              data-testid="button-hourly-home"
            >
              {hourlyReady && (
                <span
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#05050A]"
                  style={{ backgroundColor: C.pink }}
                />
              )}
              <div className="text-base leading-none">{hourlyReady ? '⚡' : '⏰'}</div>
              <div className="text-[10px] font-bold font-sans" style={{ color: hourlyReady ? C.gold : 'rgba(255,255,255,0.40)' }}>
                {hourlyReady ? 'Claim Bonus' : 'Hourly'}
              </div>
            </button>

            {/* Starter Kit — only if unclaimed */}
            {starterAvailable && (
              <button
                onClick={() => setStarterOpen(true)}
                className="rounded-xl p-3 flex flex-col items-center text-center gap-1 transition-all duration-200 active:scale-[0.97] relative"
                style={{ background: 'linear-gradient(135deg, rgba(240,184,41,0.12) 0%, rgba(255,107,0,0.06) 100%)', border: '1px solid rgba(240,184,41,0.30)' }}
                data-testid="button-starter-home"
              >
                <span
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#05050A]"
                  style={{ backgroundColor: C.pink }}
                />
                <div className="text-base leading-none">🎁</div>
                <div className="text-[10px] font-bold font-sans" style={{ color: C.gold }}>Starter Kit</div>
              </button>
            )}

            {/* Bonus Center */}
            <button
              onClick={() => navigate('/bonus')}
              className="rounded-xl p-3 flex flex-col items-center text-center gap-1 transition-all duration-200 active:scale-[0.97]"
              style={{ backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.05)' }}
              data-testid="link-bonus-center-home"
            >
              <div className="text-base leading-none">⚡</div>
              <div className="text-[10px] font-bold font-sans text-white/40">Bonus Center</div>
            </button>
          </div>

          {/* ── PRIZE BAND ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl p-3 flex flex-col items-center text-center"
              style={{ background: 'linear-gradient(135deg, rgba(240,184,41,0.10) 0%, rgba(240,184,41,0.03) 100%)', border: '1px solid rgba(240,184,41,0.18)' }}>
              <div className="text-base mb-1">🏅</div>
              <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1">Daily Pot</div>
              <div className="text-sm font-bold font-mono tabular-nums anim-jackpot" style={{ color: C.gold }}>${dailyJackpot.toLocaleString()}</div>
            </div>
            <div className="rounded-xl p-3 flex flex-col items-center text-center"
              style={{ background: 'linear-gradient(135deg, rgba(155,93,229,0.10) 0%, rgba(155,93,229,0.03) 100%)', border: '1px solid rgba(155,93,229,0.18)' }}>
              <div className="text-base mb-1">👑</div>
              <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1">Weekly</div>
              <div className="text-sm font-bold font-mono tabular-nums" style={{ color: C.purple }}>${weeklyPrize.toLocaleString()}</div>
            </div>
            <div className="rounded-xl p-3 flex flex-col items-center text-center"
              style={{ background: 'linear-gradient(135deg, rgba(255,107,0,0.10) 0%, rgba(255,107,0,0.03) 100%)', border: '1px solid rgba(255,107,0,0.18)' }}>
              <div className="text-base mb-1">⛓️</div>
              <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1">Streak</div>
              <div className="text-sm font-bold font-mono tabular-nums" style={{ color: C.orange }}>
                {streakInfo.streak > 0 ? `${streakInfo.streak} days` : 'Start'}
              </div>
            </div>
          </div>

          {/* ── SECTION LABEL ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-1">
            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(240,184,41,0.18))' }} />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">⛓️ The Games</span>
            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(240,184,41,0.18), transparent)' }} />
          </div>

          {/* ── BADUGI HERO CARD ──────────────────────────────────────────── */}
          {(() => {
            const mode  = MODES[0];
            // P1: Unified bankroll — all modes share the server-authoritative
            // chipBalance. Only fall back to per-mode localStorage values when
            // the server profile hasn't loaded yet.
            const chips = serverProfile?.chipBalance ?? chipMap[mode.id] ?? 1000;
            const tbl   = getModeTableCount(mode.id);
            return (
              <button
                onClick={() => navigateToMode(mode.id, mode.path)}
                className="w-full text-left rounded-2xl relative overflow-hidden transition-all duration-200 active:scale-[0.99] group home-hero-card"
                style={{ background: mode.bg, border: `1px solid ${mode.border}` }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = mode.borderHover)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = mode.border)}
                data-testid={`button-mode-${mode.id}`}
              >
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at 80% 50%, ${mode.glow}0.16) 0%, transparent 65%)` }} />
                <div className="absolute inset-0 anim-shimmer pointer-events-none opacity-30 rounded-2xl" />
                <div className="relative p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold font-mono shrink-0"
                      style={{ backgroundColor: `${mode.glow}0.15)`, border: `1px solid ${mode.glow}0.28)`, color: mode.color }}>
                      {mode.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold text-white/90 font-sans" data-testid={`text-mode-name-${mode.id}`}>{mode.name}</span>
                        <span className="text-[8px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                          style={{ color: mode.color, backgroundColor: `${mode.glow}0.12)`, border: `1px solid ${mode.glow}0.28)` }}>
                          {mode.badge}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono mt-0.5" style={{ color: mode.color + 'cc' }}>{mode.tagline}</div>
                      <p className="text-sm text-white/50 mt-1.5 leading-snug">{mode.description}</p>
                      {stats.handsPlayed === 0 && (
                        <p className="text-[10px] font-mono mt-1.5" style={{ color: mode.color + '80' }}>New here — tap Quick Play and you're at a table in seconds.</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: mode.color }} />
                        <span className="text-[10px] font-mono text-white/55">{tbl} tables live</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-2">
                        <div className="font-mono font-bold text-sm tabular-nums" style={{ color: mode.color }}>${chips.toLocaleString()}</div>
                        <div className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all duration-200"
                          style={{ backgroundColor: mode.color, color: '#05050A', boxShadow: `0 2px 10px ${mode.color}66` }}>
                          Quick Play →
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-white/25">Joins real players · bots fill if needed</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })()}

          {/* ── LIVE TABLES BROWSER ───────────────────────────────────────── */}
          <LiveTablesSection onJoin={handleJoinTable} serverChips={serverProfile?.chipBalance} />

          {/* ── 2-COLUMN GRID ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2">
            {MODES.slice(1).map(mode => {
              // P1: Unified bankroll — all modes share the server-authoritative
            // chipBalance. Only fall back to per-mode localStorage values when
            // the server profile hasn't loaded yet.
            const chips = serverProfile?.chipBalance ?? chipMap[mode.id] ?? 1000;
              const tbl   = getModeTableCount(mode.id);
              return (
                <button
                  key={mode.id}
                  onClick={() => navigateToMode(mode.id, mode.path)}
                  className="text-left rounded-2xl relative overflow-hidden transition-all duration-200 active:scale-[0.98] group"
                  style={{ background: mode.bg, border: `1px solid ${mode.border}` }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = mode.borderHover)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = mode.border)}
                  data-testid={`button-mode-${mode.id}`}
                >
                  <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at top right, ${mode.glow}0.18) 0%, transparent 70%)` }} />
                  <div className="relative p-3.5">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold font-mono text-sm"
                        style={{ backgroundColor: `${mode.glow}0.15)`, border: `1px solid ${mode.glow}0.25)`, color: mode.color }}>
                        {mode.icon}
                      </div>
                      {mode.badge ? (
                        <div className="text-[7px] font-mono font-bold px-1.5 py-0.5 rounded-full"
                          style={{ color: mode.color, backgroundColor: `${mode.glow}0.10)`, border: `1px solid ${mode.glow}0.20)` }}>
                          {mode.badge}
                        </div>
                      ) : (
                        <div className="text-[8px] font-mono text-white/20">{mode.difficulty}</div>
                      )}
                    </div>
                    <div className="font-bold text-sm text-white/85 font-sans mb-0.5" data-testid={`text-mode-name-${mode.id}`}>{mode.name}</div>
                    <div className="text-[10px] font-mono leading-tight mb-2" style={{ color: mode.color + 'bb' }}>{mode.tagline}</div>
                    <div className="flex items-center justify-between">
                      <div className="font-mono font-bold text-sm tabular-nums" style={{ color: mode.color }}>${chips.toLocaleString()}</div>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full" style={{ backgroundColor: mode.color + '60' }} />
                        <span className="text-[9px] font-mono text-white/20">{tbl}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── CREW INVITE (Multiplayer spotlight) ───────────────────────── */}
          <div className="w-full rounded-2xl p-4 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(0,200,150,0.08) 0%, rgba(155,93,229,0.06) 100%)', border: '1px solid rgba(0,200,150,0.16)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-white/25 mb-1">⛓️ Crew Mode</div>
                <div className="text-base font-bold text-white/92 font-sans">Play Badugi with Your Crew</div>
                <p className="text-xs text-white/40 mt-1 leading-relaxed">
                  Open a Badugi table anyone can find — or go private and share the code with your crew. Up to 5 real players, bots fill empty seats instantly.
                </p>
              </div>
              <div className="text-3xl shrink-0 anim-float-coin">⛓️</div>
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

          {/* ── LIVE FEED TICKER ──────────────────────────────────────────── */}
          <div className="w-full rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="px-3 py-2 flex items-center gap-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: C.emerald }} />
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/20">Live Activity</span>
            </div>
            <div className="relative overflow-hidden h-8">
              <div className="flex anim-ticker whitespace-nowrap absolute left-0 top-0 h-full items-center">
                {[...feedItems, ...feedItems].map((item, i) => (
                  <span key={i} className="text-[10px] font-mono text-white/30 px-4 shrink-0">
                    <span style={{ color: C.orange }} className="mr-1">•</span>{item}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── STATS STRIP ───────────────────────────────────────────────── */}
          {stats.handsPlayed > 0 && (
            <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-4"
              style={{ backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.04)' }}>
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
          <div className="flex items-center justify-center gap-1 flex-wrap pt-2">
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
