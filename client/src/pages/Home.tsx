import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { getStripeGoal } from '@/lib/stripeGoal';
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
  isHourlyReady,
} from '@/lib/retention';
import { DailyBonusCalendarModal } from '@/components/DailyBonusCalendarModal';
import { HourlyBonusModal } from '@/components/HourlyBonusModal';
import { StarterPackModal } from '@/components/StarterPackModal';
import { AvatarWithFrame } from '@/components/ui/AvatarWithFrame';
import { HowToPlay } from '@/components/ui/HowToPlay';
import { useServerProfile } from '@/lib/useServerProfile';
import { apiUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';
import { track, fire2, trackHomeViewed } from '@/lib/analytics';
import { startMenuReview } from '@/lib/reviewFlow';
import { MusicButton } from '@/components/MusicButton';
import { DEFAULT_STAKE_TIER_ID, getStakeTierId, STAKE_TIERS, type StakeTierId } from '@shared/stakeTiers';
import { shouldShowHomeChipRecovery } from './homeChipRecovery';
import { MODE_PLACEHOLDER_ASSETS } from '@/lib/modePlaceholders';
import badugiArt from '@/assets/home/badugi.png';
import flushedUpArt from '@/assets/home/flushed-up.png';
import ladyLuckArt from '@/assets/home/lady-luck.png';
import boxChevyArt from '@/assets/home/box-chevy.png';
import { YardBottomNav } from '@/components/YardBottomNav';
import { YardPlayerHeader } from '@/components/YardPlayerHeader';
import { YardRewardFlight } from '@/components/YardRewardFlight';
import { publishYardMissionBadge } from '@/lib/yardMissionBadge';
import yardBackdrop from '@/assets/images/yard-backdrop.jpg';
import { RefreshCw, ArrowRight, Medal, Crown, Trophy } from 'lucide-react';
import '@/yard-reskin.css';

// ── Quest types (inline) ──────────────────────────────────────────────────────

interface QuestData {
  claimed:           string[];
  handsPlayed:       number;
  handsPlayedBadugi: number;
  handsPlayedFlushedUp: number;
  handsPlayedLadyLuck: number;
  handsPlayedBoxChevy: number;
}

function questHandsForMode(d: QuestData, modeId: string | null): number {
  if (!modeId)             return d.handsPlayed;
  if (modeId === 'badugi') return d.handsPlayedBadugi;
  if (modeId === 'flushed_up') return d.handsPlayedFlushedUp;
  if (modeId === 'lady_luck') return d.handsPlayedLadyLuck;
  if (modeId === 'box_chevy') return d.handsPlayedBoxChevy;
  return d.handsPlayed;
}

// ── Quest constants (mirrors server) ─────────────────────────────────────────

const HOME_DAILY_QUESTS: Record<number, { questId: string; description: string; modeId: string | null; requiredHands: number; stripes: number }> = {
  1: { questId: 'daily_monday',    description: 'Play 10 hands in Badugi',              modeId: 'badugi', requiredHands: 10, stripes: 5 },
  2: { questId: 'daily_tuesday',   description: 'Play 10 hands in Flushed Up',          modeId: 'flushed_up', requiredHands: 10, stripes: 5 },
  3: { questId: 'daily_wednesday', description: 'Play 10 hands in Lady Luck',           modeId: 'lady_luck', requiredHands: 10, stripes: 5 },
  4: { questId: 'daily_thursday',  description: 'Play 10 hands in Box Chevy',           modeId: 'box_chevy', requiredHands: 10, stripes: 5 },
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
  { questId: 'milestone_flushed_up_100', label: 'FLUSH 100', required: 100, stripes: 25, modeId: 'flushed_up' },
  { questId: 'milestone_lady_luck_100', label: 'LADY 100', required: 100, stripes: 25, modeId: 'lady_luck' },
  { questId: 'milestone_box_chevy_100', label: 'CHEVY 100', required: 100, stripes: 25, modeId: 'box_chevy' },
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

// ── Time until next daily bonus ───────────────────────────────────────────────

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
  { id: 'flushedup',  name: 'FLUSHED UP',    tagline: 'Chase the flush',        path: '/flushedup',  color: '#8b5cf6', icon: MODE_PLACEHOLDER_ASSETS.flushedUpIcon },
  { id: 'box_chevy',  name: 'BOX CHEVY',   tagline: '10 cards. No pairs. Swing.', path: '/box-chevy',  color: '#3b82f6', icon: MODE_PLACEHOLDER_ASSETS.boxChevyIcon },
  { id: 'ladyluck',   name: 'LADY LUCK',    tagline: 'Pick your suit. Run the race.', path: '/ladyluck', color: '#e53935', icon: MODE_PLACEHOLDER_ASSETS.ladyLuckIcon },
] as const;

// Card-specific background images and copy (per spec)
const MODE_CARD_CONFIGS = [
  { id: 'badugi',     bg: badugiArt, color: '#8B5CF6', btnText: '#150A2E', title: 'BADUGI', subtitle: '4-CARD DRAW', tag: '4-CARD DRAW' },
  { id: 'flushedup',  bg: flushedUpArt, color: '#D946EF', btnText: '#150A2E', title: 'FLUSHED UP', subtitle: 'CHASE THE FLUSH', tag: 'CHASE THE FLUSH' },
  { id: 'ladyluck',   bg: ladyLuckArt, color: '#FB7185', btnText: '#150A2E', title: 'LADY LUCK', subtitle: 'PICK YOUR QUEEN', tag: 'PICK YOUR QUEEN', directNav: true },
  { id: 'box_chevy',  bg: boxChevyArt, color: '#F97316', btnText: '#150A2E', title: 'BOX CHEVY', subtitle: '10-CARD LOWBALL', tag: '10-CARD LOWBALL' },
];

// ── Live table browser ────────────────────────────────────────────────────────

interface LiveTableEntry {
  tableId:      string;
  modeId:       string;
  humanCount:   number;
  phase:        string;
  maxPlayers:   number;
  isInviteOnly: boolean;
  stakeTier?: StakeTierId;
}

const LIVE_MODE_INFO: Record<string, { name: string; abbrev: string; color: string; path: string; icon: string; stakes: string }> = {
  badugi:      { name: 'Badugi',        abbrev: 'B',  color: '#10b981', path: '/badugi',     icon: '/mode-icon-badugi.png',    stakes: '$25 ante' },
  flushed_up:  { name: 'Flushed Up',    abbrev: 'FU', color: '#8b5cf6', path: '/flushedup',  icon: MODE_PLACEHOLDER_ASSETS.flushedUpIcon, stakes: '$25 ante' },
  box_chevy:   { name: 'Box Chevy',     abbrev: 'BX', color: '#3b82f6', path: '/box-chevy',  icon: MODE_PLACEHOLDER_ASSETS.boxChevyIcon, stakes: '$25 ante' },
};

function phaseLabel(phase: string): string {
  if (phase === 'WAITING') return 'Open · Join Now';
  if (phase === 'ANTE' || phase === 'DEAL') return 'Starting';
  if (phase.startsWith('DRAW')) return 'Draw';
  if (phase.startsWith('BET')) return 'Betting';
  if (phase.startsWith('HIT')) return 'In Play';
  if (phase === 'DECLARE') return 'Declare';
  if (phase === 'SHOWDOWN') return 'Showdown';
  return 'In Play';
}

const LIVE_TABS = [
  { id: 'all',         label: 'All'    },
  { id: 'badugi',      label: 'Badugi' },
  { id: 'flushed_up',  label: 'Flush'  },
  { id: 'box_chevy',   label: 'Box Chevy'   },
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
       <p className="text-center font-mono py-2" style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>No tables open.</p>
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
               opacity:     1,
              cursor:      isFull ? 'default' : 'pointer',
            }}>
            {info.icon && <img src={info.icon} alt={info.name} className="w-8 h-8 object-contain shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[12px] font-bold" style={{ color: info.color }}>{info.name}</span>
                <span className="font-mono text-[9px] text-white/25" data-testid={`text-live-table-code-${table.tableId}`}>{table.tableId}</span>
              </div>
               <span className="font-mono" style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }} data-testid={`text-live-players-${table.tableId}`}>
                {table.humanCount}/{table.maxPlayers} · {phaseLabel(table.phase)}
              </span>
               <span className="font-mono" style={{ fontSize: 10, color: 'rgba(201,162,39,0.78)' }} data-testid={`text-live-stakes-${table.tableId}`}>
                 {(() => { const tier = STAKE_TIERS.find(t => t.id === getStakeTierId(table.stakeTier))!; return `${tier.label} · ${tier.minBet} BB`; })()}
               </span>
               {info.stakes && <span className="font-mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{info.stakes}</span>}
            </div>
             <div className="shrink-0 px-2.5 py-1 rounded-lg font-bold font-mono uppercase"
               style={{ fontSize: 12, background: isFull ? 'rgba(255,255,255,0.05)' : info.color + '22', color: isFull ? 'rgba(255,255,255,0.68)' : info.color }}>
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
  const [location, navigate] = useLocation();
  const isMissionsPage = location === '/missions';
  const pullStartY = useRef<number | null>(null);
  const [refreshingMissions, setRefreshingMissions] = useState(false);
  const [missionRefreshSuccess, setMissionRefreshSuccess] = useState(false);
  const homeTracked = useRef(false);
  useEffect(() => {
    if (homeTracked.current) return;
    homeTracked.current = true;
    trackHomeViewed();
  }, []);
  const selectMode = (id: string, path: string, direct: boolean) => {
    fire2("mode_selected", { mode: id });
    if (direct) navigate(path);
    else void navigateToMode(id, path);
  };
  const [showPrivateSetup,   setShowPrivateSetup]   = useState(false);
  const [showOpenTableModal, setShowOpenTableModal] = useState(false);
  const [howToPlayMode, setHowToPlayMode] = useState<'badugi' | 'flushedup' | 'box_chevy' | 'ladyluck' | null>(null);

  const HOW_TO_PLAY_ID: Record<string, 'badugi' | 'flushedup' | 'box_chevy' | 'ladyluck'> = {
    badugi: 'badugi', flushedup: 'flushedup', box_chevy: 'box_chevy', ladyluck: 'ladyluck',
  };

  const identity    = ensurePlayerIdentity();
  const initials    = getAvatarInitials(identity.name);
  const avatarColor = getAvatarColor(identity.avatarSeed);

  useEffect(() => { syncXPFromHistory(); }, []);

  const [progression, setProgression] = useState(() => getProgression());
  const { profile: serverProfile, loading: profileLoading, refetch } = useServerProfile();
  useEffect(() => { void refetch(); }, [refetch]);
  const levelInfo = getLevelInfo(serverProfile?.xp ?? 0);


  // ── Guest nudge banner (show once per device for unauthenticated guests) ─────
  const [guestNudgeDismissed, setGuestNudgeDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem('cgp_guest_nudge_dismissed') === '1'; } catch { return false; }
  });
  const isGuestUser   = serverProfile !== null && serverProfile !== undefined && serverProfile.hasAuth === false;
  const showGuestNudge = isGuestUser && !guestNudgeDismissed;
  const dismissGuestNudge = () => {
    try { localStorage.setItem('cgp_guest_nudge_dismissed', '1'); } catch {}
    setGuestNudgeDismissed(true);
  };

  const chipMap    = getAllChips();
  const stats      = getPlayerStats();
  const totalChips = Object.values(chipMap).reduce((a, b) => a + b, 0);

  const displayChips = Math.max(0, serverProfile?.chipBalance ?? totalChips);
  const hasAuthoritativeZeroBalance = shouldShowHomeChipRecovery(serverProfile, profileLoading);
  const serverLevel  = serverProfile?.level ?? levelInfo.level;

  const rank        = getRankForLevel(serverLevel);
  const progressPct = Math.round(levelInfo.progress * 100);

  const [dailyBonusCalOpen, setDailyBonusCalOpen] = useState(false);
  const [serverBonusCanClaim,  setServerBonusCanClaim]  = useState<boolean | null>(null);
  const [serverBonusStreakDay, setServerBonusStreakDay] = useState(1);
  const [hourlyOpen,        setHourlyOpen]        = useState(false);
  const [starterOpen,       setStarterOpen]        = useState(false);
  const starterAvailable = serverProfile?.welcomeKitClaimed === false;

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
  const [rewardFlight, setRewardFlight] = useState<{ id: number; amount: number } | null>(null);

  const fetchQuestData = useCallback(async (pid: string): Promise<boolean> => {
    try {
      const r = await apiFetch(apiUrl(`/api/players/${pid}/quests`));
      if (r.ok) {
        setQuestData(await r.json());
        return true;
      }
      return false;
    } catch {
      return false;
    }
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
        setRewardFlight(previous => ({ id: (previous?.id ?? 0) + 1, amount: body.stripesGranted ?? stripes }));
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
  const hasClaimableMissions = (todayQuestEligible && !todayQuestClaimed) || HOME_MILESTONES.some(m =>
    !!questData && !questData.claimed.includes(m.questId) && questHandsForMode(questData, m.modeId ?? null) >= m.required);
  useEffect(() => {
    if (serverProfile?.profileId) publishYardMissionBadge(serverProfile.profileId, hasClaimableMissions);
  }, [serverProfile?.profileId, hasClaimableMissions]);
  const refreshMissions = useCallback(async () => {
    if (!serverProfile?.profileId || refreshingMissions) return;
    setRefreshingMissions(true);
    const succeeded = await fetchQuestData(serverProfile.profileId);
    setMissionRefreshSuccess(succeeded);
    window.setTimeout(() => setMissionRefreshSuccess(false), 1500);
    setRefreshingMissions(false);
  }, [serverProfile?.profileId, refreshingMissions, fetchQuestData]);

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
      const modes = ['badugi', 'flushed_up', 'box_chevy'];
      for (const modeId of modes) {
        try { localStorage.setItem(`pt_chips_${modeId}`, String(newChipBalance)); } catch {}
      }
      void newStripesBalance;
    },
    [refetch],
  );

  const handleHourlyClose = useCallback(() => {
    setHourlyOpen(false);
  }, []);

  const handleStarterClose = useCallback((claimed?: boolean) => {
    setStarterOpen(false);
    if (claimed) refetch();
  }, [refetch]);

  const handleJoinTable = useCallback((modeId: string, tableId: string) => {
    const info = LIVE_MODE_INFO[modeId];
    if (!info) return;
    navigate(`${info.path}?t=${tableId}${hasAuthoritativeZeroBalance ? '&watch=1' : ''}`);
  }, [navigate, hasAuthoritativeZeroBalance]);

  const MODE_ENGINE_ID: Record<string, string> = {
    badugi: 'badugi', flushedup: 'flushed_up',
  };

  const navigateToMode = useCallback(async (modeId: string, path: string) => {
    const watching = hasAuthoritativeZeroBalance;
    const watchQuery = watching ? '&watch=1' : '';
    const modeMap: Record<string, 'badugi'> = {
      badugi: 'badugi',
    };
    if (modeMap[modeId]) track({ name: 'mode_started', mode: modeMap[modeId] });
    try {
      const engineModeId = MODE_ENGINE_ID[modeId] ?? modeId;
      const res = await fetch(apiUrl('/api/tables'));
      if (res.ok) {
        const all: LiveTableEntry[] = await res.json();
        const joinable = all
          .filter(t => t.modeId === engineModeId && (watching || t.phase === 'WAITING') && t.humanCount > 0 && (watching || t.humanCount < (t.maxPlayers ?? 5)) && !t.isInviteOnly)
          .sort((a, b) => b.humanCount - a.humanCount)[0];
        if (joinable) { navigate(`${path}?t=${joinable.tableId}${watchQuery}`); return; }
      }
    } catch {}
    const newCode = generateTableCode();
    navigate(`${path}?t=${newCode}&qp=1${watchQuery}`);
  }, [navigate, hasAuthoritativeZeroBalance]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissAchievement = useCallback((id: string) => {
    setNewAchievements(prev => prev.filter(a => a.id !== id));
    clearNewAchievements();
  }, []);

  // Suppress unused-var lint on stats (kept for existing logic parity)
  void stats;

  const canClaimBonus = serverBonusCanClaim === true;

  const stripes = serverProfile?.stripes ?? 0;
  const { label: stripeGoalLabel, progress: stripeGoalPct } = getStripeGoal(stripes);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
    {/* ── Fixed background ──────────────────────────────────────────────────── */}
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: `url('${yardBackdrop}')`, backgroundSize: 'cover', backgroundPosition: 'center top' }} />
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'rgba(0,0,0,0.55)' }} />

    <div className={`yard-page${isMissionsPage ? ' is-missions-page' : ''}`} style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Sticky header ─────────────────────────────────────────────────────── */}
      <YardPlayerHeader notificationDot={hasClaimableMissions} actions={<>
        <button className="yard-header-action" type="button" onClick={() => navigate('/leaderboard')} aria-label="Leaderboard">
          <Trophy size={20} color="#FBBF24" />
        </button>
        <MusicButton size={40} popoverAlign="right" />
      </>} />

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
      {!isMissionsPage && hasAuthoritativeZeroBalance && <div className="yard-zero-wallet">
        <span data-testid="text-bankroll">You're out of chips</span>
        <button type="button" data-testid="button-home-get-chips" onClick={() => navigate('/shop')}>GET CHIPS</button>
      </div>}
      {rewardFlight && <YardRewardFlight key={rewardFlight.id} amount={rewardFlight.amount} />}
      {questToast && (
        <div style={{ position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)', background: 'rgba(12,8,24,0.96)', backdropFilter: 'blur(16px)', border: '1.5px solid rgba(201,162,39,0.55)', borderRadius: 12, padding: '10px 22px', color: '#F0B829', fontFamily: 'monospace', fontWeight: 800, fontSize: 13, zIndex: 9999, whiteSpace: 'nowrap', boxShadow: '0 8px 32px rgba(0,0,0,0.60)' }}>
          {questToast}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      <DailyBonusCalendarModal open={dailyBonusCalOpen} onClose={() => setDailyBonusCalOpen(false)} onClaimed={handleDailyBonusClaimed} />
      <HourlyBonusModal open={hourlyOpen} onClose={handleHourlyClose} />
      <StarterPackModal open={starterOpen} onClose={handleStarterClose} onRefetchProfile={refetch} />
      {howToPlayMode && <HowToPlay modeId={howToPlayMode} onClose={() => setHowToPlayMode(null)} />}

      {/* ── Scrollable content ────────────────────────────────────────────────── */}
      {isMissionsPage && <main className="yard-missions-screen" onTouchStart={event => { if (event.currentTarget.scrollTop <= 0) pullStartY.current = event.touches[0]?.clientY ?? null; }}
        onTouchEnd={event => { const start = pullStartY.current; pullStartY.current = null; if (start != null && event.changedTouches[0] && event.changedTouches[0].clientY - start > 72) void refreshMissions(); }}>
        <div className="yard-missions-titlebar">
          <div><span>THE YARD / OBJECTIVES</span><h1>MISSIONS</h1></div>
          <button type="button" aria-label="Refresh missions" onClick={() => void refreshMissions()} disabled={refreshingMissions}>
            <RefreshCw size={19} className={refreshingMissions ? 'is-refreshing' : ''} />
          </button>
        </div>
        <div className={`yard-refresh-flight${missionRefreshSuccess ? ' is-visible' : ''}`} aria-live="polite">
          {missionRefreshSuccess ? 'MISSIONS REFRESHED' : refreshingMissions ? 'CHECKING THE BOARD' : ''}
        </div>
        <section className="yard-mission-group">
          <div className="yard-section-heading"><h2>DAILY MISSIONS</h2><span>ONE CONTRACT · RESET EACH DAY</span></div>
          {todayQuest && (() => {
            const modeId = todayQuest.modeId === 'flushed_up' ? 'flushedup' : todayQuest.modeId ?? 'badugi';
            const artwork = MODE_CARD_CONFIGS.find(mode => mode.id === modeId) ?? MODE_CARD_CONFIGS[0];
            const hands = Math.min(todayQuestHands, todayQuest.requiredHands);
            const claimed = todayQuestClaimed;
            const eligible = todayQuestEligible && !claimed;
            return <article className="yard-mission-card">
              <img className="yard-mission-art" src={artwork.bg} alt="" />
              <div className="yard-mission-copy">
                <span className="yard-mission-mode">{artwork.title}</span>
                <h3>{todayQuest.description}</h3>
                <div className="yard-mission-progress"><span>{hands}/{todayQuest.requiredHands}</span><span>+{todayQuest.stripes} STRIPES</span></div>
                <div className="yard-mission-track"><i style={{ width: `${todayQuestPct}%` }} /></div>
              </div>
              {claimed ? <button type="button" className="yard-mission-state is-done" disabled>DONE</button>
                : eligible ? <button type="button" className="yard-mission-state is-claim" disabled={!!questClaiming} onClick={() => void claimQuestById(todayQuest.questId, todayQuest.stripes)}>{questClaiming === todayQuest.questId ? 'CLAIMING' : 'CLAIM'}</button>
                : <button type="button" className="yard-mission-state is-go" onClick={() => { const target = MODES.find(mode => mode.id === modeId); if (target) void navigateToMode(modeId, target.path); else navigate('/'); }}>GO NOW <ArrowRight size={16} /></button>}
            </article>;
          })()}
        </section>
        <section className="yard-mission-group">
          <div className="yard-section-heading"><h2>WEEKLY MISSIONS</h2><span>LONGER RUN · NO ACTIVE CONTRACTS</span></div>
          <div className="yard-weekly-empty"><div className="yard-empty-emblem"><Medal size={22} /></div><div><strong>No weekly missions configured</strong><p>There are no weekly objectives in the current mission data. Your daily contract is live above.</p></div></div>
        </section>
        <section className="yard-mission-group yard-career-group">
          <div className="yard-section-heading"><h2>CAREER MILESTONES</h2><span>ALL-TIME PROGRESS</span></div>
          <div className="yard-career-list">{HOME_MILESTONES.map(m => {
            const total = questData ? questHandsForMode(questData, m.modeId ?? null) : 0;
            const complete = total >= m.required;
            const claimed = questData?.claimed.includes(m.questId) ?? false;
            const pct = Math.min(100, Math.round(total / m.required * 100));
            return <article className="yard-career-row" key={m.questId}>
              <div className="yard-career-copy"><strong>{m.modeId ? m.label.replace(' 100', '') : `${m.required.toLocaleString()} HANDS`}</strong><span>{Math.min(total,m.required).toLocaleString()} / {m.required.toLocaleString()}</span><div className="yard-mission-track"><i style={{ width: `${pct}%` }} /></div></div>
              {claimed ? <button className="yard-mission-state is-done" disabled>DONE</button>
                : complete ? <button className="yard-mission-state is-claim" disabled={!!questClaiming} onClick={() => void claimQuestById(m.questId, m.stripes)}>CLAIM</button>
                  : <span className="yard-career-reward">+{m.stripes} STRIPES</span>}
            </article>;
          })}</div>
        </section>
      </main>}
      <div className={`yard-home-regular${isMissionsPage ? ' is-hidden' : ''}`} style={{ flex: 1, paddingBottom: 140 }}>
        <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>

          {/* ══ GUEST NUDGE BANNER ═══════════════════════════════════════════════ */}
          {showGuestNudge && (
            <div data-testid="banner-guest-nudge"
              style={{ margin: '10px 14px 2px', padding: '12px 14px 12px 16px', background: 'linear-gradient(135deg,rgba(201,162,39,0.12),rgba(10,10,16,0.80))', border: '1px solid rgba(201,162,39,0.30)', borderLeft: '3px solid #C9A227', borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 12, backdropFilter: 'blur(12px)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12, color: '#C9A227', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>
                  LOCK IN YOUR SPOT
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', lineHeight: 1.4 }}>
                  You're playing as a guest. Create a free account and your chips, stats, and streak never disappear.
                </div>
                <button
                  onClick={() => navigate('/profile')}
                  data-testid="btn-guest-nudge-cta"
                  style={{ marginTop: 8, padding: '6px 14px', background: '#C9A227', color: '#0A0A10', fontFamily: 'monospace', fontWeight: 800, fontSize: 11, letterSpacing: '0.06em', borderRadius: 6, border: 'none', cursor: 'pointer' }}>
                  CREATE ACCOUNT
                </button>
              </div>
              <button onClick={dismissGuestNudge} data-testid="btn-guest-nudge-dismiss"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.30)', fontSize: 18, lineHeight: 1, padding: 2, flexShrink: 0 }}
                aria-label="Dismiss">✕</button>
            </div>
          )}

          {/* ══ PLAYER AREA — floating, no box ═══════════════════════════════════ */}
          <button className="yard-home-player-area" onClick={() => navigate('/profile')} data-testid="button-profile-strip"
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
              <div data-testid="text-bankroll-legacy" style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: hasAuthoritativeZeroBalance ? 11 : 18, color: hasAuthoritativeZeroBalance ? '#F2C66D' : '#22c55e', textShadow: hasAuthoritativeZeroBalance ? 'none' : '0 0 12px rgba(34,197,94,0.45)', lineHeight: 1, textAlign: 'right', maxWidth: 132 }}>
                {hasAuthoritativeZeroBalance ? "You're out of chips" : `$${displayChips.toLocaleString()}`}
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

          {hasAuthoritativeZeroBalance && (
            <button
              type="button"
              onClick={() => navigate('/shop')}
              data-testid="button-home-get-chips-legacy"
              style={{ margin: '0 16px 12px 98px', alignSelf: 'stretch', padding: '11px 16px', border: '1px solid rgba(201,162,39,0.55)', borderRadius: 12, background: 'linear-gradient(135deg, rgba(201,162,39,0.20), rgba(201,162,39,0.08))', color: '#F2C66D', fontFamily: 'monospace', fontWeight: 800, fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}
            >
              GET CHIPS
            </button>
          )}

          {/* ══ GAME MODE CARDS — 4 atmospheric stacked banners ══════════════════ */}
          {new URLSearchParams(window.location.search).has('tableExit') && (
            <p role="status" className="mx-4 mb-3 rounded-xl border border-amber-200/30 bg-black/40 p-3 text-sm text-amber-100">
              You’re back in the lobby. Your table balance remains server-controlled and may still be awaiting confirmation.
            </p>
          )}
          <div className="yard-home-title">
            <h1>CHAIN GANG</h1>
            <em>Poker</em>
            <p>DIFFERENT GAMES. SAME YARD.</p>
          </div>
          <div className="yard-game-grid">
            {MODE_CARD_CONFIGS.map(card => {
              const mode       = MODES.find(m => m.id === card.id)!;
              const htpModeId  = HOW_TO_PLAY_ID[card.id];
              return (
                <div key={card.id} data-testid={`button-mode-${card.id}`}
                  className="yard-game-card"
                  onClick={() => selectMode(card.id, mode.path, Boolean((card as any).directNav))}
                  role="button" tabIndex={0}
                  onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectMode(card.id, mode.path, Boolean((card as any).directNav)); } }}
                  style={{ '--card-accent': card.color } as React.CSSProperties}>
                  <img className="yard-card-art" src={card.bg} alt={`${card.title} — ${card.tag}`} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
                  <div className="yard-card-wash" style={{ position: 'absolute', inset: 0 }} />
                  <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-start', padding: 12, textAlign: 'left' }}>
                       <Crown size={18} aria-hidden="true" color="#FBBF24" />
                       <div data-testid={`text-mode-name-${card.id}`}
                        style={{ fontFamily: 'Oswald, Impact, sans-serif', fontSize: 'clamp(21px,5vw,32px)', color: '#E5E7EB', letterSpacing: '1px', lineHeight: 1, textShadow: '0 2px 8px #0A0618', marginBottom: 4 }}>
                        {card.title}
                      </div>
                      <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: '#C4B5FD', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>
                        {card.subtitle}
                      </div>
                       <button className="yard-card-chevron" data-testid={`button-play-${card.id}`}
                         aria-label={`Play ${card.title}`}
                         onClick={e => { e.stopPropagation(); selectMode(card.id, mode.path, Boolean((card as any).directNav)); }}>›</button>
                       <div className="yard-card-utilities">
                       {htpModeId && (
                        <button
                          data-testid={`button-how-to-play-${card.id}`}
                           aria-label={`How to play ${card.title}`}
                          onClick={e => { e.stopPropagation(); setHowToPlayMode(htpModeId); }}
                          style={{ background: '#150A2Edd', border: '1px solid #FBBF24', borderRadius: 8, minHeight: 32, padding: '4px 12px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#FBBF24', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                        >
                           HOW TO PLAY
                        </button>
                      )}
                      {card.id === 'badugi' && (
                        <button
                          data-testid="button-practice-badugi"
                           aria-label="Practice Badugi"
                          onClick={e => { e.stopPropagation(); navigate('/practice/badugi'); }}
                          style={{ marginLeft: 5, background: '#150A2Edd', border: '1px solid #C4B5FD', borderRadius: 8, minHeight: 32, padding: '4px 8px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#EDE9FE', cursor: 'pointer', textTransform: 'uppercase' }}
                        >
                           <RefreshCw size={20} aria-hidden="true" />
                        </button>
                      )}
                       </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ══ DAILY BONUS + MISSIONS ════════════════════════════════════════════ */}
          <div className="yard-bonus-mission-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '10px 12px 0' }}>

            {/* Daily Bonus — parchment / amber */}
            <div id="missions" className="yard-missions-screen" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 6, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227', textTransform: 'uppercase', letterSpacing: '0.10em', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span aria-hidden="true">CHAIN</span><span>DAILY BONUS</span>
              </div>
              <div style={{ fontWeight: 900, color: 'white', fontSize: 15, lineHeight: 1.2 }}>
                {serverBonusCanClaim !== null
                  ? `Day ${serverBonusStreakDay} Ready`
                  : 'Loading bonus…'}
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
                {canClaimBonus ? 'CLAIM BONUS' : `NEXT IN ${getTimeUntilMidnight()}`}
              </button>
            </div>

            {/* Daily Missions + Milestones */}
            <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 6, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
              <div className="yard-missions-title">
                DAILY MISSIONS
                <button type="button" aria-label="Refresh daily missions" onClick={() => serverProfile?.profileId && fetchQuestData(serverProfile.profileId)}
                  style={{ marginLeft: 'auto', minWidth: 48, minHeight: 48, display: 'grid', placeItems: 'center', border: '1px solid #A78BFA', borderRadius: 8, background: '#1E1040', color: '#EDE9FE' }}>
                  <RefreshCw size={18} />
                </button>
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
                  <div role="progressbar" aria-label="Daily mission progress" aria-valuemin={0} aria-valuemax={todayQuest.requiredHands} aria-valuenow={Math.min(todayQuestHands,todayQuest.requiredHands)} style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 3, height: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${todayQuestPct}%`, height: '100%', background: 'linear-gradient(90deg,#B45309,#FDE68A)', borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{display:'flex',gap:10}}>
                  {!todayQuestEligible && !todayQuestClaimed && (() => {
                    const gameMode = MODES.find(m => m.id === todayQuest.modeId || (todayQuest.modeId === 'flushed_up' && m.id === 'flushedup'));
                    return gameMode ? <button type="button" onClick={() => selectMode(gameMode.id, gameMode.path, Boolean((gameMode as any).directNav))}
                      style={{flex:1,minHeight:48,borderRadius:8,border:'1px solid #A78BFA',background:'#1E1040',color:'#EDE9FE',fontWeight:800,fontSize:13}}>GO NOW</button> : null;
                  })()}
                  <button className={`yard-mission-claim${todayQuestClaimed ? ' is-done' : ''}`} disabled={!todayQuestEligible || todayQuestClaimed || questClaiming === todayQuest.questId}
                    onClick={() => claimQuestById(todayQuest.questId, todayQuest.stripes)} data-testid="daily-quest-claim-btn"
                    style={{ padding: '7px 0', borderRadius: 10, border: 'none', background: todayQuestClaimed ? 'rgba(34,197,94,0.15)' : todayQuestEligible ? '#22c55e' : 'rgba(255,255,255,0.07)', color: todayQuestClaimed ? '#22c55e' : todayQuestEligible ? 'white' : 'rgba(255,255,255,0.28)', fontFamily: 'monospace', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', cursor: todayQuestEligible && !todayQuestClaimed ? 'pointer' : 'not-allowed', boxShadow: todayQuestEligible && !todayQuestClaimed ? '0 3px 12px rgba(34,197,94,0.40)' : 'none', letterSpacing: '0.06em' }}>
                    {todayQuestClaimed ? 'DONE' : questClaiming === todayQuest.questId ? 'CLAIMING' : 'CLAIM'}
                  </button>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', fontFamily: 'monospace' }}>No quest today.</div>
              )}

            </div>
          </div>

          {/* ══ MILESTONES — floating circles, no container ═══════════════════════ */}
          <div style={{ padding: '10px 14px 0' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#C4B5FD', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>LIFETIME MILESTONES</div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
              {HOME_MILESTONES.map(m => {
                const totalHands = questData
                  ? questHandsForMode(questData, m.modeId ?? null)
                  : 0;
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
                {realPlayerCount > 0 && <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>{realPlayerCount} playing</span>}
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
                      style={{ width: 130, flexShrink: 0, background: 'rgba(0,0,0,0.40)', border: `1px solid rgba(255,255,255,0.05)`, borderRadius: 12, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 5, cursor: isFull ? 'default' : 'pointer', opacity: 1, textAlign: 'left', backdropFilter: 'blur(8px)' }}>
                      {info.icon && <img src={info.icon} alt="" style={{ width: 32, height: 32, objectFit: 'contain', filter: `drop-shadow(0 0 5px ${info.color}55)` }} />}
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12, color: info.color }}>{info.name}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.68)' }} data-testid={`text-live-players-${table.tableId}`}>
                        {table.humanCount}/{table.maxPlayers} players
                      </span>
                      {info.stakes && <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{info.stakes}</span>}
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(201,162,39,0.70)' }} data-testid={`text-live-stakes-${table.tableId}`}>
                         {(() => { const tier = STAKE_TIERS.find(t => t.id === getStakeTierId(table.stakeTier ?? DEFAULT_STAKE_TIER_ID))!; return `${tier.label} · ${tier.minBet} BB`; })()}
                       </span>
                      <div style={{ padding: '5px 0', borderRadius: 8, textAlign: 'center', fontFamily: 'monospace', fontWeight: 900, fontSize: 12, letterSpacing: '0.06em', background: isFull ? 'rgba(255,255,255,0.06)' : isOpen ? `${info.color}22` : 'rgba(255,255,255,0.06)', color: isFull ? 'rgba(255,255,255,0.68)' : isOpen ? info.color : 'rgba(255,255,255,0.65)' }}>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <a href="/terms" style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.70)', letterSpacing: '0.06em' }} data-testid="link-home-footer-terms">Terms</a>
              <span style={{ color: 'rgba(255,255,255,0.30)' }}>·</span>
              <a href="/privacy" style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.70)' }} data-testid="link-home-footer-privacy">Privacy</a>
              <span style={{ color: 'rgba(255,255,255,0.30)' }}>·</span>
              <a href="https://forms.gle/Vh6Uut9bB6neHA3J8" target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.70)' }}
                data-testid="link-home-footer-feedback"
                onClick={() => track({ name: 'feedback_link_clicked', location: 'home_footer' })}>Feedback</a>
              <span style={{ color: 'rgba(255,255,255,0.30)' }}>·</span>
              <button type="button" data-testid="button-rate-chain-home"
                onClick={() => { void startMenuReview(serverProfile?.profileId ?? identity.id).then(({ launched, saved }) => {
                  if (!launched || !saved) window.alert(!launched
                    ? 'The store could not be opened. Please try again later.'
                    : 'Your rating preference could not be saved. Please check your connection.');
                }); }}
                style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#F0B829', letterSpacing: '0.02em', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
                Rate the Chain
              </button>
            </div>
          </div>

        </div>
      </div>

      <YardBottomNav active={isMissionsPage ? 'MISSIONS' : 'HOME'} missionDot={hasClaimableMissions} />

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
          <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.68)', textAlign: 'center', marginBottom: 18 }}>Pick a mode — a public table opens instantly</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 18 }}>
            {MODES.map(mode => (
              <button key={mode.id} data-testid={`button-open-table-mode-${mode.id}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(40,28,8,0.85)', border: '1px solid rgba(80,55,15,0.45)', borderRadius: 8, padding: '8px 4px 7px', cursor: 'pointer' }}
                onClick={() => { setShowOpenTableModal(false); track({ name: 'crew_table_opened', mode: mode.id as 'badugi' }); navigateToMode(mode.id, mode.path); }}>
                <img src={mode.icon} alt={mode.name} style={{ width: 40, height: 40, objectFit: 'contain' }} />
                <span style={{ fontFamily: 'Impact,"Arial Narrow Bold",Arial,sans-serif', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(210,165,55,0.90)', marginTop: 4, textAlign: 'center', lineHeight: 1.2 }}>{mode.name}</span>
              </button>
            ))}
          </div>
          <button style={{ width: '100%', padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 700, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.70)', cursor: 'pointer' }}
            onClick={() => setShowOpenTableModal(false)} data-testid="button-open-table-cancel">
            Cancel
          </button>
        </div>
      </div>
    )}
    </>
  );
}
