import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  ensurePlayerIdentity,
  getAvatarInitials,
  getAvatarColor,
  resolveAvatarSrc,
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
} from '@/lib/retention';
import { DailyRewardModal } from '@/components/DailyRewardModal';
import { DailyBonusCalendarModal } from '@/components/DailyBonusCalendarModal';
import { HourlyBonusModal } from '@/components/HourlyBonusModal';
import { StarterPackModal } from '@/components/StarterPackModal';
import { AvatarWithFrame } from '@/components/ui/AvatarWithFrame';
import { useServerProfile } from '@/lib/useServerProfile';
import { apiUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';
import { track } from '@/lib/analytics';

// ── Quest types (inline) ──────────────────────────────────────────────────────

interface QuestData {
  claimed:           string[];
  handsPlayed:       number;
  handsPlayedBadugi: number;
  handsPlayedDead7:  number;
  handsPlayed1535:   number;
  handsPlayedSuits:  number;
}

function questHandsForMode(d: QuestData, modeId: string | null): number {
  if (!modeId)             return d.handsPlayed;
  if (modeId === 'badugi') return d.handsPlayedBadugi;
  if (modeId === 'dead7')  return d.handsPlayedDead7;
  if (modeId === '1535')   return d.handsPlayed1535;
  if (modeId === 'suits')  return d.handsPlayedSuits;
  return d.handsPlayed;
}

// ── Quest constants (mirrors server) ─────────────────────────────────────────

const HOME_DAILY_QUESTS: Record<number, { questId: string; description: string; modeId: string | null; requiredHands: number; stripes: number }> = {
  1: { questId: 'daily_monday',    description: 'Play 10 hands in Badugi',              modeId: 'badugi', requiredHands: 10, stripes: 5 },
  2: { questId: 'daily_tuesday',   description: 'Play 10 hands in Dead 7',              modeId: 'dead7',  requiredHands: 10, stripes: 5 },
  3: { questId: 'daily_wednesday', description: 'Play 10 hands in 15/35',               modeId: '1535',   requiredHands: 10, stripes: 5 },
  4: { questId: 'daily_thursday',  description: 'Play 10 hands in Suits & Poker',       modeId: 'suits',  requiredHands: 10, stripes: 5 },
  5: { questId: 'daily_friday',    description: 'Play 15 hands in any mode',            modeId: null,     requiredHands: 15, stripes: 5 },
  6: { questId: 'daily_saturday',  description: 'Win 15 hands in any mode',             modeId: null,     requiredHands: 15, stripes: 5 },
  0: { questId: 'daily_sunday',    description: 'Play 10 hands in two different modes', modeId: null,     requiredHands: 10, stripes: 5 },
};

const HOME_MILESTONES = [
  { questId: 'milestone_10',   label: '10',   required: 10,   stripes: 5   },
  { questId: 'milestone_50',   label: '50',   required: 50,   stripes: 10  },
  { questId: 'milestone_100',  label: '100',  required: 100,  stripes: 25  },
  { questId: 'milestone_500',  label: '500',  required: 500,  stripes: 50  },
  { questId: 'milestone_1000', label: '1K',   required: 1000, stripes: 100 },
  { questId: 'milestone_2500', label: '2.5K', required: 2500, stripes: 150 },
];

// ── Tier badge asset map ──────────────────────────────────────────────────────

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

// ── Time until next daily ration ──────────────────────────────────────────────

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
  { id: 'badugi',     name: 'BADUGI',       tagline: 'The OG draw game',      path: '/badugi',     color: '#10b981', icon: '/mode-icon-badugi.png'    },
  { id: 'dead7',      name: 'DEAD 7',        tagline: 'Snitches get stitches', path: '/dead7',      color: '#ef4444', icon: '/mode-icon-dead7.png'     },
  { id: 'fifteen35',  name: '15 / 35',       tagline: 'Hit or go home',        path: '/fifteen35',  color: '#f59e0b', icon: '/mode-icon-fifteen35.png' },
  { id: 'suitspoker', name: 'SUITS & POKER', tagline: 'Two paths, one winner', path: '/suitspoker', color: '#3b82f6', icon: '/mode-icon-suits.png'     },
] as const;

// Card-specific background images and copy (per spec)
const MODE_CARD_CONFIGS = [
  { id: 'badugi',     bg: '/modes/bg-badugi.png',               color: '#4CAF50', btnText: 'white', title: 'BADUGI',        subtitle: 'THE OG DRAW GAME'      },
  { id: 'dead7',      bg: '/assets/backgrounds/dead7board.png', color: '#f44336', btnText: 'white', title: 'DEAD 7',        subtitle: 'ONLY ONE WALKS AWAY'   },
  { id: 'fifteen35',  bg: '/modes/bg-1535.png',                 color: '#C9A227', btnText: 'black', title: '15 / 35',       subtitle: 'HIT OR GO HOME'        },
  { id: 'suitspoker', bg: '/modes/bg-suits.png',                color: '#2196F3', btnText: 'white', title: 'SUITS & POKER', subtitle: 'TWO PATHS. ONE WINNER.' },
];

