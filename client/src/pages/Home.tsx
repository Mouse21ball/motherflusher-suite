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
import {
  isRewardAvailable,
  getStreakInfo,
  getSimulatedPlayerCount,
  getModeTableCount,
  getDailyRewardState,
} from '@/lib/dailyReward';
import { DailyRewardModal } from '@/components/DailyRewardModal';

// ─── Mode definitions ──────────────────────────────────────────────────────────

const MODES = [
  {
    id: 'badugi',
    name: 'Badugi',
    tagline: '4-Card Draw Poker',
    description: 'Draw and discard to build the perfect 4-suit hand. The OG prestige mode.',
    quickFacts: ['4 cards', '3 draws', 'High/Low split'],
    path: '/badugi',
    icon: '♦',
    accentColor: '#10B981',
    accentBg: 'rgba(16,185,129,0.08)',
    accentBorder: 'rgba(16,185,129,0.18)',
    accentHover: 'rgba(16,185,129,0.30)',
    isMultiplayer: true,
    difficulty: 'Classic Draw',
  },
  {
    id: 'dead7',
    name: 'Dead 7',
    tagline: 'High-Low Killer',
    description: 'Every 7 in your hand is instant death. High tension, brutal reads.',
    quickFacts: ['4 cards', '7s are dead', 'Flush scoops'],
    path: '/dead7',
    icon: '💀',
    accentColor: '#EF4444',
    accentBg: 'rgba(239,68,68,0.08)',
    accentBorder: 'rgba(239,68,68,0.18)',
    accentHover: 'rgba(239,68,68,0.28)',
    isMultiplayer: false,
    difficulty: 'Intermediate',
  },
  {
    id: 'fifteen35',
    name: '15 / 35',
    tagline: 'Hit or Bust',
    description: "Chase 15 or 35. Go over and you're out. Fast rounds, pure pressure.",
    quickFacts: ['Hit or Stay', 'J/Q/K = ½', 'Bust at 35'],
    path: '/fifteen35',
    icon: '15',
    accentColor: '#F59E0B',
    accentBg: 'rgba(245,158,11,0.08)',
    accentBorder: 'rgba(245,158,11,0.18)',
    accentHover: 'rgba(245,158,11,0.28)',
    isMultiplayer: false,
    difficulty: 'Easy to Learn',
  },
  {
    id: 'swing',
    name: 'Mother Flusher',
    tagline: 'Swing Poker',
    description: '5 hole cards. 15-card community board. Declare High, Low, or Swing for everything.',
    quickFacts: ['5 hole cards', '15-card board', 'Swing to scoop'],
    path: '/swing',
    icon: '⚡',
    accentColor: '#3B82F6',
    accentBg: 'rgba(59,130,246,0.08)',
    accentBorder: 'rgba(59,130,246,0.18)',
    accentHover: 'rgba(59,130,246,0.28)',
    isMultiplayer: false,
    difficulty: 'Signature Mode',
  },
  {
    id: 'suitspoker',
    name: 'Suits & Poker',
    tagline: 'Dual-Path Board',
    description: 'Fork the board, pick a path. Poker, Suits, or Swing your way to the pot.',
    quickFacts: ['5 hole cards', 'Split board', '3 declarations'],
    path: '/suitspoker',
    icon: '♠',
    accentColor: '#06B6D4',
    accentBg: 'rgba(6,182,212,0.08)',
    accentBorder: 'rgba(6,182,212,0.18)',
    accentHover: 'rgba(6,182,212,0.28)',
    isMultiplayer: false,
    difficulty: 'Advanced',
  },
] as const;

// ─── Sync XP from hand history ─────────────────────────────────────────────────
// On first load with the new progression system, baseline the hand count so we
// don't retroactively double-award XP. Existing players get a clean slate.

