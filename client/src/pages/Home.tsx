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
import { HowToPlay } from '@/components/ui/HowToPlay';
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
  { id: 'flushedup',  name: 'FLUSHED UP',    tagline: 'Chase the flush',        path: '/flushedup',  color: '#8b5cf6', icon: '/mode-icon-suits.png'     },
  { id: 'kamikaze',   name: 'KAMIKAZE',      tagline: '3+2+1. High or Low.',   path: '/kamikaze',   color: '#ef4444', icon: '/mode-icon-dead7.png'     },
  { id: 'bonecrusher', name: 'BONECRUSHER', tagline: '6 cards. High/Low/Swing.', path: '/bonecrusher', color: '#d97706', icon: '/mode-icon-dead7.png'     },
  { id: 'ladyluck',   name: 'LADY LUCK',    tagline: 'Pick your Queen. Run the race.', path: '/ladyluck', color: '#e53935', icon: '/mode-icon-suits.png' },
] as const;

// Card-specific background images and copy (per spec)
const MODE_CARD_CONFIGS = [
  { id: 'badugi',     bg: '/modes/bg-badugi.png',               color: '#4CAF50', btnText: 'white', title: 'BADUGI',        subtitle: 'THE OG DRAW GAME'      },
  { id: 'dead7',      bg: '/assets/backgrounds/dead7board.png', color: '#f44336', btnText: 'white', title: 'DEAD 7',        subtitle: 'PICK A SIDE.'          },
  { id: 'fifteen35',  bg: '/modes/bg-1535.png',                 color: '#C9A227', btnText: 'black', title: '15 / 35',       subtitle: 'HIT OR GO HOME'        },
  { id: 'suitspoker', bg: '/modes/bg-suits.png',                color: '#2196F3', btnText: 'white', title: 'SUITS & POKER', subtitle: 'COUNT OR POKER.'       },
  { id: 'flushedup',  bg: '/modes/bg-suits.png',                color: '#7c3aed', btnText: 'white', title: 'FLUSHED UP',    subtitle: 'CHASE THE FLUSH.'      },
  { id: 'kamikaze',   bg: '/modes/bg-kamikaze.png',             color: '#ef4444', btnText: 'white', title: 'KAMIKAZE',      subtitle: '3+2+1. HIGH OR LOW.'   },
  { id: 'bonecrusher', bg: '/modes/bg-kamikaze.png',           color: '#d97706', btnText: 'white', title: 'BONECRUSHER',   subtitle: '6 CARDS. HIGH / LOW / SWING.' },
  { id: 'ladyluck',   bg: '/assets/backgrounds/bg-cellblock.jpg', color: '#e53935', btnText: 'white', title: 'LADY LUCK',    subtitle: 'PICK YOUR QUEEN. RUN THE RACE.', directNav: true },
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
  flushed_up:  { name: 'Flushed Up',    abbrev: 'FU', color: '#8b5cf6', path: '/flushedup',  icon: '/mode-icon-suits.png',     stakes: '$25 ante' },
  kamikaze:    { name: 'Kamikaze',      abbrev: 'KZ', color: '#ef4444', path: '/kamikaze',   icon: '/mode-icon-dead7.png',     stakes: '$25 ante' },
  bonecrusher: { name: 'Bonecrusher',   abbrev: 'BC', color: '#d97706', path: '/bonecrusher', icon: '/mode-icon-dead7.png',    stakes: '$25 ante' },
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
  { id: 'flushed_up',  label: 'Flush'  },
  { id: 'kamikaze',    label: 'Kamikaze' },
  { id: 'bonecrusher', label: 'Bonecrusher' },
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
  const [howToPlayMode, setHowToPlayMode] = useState<'badugi' | 'dead7' | '1535' | 'suits' | 'ladyluck' | null>(null);

  const HOW_TO_PLAY_ID: Record<string, 'badugi' | 'dead7' | '1535' | 'suits' | 'ladyluck'> = {
    badugi: 'badugi', dead7: 'dead7', fifteen35: '1535', suitspoker: 'suits', ladyluck: 'ladyluck',
  };

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
    suitspoker: 'suits_poker', flushedup: 'flushed_up',
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

  const stripes = serverProfile?.stripes ?? 0;
  let stripeGoalLabel = '';
  let stripeGoalPct = 0;
  if (stripes < 100) {
    stripeGoalLabel = `${100 - stripes} away from Gold Frame`;
    stripeGoalPct = stripes / 100;
  } else if (stripes < 125) {
    stripeGoalLabel = `${125 - stripes} away from first avatar`;
    stripeGoalPct = (stripes - 100) / 25;
  } else if (stripes < 500) {
    stripeGoalLabel = `${500 - stripes} away from creating a Crew`;
    stripeGoalPct = (stripes - 125) / 375;
  } else {
    stripeGoalLabel = 'Ready to create a Crew';
    stripeGoalPct = 1;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
    {/* ── Fixed background ──────────────────────────────────────────────────── */}
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: "url('/assets/backgrounds/bg-cellblock.jpg')", backgroundSize: 'cover', backgroundPosition: 'center top' }} />
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'rgba(0,0,0,0.55)' }} />

    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Sticky header ─────────────────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px' }}>
        {/* Left: live indicator + leaderboard */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', animation: 'pulse 2s infinite' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em' }}>LIVE</span>
          </div>
          <button onClick={() => navigate('/leaderboard')} data-testid="link-leaderboard-header"
            style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(0,0,0,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <img src="/dock-leaderboard.png" alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
          </button>
        </div>

        {/* Center: logo */}
        <img src="/hero-chain-logo.png" alt="Chain Gang Poker"
          style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', height: 64, objectFit: 'contain', pointerEvents: 'none', filter: 'drop-shadow(0 2px 14px rgba(201,162,39,0.50))' }} />

        {/* Right: avatar only */}
        <button onClick={() => navigate('/profile')} data-testid="button-open-profile"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <AvatarWithFrame
            avatarSrc={resolveAvatarSrc(serverProfile?.equippedAvatarId, serverProfile?.avatarId)}
            frameSrc={serverProfile?.equippedFrameId ? `/cosmetics/frames/${serverProfile.equippedFrameId.replace(/_/g, '-')}.png` : null}
            initials={initials} initialsColor="#F0B829" size={40} />
        </button>
      </header>

      {/* ── Toasts ────────────────────────────────────────────────────────────── */}
      {newAchievements.length > 0 && (
        <div style={{ position: 'fixed', top: 68, right: 12, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 280 }}>
          {newAchievements.map(ach => (
            <button key={ach.id} onClick={() => dismissAchievement(ach.id)} data-testid={`toast-achievement-${ach.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(10,10,16,0.96)', backdropFilter: 'blur(16px)', border: '1px solid rgba(201,162,39,0.35)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 20 }}>{ach.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(201,162,39,0.75)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 2 }}>Achievement Unlocked</div>
                <div style={{ fontWeight: 800, color: 'white', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ach.name}</div>
              </div>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 10, color: '#10b981' }}>+{ach.xpReward} XP</div>
            </button>
          ))}
        </div>
      )}
      {questToast && (
        <div style={{ position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)', background: 'rgba(12,8,24,0.96)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(201,162,39,0.55)', borderRadius: 12, padding: '10px 22px', color: '#F0B829', fontFamily: 'monospace', fontWeight: 800, fontSize: 13, zIndex: 9999, whiteSpace: 'nowrap', boxShadow: '0 8px 32px rgba(0,0,0,0.60)' }}>
          {questToast}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      <DailyRewardModal open={dailyOpen} onClose={handleDailyClose} />
      <DailyBonusCalendarModal open={dailyBonusCalOpen} onClose={() => setDailyBonusCalOpen(false)} onClaimed={handleDailyBonusClaimed} />
      <HourlyBonusModal open={hourlyOpen} onClose={handleHourlyClose} />
      <StarterPackModal open={starterOpen} onClose={handleStarterClose} onRefetchProfile={refetch} />
      {howToPlayMode && <HowToPlay modeId={howToPlayMode} onClose={() => setHowToPlayMode(null)} />}

      {/* ── Scrollable content ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, paddingBottom: 140 }}>
        <div style={{ width: '100%', maxWidth: 512, margin: '0 auto' }}>

          {/* ══ PLAYER AREA — floating, no box ═══════════════════════════════════ */}
          <button onClick={() => navigate('/profile')} data-testid="button-profile-strip"
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <AvatarWithFrame
              avatarSrc={resolveAvatarSrc(serverProfile?.equippedAvatarId, serverProfile?.avatarId)}
              frameSrc={serverProfile?.equippedFrameId ? `/cosmetics/frames/${serverProfile.equippedFrameId.replace(/_/g, '-')}.png` : null}
              initials={initials} initialsColor="#F0B829" size={68} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 900, color: 'white', fontSize: 20, lineHeight: 1, textShadow: '0 2px 12px rgba(0,0,0,0.80)' }} data-testid="text-player-name">{identity.name}</span>
                <img src={getTierBadgeAsset(rank.name)} alt={rank.name} style={{ height: 20, width: 'auto', objectFit: 'contain' }} data-testid="badge-rank-home" />
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,215,0,0.55)', marginBottom: 5 }}>LVL {serverLevel} &nbsp;·&nbsp; {levelInfo.xpIntoLevel} / {levelInfo.xpNeeded} XP</div>
              <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 4, overflow: 'hidden', marginBottom: 5 }}>
                <div style={{ width: `${progressPct}%`, height: '100%', background: 'rgba(201,162,39,0.85)', borderRadius: 4, transition: 'width 0.7s' }} />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,215,0,0.55)', fontFamily: 'monospace' }}>Welcome back, {identity.name.split(' ')[0]}.</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <div data-testid="text-bankroll" style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 18, color: '#22c55e', textShadow: '0 0 12px rgba(34,197,94,0.45)', lineHeight: 1 }}>
                ${displayChips.toLocaleString()}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(34,197,94,0.55)', letterSpacing: '0.08em', marginTop: -3 }}>CHIPS</div>
              <div data-testid="text-stripes-lobby" style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'monospace', fontWeight: 800, fontSize: 18, color: '#a855f7', textShadow: '0 0 12px rgba(168,85,247,0.45)', lineHeight: 1 }}>
                <span style={{ fontSize: 13, color: '#a855f7' }}>◆</span>{(serverProfile?.stripes ?? 0).toLocaleString()}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(168,85,247,0.55)', letterSpacing: '0.08em', marginTop: -3 }}>STRIPES</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, marginTop: -2 }}>
                <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(stripeGoalPct * 100)}%`, height: '100%', background: '#C9A227', borderRadius: 2, transition: 'width 0.5s' }} />
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#a855f7', textAlign: 'right', lineHeight: 1 }}>{stripeGoalLabel}</span>
              </div>
            </div>
          </button>

          {/* ══ GAME MODE CARDS — 4 atmospheric stacked banners ══════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {MODE_CARD_CONFIGS.map(card => {
              const mode       = MODES.find(m => m.id === card.id)!;
              const htpModeId  = HOW_TO_PLAY_ID[card.id];
              return (
                <div key={card.id} data-testid={`button-mode-${card.id}`}
                  onClick={() => (card as any).directNav ? navigate(mode.path) : navigateToMode(card.id, mode.path)}
                  role="button" tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') ((card as any).directNav ? navigate(mode.path) : navigateToMode(card.id, mode.path)); }}
                  style={{ position: 'relative', height: 120, borderRadius: 16, overflow: 'hidden', width: 'calc(100% - 24px)', margin: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, boxShadow: 'inset 0 -20px 30px rgba(0,0,0,0.4)' }}>
                  {/* BG scene art */}
                  <img src={card.bg} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
                  {/* Atmospheric overlay — dark both sides, lighter center */}
                  <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.05) 100%)` }} />

                  {/* Icon + text grouped in a flex row */}
                  <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', flex: 1, gap: 14, padding: '0 10px 0 14px', minWidth: 0 }}>
                    <img src={mode.icon} alt={card.title} style={{ flexShrink: 0, width: 72, height: 72, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} />
                    <div style={{ minWidth: 0, textAlign: 'left' }}>
                      <div data-testid={`text-mode-name-${card.id}`}
                        style={{ fontFamily: 'Anton, Impact, "Arial Narrow Bold", sans-serif', fontSize: 34, color: card.color, letterSpacing: '1px', lineHeight: 1, textShadow: '0 2px 8px rgba(0,0,0,0.9)', marginBottom: 4 }}>
                        {card.title}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 14, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.06em', textShadow: '0 1px 4px rgba(0,0,0,0.9)', marginBottom: 4 }}>
                        {card.subtitle}
                      </div>
                      {htpModeId && (
                        <button
                          data-testid={`button-how-to-play-${card.id}`}
                          onClick={e => { e.stopPropagation(); setHowToPlayMode(htpModeId); }}
                          style={{ background: 'rgba(201,162,39,0.15)', border: '1px solid rgba(201,162,39,0.5)', borderRadius: 20, padding: '4px 14px', fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: '#C9A227', letterSpacing: '1px', cursor: 'pointer', textTransform: 'uppercase' }}
                        >
                          HOW TO PLAY
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right: PLAY button */}
                  <div style={{ position: 'relative', zIndex: 1, flexShrink: 0, marginRight: 12 }}>
                    <button
                      data-testid={`button-play-${card.id}`}
                      onClick={e => { e.stopPropagation(); (card as any).directNav ? navigate(mode.path) : navigateToMode(card.id, mode.path); }}
                      style={{ background: card.color, color: card.btnText, borderRadius: 24, padding: '9px 18px', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', boxShadow: `0 0 16px ${card.color}80`, letterSpacing: '0.04em', border: 'none', cursor: 'pointer' }}
                    >
                      PLAY →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ══ DAILY BONUS + MISSIONS ════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '10px 12px 0' }}>

            {/* Daily Bonus — parchment / amber */}
            <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 6, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.10em', display: 'flex', alignItems: 'center', gap: 5 }}>
                🔥 <span>DAILY BONUS</span>
              </div>
              <div style={{ fontWeight: 900, color: 'white', fontSize: 15, lineHeight: 1.2 }}>
                {serverBonusCanClaim !== null
                  ? `Day ${serverBonusStreakDay} Ready`
                  : streakInfo.streak > 0
                    ? `${streakInfo.streak}-Day Streak`
                    : 'Day 1 Ready'}
              </div>
              {!canClaimBonus && (
                <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.40)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{getTimeUntilMidnight()}</span>
                  <span style={{ color: 'rgba(201,162,39,0.55)' }}>NEXT BONUS</span>
                </div>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={() => setDailyBonusCalOpen(true)} data-testid="button-claim-daily-home"
                style={{ width: '100%', padding: '9px 0', borderRadius: 10, border: canClaimBonus ? 'none' : '1px solid rgba(255,255,255,0.12)', background: canClaimBonus ? 'linear-gradient(135deg,#F0B829,#C9A227)' : 'rgba(255,255,255,0.06)', color: canClaimBonus ? '#0c0b08' : 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontWeight: 900, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', boxShadow: canClaimBonus ? '0 4px 18px rgba(240,184,41,0.45)' : 'none', transition: 'all 0.2s' }}>
                {canClaimBonus ? '🎁 CLAIM BONUS' : `📅 ${getTimeUntilMidnight()}`}
              </button>
            </div>

            {/* Daily Missions + Milestones */}
            <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 6, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                🎯 DAILY MISSIONS
              </div>
              {todayQuest ? (
                <>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.35, fontWeight: 600 }}>
                    {todayQuest.description}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(201,162,39,0.16)', border: '1px solid rgba(201,162,39,0.36)', borderRadius: 20, padding: '2px 7px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 10, color: '#F0B829' }}>+{todayQuest.stripes} ◆</span>
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>{Math.min(todayQuestHands, todayQuest.requiredHands)}/{todayQuest.requiredHands}</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${todayQuestPct}%`, height: '100%', background: todayQuestClaimed ? '#22c55e' : 'rgba(201,162,39,0.85)', borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                  <button disabled={!todayQuestEligible || todayQuestClaimed || questClaiming === todayQuest.questId}
                    onClick={() => claimQuestById(todayQuest.questId, todayQuest.stripes)} data-testid="daily-quest-claim-btn"
                    style={{ padding: '7px 0', borderRadius: 10, border: 'none', background: todayQuestClaimed ? 'rgba(34,197,94,0.15)' : todayQuestEligible ? '#22c55e' : 'rgba(255,255,255,0.07)', color: todayQuestClaimed ? '#22c55e' : todayQuestEligible ? 'white' : 'rgba(255,255,255,0.28)', fontFamily: 'monospace', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', cursor: todayQuestEligible && !todayQuestClaimed ? 'pointer' : 'not-allowed', boxShadow: todayQuestEligible && !todayQuestClaimed ? '0 3px 12px rgba(34,197,94,0.40)' : 'none', letterSpacing: '0.06em' }}>
                    {todayQuestClaimed ? '✓ CLAIMED' : questClaiming === todayQuest.questId ? '…' : 'CLAIM'}
                  </button>
                </>
              ) : (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', fontFamily: 'monospace' }}>No quest today.</div>
              )}

            </div>
          </div>

          {/* ══ MILESTONES — floating circles, no container ═══════════════════════ */}
          <div style={{ padding: '10px 14px 0' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>MILESTONES</div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
              {HOME_MILESTONES.map(m => {
                const totalHands = questData?.handsPlayed ?? 0;
                const eligible   = totalHands >= m.required;
                const claimed    = questData?.claimed.includes(m.questId) ?? false;
                const isClaiming = questClaiming === m.questId;
                return (
                  <button key={m.questId} data-testid={`milestone-badge-${m.questId}`}
                    disabled={!eligible || claimed || !!questClaiming}
                    onClick={() => eligible && !claimed && claimQuestById(m.questId, m.stripes)}
                    style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `2px solid ${claimed ? 'rgba(201,162,39,0.90)' : eligible ? 'rgba(201,162,39,0.55)' : 'rgba(255,255,255,0.10)'}`, background: claimed ? 'rgba(201,162,39,0.18)' : eligible ? 'rgba(201,162,39,0.08)' : 'rgba(0,0,0,0.25)', cursor: eligible && !claimed ? 'pointer' : 'default', padding: 0, opacity: isClaiming ? 0.6 : 1, animation: eligible && !claimed ? 'pulse 2s infinite' : 'none', backdropFilter: 'blur(4px)' }}>
                    {claimed ? (
                      <>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 9, color: '#C9A227', lineHeight: 1 }}>{m.label}</span>
                        <span style={{ color: '#C9A227', fontSize: 12, lineHeight: 1 }}>✓</span>
                      </>
                    ) : isClaiming ? (
                      <span style={{ color: '#C9A227', fontSize: 13 }}>…</span>
                    ) : (
                      <>
                        <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 11, color: eligible ? '#C9A227' : 'rgba(255,255,255,0.28)', lineHeight: 1 }}>{m.label}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 7, color: eligible ? 'rgba(201,162,39,0.60)' : 'rgba(255,255,255,0.15)', marginTop: 1 }}>+{m.stripes}◆</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ══ CREW MODE — cinematic dark purple banner ══════════════════════════ */}
          <div style={{ margin: '10px 12px 0', position: 'relative', height: 140, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.20)', background: 'linear-gradient(135deg, rgba(88,28,135,0.55), rgba(40,10,60,0.40))', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
            {/* Crew art — bleeds from left */}
            <img src="/crews/icon-crew.png" alt="" aria-hidden style={{ position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)', height: 150, width: 'auto', objectFit: 'contain', filter: 'brightness(0.55) saturate(0.8) drop-shadow(0 0 40px rgba(138,43,226,0.80))', pointerEvents: 'none' }} />
            {/* Radial purple glow behind icon */}
            <div style={{ position: 'absolute', left: 0, top: 0, width: '50%', height: '100%', background: 'radial-gradient(ellipse at 25% 50%, rgba(138,43,226,0.35) 0%, transparent 70%)' }} />
            {/* Purple smoke / glow */}
            <div style={{ position: 'absolute', left: 0, top: 0, width: '55%', height: '100%', background: 'radial-gradient(ellipse at 30% 60%, rgba(138,43,226,0.22) 0%, transparent 70%)' }} />
            {/* Fade left-to-right so text is readable */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 30%, rgba(8,3,18,0.70) 70%, rgba(8,3,18,0.90) 100%)' }} />

            {/* Content — right aligned */}
            <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', padding: '0 16px', textAlign: 'right' }}>
              <div style={{ fontFamily: 'Anton, Impact, "Arial Narrow Bold", sans-serif', fontSize: 26, letterSpacing: '0.05em', lineHeight: 1, marginBottom: 3, background: 'linear-gradient(135deg, #C9A227 0%, #a855f7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                CREW MODE
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 14 }}>
                BUILD YOUR EMPIRE.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => navigate('/crews')} data-testid="button-create-crew"
                  style={{ padding: '8px 14px', background: 'rgba(138,43,226,0.30)', border: '1px solid rgba(138,43,226,0.65)', borderRadius: 20, color: '#d8b4fe', fontFamily: 'monospace', fontWeight: 900, fontSize: 11, cursor: 'pointer', letterSpacing: '0.04em' }}>
                  CREATE CREW
                </button>
                <button onClick={() => navigate('/crews')} data-testid="button-join-crew"
                  style={{ padding: '8px 14px', background: 'rgba(138,43,226,0.18)', border: '1px solid rgba(138,43,226,0.45)', borderRadius: 20, color: '#c4b5fd', fontFamily: 'monospace', fontWeight: 900, fontSize: 11, cursor: 'pointer', letterSpacing: '0.04em' }}>
                  JOIN CREW
                </button>
              </div>
            </div>
          </div>

          {/* ══ LIVE TABLES — only if tables exist ═══════════════════════════════ */}
          {publicTables.length > 0 && (
            <div style={{ padding: '10px 12px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', animation: 'pulse 2s infinite' }} />
                <span style={{ fontWeight: 800, color: 'white', fontSize: 13, letterSpacing: '0.06em', fontFamily: 'monospace' }}>LIVE TABLES</span>
                {realPlayerCount > 0 && <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.30)' }}>{realPlayerCount} playing</span>}
                <div style={{ flex: 1 }} />
                <button onClick={() => setShowOpenTableModal(true)} data-testid="link-view-all-tables"
                  style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(201,162,39,0.70)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, letterSpacing: '0.06em' }}>
                  VIEW ALL →
                </button>
              </div>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 } as React.CSSProperties}>
                {publicTables.slice(0, 8).map(table => {
                  const info   = LIVE_MODE_INFO[table.modeId] ?? { name: table.modeId, abbrev: '', color: '#888', path: '/', icon: '', stakes: '' };
                  const isFull = table.humanCount >= table.maxPlayers;
                  const isOpen = table.phase === 'WAITING';
                  return (
                    <button key={`${table.modeId}-${table.tableId}`}
                      onClick={() => !isFull && handleJoinTable(table.modeId, table.tableId)}
                      disabled={isFull} data-testid={`button-join-card-${table.tableId}`}
                      style={{ width: 130, flexShrink: 0, background: 'rgba(0,0,0,0.40)', border: `1px solid rgba(255,255,255,0.05)`, borderRadius: 12, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 5, cursor: isFull ? 'default' : 'pointer', opacity: isFull ? 0.55 : 1, textAlign: 'left', backdropFilter: 'blur(8px)' }}>
                      {info.icon && <img src={info.icon} alt="" style={{ width: 32, height: 32, objectFit: 'contain', filter: `drop-shadow(0 0 5px ${info.color}55)` }} />}
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 11, color: info.color }}>{info.name}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.45)' }} data-testid={`text-live-players-${table.tableId}`}>
                        👤 {table.humanCount}/{table.maxPlayers}
                      </span>
                      {info.stakes && <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(201,162,39,0.55)' }}>{info.stakes}</span>}
                      <div style={{ padding: '5px 0', borderRadius: 8, textAlign: 'center', fontFamily: 'monospace', fontWeight: 900, fontSize: 11, letterSpacing: '0.06em', background: isFull ? 'rgba(255,255,255,0.06)' : isOpen ? `${info.color}22` : 'rgba(255,255,255,0.06)', color: isFull ? 'rgba(255,255,255,0.25)' : isOpen ? info.color : 'rgba(255,255,255,0.40)' }}>
                        {isFull ? 'FULL' : isOpen ? 'JOIN' : 'WATCH'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ FOOTER ═══════════════════════════════════════════════════════════ */}
          <div style={{ padding: '14px 12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <a href="/terms" style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em' }} data-testid="link-home-footer-terms">Terms</a>
              <span style={{ color: 'rgba(255,255,255,0.30)' }}>·</span>
              <a href="/privacy" style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }} data-testid="link-home-footer-privacy">Privacy</a>
              <span style={{ color: 'rgba(255,255,255,0.30)' }}>·</span>
              <a href="https://forms.gle/Vh6Uut9bB6neHA3J8" target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}
                data-testid="link-home-footer-feedback"
                onClick={() => track({ name: 'feedback_link_clicked', location: 'home_footer' })}>Feedback</a>
            </div>
          </div>

        </div>
      </div>

      {/* ── Fixed bottom dock ─────────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, height: 76, background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid rgba(245,158,11,0.18)', display: 'flex', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 512, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', height: '100%' }}>
          {([
            { icon: '/dock-leaderboard.png', label: 'RANKS',   onClick: () => navigate('/leaderboard'), testId: 'link-leaderboard-footer', isCenter: false },
            { icon: '/dock-shop.png',        label: 'SHOP',    onClick: () => navigate('/shop'),        testId: 'link-shop-footer',        isCenter: false },
            { icon: '💎',                   label: 'STYLE',   onClick: () => navigate('/cosmetics'),   testId: 'link-cosmetics-footer',   isCenter: false },
            { icon: '/dock-home.png',        label: 'HOME',    onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }), testId: 'link-home-dock', isCenter: true },
            { icon: '👥',                   label: 'CREWS',   onClick: () => navigate('/crews'),       testId: 'link-crews-footer',       isCenter: false },
            { icon: '/dock-profile.png',     label: 'PROFILE', onClick: () => navigate('/profile'),    testId: 'link-profile-footer',     isCenter: false },
          ] as const).map(item => (
            <button key={item.testId} onClick={item.onClick} data-testid={item.testId}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, height: '100%', minHeight: 44, background: 'none', border: 'none', cursor: 'pointer', transform: item.isCenter ? 'translateY(-4px)' : undefined }}>
              {item.isCenter ? (
                <div style={{ width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(240,184,41,0.55)', boxShadow: '0 0 16px rgba(240,184,41,0.30)', background: 'rgba(240,184,41,0.10)' }}>
                  <img src={item.icon} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                </div>
              ) : item.icon.startsWith('/') ? (
                <img src={item.icon} alt={item.label} style={{ width: 36, height: 36, objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: 24, lineHeight: 1 }}>{item.icon}</span>
              )}
              <span style={{ fontFamily: 'monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: item.isCenter ? 'rgba(240,184,41,0.90)' : 'rgba(240,184,41,0.60)' }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

    </div>

    <PrivateTableSetup open={showPrivateSetup} onClose={() => setShowPrivateSetup(false)} />

    {/* ── Open Table Mode Picker ────────────────────────────────────────────── */}
    {showOpenTableModal && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
        onClick={() => setShowOpenTableModal(false)}>
        <div style={{ width: '100%', maxWidth: 512, borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', background: 'linear-gradient(180deg,#111116 0%,#0d0d11 100%)', border: '1px solid rgba(245,158,11,0.18)', borderBottom: 'none' }}
          onClick={e => e.stopPropagation()}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)', margin: '0 auto 18px' }} />
          <h2 style={{ fontFamily: 'Impact,"Arial Narrow Bold",Arial,sans-serif', fontSize: 16, fontWeight: 900, color: 'white', letterSpacing: '0.10em', textAlign: 'center', marginBottom: 4 }}>OPEN A TABLE</h2>
          <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.40)', textAlign: 'center', marginBottom: 18 }}>Pick a mode — a public table opens instantly</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 18 }}>
            {MODES.map(mode => (
              <button key={mode.id} data-testid={`button-open-table-mode-${mode.id}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(40,28,8,0.85)', border: '1px solid rgba(80,55,15,0.45)', borderRadius: 8, padding: '8px 4px 7px', cursor: 'pointer' }}
                onClick={() => { setShowOpenTableModal(false); track({ name: 'crew_table_opened', mode: mode.id as 'badugi' }); navigateToMode(mode.id, mode.path); }}>
                <img src={mode.icon} alt={mode.name} style={{ width: 40, height: 40, objectFit: 'contain' }} />
                <span style={{ fontFamily: 'Impact,"Arial Narrow Bold",Arial,sans-serif', fontSize: '0.52rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(210,165,55,0.90)', marginTop: 4, textAlign: 'center', lineHeight: 1.2 }}>{mode.name}</span>
              </button>
            ))}
          </div>
          <button style={{ width: '100%', padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 700, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.38)', cursor: 'pointer' }}
            onClick={() => setShowOpenTableModal(false)} data-testid="button-open-table-cancel">
            Cancel
          </button>
        </div>
      </div>
    )}
    </>
  );
}
