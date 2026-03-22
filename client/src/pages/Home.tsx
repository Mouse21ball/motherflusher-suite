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
import {
  isRewardAvailable,
  getStreakInfo,
  getSimulatedPlayerCount,
  getModeTableCount,
} from '@/lib/dailyReward';
import { DailyRewardModal } from '@/components/DailyRewardModal';

// ─── Color palette (psychology-driven) ────────────────────────────────────────
// Gold   → wealth, luxury, winning   (primary brand)
// Emerald→ money, success, action    (CTAs, positive states)
// Purple → exclusivity, VIP, prestige (premium features)
// Amber  → urgency, energy, limited  (FOMO triggers)
// Red    → danger, passion, bust     (Dead 7)

const C = {
  gold: '#F0B829',
  goldBright: '#FFD060',
  goldDim: 'rgba(240,184,41,',
  emerald: '#00C896',
  purple: '#9B5DE5',
  amber: '#FF9500',
  red: '#EF4444',
  surface: '#070709',
  panel: '#0F0F13',
  elevated: '#17171C',
  border: 'rgba(255,255,255,0.06)',
} as const;

// ─── Mode definitions ─────────────────────────────────────────────────────────

const MODES = [
  {
    id: 'badugi',
    name: 'Badugi',
    tagline: '4-Card Draw · High/Low Split',
    description: 'The prestige draw game. Build the perfect 4-suit, 4-rank hand across three draws. Real multiplayer.',
    path: '/badugi',
    icon: '♦',
    emoji: '♦️',
    color: '#00C896',
    glow: 'rgba(0,200,150,',
    bg: 'linear-gradient(135deg, rgba(0,200,150,0.12) 0%, rgba(0,200,150,0.04) 100%)',
    border: 'rgba(0,200,150,0.25)',
    borderHover: 'rgba(0,200,150,0.50)',
    isMultiplayer: true,
    isHero: true,
    difficulty: 'Classic',
    prize: 'Daily $10K chip pot',
  },
  {
    id: 'dead7',
    name: 'Dead 7',
    tagline: 'Every 7 Kills You',
    description: '7s are instant death. Flush scoops the pot. Pure high-tension, brutal reads.',
    path: '/dead7',
    icon: '💀',
    emoji: '💀',
    color: '#EF4444',
    glow: 'rgba(239,68,68,',
    bg: 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(239,68,68,0.04) 100%)',
    border: 'rgba(239,68,68,0.25)',
    borderHover: 'rgba(239,68,68,0.50)',
    isMultiplayer: false,
    isHero: false,
    difficulty: 'Intermediate',
    prize: 'Hot Streak Bonus',
  },
  {
    id: 'fifteen35',
    name: '15 / 35',
    tagline: 'Hit or Bust · Pure Pressure',
    description: "Chase 15 or 35. Go over and you're out. Fast rounds, pure pressure — like blackjack with a split pot.",
    path: '/fifteen35',
    icon: '15',
    emoji: '🃏',
    color: '#F0B829',
    glow: 'rgba(240,184,41,',
    bg: 'linear-gradient(135deg, rgba(240,184,41,0.12) 0%, rgba(240,184,41,0.04) 100%)',
    border: 'rgba(240,184,41,0.25)',
    borderHover: 'rgba(240,184,41,0.50)',
    isMultiplayer: false,
    isHero: false,
    difficulty: 'Easy Pick-up',
    prize: 'Perfect Score Bonus',
  },
  {
    id: 'swing',
    name: 'Mother Flusher',
    tagline: 'Swing Poker · Scoop Everything',
    description: 'Our signature mode. 5 cards, 15-card board. Declare High, Low, or Swing all — and pray.',
    path: '/swing',
    icon: '⚡',
    emoji: '⚡',
    color: '#9B5DE5',
    glow: 'rgba(155,93,229,',
    bg: 'linear-gradient(135deg, rgba(155,93,229,0.12) 0%, rgba(155,93,229,0.04) 100%)',
    border: 'rgba(155,93,229,0.25)',
    borderHover: 'rgba(155,93,229,0.50)',
    isMultiplayer: false,
    isHero: false,
    difficulty: 'Signature',
    prize: 'Swing Bonus 3×',
  },
  {
    id: 'suitspoker',
    name: 'Suits & Poker',
    tagline: 'Dual-Path · 3 Declarations',
    description: 'Fork the board, pick a path. Win on poker, suits scoring, or Swing both sides to scoop the lot.',
    path: '/suitspoker',
    icon: '♠',
    emoji: '♠️',
    color: '#06B6D4',
    glow: 'rgba(6,182,212,',
    bg: 'linear-gradient(135deg, rgba(6,182,212,0.12) 0%, rgba(6,182,212,0.04) 100%)',
    border: 'rgba(6,182,212,0.25)',
    borderHover: 'rgba(6,182,212,0.50)',
    isMultiplayer: false,
    isHero: false,
    difficulty: 'Advanced',
    prize: 'Scoop Bonus 2×',
  },
] as const;