function syncXPFromHistory(): void {
  const history = getHandHistory();
  initProgressionBaseline(history.length);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [, navigate] = useLocation();

  // Player data
  const identity = ensurePlayerIdentity();
  const initials = getAvatarInitials(identity.name);
  const avatarColor = getAvatarColor(identity.avatarSeed);

  // Sync XP from history (no-op if already synced)
  useEffect(() => { syncXPFromHistory(); }, []);

  // Progression (re-read after sync)
  const [progression, setProgression] = useState(() => getProgression());
  const levelInfo = getLevelInfo(progression.xp);
  const rank = getRankForLevel(levelInfo.level);

  // Stats
  const chipMap = getAllChips();
  const stats = getPlayerStats();

  // Daily reward
  const [dailyOpen, setDailyOpen] = useState(false);
  const [rewardReady, setRewardReady] = useState(isRewardAvailable);
  const streakInfo = getStreakInfo();

  // Live player count — updates every 30 seconds
  const [playerCount, setPlayerCount] = useState(getSimulatedPlayerCount);
  useEffect(() => {
    const id = setInterval(() => setPlayerCount(getSimulatedPlayerCount()), 30000);
    return () => clearInterval(id);
  }, []);

  // New achievements to celebrate
  const [newAchievements, setNewAchievements] = useState<Achievement[]>(() => {
    const p = getProgression();
    return p.newAchievements.map(id => ACHIEVEMENT_MAP.get(id)!).filter(Boolean);
  });

  const handleDailyClose = useCallback(() => {
    setDailyOpen(false);
    setRewardReady(false);
    setProgression(getProgression());
  }, []);

  // Dismiss achievement toasts
  const dismissAchievement = useCallback((id: string) => {
    setNewAchievements(prev => prev.filter(a => a.id !== id));
    clearNewAchievements();
  }, []);

  const progressPct = Math.round(levelInfo.progress * 100);
  const totalNet = stats.totalChipChange;

  return (
    <div className="min-h-[100dvh] bg-[#0B0B0D] flex flex-col relative overflow-x-hidden">
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-[#C9A227]/[0.03] blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-64 h-64 rounded-full bg-emerald-500/[0.03] blur-3xl" />
      </div>

      {/* Achievement toasts */}
      {newAchievements.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {newAchievements.map(ach => (
            <div
              key={ach.id}
              className="flex items-center gap-3 rounded-xl bg-[#1C1C20] border border-[#C9A227]/25 px-4 py-3 shadow-xl cursor-pointer animate-slide-in-right"
              onClick={() => dismissAchievement(ach.id)}
              data-testid={`toast-achievement-${ach.id}`}
            >
              <span className="text-2xl leading-none">{ach.icon}</span>
              <div>
                <div className="text-[9px] text-[#C9A227]/60 font-mono uppercase tracking-widest">Achievement Unlocked</div>
                <div className="text-sm font-bold text-white/80 font-sans">{ach.name}</div>
                <div className="text-[10px] text-white/30">{ach.description}</div>
              </div>
              <div className="text-[10px] font-mono text-emerald-400/70 ml-2 shrink-0">+{ach.xpReward} XP</div>
            </div>
          ))}
        </div>
      )}

      {/* Daily reward modal */}
      <DailyRewardModal open={dailyOpen} onClose={handleDailyClose} />

      <div className="flex-1 flex flex-col items-center justify-start px-4 pt-6 pb-8 relative">
        <div className="w-full max-w-lg flex flex-col gap-3">

          {/* ── Top bar: player identity + live count ───────────────────────── */}
          <div className="flex items-center justify-between gap-3">
            {/* Player pill */}
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2.5 rounded-2xl bg-[#141417]/80 border border-white/[0.05] px-3 py-2 hover:border-white/[0.10] hover:bg-[#141417] transition-all duration-200 flex-1 min-w-0"
              data-testid="button-open-profile"
            >
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold font-mono text-white shrink-0"
                style={{ backgroundColor: avatarColor + '22', border: `1.5px solid ${rank.color}40` }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-white/80 font-sans truncate" data-testid="text-player-name">
                    {identity.name}
                  </span>
                  <span
                    className="text-[8px] font-mono px-1 py-0.5 rounded shrink-0"
                    style={{ color: rank.color, backgroundColor: rank.bg, border: `1px solid ${rank.border}` }}
                    data-testid="badge-rank-home"
                  >
                    Lv {levelInfo.level}
                  </span>
                </div>
                {/* XP bar */}
                <div className="h-0.5 rounded-full bg-white/[0.05] mt-1 overflow-hidden w-full">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%`, backgroundColor: rank.color }}
                  />
                </div>
              </div>
            </button>

            {/* Live player indicator */}
            <div className="flex items-center gap-1.5 rounded-2xl bg-[#141417]/80 border border-white/[0.05] px-3 py-2 shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
              <span className="text-[11px] font-mono text-white/40 tabular-nums" data-testid="text-live-count">
                {playerCount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* ── Daily bonus banner ─────────────────────────────────────────── */}
          {rewardReady ? (
            <button
              onClick={() => setDailyOpen(true)}
              className="w-full rounded-2xl bg-gradient-to-r from-[#C9A227]/10 to-[#C9A227]/5 border border-[#C9A227]/25 hover:border-[#C9A227]/40 px-4 py-3.5 flex items-center gap-3 transition-all duration-200 active:scale-[0.99] group"
              data-testid="button-claim-daily-home"
            >
              <div className="w-10 h-10 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/20 flex items-center justify-center text-xl shrink-0">
                🎁
              </div>
              <div className="flex-1 text-left">
                <div className="text-xs font-bold text-[#C9A227]/90 font-sans">Daily Bonus Ready!</div>
                <div className="text-[10px] text-white/35 font-mono mt-0.5">
                  {streakInfo.streak > 0
                    ? `Day ${streakInfo.dayInCycle} · ${streakInfo.streak}🔥 streak`
                    : 'Start your streak today'}
                  {' · '}
                  +${streakInfo.nextReward.chips.toLocaleString()} chips
                </div>
              </div>
              <div className="text-[#C9A227]/50 group-hover:text-[#C9A227]/80 transition-colors text-base">›</div>
            </button>
          ) : (
            <div className="w-full rounded-2xl bg-[#141417]/40 border border-white/[0.03] px-4 py-3 flex items-center gap-3">
              <div className="text-lg leading-none">
                {streakInfo.streak > 0 ? '🔥' : '⏰'}
              </div>
              <div>
                <div className="text-[10px] text-white/25 font-mono uppercase tracking-widest">
                  {streakInfo.streak > 0
                    ? `${streakInfo.streak}-day streak active`
                    : 'Daily bonus'}
                </div>
                <div className="text-[10px] text-white/20 font-mono mt-0.5">Claimed · Come back tomorrow</div>
              </div>
            </div>
          )}

          {/* ── Headline ───────────────────────────────────────────────────── */}
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/[0.04]" />
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#C9A227]/15 to-[#C9A227]/5 border border-[#C9A227]/12 flex items-center justify-center shadow-[0_0_20px_rgba(201,162,39,0.08)]">
                <span className="text-[#C9A227] font-bold text-base font-mono">PT</span>
              </div>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/[0.04]" />
            </div>
            <h1 className="text-xl font-bold text-white/85 tracking-tight font-sans" data-testid="text-app-title">
              Five Poker Games You Can't Play Anywhere Else
            </h1>
            <p className="text-white/25 text-[11px] font-mono mt-1 tracking-wide">
              {playerCount.toLocaleString()} players online right now
            </p>
          </div>

          {/* ── Mode cards ────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            {MODES.map((mode) => {
              const chips = chipMap[mode.id] ?? 1000;
              const tableCount = getModeTableCount(mode.id);

              return (
                <button
                  key={mode.id}
                  onClick={() => navigate(mode.path)}
                  className="w-full text-left rounded-2xl border transition-all duration-200 active:scale-[0.99] group overflow-hidden"
                  style={{
                    backgroundColor: mode.accentBg,
                    borderColor: mode.accentBorder,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = mode.accentHover)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = mode.accentBorder)}
                  data-testid={`button-mode-${mode.id}`}
                >
                  <div className="flex items-center gap-3.5 px-4 py-3.5">
                    {/* Icon */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center font-bold font-mono text-sm shrink-0"
                      style={{ backgroundColor: mode.accentColor + '18', border: `1px solid ${mode.accentColor}30`, color: mode.accentColor }}
                    >
                      {mode.icon}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-semibold text-white/85 font-sans" data-testid={`text-mode-name-${mode.id}`}>
                          {mode.name}
                        </span>
                        {mode.isMultiplayer && (
                          <span className="text-[8px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border text-emerald-400/80 border-emerald-500/25 bg-emerald-500/[0.07]">
                            Multiplayer
                          </span>
                        )}
                        <span
                          className="text-[8px] font-mono font-medium uppercase tracking-widest px-1.5 py-0.5 rounded border shrink-0"
                          style={{ color: mode.accentColor + 'aa', borderColor: mode.accentColor + '22', backgroundColor: mode.accentColor + '08' }}
                          data-testid={`badge-difficulty-${mode.id}`}
                        >
                          {mode.difficulty}
                        </span>
                      </div>
                      <p className="text-white/35 text-xs mt-0.5 line-clamp-1">{mode.description}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {mode.quickFacts.map((fact, i) => (
                          <span key={i} className="text-[9px] font-mono text-white/25 bg-white/[0.02] px-1.5 py-0.5 rounded border border-white/[0.03]">
                            {fact}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Right side: chips + activity */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="font-mono font-bold text-sm tabular-nums" style={{ color: mode.accentColor + 'cc' }} data-testid={`text-chips-${mode.id}`}>
                        ${chips.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-emerald-400/60" />
                        <span className="text-[9px] font-mono text-white/25">{tableCount} tables</span>
                      </div>
                      <div className="text-white/20 group-hover:text-white/45 transition-colors text-base leading-none">›</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Player stats strip ────────────────────────────────────────── */}
          {stats.handsPlayed > 0 && (
            <div className="rounded-2xl bg-[#141417]/60 border border-white/[0.04] px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-white/20 font-mono">
                  {stats.handsPlayed} {stats.handsPlayed === 1 ? 'hand' : 'hands'}
                </span>
                <span className="text-[10px] text-white/15">·</span>
                <span className="text-[10px] text-white/20 font-mono">W{stats.wins} L{stats.losses}</span>
                <span className="text-[10px] text-white/15">·</span>
                <span className={`text-[10px] font-mono font-bold ${totalNet > 0 ? 'text-emerald-400/60' : totalNet < 0 ? 'text-red-400/60' : 'text-white/20'}`}>
                  {totalNet >= 0 ? '+' : ''}${totalNet}
                </span>
              </div>
              <button
                onClick={() => navigate('/profile')}
                className="text-[10px] font-mono text-white/20 hover:text-white/45 uppercase tracking-widest transition-colors"
                data-testid="link-profile-strip"
              >
                Profile ›
              </button>
            </div>
          )}

          {/* ── Footer links ──────────────────────────────────────────────── */}
          <div className="text-center mt-2 flex items-center justify-center flex-wrap gap-x-3 gap-y-1">
            <button
              onClick={() => navigate('/leaderboard')}
              className="text-white/10 hover:text-white/35 text-[10px] font-mono transition-colors"
              data-testid="link-leaderboard-footer"
            >
              🏆 Leaderboard
            </button>
            <span className="text-white/[0.06]">·</span>
            <button
              onClick={() => navigate('/shop')}
              className="text-[#C9A227]/30 hover:text-[#C9A227]/60 text-[10px] font-mono transition-colors"
              data-testid="link-shop-footer"
            >
              ✦ Premium Shop
            </button>
            <span className="text-white/[0.06]">·</span>
            <button
              onClick={() => navigate('/profile')}
              className="text-white/10 hover:text-white/25 text-[10px] font-mono transition-colors"
              data-testid="link-profile-footer"
            >
              Profile & Achievements
            </button>
            <span className="text-white/[0.06]">·</span>
            <a href="/terms" className="text-white/10 hover:text-white/25 text-[10px] font-mono transition-colors" data-testid="link-terms">
              Terms
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
