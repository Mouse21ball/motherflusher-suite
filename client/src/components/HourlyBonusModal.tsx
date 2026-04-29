import { useState, useEffect } from 'react';
import {
  isHourlyReady, getHourlyCountdown, getHourlyBonusChips,
  claimHourlyBonus, getVipTier, DISCLAIMER,
} from '@/lib/retention';
import { saveChips, getChips } from '@/lib/persistence';
import { getLevelInfo, getProgression } from '@/lib/progression';

interface HourlyBonusModalProps {
  open: boolean;
  onClose: (chipsClaimed?: number) => void;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const MODES = ['badugi', 'dead7', 'fifteen35', 'suitspoker'];

export function HourlyBonusModal({ open, onClose }: HourlyBonusModalProps) {
  const progression = getProgression();
  const levelInfo   = getLevelInfo(progression.xp);
  const level       = levelInfo.level;
  const vip         = getVipTier(level);

  const [claimed,    setClaimed]    = useState(false);
  const [chipsGained, setChipsGained] = useState(0);
  const [animating,  setAnimating]  = useState(false);
  const [ready,      setReady]      = useState(() => isHourlyReady());
  const [countdown,  setCountdown]  = useState(() => getHourlyCountdown());

  useEffect(() => {
    if (!open) return;
    setReady(isHourlyReady());
    setCountdown(getHourlyCountdown());
    setClaimed(false);
    setChipsGained(0);
  }, [open]);

  useEffect(() => {
    if (!open || ready) return;
    const id = setInterval(() => {
      const remaining = getHourlyCountdown();
      setCountdown(remaining);
      if (remaining === 0) setReady(true);
    }, 1000);
    return () => clearInterval(id);
  }, [open, ready]);

  if (!open) return null;

  const chips = getHourlyBonusChips(level);

  const handleClaim = () => {
    if (animating || claimed || !ready) return;
    setAnimating(true);
    const earned = claimHourlyBonus(level);
    for (const modeId of MODES) {
      saveChips(modeId, getChips(modeId) + earned);
    }
    setTimeout(() => {
      setChipsGained(earned);
      setClaimed(true);
      setAnimating(false);
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => onClose(claimed ? chipsGained : undefined)}
      />
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#141417', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 0 48px rgba(0,0,0,0.6)' }}
      >
        <div
          className="absolute -top-12 left-1/2 -translate-x-1/2 w-36 h-36 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(240,184,41,0.14) 0%, transparent 70%)' }}
        />

        <div className="relative p-6 flex flex-col items-center gap-4">

          {/* Header */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-3xl leading-none">{claimed ? '⚡' : '⏰'}</div>
            <h2 className="text-lg font-bold text-white/90 font-sans" data-testid="text-hourly-title">
              {claimed ? 'Bonus Collected!' : 'Hourly Bonus'}
            </h2>
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ backgroundColor: vip.bg, border: `1px solid ${vip.border}` }}
            >
              <span className="text-xs">{vip.badge}</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: vip.color }}>
                {vip.name} VIP
              </span>
              {vip.hourlyBonusPct > 0 && (
                <span className="text-[9px] font-mono text-white/35">+{vip.hourlyBonusPct}% bonus</span>
              )}
            </div>
          </div>

          {/* Chip display */}
          {!claimed ? (
            <div
              className="w-full rounded-xl p-4 flex items-center justify-between"
              style={{ backgroundColor: '#1C1C20', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div>
                <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-1">Free Chips</div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-2xl font-bold font-mono tabular-nums"
                    style={{ color: '#F0B829' }}
                    data-testid="text-hourly-chips"
                  >
                    +${chips.toLocaleString()}
                  </span>
                  <span className="text-xs text-white/30 font-mono">chips</span>
                </div>
                {!ready && (
                  <div className="text-[11px] font-mono mt-1.5" style={{ color: 'rgba(240,184,41,0.5)' }}>
                    Ready in {formatCountdown(countdown)}
                  </div>
                )}
                {ready && (
                  <div className="text-[11px] font-mono mt-1.5 text-emerald-400/60">
                    Ready to collect now!
                  </div>
                )}
              </div>
              <div className="text-3xl leading-none">🪙</div>
            </div>
          ) : (
            <div
              className="w-full rounded-xl p-4 flex items-center justify-between"
              style={{ backgroundColor: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.20)' }}
            >
              <div>
                <div className="text-[10px] font-mono text-emerald-400/50 uppercase tracking-widest mb-1">Added to stack</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
                    +${chipsGained.toLocaleString()}
                  </span>
                  <span className="text-xs text-white/30 font-mono">chips</span>
                </div>
              </div>
              <span className="text-2xl">✅</span>
            </div>
          )}

          {/* CTA */}
          {!claimed ? (
            <button
              onClick={handleClaim}
              disabled={!ready || animating}
              className={[
                'w-full h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200',
                ready && !animating
                  ? 'text-[#05050A] hover:scale-[1.01] active:scale-[0.98]'
                  : 'bg-white/[0.04] text-white/20 border border-white/[0.06] cursor-not-allowed',
              ].join(' ')}
              style={ready && !animating ? {
                backgroundColor: '#F0B829',
                boxShadow: '0 4px 20px rgba(240,184,41,0.35)',
                letterSpacing: '0.5px',
              } : undefined}
              data-testid="button-claim-hourly"
            >
              {animating
                ? 'Collecting…'
                : ready
                ? 'Collect Bonus'
                : `Come back in ${formatCountdown(countdown)}`}
            </button>
          ) : (
            <button
              onClick={() => onClose(chipsGained)}
              className="w-full h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] font-semibold text-sm text-white/60 hover:text-white/80 transition-all duration-200"
              data-testid="button-close-hourly"
            >
              Back to Lobby →
            </button>
          )}

          {/* Compliance disclaimer */}
          <p
            className="text-[9px] font-mono text-white/20 text-center leading-relaxed"
            data-testid="text-hourly-disclaimer"
          >
            {DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  );
}