// ── Live table browser ────────────────────────────────────────────────────────

interface LiveTableEntry {
  tableId:      string;
  modeId:       string;
  humanCount:   number;
  phase:        string;
  maxPlayers:   number;
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
  { id: 'all',         label: 'All'    },
  { id: 'badugi',      label: 'Badugi' },
  { id: 'dead7',       label: 'Dead 7' },
  { id: 'fifteen35',   label: '15/35'  },
  { id: 'suits_poker', label: 'Suits'  },
] as const;

// LiveTablesSection kept for reference / join handler usage
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
    <div className="flex flex-col gap-2.5" data-testid="section-live-tables-legacy">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
        {LIVE_TABS.map(tab => {
          const active    = activeTab === tab.id;
          const modeColor = tab.id === 'all' ? '#C9A227' : (LIVE_MODE_INFO[tab.id]?.color ?? '#C9A227');
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-live-${tab.id}`}
              className="shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider transition-all"
              style={{
                background: active ? modeColor + '22' : 'rgba(255,255,255,0.04)',
                border:     `1px solid ${active ? modeColor + '55' : 'rgba(255,255,255,0.08)'}`,
                color:      active ? modeColor : 'rgba(255,255,255,0.35)',
              }}>
              {tab.label}
              {tabHasActive(tab.id) && <span className="w-1 h-1 rounded-full" style={{ background: active ? modeColor : '#10b981' }} />}
            </button>
          );
        })}
      </div>
      {filteredTables.length === 0 && (
        <p className="text-center text-xs font-mono text-white/30 py-2">No tables open.</p>
      )}
      {filteredTables.slice(0, 6).map(table => {
        const info   = LIVE_MODE_INFO[table.modeId] ?? { name: table.modeId, color: '#A0A0B8', path: '/', icon: '', stakes: '' };
        const isFull = table.humanCount >= table.maxPlayers;
        return (
          <button key={`${table.modeId}-${table.tableId}`}
            onClick={() => !isFull && onJoin(table.modeId, table.tableId)}
            disabled={isFull}
            data-testid={`button-join-table-${table.tableId}`}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 border text-left transition-all active:scale-[0.98]"
            style={{
              background:  isFull ? 'rgba(255,255,255,0.03)' : info.color + '0e',
              borderColor: isFull ? 'rgba(255,255,255,0.06)' : info.color + '35',
              opacity:     isFull ? 0.55 : 1,
              cursor:      isFull ? 'default' : 'pointer',
            }}>
            {info.icon && <img src={info.icon} alt={info.name} className="w-8 h-8 object-contain shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[12px] font-bold" style={{ color: info.color }}>{info.name}</span>
                <span className="font-mono text-[9px] text-white/25" data-testid={`text-live-table-code-${table.tableId}`}>{table.tableId}</span>
              </div>
              <span className="text-[10px] font-mono text-white/50" data-testid={`text-live-players-${table.tableId}`}>
                {table.humanCount}/{table.maxPlayers} · {phaseLabel(table.phase)}
              </span>
            </div>
            <div className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono uppercase"
              style={{ background: isFull ? 'rgba(255,255,255,0.05)' : info.color + '22', color: isFull ? 'rgba(255,255,255,0.28)' : info.color }}>
              {isFull ? 'FULL' : 'JOIN'}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── XP sync ──────────────────────────────────────────────────────────────────

function syncXPFromHistory(): void {
  const history = getHandHistory();
  initProgressionBaseline(history.length);
}

// ── Home ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [, navigate] = useLocation();
  const [showPrivateSetup,   setShowPrivateSetup]   = useState(false);
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

  const rank        = getRankForLevel(serverLevel);
  const progressPct = Math.round(levelInfo.progress * 100);

  const [dailyOpen,         setDailyOpen]         = useState(false);
  const [dailyBonusCalOpen, setDailyBonusCalOpen] = useState(false);
  const [serverBonusCanClaim,  setServerBonusCanClaim]  = useState<boolean | null>(null);
  const [serverBonusStreakDay, setServerBonusStreakDay] = useState(1);
  const [hourlyOpen,        setHourlyOpen]        = useState(false);
  const [starterOpen,       setStarterOpen]        = useState(false);
  const [rewardReady,       setRewardReady]        = useState(isRewardAvailable);
  const [hourlyReady,       setHourlyReady]        = useState(isHourlyReady);
  const starterAvailable = serverProfile?.welcomeKitClaimed === false;
  const streakInfo = getStreakInfo();

  // Live tables (30s poll, used for header live count + new live section)
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
  const publicTables    = liveTables.filter(t => !t.isInviteOnly).sort((a, b) => b.humanCount - a.humanCount);
  const realPlayerCount = liveTables.reduce((sum, t) => sum + (t.humanCount ?? 0), 0);

  const [newAchievements, setNewAchievements] = useState<Achievement[]>(() => {
    const p = getProgression();
    return (p.newAchievements ?? []).map(id => ACHIEVEMENT_MAP.get(id)!).filter(Boolean);
  });

  // ── Quest inline state ──────────────────────────────────────────────────────
  const [questData,     setQuestData]     = useState<QuestData | null>(null);
  const [questClaiming, setQuestClaiming] = useState<string | null>(null);
  const [questToast,    setQuestToast]    = useState<string | null>(null);

  const fetchQuestData = useCallback(async (pid: string) => {
    try {
      const r = await apiFetch(apiUrl(`/api/players/${pid}/quests`));
      if (r.ok) setQuestData(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (!serverProfile?.profileId) return;
    fetchQuestData(serverProfile.profileId);
  }, [serverProfile?.profileId, fetchQuestData]);

  useEffect(() => {
    if (!questToast) return;
    const t = setTimeout(() => setQuestToast(null), 3000);
    return () => clearTimeout(t);
  }, [questToast]);

  const claimQuestById = useCallback(async (questId: string, stripes: number) => {
    if (!serverProfile || questClaiming) return;
    setQuestClaiming(questId);
    try {
      const r = await apiFetch(apiUrl(`/api/players/${serverProfile.profileId}/quests/claim`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questId }),
      });
      if (r.ok) {
        const body = await r.json();
        setQuestToast(`+${body.stripesGranted ?? stripes} ◆ Stripes earned!`);
        refetch();
        fetchQuestData(serverProfile.profileId);
      } else {
        const err = await r.json().catch(() => ({}));
        setQuestToast(err.error ?? 'Could not claim');
      }
    } catch {
      setQuestToast('Network error');
    } finally {
      setQuestClaiming(null);
    }
  }, [serverProfile, questClaiming, refetch, fetchQuestData]);

  // ── Today's daily quest ─────────────────────────────────────────────────────
  const todayDow          = new Date().getUTCDay();
  const todayQuest        = HOME_DAILY_QUESTS[todayDow];
  const todayQuestHands   = questData ? questHandsForMode(questData, todayQuest?.modeId ?? null) : 0;
  const todayQuestPct     = todayQuest ? Math.min(100, Math.round((todayQuestHands / todayQuest.requiredHands) * 100)) : 0;
  const todayQuestEligible = todayQuestHands >= (todayQuest?.requiredHands ?? 0);
  const todayQuestClaimed  = questData?.claimed.includes(todayQuest?.questId ?? '') ?? false;

  // Auto-show starter pack
  useEffect(() => {
    if (!serverProfile) return;
    if (serverProfile.welcomeKitClaimed === false) setStarterOpen(true);
  }, [serverProfile?.welcomeKitClaimed]);

  // Fetch server-authoritative daily bonus status
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
      refetch();
      const modes = ['badugi', 'dead7', 'fifteen35', 'suitspoker'];
      for (const modeId of modes) {
        try { localStorage.setItem(`pt_chips_${modeId}`, String(newChipBalance)); } catch {}
      }
      void newStripesBalance;
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

  const handleStarterClose = useCallback((claimed?: boolean) => {
    setStarterOpen(false);
    if (claimed) refetch();
  }, [refetch]);

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

  // Suppress unused-var lint on stats (kept for existing logic parity)
  void stats;
  void hourlyReady;

  const canClaimBonus = serverBonusCanClaim === true || (serverBonusCanClaim === null && rewardReady);


  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
    {/* Fixed background layers */}
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: "url('/assets/backgrounds/bg-cellblock.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }} />
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'rgba(0,0,0,0.78)' }} />

    <div className="min-h-[100dvh] flex flex-col" style={{ position: 'relative', zIndex: 1 }}>

      {/* ── Sticky top header ──────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50, height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', background: 'rgba(0,0,0,0.70)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(201,162,39,0.25)',
      }}>
        {/* Left: leaderboard */}
        <button
          onClick={() => navigate('/leaderboard')}
          data-testid="link-leaderboard-header"
          style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(201,162,39,0.30)', background: 'rgba(0,0,0,0.50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
        >
          <img src="/dock-leaderboard.png" alt="Leaderboard" style={{ width: 20, height: 20, objectFit: 'contain' }} />
        </button>

        {/* Center: hero logo (absolutely centered) */}
        <img
          src="/hero-chain-logo.png"
          alt="Chain Gang Poker"
          style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', height: 44, objectFit: 'contain', pointerEvents: 'none', filter: 'drop-shadow(0 2px 10px rgba(201,162,39,0.40))' }}
        />

        {/* Right: ◆ + stripes + avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => navigate('/cosmetics')}
            data-testid="link-cosmetics-header"
            style={{ background: 'none', border: 'none', color: '#C9A227', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 0 }}
          >
            ◆
          </button>
          <button
            onClick={() => navigate('/shop')}
            data-testid="link-shop-header"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
          >
            <img src="/stripes-icon.png" alt="Stripes" style={{ width: 20, height: 20, objectFit: 'contain' }} />
          </button>
          <button
            onClick={() => navigate('/profile')}
            data-testid="button-open-profile"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
          >
            <AvatarWithFrame
              avatarSrc={resolveAvatarSrc(serverProfile?.equippedAvatarId, serverProfile?.avatarId)}
              frameSrc={serverProfile?.equippedFrameId ? `/cosmetics/frames/${serverProfile.equippedFrameId.replace(/_/g, '-')}.png` : null}
              initials={initials}
              initialsColor="#F0B829"
              size={40}
            />
          </button>
        </div>
      </header>

      {/* ── Achievement toasts ───────────────────────────────────────────────── */}
      {newAchievements.length > 0 && (
        <div className="fixed top-20 right-3 z-50 flex flex-col gap-2 max-w-[280px]">
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
                <div className="text-[8px] font-mono uppercase tracking-widest mb-0.5" style={{ color: 'rgba(201,162,39,0.75)' }}>Achievement Unlocked</div>
                <div className="text-xs font-bold text-white/90 truncate">{ach.name}</div>
                <div className="text-[9px] text-white/30 truncate">{ach.description}</div>
              </div>
              <div className="text-[10px] font-mono font-bold shrink-0 text-emerald-400">+{ach.xpReward} XP</div>
            </button>
          ))}
        </div>
      )}

      {/* ── Quest claim toast ────────────────────────────────────────────────── */}
      {questToast && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg,#1a1230,#12092a)',
          border: '1.5px solid rgba(201,162,39,0.60)', borderRadius: 12,
          padding: '10px 20px', color: '#F0B829', fontFamily: 'monospace',
          fontWeight: 800, fontSize: 13, zIndex: 9999, whiteSpace: 'nowrap',
          boxShadow: '0 8px 32px rgba(0,0,0,0.60)',
        }}>
          {questToast}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <DailyRewardModal open={dailyOpen} onClose={handleDailyClose} />
      <DailyBonusCalendarModal
        open={dailyBonusCalOpen}
        onClose={() => setDailyBonusCalOpen(false)}
        onClaimed={handleDailyBonusClaimed}
      />
      <HourlyBonusModal  open={hourlyOpen}  onClose={handleHourlyClose}  />
      <StarterPackModal  open={starterOpen} onClose={handleStarterClose} onRefetchProfile={refetch} />

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col pb-24">
        <div className="w-full max-w-lg mx-auto flex flex-col">

          {/* ═══════════ 1. PLAYER CARD ═══════════ */}
          <button
            onClick={() => navigate('/profile')}
            data-testid="button-profile-strip"
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(0,0,0,0.50)', borderBottom: '1px solid rgba(201,162,39,0.15)', textAlign: 'left', cursor: 'pointer', width: '100%' }}
          >
            {/* Avatar */}
            <AvatarWithFrame
              avatarSrc={resolveAvatarSrc(serverProfile?.equippedAvatarId, serverProfile?.avatarId)}
              frameSrc={serverProfile?.equippedFrameId ? `/cosmetics/frames/${serverProfile.equippedFrameId.replace(/_/g, '-')}.png` : null}
              initials={initials}
              initialsColor="#F0B829"
              size={64}
            />

            {/* Middle */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontWeight: 800, color: 'white', fontSize: 18, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="text-player-name">
                  {identity.name}
                </span>
                <img src={getTierBadgeAsset(rank.name)} alt={rank.name} style={{ height: 20, width: 'auto', objectFit: 'contain', flexShrink: 0 }} data-testid="badge-rank-home" />
              </div>
              {/* XP bar */}
              <div style={{ width: '100%', height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.10)', overflow: 'hidden', marginBottom: 5 }}>
                <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: 4, background: 'rgba(201,162,39,0.80)', transition: 'width 0.7s ease' }} />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,215,0,0.60)', fontFamily: 'monospace' }}>
                Welcome back, {identity.name.split(' ')[0]}.
              </div>
            </div>

            {/* Right: pills */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <div
                style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(0,180,0,0.15)', border: '1px solid rgba(0,255,0,0.30)', color: '#22c55e', fontWeight: 800, fontFamily: 'monospace', fontSize: 13 }}
                data-testid="text-bankroll"
              >
                ${displayChips.toLocaleString()}
              </div>
              <div
                style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.40)', color: '#a855f7', fontWeight: 800, fontFamily: 'monospace', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
                data-testid="text-stripes-lobby"
              >
                <img src="/stripes-icon.png" alt="" aria-hidden style={{ width: 12, height: 12 }} />
                {(serverProfile?.stripes ?? 0).toLocaleString()}
              </div>
            </div>
          </button>

          {/* ═══════════ 2. MODE CARDS ═══════════ */}
          <div>
            {MODE_CARD_CONFIGS.map(card => {
              const mode = MODES.find(m => m.id === card.id)!;
              return (
                <button
                  key={card.id}
                  onClick={() => navigateToMode(card.id, mode.path)}
                  data-testid={`button-mode-${card.id}`}
                  style={{ position: 'relative', overflow: 'hidden', width: '100%', height: 110, cursor: 'pointer', border: 'none', padding: 0, display: 'block' }}
                >
                  {/* Background image */}
                  <img
                    src={card.bg}
                    alt=""
                    aria-hidden
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {/* Dark gradient overlay */}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.40) 60%, rgba(0,0,0,0.10) 100%)' }} />

                  {/* Content */}
                  <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: '100%' }}>
                    {/* Left */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <img src={mode.icon} alt={card.title} style={{ width: 48, height: 48, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 0 10px ${card.color}66)` }} />
                      <div style={{ minWidth: 0, textAlign: 'left' }}>
                        <div
                          style={{ fontFamily: 'Anton, Impact, "Arial Narrow Bold", sans-serif', fontSize: 28, color: card.color, letterSpacing: '1px', lineHeight: 1, textShadow: '0 2px 10px rgba(0,0,0,0.80)' }}
                          data-testid={`text-mode-name-${card.id}`}
                        >
                          {card.title}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>
                          {card.subtitle}
                        </div>
                      </div>
                    </div>
                    {/* Right: PLAY button */}
                    <div style={{
                      background: card.color, color: card.btnText, borderRadius: 24,
                      padding: '10px 20px', fontWeight: 700, fontSize: 14, border: 'none',
                      whiteSpace: 'nowrap', flexShrink: 0, boxShadow: `0 4px 16px ${card.color}55`,
                    }}>
                      PLAY →
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ═══════════ 3. DAILY ROW ═══════════ */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
            {/* Daily Bonus */}
            <div style={{ flex: 1, background: 'rgba(180,120,0,0.15)', border: '1px solid rgba(201,162,39,0.30)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                🔥 DAILY BONUS
              </div>
              <div style={{ fontWeight: 800, color: 'white', fontSize: 14, lineHeight: 1.2 }}>
                {serverBonusCanClaim !== null
                  ? `Day ${serverBonusStreakDay} Ready`
                  : streakInfo.streak > 0
                    ? `${streakInfo.streak}-Day Streak`
                    : 'Daily Streak'}
              </div>
              <div style={{ flex: 1 }} />
              {canClaimBonus ? (
                <button
                  onClick={() => setDailyBonusCalOpen(true)}
                  data-testid="button-claim-daily-home"
                  style={{ width: '100%', padding: '9px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#F0B829,#C9A227)', color: '#0c0b08', fontFamily: 'monospace', fontWeight: 900, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', boxShadow: '0 4px 16px rgba(240,184,41,0.45)' }}
                >
                  CLAIM BONUS
                </button>
              ) : (
                <button
                  onClick={() => setDailyBonusCalOpen(true)}
                  data-testid="button-view-daily-streak"
                  style={{ width: '100%', padding: '8px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', fontWeight: 700, fontSize: 10, cursor: 'pointer' }}
                >
                  📅 {getTimeUntilMidnight()}
                </button>
              )}
            </div>

            {/* Daily Missions */}
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.40)', border: '1px solid rgba(201,162,39,0.20)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                🎯 DAILY MISSIONS
              </div>
              {todayQuest ? (
                <>
                  <div style={{ fontSize: 13, color: 'white', lineHeight: 1.3, fontWeight: 600 }}>
                    {todayQuest.description}
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', width: 'fit-content', background: 'rgba(201,162,39,0.18)', border: '1px solid rgba(201,162,39,0.40)', borderRadius: 20, padding: '2px 8px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 10, color: '#F0B829' }}>+{todayQuest.stripes} ◆ Stripes</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.10)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${todayQuestPct}%`, height: '100%', background: todayQuestClaimed ? '#22c55e' : 'rgba(201,162,39,0.80)', borderRadius: 4, transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ flex: 1 }} />
                  <button
                    disabled={!todayQuestEligible || todayQuestClaimed || questClaiming === todayQuest.questId}
                    onClick={() => claimQuestById(todayQuest.questId, todayQuest.stripes)}
                    data-testid="daily-quest-claim-btn"
                    style={{
                      width: '100%', padding: '8px 0', borderRadius: 10, border: 'none',
                      background: todayQuestClaimed ? 'rgba(34,197,94,0.15)' : todayQuestEligible ? '#22c55e' : 'rgba(255,255,255,0.07)',
                      color: todayQuestClaimed ? '#22c55e' : todayQuestEligible ? 'white' : 'rgba(255,255,255,0.30)',
                      fontFamily: 'monospace', fontWeight: 900, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                      cursor: todayQuestEligible && !todayQuestClaimed ? 'pointer' : 'not-allowed',
                      boxShadow: todayQuestEligible && !todayQuestClaimed ? '0 3px 12px rgba(34,197,94,0.40)' : 'none',
                    }}
                  >
                    {todayQuestClaimed ? '✓ CLAIMED' : questClaiming === todayQuest.questId ? '…' : 'CLAIM'}
                  </button>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>No quest today.</div>
              )}
            </div>
          </div>

          {/* ═══════════ 4. MILESTONES ═══════════ */}
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '4px 16px' }}>
            Milestones
          </div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '8px 16px', scrollbarWidth: 'none' } as React.CSSProperties}>
            {HOME_MILESTONES.map(m => {
              const totalHands = questData?.handsPlayed ?? 0;
              const eligible   = totalHands >= m.required;
              const claimed    = questData?.claimed.includes(m.questId) ?? false;
              const isClaiming = questClaiming === m.questId;
              return (
                <button
                  key={m.questId}
                  data-testid={`milestone-badge-${m.questId}`}
                  disabled={!eligible || claimed || !!questClaiming}
                  onClick={() => eligible && !claimed && claimQuestById(m.questId, m.stripes)}
                  style={{
                    width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    border: `2px solid ${claimed ? 'rgba(201,162,39,0.80)' : eligible ? 'rgba(201,162,39,0.50)' : 'rgba(255,255,255,0.10)'}`,
                    background: claimed ? 'rgba(201,162,39,0.20)' : eligible ? 'rgba(201,162,39,0.10)' : 'rgba(255,255,255,0.03)',
                    cursor: eligible && !claimed ? 'pointer' : 'default',
                    animation: eligible && !claimed ? 'pulse 2s infinite' : 'none',
                    opacity: isClaiming ? 0.6 : 1, padding: 0,
                  }}
                >
                  {claimed ? (
                    <span style={{ color: '#C9A227', fontSize: 22, lineHeight: 1 }}>✓</span>
                  ) : isClaiming ? (
                    <span style={{ color: '#C9A227', fontFamily: 'monospace', fontSize: 14 }}>…</span>
                  ) : (
                    <>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: eligible ? '#C9A227' : 'rgba(255,255,255,0.30)', lineHeight: 1 }}>
                        {m.label}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: 9, marginTop: 3, color: eligible ? 'rgba(201,162,39,0.70)' : 'rgba(255,255,255,0.20)' }}>
                        +{m.stripes} ◆
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* ═══════════ 5. CREW MODE CARD ═══════════ */}
          <div style={{
            margin: '12px 16px', borderRadius: 16, overflow: 'hidden', position: 'relative', height: 120,
            backgroundImage: "url('/crews/icon-crew.png')", backgroundPosition: 'left center', backgroundRepeat: 'no-repeat', backgroundSize: 'contain', backgroundColor: '#1a0a2e',
          }}>
            {/* Gradient overlay from right */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to left, rgba(26,10,46,0.95) 30%, rgba(26,10,46,0.60) 70%, transparent 100%)' }} />
            {/* Content right-aligned */}
            <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', textAlign: 'right', padding: '0 16px' }}>
              <div style={{ fontFamily: 'Anton, Impact, "Arial Narrow Bold", sans-serif', fontSize: 24, color: '#C9A227', letterSpacing: '0.04em', lineHeight: 1 }}>
                CREW MODE
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.60)', marginTop: 4, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                BUILD YOUR EMPIRE.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => navigate('/crews')}
                  data-testid="button-create-crew"
                  style={{ border: '1px solid rgba(138,43,226,0.60)', background: 'rgba(138,43,226,0.20)', color: 'white', borderRadius: 20, padding: '8px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer' }}
                >
                  CREATE CREW
                </button>
                <button
                  onClick={() => navigate('/crews')}
                  data-testid="button-join-crew"
                  style={{ border: '1px solid rgba(138,43,226,0.60)', background: 'rgba(138,43,226,0.20)', color: 'white', borderRadius: 20, padding: '8px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer' }}
                >
                  JOIN CREW
                </button>
              </div>
            </div>
          </div>

          {/* ═══════════ 6. LIVE TABLES ═══════════ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }} data-testid="section-live-tables">
            <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: publicTables.length > 0 ? '#22c55e' : '#444', boxShadow: publicTables.length > 0 ? '0 0 6px #22c55e' : 'none', animation: publicTables.length > 0 ? 'pulse 2s infinite' : 'none' }} />
            <span style={{ fontWeight: 800, color: 'white', fontSize: 14, letterSpacing: '0.04em' }}>LIVE TABLES</span>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setShowOpenTableModal(true)}
              data-testid="link-view-all-tables"
              style={{ background: 'none', border: 'none', color: '#C9A227', fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', padding: 0 }}
            >
              VIEW ALL →
            </button>
          </div>
          {publicTables.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.30)', fontSize: 13, padding: '8px 16px 12px' }}>
              No public tables open. Start one above!
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px 12px', scrollbarWidth: 'none' } as React.CSSProperties}>
              {publicTables.slice(0, 10).map(table => {
                const info   = LIVE_MODE_INFO[table.modeId] ?? { name: table.modeId, abbrev: '', color: '#A0A0B8', path: '/', icon: '', stakes: '' };
                const isFull = table.humanCount >= table.maxPlayers;
                const isOpen = table.phase === 'WAITING';
                return (
                  <button
                    key={`${table.modeId}-${table.tableId}`}
                    onClick={() => !isFull && handleJoinTable(table.modeId, table.tableId)}
                    disabled={isFull}
                    data-testid={`button-join-card-${table.tableId}`}
                    style={{
                      width: 140, flexShrink: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 5, textAlign: 'left',
                      cursor: isFull ? 'default' : 'pointer', opacity: isFull ? 0.55 : 1,
                    }}
                  >
                    {info.icon && <img src={info.icon} alt={info.name} style={{ width: 32, height: 32, objectFit: 'contain', filter: `drop-shadow(0 0 4px ${info.color}44)` }} />}
                    <span style={{ fontWeight: 800, fontSize: 12, color: info.color, lineHeight: 1, fontFamily: 'monospace' }}>{info.name}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.50)', fontFamily: 'monospace' }} data-testid={`text-live-players-${table.tableId}`}>
                      {table.humanCount}/{table.maxPlayers} players
                    </span>
                    {info.stakes && <span style={{ fontSize: 9, color: 'rgba(201,162,39,0.50)', fontFamily: 'monospace' }}>{info.stakes}</span>}
                    <div style={{
                      padding: '4px 0', borderRadius: 6, textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: 10, letterSpacing: '0.06em',
                      background: isFull ? 'rgba(255,255,255,0.05)' : isOpen ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.06)',
                      color: isFull ? 'rgba(255,255,255,0.25)' : isOpen ? '#22c55e' : 'rgba(255,255,255,0.45)',
                    }}>
                      {isFull ? 'FULL' : isOpen ? 'JOIN' : 'WATCH'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ═══════════ 7. FOOTER ═══════════ */}
          <div style={{ padding: '16px 12px 0' }}>
            <div className="flex items-center justify-center gap-3 py-1">
              <a href="/terms" className="text-[9px] font-mono tracking-wider" style={{ color: 'rgba(255,255,255,0.15)' }} data-testid="link-home-footer-terms">Terms</a>
              <span style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
              <a href="/privacy" className="text-[9px] font-mono tracking-wider" style={{ color: 'rgba(255,255,255,0.15)' }} data-testid="link-home-footer-privacy">Privacy</a>
              <span style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
              <a
                href="https://forms.gle/Vh6Uut9bB6neHA3J8"
                target="_blank" rel="noopener noreferrer"
                className="text-[9px] font-mono tracking-wider"
                style={{ color: 'rgba(255,255,255,0.15)' }}
                data-testid="link-home-footer-feedback"
                onClick={() => track({ name: 'feedback_link_clicked', location: 'home_footer' })}
              >Feedback</a>
            </div>
            <p className="text-center text-[9px] font-mono py-1 tracking-wider" style={{ color: 'rgba(255,255,255,0.10)' }} data-testid="text-home-chips-disclaimer">
              VIRTUAL CHIPS · FOR ENTERTAINMENT ONLY · NO CASH VALUE
            </p>
          </div>

        </div>
      </div>

      {/* ── Fixed bottom dock ────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 h-[76px] flex items-center"
        style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid rgba(245,158,11,0.18)' }}
      >
        <div className="w-full max-w-lg mx-auto grid grid-cols-6 h-full">
          <button onClick={() => navigate('/leaderboard')} className="flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] transition-all active:scale-90" data-testid="link-leaderboard-footer">
            <img src="/dock-leaderboard.png" alt="Leaderboard" className="w-6 h-6 object-contain" />
            <span className="text-[6.5px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Ranks</span>
          </button>
          <button onClick={() => navigate('/shop')} className="flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] transition-all active:scale-90" data-testid="link-shop-footer">
            <img src="/dock-shop.png" alt="Shop" className="w-6 h-6 object-contain" />
            <span className="text-[6.5px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Shop</span>
          </button>
          <button onClick={() => navigate('/cosmetics')} className="flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] transition-all active:scale-90" data-testid="link-cosmetics-footer">
            <span className="w-6 h-6 flex items-center justify-center text-base" style={{ color: 'rgba(201,162,39,0.75)' }}>◆</span>
            <span className="text-[6.5px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Style</span>
          </button>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] transition-all active:scale-90 -translate-y-1" data-testid="link-home-dock">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ border: '1px solid rgba(240,184,41,0.55)', boxShadow: '0 0 16px rgba(240,184,41,0.30),0 0 6px rgba(240,184,41,0.15)', background: 'rgba(240,184,41,0.10)' }}>
              <img src="/dock-home.png" alt="Home" className="w-5 h-5 object-contain" />
            </div>
            <span className="text-[6.5px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.90)' }}>Home</span>
          </button>
          <button onClick={() => navigate('/crews')} className="flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] transition-all active:scale-90" data-testid="link-crews-footer">
            <span className="w-6 h-6 flex items-center justify-center text-base" style={{ color: 'rgba(201,162,39,0.75)' }}>⛓</span>
            <span className="text-[6.5px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Crews</span>
          </button>
          <button onClick={() => navigate('/profile')} className="flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] transition-all active:scale-90" data-testid="link-profile-footer">
            <img src="/dock-profile.png" alt="Profile" className="w-7 h-7 object-contain" />
            <span className="text-[6.5px] font-mono uppercase tracking-wider" style={{ color: 'rgba(240,184,41,0.60)' }}>Profile</span>
          </button>
        </div>
      </div>

    </div>

    <PrivateTableSetup open={showPrivateSetup} onClose={() => setShowPrivateSetup(false)} />

    {/* ── Open Table Mode Picker ───────────────────────────────────────────── */}
    {showOpenTableModal && (
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={() => setShowOpenTableModal(false)}
      >
        <div
          className="w-full max-w-lg rounded-t-2xl p-5 pb-8"
          style={{ background: 'linear-gradient(180deg,#111116 0%,#0d0d11 100%)', border: '1px solid rgba(245,158,11,0.18)', borderBottom: 'none' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="text-center mb-5">
            <h2 className="text-base font-black tracking-[0.12em] text-white" style={{ fontFamily: 'Impact,"Arial Narrow Bold",Arial,sans-serif' }}>
              OPEN A TABLE
            </h2>
            <p className="text-[11px] font-mono text-white/40 mt-1">Pick a mode — a public table opens instantly</p>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-5">
            {MODES.map(mode => (
              <button
                key={mode.id}
                data-testid={`button-open-table-mode-${mode.id}`}
                className="flex flex-col items-center active:scale-95 transition-transform"
                style={{ background: 'linear-gradient(180deg,rgba(40,28,8,0.85) 0%,rgba(20,12,2,0.92) 100%)', border: '1px solid rgba(80,55,15,0.45)', borderRadius: 6, padding: '8px 4px 7px', cursor: 'pointer' }}
                onClick={() => {
                  setShowOpenTableModal(false);
                  track({ name: 'crew_table_opened', mode: mode.id as 'badugi' });
                  navigateToMode(mode.id, mode.path);
                }}
              >
                <img src={mode.icon} alt={mode.name} style={{ width: 40, height: 40, objectFit: 'contain' }} />
                <span style={{ fontFamily: 'Impact,"Arial Narrow Bold",Arial,sans-serif', fontSize: '0.52rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(210,165,55,0.90)', marginTop: 4, textAlign: 'center', lineHeight: 1.2 }}>
                  {mode.name}
                </span>
              </button>
            ))}
          </div>
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
