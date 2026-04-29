import { useState, useEffect } from 'react';
import { claimDailyReward, isRewardAvailable, DAILY_REWARD_TIERS, getStreakInfo, type DailyRewardTier } from '@/lib/dailyReward';
import { awardDailyXP, getLevelInfo, getProgression } from '@/lib/progression';
import { saveChips, getChips } from '@/lib/persistence';
import { getVipTier, DISCLAIMER } from '@/lib/retention';

interface DailyRewardModalProps {
  open: boolean;
  onClose: (reward?: DailyRewardTier) => void;
  modeIds?: string[];
}

const STREAK_FLAMES = ['', '🔥', '🔥🔥', '🔥🔥🔥', '⚡🔥⚡', '⚡⚡🔥⚡⚡', '💥🔥💥', '👑'];

export function DailyRewardModal({ open, onClose }: DailyRewardModalProps) {
  const [claimed, setClaimed] = useState<DailyRewardTier | null>(null);
  const [animating, setAnimating] = useState(false);
  const [streakInfo, setStreakInfo] = useState(getStreakInfo);
  const progression = getProgression();
  const levelInfo   = getLevelInfo(progression.xp);
  const vip         = getVipTier(levelInfo.level);

  useEffect(() => {
    if (open) setStreakInfo(getStreakInfo());
  }, [open]);

  if (!open) return null;

  const todayReward = DAILY_REWARD_TIERS[(streakInfo.dayInCycle - 1) % 7];

  const handleClaim = () => {
    if (animating || claimed) return;
    setAnimating(true);
    const reward = claimDailyReward();

    // Apply chips across all modes
    const modes = ['badugi', 'dead7', 'fifteen35', 'suitspoker'];
    for (const modeId of modes) {
      saveChips(modeId, getChips(modeId) + reward.chips);
    }
    // Award XP
    awardDailyXP(reward.xp);

    setTimeout(() => {
      setClaimed(reward);
      setAnimating(false);
    }, 600);
  };

  const flameStr = STREAK_FLAMES[Math.min(streakInfo.streak, 7)] || '🔥';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { if (claimed) onClose(claimed ?? undefined); }} />

      <div className="relative w-full max-w-sm rounded-2xl bg-[#141417] border border-white/[0.08] shadow-2xl overflow-hidden">
        {/* Glow */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-[#C9A227]/8 blur-2xl pointer-events-none" />

        <div className="relative p-6 flex flex-col items-center gap-4">
          {/* Header */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-3xl leading-none">{claimed ? '🎉' : '🎁'}</div>
            <h2 className="text-lg font-bold text-white/90 font-sans" data-testid="text-daily-title">
              {claimed ? 'Reward Claimed!' : 'Daily Bonus'}
            </h2>
            {streakInfo.streak > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono text-white/35 uppercase tracking-widest">
                  {streakInfo.streak} day streak
                </span>
                <span className="text-sm leading-none">{flameStr}</span>
              </div>
            )}
            {/* VIP tier badge */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full mt-0.5"
              style={{ backgroundColor: vip.bg, border: `1px solid ${vip.border}` }}
            >
              <span className="text-xs">{vip.badge}</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: vip.color }}>
                {vip.name} VIP
              </span>
              {vip.dailyBonusPct > 0 && (
                <span className="text-[9px] font-mono text-white/35">+{vip.dailyBonusPct}% bonus</span>
              )}
            </div>
          </div>

          {/* 7-day tracker */}
          <div className="w-full grid grid-cols-7 gap-1">
            {DAILY_REWARD_TIERS.map((tier, i) => {
              const dayNum = i + 1;
              const isPast = dayNum < streakInfo.dayInCycle;
              const isToday = dayNum === streakInfo.dayInCycle;
              const isFuture = dayNum > streakInfo.dayInCycle;
              return (
                <div
                  key={tier.day}
                  className={[
                    'flex flex-col items-center gap-0.5 rounded-lg py-1.5 px-1 border transition-all',
                    isPast  ? 'bg-[#C9A227]/10 border-[#C9A227]/20 opacity-50' : '',
                    isToday ? 'bg-[#C9A227]/15 border-[#C9A227]/40 ring-1 ring-[#C9A227]/30' : '',
                    isFuture ? 'bg-white/[0.02] border-white/[0.04] opacity-40' : '',
                  ].join(' ')}
                  data-testid={`day-reward-${dayNum}`}
                >
                  {isPast && <span className="text-base leading-none">✓</span>}
                  {isToday && <span className="text-base leading-none">{tier.isJackpot ? '👑' : '🎁'}</span>}
                  {isFuture && <span className="text-[9px] text-white/30 font-mono leading-none mt-0.5">{dayNum}</span>}
                  <span className={`text-[8px] font-mono leading-none ${isToday ? 'text-[#C9A227]' : 'text-white/25'}`}>
                    {isPast ? '' : `$${tier.chips >= 1000 ? `${tier.chips / 1000}k` : tier.chips}`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Reward display */}
          {!claimed ? (
            <div className="w-full rounded-xl bg-[#1C1C20] border border-white/[0.06] p-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest mb-1">Today's reward</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-[#C9A227] tabular-nums" data-testid="text-reward-chips">
                    +${todayReward.chips.toLocaleString()}
                  </span>
                  <span className="text-xs text-white/30 font-mono">chips</span>
                </div>
                <div className="text-xs text-emerald-400/60 font-mono mt-0.5">+{todayReward.xp} XP</div>
              </div>
              {todayReward.isJackpot && (
                <div className="text-4xl leading-none">👑</div>
              )}
            </div>
          ) : (
            <div className="w-full rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-emerald-400/50 font-mono uppercase tracking-widest mb-1">Added to your stack</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                    +${claimed.chips.toLocaleString()}
                  </span>
                  <span className="text-xs text-white/30 font-mono">chips</span>
                </div>
                <div className="text-xs text-emerald-400/60 font-mono mt-0.5">+{claimed.xp} XP awarded</div>
              </div>
              <span className="text-2xl">✅</span>
            </div>
          )}

          {/* CTA */}
          {!claimed ? (
            <button
              onClick={handleClaim}
              disabled={animating}
              className={[
                'w-full h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200',
                'bg-[#C9A227] text-[#0B0B0D] hover:bg-[#D4B44A] active:scale-[0.98]',
                'shadow-[0_2px_16px_rgba(201,162,39,0.3)]',
                animating ? 'opacity-70 cursor-not-allowed' : '',
              ].join(' ')}
              data-testid="button-claim-daily"
            >
              {animating ? 'Claiming…' : todayReward.isJackpot ? '🎉 Claim Jackpot!' : 'Claim Reward'}
            </button>
          ) : (
            <button
              onClick={() => onClose(claimed)}
              className="w-full h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] font-semibold text-sm text-white/60 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-200"
              data-testid="button-close-daily"
            >
              Let's Play →
            </button>
          )}

          {/* Come back reminder */}
          {claimed && (
            <p className="text-[10px] text-white/20 font-mono text-center tracking-wide">
              Come back tomorrow for day {(streakInfo.dayInCycle % 7) + 1} of your streak!
            </p>
          )}

          {/* Compliance disclaimer */}
          <p
            className="text-[9px] font-mono text-white/20 text-center leading-relaxed"
            data-testid="text-daily-disclaimer"
          >
            {DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  );
}