// ─── Simulated live feed ──────────────────────────────────────────────────────

const FEED_TEMPLATES = [
  (n: string) => `${n} scooped a $420 pot in Mother Flusher`,
  (n: string) => `${n} went on a 4-win streak 🔥`,
  (n: string) => `${n} hit a perfect Badugi!`,
  (n: string) => `${n} won $280 in Dead 7`,
  (n: string) => `${n} reached Level 12 — Silver rank`,
  (n: string) => `${n} claimed the daily bonus ($750 chips)`,
  (n: string) => `${n} won the 15/35 pot with a perfect 35`,
  (n: string) => `${n} unlocked "Hat Trick" achievement`,
  (n: string) => `${n} is on a 7-win streak 🚀`,
  (n: string) => `${n} won $640 swinging both sides`,
  (n: string) => `${n} reached Gold rank — Level 21`,
  (n: string) => `${n} hit 100 hands played — Century Club!`,
  (n: string) => `${n} scooped $380 at Suits & Poker`,
];

const FEED_NAMES = ['AceHunter','BluffKing','CardShark','DeckMaster','FlushQueen',
  'GoldStrike','IronSuit','JackWild','KingBluff','MidStack','NightRider',
  'PotSweeper','RiverRat','TiltKing','UltBadugi','VegasGhost','SilkHand'];

function buildFeed(seed: number): string[] {
  const items: string[] = [];
  for (let i = 0; i < 14; i++) {
    const nameIdx = (seed + i * 7) % FEED_NAMES.length;
    const tmplIdx = (seed + i * 13) % FEED_TEMPLATES.length;
    items.push(FEED_TEMPLATES[tmplIdx](FEED_NAMES[nameIdx]));
  }
  return items;
}

