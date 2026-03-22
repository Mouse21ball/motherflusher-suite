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
    color: '#DC2626',
    glow: 'rgba(220,38,38,',
    bg: 'linear-gradient(135deg, rgba(220,38,38,0.12) 0%, rgba(220,38,38,0.03) 100%)',
    border: 'rgba(220,38,38,0.22)',
    borderHover: 'rgba(220,38,38,0.55)',
    isMultiplayer: true,
    isHero: false,
    badge: '⛓️ Up to 5',
    badgeColor: 'rgba(220,38,38,',
    difficulty: 'Cutthroat',
  },
  {
    id: 'fifteen35',
    name: '15 / 35',
    tagline: 'Hit or go home',
    description: 'Chase 15 or 35 exactly. Go over and you bust — just like crossing the wrong line.',
    path: '/fifteen35',
    icon: '15',
    color: '#F0B829',
    glow: 'rgba(240,184,41,',
    bg: 'linear-gradient(135deg, rgba(240,184,41,0.12) 0%, rgba(240,184,41,0.03) 100%)',
    border: 'rgba(240,184,41,0.22)',
    borderHover: 'rgba(240,184,41,0.55)',
    isMultiplayer: true,
    isHero: false,
    badge: '⛓️ Up to 5',
    badgeColor: 'rgba(240,184,41,',
    difficulty: 'Easy Hustle',
  },
  {
    id: 'swing',
    name: 'Mother Flusher',
    tagline: 'Swing or go broke',
    description: '5 cards, 15-card board. Declare High, Low, or Swing all. The signature Chain Gang move.',
    path: '/swing',
    icon: '⚡',
    color: '#9B5DE5',
    glow: 'rgba(155,93,229,',
    bg: 'linear-gradient(135deg, rgba(155,93,229,0.12) 0%, rgba(155,93,229,0.03) 100%)',
    border: 'rgba(155,93,229,0.22)',
    borderHover: 'rgba(155,93,229,0.55)',
    isMultiplayer: true,
    isHero: false,
    badge: '⚡ Signature · Up to 5',
    badgeColor: 'rgba(155,93,229,',
    difficulty: 'Signature',
  },
  {
    id: 'suitspoker',
    name: 'Suits & Poker',
    tagline: 'Two paths, one winner',
    description: 'Fork the board. Pick Poker, Suits, or Swing both to scoop the whole pot.',
    path: '/suitspoker',
    icon: '♠',
    color: '#06B6D4',
    glow: 'rgba(6,182,212,',
    bg: 'linear-gradient(135deg, rgba(6,182,212,0.12) 0%, rgba(6,182,212,0.03) 100%)',
    border: 'rgba(6,182,212,0.22)',
    borderHover: 'rgba(6,182,212,0.55)',
    isMultiplayer: true,
    isHero: false,
    badge: '⛓️ Up to 5',
    badgeColor: 'rgba(6,182,212,',
    difficulty: 'Advanced',
  },
] as const;

// ─── Live feed ────────────────────────────────────────────────────────────────

const FEED_TEMPLATES = [
  (n: string) => `${n} scooped a $420 Mother Flusher pot ⛓️`,
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
  const rank      = getRankForLevel(levelInfo.level);

  const chipMap    = getAllChips();
  const stats      = getPlayerStats();
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
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(240,184,41,0.16) 0%, transparent 70%)' }} />
        <div className="absolute top-1/3 -right-32 w-80 h-80 rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(0,200,150,0.08) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 -left-20 w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(255,107,0,0.06) 0%, transparent 70%)' }} />
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

      <DailyRewardModal open={dailyOpen} onClose={handleDailyClose} />

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 w-full px-4 py-2.5 flex items-center gap-3 border-b"
        style={{ backgroundColor: 'rgba(5,5,10,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.05)' }}
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
        <div className="w-full max-w-lg px-4 pt-5 pb-10 flex flex-col gap-4">

          {/* ── PLAYER CARD ───────────────────────────────────────────────── */}
          <div
            className="w-full rounded-2xl p-4 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, rgba(240,184,41,0.09) 0%, rgba(255,107,0,0.04) 60%, rgba(0,200,150,0.04) 100%)`,
              border: `1px solid rgba(240,184,41,0.18)`,
              boxShadow: '0 0 30px rgba(240,184,41,0.05)',
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
                    Lv {levelInfo.level} · {rank.name}
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
                <div className="text-lg font-bold font-mono tabular-nums" style={{ color: C.gold }}>${totalChips.toLocaleString()}</div>
                {stats.handsPlayed > 0 && (
                  <div className={`text-[10px] font-mono font-bold tabular-nums ${totalNet >= 0 ? 'text-emerald-400/70' : 'text-red-400/60'}`}>
                    {totalNet >= 0 ? '+' : ''}${totalNet}
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
            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(240,184,41,0.12))' }} />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/20">⛓️ The Games</span>
            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(240,184,41,0.12), transparent)' }} />
          </div>

          {/* ── BADUGI HERO CARD ──────────────────────────────────────────── */}
          {(() => {
            const mode  = MODES[0];
            const chips = chipMap[mode.id] ?? 1000;
            const tbl   = getModeTableCount(mode.id);
            return (
              <button
                onClick={() => navigate(mode.path)}
                className="w-full text-left rounded-2xl relative overflow-hidden transition-all duration-200 active:scale-[0.99] group"
                style={{ background: mode.bg, border: `1px solid ${mode.border}` }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = mode.borderHover)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = mode.border)}
                data-testid={`button-mode-${mode.id}`}
              >
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at 80% 50%, ${mode.glow}0.12) 0%, transparent 65%)` }} />
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
                      <div className="text-[11px] font-mono mt-0.5" style={{ color: mode.color + 'aa' }}>{mode.tagline}</div>
                      <p className="text-sm text-white/50 mt-1.5 leading-snug">{mode.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: mode.color }} />
                        <span className="text-[10px] font-mono text-white/30">{tbl} tables live</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-mono font-bold text-sm tabular-nums" style={{ color: mode.color }}>${chips.toLocaleString()}</div>
                      <div className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all duration-200"
                        style={{ backgroundColor: mode.color, color: '#05050A' }}>
                        Play →
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })()}

          {/* ── 2-COLUMN GRID ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2">
            {MODES.slice(1).map(mode => {
              const chips = chipMap[mode.id] ?? 1000;
              const tbl   = getModeTableCount(mode.id);
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
                    <div className="text-[10px] font-mono leading-tight mb-2" style={{ color: mode.color + '90' }}>{mode.tagline}</div>
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
                <div className="text-base font-bold text-white/85 font-sans">Run it with Your Crew</div>
                <p className="text-xs text-white/40 mt-1 leading-relaxed">
                  All 5 games support real multiplayer — up to 5 players per table. Pick a game, share your link. No account, no download.
                </p>
              </div>
              <div className="text-3xl shrink-0 anim-float-coin">⛓️</div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => navigate('/badugi')}
                className="flex-1 h-10 rounded-xl text-sm font-bold transition-all duration-200 active:scale-[0.98]"
                style={{ backgroundColor: C.emerald, color: '#05050A' }}
                data-testid="button-create-table"
              >
                Create Table
              </button>
              <button
                onClick={() => navigate('/swing')}
                className="flex-1 h-10 rounded-xl text-sm font-bold border transition-all duration-200"
                style={{ backgroundColor: 'rgba(155,93,229,0.07)', border: '1px solid rgba(155,93,229,0.22)', color: C.purple }}
                data-testid="button-browse-tables"
              >
                Mother Flusher
              </button>
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
          </div>

        </div>
      </div>
    </div>
  );
}