function syncXPFromHistory(): void {
  const history = getHandHistory();
  initProgressionBaseline(history.length);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [, navigate] = useLocation();

  const identity = ensurePlayerIdentity();
  const initials  = getAvatarInitials(identity.name);
  const avatarColor = getAvatarColor(identity.avatarSeed);

  useEffect(() => { syncXPFromHistory(); }, []);

  const [progression, setProgression] = useState(() => getProgression());
  const levelInfo  = getLevelInfo(progression.xp);
  const rank       = getRankForLevel(levelInfo.level);

  const chipMap = getAllChips();
  const stats   = getPlayerStats();
  const totalChips = Object.values(chipMap).reduce((a, b) => a + b, 0);

  const [dailyOpen,   setDailyOpen]   = useState(false);
  const [rewardReady, setRewardReady] = useState(isRewardAvailable);
  const streakInfo = getStreakInfo();

  const [playerCount, setPlayerCount] = useState(getSimulatedPlayerCount);
  useEffect(() => {
    const id = setInterval(() => setPlayerCount(getSimulatedPlayerCount()), 30000);
    return () => clearInterval(id);
  }, []);

  const [newAchievements, setNewAchievements] = useState<Achievement[]>(() => {
    const p = getProgression();
    return (p.newAchievements ?? []).map(id => ACHIEVEMENT_MAP.get(id)!).filter(Boolean);
  });

  const handleDailyClose = useCallback(() => {
    setDailyOpen(false);
    setRewardReady(false);
    setProgression(getProgression());
  }, []);

  const dismissAchievement = useCallback((id: string) => {
    setNewAchievements(prev => prev.filter(a => a.id !== id));
    clearNewAchievements();
  }, []);

  const progressPct = Math.round(levelInfo.progress * 100);
  const totalNet    = stats.totalChipChange;
  const feedSeed    = Math.floor(Date.now() / (1000 * 60 * 5)); // rotates every 5 min
  const feedItems   = useMemo(() => buildFeed(feedSeed), [feedSeed]);

  const hour  = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // Daily jackpot — deterministic per day
  const dayKey = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const dailyJackpot = 8000 + ((dayKey * 137) % 14000);
  const weeklyPrize  = 45000 + ((dayKey * 53) % 30000);

  return (
    <div className="min-h-[100dvh] bg-[#070709] flex flex-col relative overflow-x-hidden">
      {/* ── Deep ambient glows ─────────────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full opacity-[0.35]"
          style={{ background: 'radial-gradient(ellipse, rgba(240,184,41,0.18) 0%, transparent 70%)' }} />
        <div className="absolute top-1/3 -right-32 w-80 h-80 rounded-full opacity-60"
          style={{ background: 'radial-gradient(ellipse, rgba(0,200,150,0.10) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 -left-20 w-72 h-72 rounded-full opacity-60"
          style={{ background: 'radial-gradient(ellipse, rgba(155,93,229,0.10) 0%, transparent 70%)' }} />
      </div>

      {/* ── Achievement toasts ──────────────────────────────────────────────── */}
      {newAchievements.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
          {newAchievements.map(ach => (
            <button
              key={ach.id}
              onClick={() => dismissAchievement(ach.id)}
              className="flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl text-left animate-slide-in-right w-full"
              style={{ backgroundColor: '#17171C', borderColor: `${C.gold}40` }}
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

      <DailyRewardModal open={dailyOpen} onClose={handleDailyClose} />

      {/* ── GLOBAL HEADER ──────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 w-full px-4 py-3 flex items-center gap-3 border-b"
        style={{ backgroundColor: 'rgba(7,7,9,0.92)', backdropFilter: 'blur(20px)', borderColor: C.border }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 mr-auto">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono shrink-0"
            style={{ background: `linear-gradient(135deg, ${C.goldDim}0.20) 0%, ${C.goldDim}0.08) 100%)`, border: `1px solid ${C.goldDim}0.25)`, color: C.gold }}
          >
            PT
          </div>
          <span className="text-sm font-bold font-sans text-white/75 hidden sm:block tracking-tight">Poker Table</span>
        </div>

        {/* Live count */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl" style={{ backgroundColor: 'rgba(0,200,150,0.07)', border: '1px solid rgba(0,200,150,0.15)' }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: C.emerald, boxShadow: `0 0 6px ${C.emerald}` }} />
          <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: C.emerald }} data-testid="text-live-count">
            {playerCount.toLocaleString()} live
          </span>
        </div>

        {/* Nav icons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate('/leaderboard')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all hover:bg-white/[0.05]"
            title="Leaderboard"
            data-testid="link-leaderboard-header"
          >
            🏆
          </button>
          <button
            onClick={() => navigate('/shop')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all hover:bg-white/[0.05]"
            title="Premium Shop"
            data-testid="link-shop-header"
          >
            💎
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold font-mono text-white transition-all hover:opacity-80 shrink-0"
            style={{ backgroundColor: avatarColor + '25', border: `1.5px solid ${rank.color}50` }}
            data-testid="button-open-profile"
          >
            {initials}
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center relative">
        <div className="w-full max-w-lg px-4 pt-5 pb-10 flex flex-col gap-4">

          {/* ── PLAYER HERO CARD ──────────────────────────────────────────── */}
          <div
            className="w-full rounded-2xl p-4 relative overflow-hidden anim-border-glow"
            style={{ background: `linear-gradient(135deg, ${C.goldDim}0.10) 0%, ${C.goldDim}0.04) 60%, rgba(0,200,150,0.04) 100%)`, border: `1px solid ${C.goldDim}0.20)` }}
          >
            {/* Shimmer sweep */}
            <div className="absolute inset-0 anim-shimmer pointer-events-none rounded-2xl" />

            <div className="relative flex items-center gap-3">
              {/* Avatar */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-base font-bold font-mono text-white shrink-0"
                style={{ backgroundColor: avatarColor + '30', border: `2px solid ${rank.color}60`, boxShadow: `0 0 20px ${rank.color}25` }}
              >
                {initials}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest">{greeting}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-base font-bold text-white/90 font-sans truncate" data-testid="text-player-name">
                    {identity.name}
                  </span>
                  <span
                    className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-md shrink-0"
                    style={{ color: rank.color, backgroundColor: rank.bg, border: `1px solid ${rank.border}` }}
                    data-testid="badge-rank-home"
                  >
                    Lv {levelInfo.level} · {rank.name}
                  </span>
                </div>
                {/* XP bar */}
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${rank.color}, ${C.goldBright})` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-white/25 shrink-0 tabular-nums">
                    {levelInfo.xpIntoLevel}/{levelInfo.xpNeeded} XP
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest">Chips</div>
                <div className="text-lg font-bold font-mono tabular-nums" style={{ color: C.gold }}>
                  ${totalChips.toLocaleString()}
                </div>
                {stats.handsPlayed > 0 && (
                  <div className={`text-[10px] font-mono font-bold tabular-nums ${totalNet >= 0 ? 'text-emerald-400/70' : 'text-red-400/60'}`}>
                    {totalNet >= 0 ? '+' : ''}${totalNet}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── DAILY BONUS / STREAK ──────────────────────────────────────── */}
          {rewardReady ? (
            <button
              onClick={() => setDailyOpen(true)}
              className="w-full rounded-2xl px-4 py-4 flex items-center gap-3.5 transition-all duration-200 active:scale-[0.99] group relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${C.goldDim}0.15) 0%, ${C.goldDim}0.06) 100%)`, border: `1px solid ${C.goldDim}0.35)` }}
              data-testid="button-claim-daily-home"
            >
              <div className="absolute inset-0 anim-shimmer pointer-events-none rounded-2xl opacity-60" />
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 anim-float-coin relative"
                style={{ backgroundColor: `${C.goldDim}0.12)`, border: `1px solid ${C.goldDim}0.25)` }}
              >
                🎁
              </div>
              <div className="flex-1 text-left relative">
                <div className="text-sm font-bold font-sans anim-jackpot" style={{ color: C.gold }}>
                  Daily Bonus Ready to Claim!
                </div>
                <div className="text-[11px] text-white/45 font-mono mt-0.5">
                  {streakInfo.streak > 0
                    ? `Day ${streakInfo.dayInCycle} streak 🔥 · `
                    : 'Start your winning streak · '}
                  <span style={{ color: C.emerald }} className="font-bold">
                    +${streakInfo.nextReward.chips.toLocaleString()} chips
                  </span>
                </div>
              </div>
              <div className="text-xl relative" style={{ color: C.gold }}>›</div>
            </button>
          ) : (
            <div
              className="w-full rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: '#0F0F13', border: `1px solid ${C.border}` }}
            >
              <div className="text-xl leading-none">
                {streakInfo.streak > 0 ? '🔥' : '⏰'}
              </div>
              <div>
                <div className="text-xs font-semibold font-sans text-white/45">
                  {streakInfo.streak > 0 ? `${streakInfo.streak}-Day Streak Active` : 'Daily Bonus'}
                </div>
                <div className="text-[10px] text-white/20 font-mono mt-0.5">
                  Claimed today · Come back tomorrow for +${(streakInfo.nextReward?.chips ?? 250).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* ── PRIZE POOL BAND ───────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            {/* Daily Jackpot */}
            <div
              className="rounded-xl p-3 flex flex-col items-center text-center"
              style={{ background: 'linear-gradient(135deg, rgba(240,184,41,0.10) 0%, rgba(240,184,41,0.04) 100%)', border: '1px solid rgba(240,184,41,0.20)' }}
            >
              <div className="text-base leading-none mb-1.5">🏅</div>
              <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-1">Daily Pot</div>
              <div className="text-sm font-bold font-mono tabular-nums anim-jackpot" style={{ color: C.gold }}>
                ${dailyJackpot.toLocaleString()}
              </div>
            </div>
            {/* Weekly Prize */}
            <div
              className="rounded-xl p-3 flex flex-col items-center text-center"
              style={{ background: 'linear-gradient(135deg, rgba(155,93,229,0.10) 0%, rgba(155,93,229,0.04) 100%)', border: '1px solid rgba(155,93,229,0.20)' }}
            >
              <div className="text-base leading-none mb-1.5">👑</div>
              <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-1">Weekly</div>
              <div className="text-sm font-bold font-mono tabular-nums" style={{ color: C.purple }}>
                ${weeklyPrize.toLocaleString()}
              </div>
            </div>
            {/* Streak multiplier */}
            <div
              className="rounded-xl p-3 flex flex-col items-center text-center"
              style={{ background: 'linear-gradient(135deg, rgba(0,200,150,0.10) 0%, rgba(0,200,150,0.04) 100%)', border: '1px solid rgba(0,200,150,0.20)' }}
            >
              <div className="text-base leading-none mb-1.5">⚡</div>
              <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-1">Streak</div>
              <div className="text-sm font-bold font-mono tabular-nums" style={{ color: C.emerald }}>
                {streakInfo.streak > 0 ? `${streakInfo.streak} days` : 'Start now'}
              </div>
            </div>
          </div>

          {/* ── SECTION HEADING ───────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-1">
            <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${C.goldDim}0.15))` }} />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/25">Choose Your Game</span>
            <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${C.goldDim}0.15), transparent)` }} />
          </div>

          {/* ── BADUGI HERO CARD (full width, multiplayer) ────────────────── */}
          {(() => {
            const mode = MODES[0]; // Badugi
            const chips = chipMap[mode.id] ?? 1000;
            const tableCount = getModeTableCount(mode.id);
            return (
              <button
                onClick={() => navigate(mode.path)}
                className="w-full text-left rounded-2xl relative overflow-hidden transition-all duration-200 active:scale-[0.99] group"
                style={{ background: mode.bg, border: `1px solid ${mode.border}` }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = mode.borderHover)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = mode.border)}
                data-testid={`button-mode-${mode.id}`}
              >
                {/* Background glow */}
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at 80% 50%, ${mode.glow}0.15) 0%, transparent 60%)` }} />
                <div className="absolute inset-0 anim-shimmer pointer-events-none opacity-40 rounded-2xl" />

                <div className="relative p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold font-mono shrink-0"
                      style={{ backgroundColor: `${mode.glow}0.15)`, border: `1px solid ${mode.glow}0.30)`, color: mode.color }}
                    >
                      {mode.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold text-white/90 font-sans" data-testid={`text-mode-name-${mode.id}`}>
                          {mode.name}
                        </span>
                        <span
                          className="text-[8px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                          style={{ color: '#00C896', backgroundColor: 'rgba(0,200,150,0.12)', border: '1px solid rgba(0,200,150,0.30)' }}
                        >
                          ⚡ Real Multiplayer
                        </span>
                      </div>
                      <div className="text-[11px] text-white/40 font-mono mt-0.5">{mode.tagline}</div>
                      <p className="text-sm text-white/55 mt-1.5 leading-snug">{mode.description}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: mode.color }} />
                        <span className="text-[10px] font-mono text-white/35">{tableCount} tables active</span>
                      </div>
                      <div className="text-[10px] font-mono text-white/25">·</div>
                      <div className="text-[10px] font-mono" style={{ color: mode.color + 'aa' }}>
                        {mode.prize}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-mono font-bold text-sm tabular-nums" style={{ color: mode.color }}>
                        ${chips.toLocaleString()}
                      </div>
                      <div
                        className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all duration-200 group-hover:opacity-100 opacity-80"
                        style={{ backgroundColor: mode.color, color: '#070709' }}
                      >
                        Play →
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })()}

          {/* ── 2-COLUMN GAME GRID ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2">
            {MODES.slice(1).map((mode) => {
              const chips = chipMap[mode.id] ?? 1000;
              const tableCount = getModeTableCount(mode.id);
              return (
                <button
                  key={mode.id}
                  onClick={() => navigate(mode.path)}
                  className="text-left rounded-2xl relative overflow-hidden transition-all duration-200 active:scale-[0.98] group"
                  style={{ background: mode.bg, border: `1px solid ${mode.border}` }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = mode.borderHover)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = mode.border)}
                  data-testid={`button-mode-${mode.id}`}
                >
                  {/* Inner glow */}
                  <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at top right, ${mode.glow}0.20) 0%, transparent 70%)` }} />

                  <div className="relative p-3.5">
                    <div className="flex items-center justify-between mb-2.5">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-bold font-mono text-sm"
                        style={{ backgroundColor: `${mode.glow}0.15)`, border: `1px solid ${mode.glow}0.25)`, color: mode.color }}
                      >
                        {mode.icon}
                      </div>
                      <div className="text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                        style={{ color: mode.color + '90', backgroundColor: `${mode.glow}0.06)`, border: `1px solid ${mode.glow}0.12)` }}>
                        {mode.difficulty}
                      </div>
                    </div>

                    <div className="font-bold text-sm text-white/85 font-sans mb-0.5" data-testid={`text-mode-name-${mode.id}`}>
                      {mode.name}
                    </div>
                    <div className="text-[10px] text-white/35 font-mono leading-tight mb-2">{mode.tagline}</div>

                    <div className="flex items-center justify-between">
                      <div className="font-mono font-bold text-sm tabular-nums" style={{ color: mode.color }}>
                        ${chips.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full" style={{ backgroundColor: mode.color + '60' }} />
                        <span className="text-[9px] font-mono text-white/20">{tableCount}</span>
                      </div>
                    </div>

                    <div className="mt-2 text-[9px] font-mono opacity-60" style={{ color: mode.color }}>
                      {mode.prize}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── MULTIPLAYER SPOTLIGHT ─────────────────────────────────────── */}
          <div
            className="w-full rounded-2xl p-4 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(0,200,150,0.08) 0%, rgba(155,93,229,0.08) 100%)', border: '1px solid rgba(0,200,150,0.18)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1">Real Multiplayer</div>
                <div className="text-base font-bold text-white/85 font-sans">Challenge Real Players</div>
                <p className="text-xs text-white/40 mt-1 leading-relaxed">
                  Create a private Badugi table and share the link. Your friends join instantly — no account needed.
                </p>
              </div>
              <div className="text-3xl shrink-0 anim-float-coin">♦️</div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => navigate('/badugi')}
                className="flex-1 h-10 rounded-xl text-sm font-bold transition-all duration-200 active:scale-[0.98]"
                style={{ backgroundColor: C.emerald, color: '#070709' }}
                data-testid="button-create-table"
              >
                Create Table
              </button>
              <button
                onClick={() => navigate('/badugi')}
                className="flex-1 h-10 rounded-xl text-sm font-bold border transition-all duration-200"
                style={{ backgroundColor: 'rgba(0,200,150,0.08)', border: '1px solid rgba(0,200,150,0.25)', color: C.emerald }}
                data-testid="button-browse-tables"
              >
                Join a Game
              </button>
            </div>
          </div>

          {/* ── LIVE FEED TICKER ──────────────────────────────────────────── */}
          <div
            className="w-full rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#0F0F13', border: `1px solid ${C.border}` }}
          >
            <div className="px-3 py-2 flex items-center gap-2 border-b" style={{ borderColor: C.border }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: C.emerald }} />
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/25">Live Feed</span>
            </div>
            <div className="relative overflow-hidden h-8">
              <div className="flex anim-ticker whitespace-nowrap absolute left-0 top-0 h-full items-center">
                {/* Double the items for seamless loop */}
                {[...feedItems, ...feedItems].map((item, i) => (
                  <span key={i} className="text-[10px] font-mono text-white/35 px-4 shrink-0">
                    <span style={{ color: C.emerald }} className="mr-1">•</span>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── PLAYER STATS STRIP ────────────────────────────────────────── */}
          {stats.handsPlayed > 0 && (
            <div
              className="rounded-2xl px-4 py-3 flex items-center justify-between gap-4"
              style={{ backgroundColor: '#0F0F13', border: `1px solid ${C.border}` }}
            >
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="text-center">
                  <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest">Hands</div>
                  <div className="text-sm font-bold font-mono text-white/60 tabular-nums">{stats.handsPlayed}</div>
                </div>
                <div className="w-px h-6 bg-white/[0.06]" />
                <div className="text-center">
                  <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest">Wins</div>
                  <div className="text-sm font-bold font-mono tabular-nums" style={{ color: C.emerald + 'bb' }}>{stats.wins}</div>
                </div>
                <div className="w-px h-6 bg-white/[0.06]" />
                <div className="text-center">
                  <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest">Net</div>
                  <div className={`text-sm font-bold font-mono tabular-nums ${totalNet >= 0 ? 'text-emerald-400/70' : 'text-red-400/60'}`}>
                    {totalNet >= 0 ? '+' : ''}${totalNet}
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate('/profile')}
                className="text-[10px] font-mono uppercase tracking-widest transition-colors shrink-0"
                style={{ color: `${C.gold}70` }}
                onMouseEnter={e => (e.currentTarget.style.color = C.gold)}
                onMouseLeave={e => (e.currentTarget.style.color = `${C.gold}70`)}
                data-testid="link-profile-strip"
              >
                Full Stats ›
              </button>
            </div>
          )}

          {/* ── BOTTOM NAV ────────────────────────────────────────────────── */}
          <div className="flex items-center justify-center gap-1 flex-wrap pt-1">
            {[
              { label: '🏆 Leaderboard', path: '/leaderboard', color: C.gold,    testId: 'link-leaderboard-footer' },
              { label: '💎 Shop',        path: '/shop',        color: C.purple,   testId: 'link-shop-footer' },
              { label: '👤 Profile',     path: '/profile',     color: 'rgba(255,255,255,0.25)', testId: 'link-profile-footer' },
            ].map(item => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="px-3 py-1.5 rounded-xl text-[10px] font-mono transition-all duration-200 hover:bg-white/[0.04]"
                style={{ color: item.color }}
                data-testid={item.testId}
              >
                {item.label}
              </button>
            ))}
            <a
              href="/terms"
              className="px-3 py-1.5 rounded-xl text-[10px] font-mono text-white/15 hover:text-white/30 transition-colors"
              data-testid="link-terms"
            >
              Terms
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
