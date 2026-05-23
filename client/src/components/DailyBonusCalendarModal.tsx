// ─── DailyBonusCalendarModal ──────────────────────────────────────────────────
// Server-authoritative 7-day rotating daily login bonus calendar.
// Fetches status from GET /api/players/:id/daily-bonus/status.
// Claims via POST /api/players/:id/daily-bonus/claim.

import { useState, useEffect, useRef, useCallback } from 'react';
import { ensurePlayerIdentity } from '@/lib/persistence';
import { apiUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';
import { DISCLAIMER } from '@/lib/retention';
import { useServerProfile } from '@/lib/useServerProfile';

// ── Reward schedule (mirrors server) ──────────────────────────────────────────
const SCHEDULE = [
  { day: 1, chips: 500,   stripes: 0,  label: 'Welcome back',  isJackpot: false },
  { day: 2, chips: 750,   stripes: 0,  label: '',              isJackpot: false },
  { day: 3, chips: 1_000, stripes: 0,  label: '',              isJackpot: false },
  { day: 4, chips: 1_500, stripes: 0,  label: '',              isJackpot: false },
  { day: 5, chips: 2_000, stripes: 5,  label: 'Stripes drop',  isJackpot: false },
  { day: 6, chips: 3_000, stripes: 0,  label: '',              isJackpot: false },
  { day: 7, chips: 5_000, stripes: 15, label: 'Streak payoff', isJackpot: true  },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────────
interface DailyBonusStatus {
  canClaim:             boolean;
  currentStreakDay:     number;
  nextClaimAvailableAt: string; // ISO timestamp
  todaysReward:         { chips: number; stripes: number };
}

interface ClaimResult {
  chipsGranted:      number;
  stripesGranted:    number;
  newStreakDay:       number;
  nextClaimAvailableAt: string;
  newChipBalance:    number;
  newStripesBalance: number;
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  onClaimed: (chipsGranted: number, stripesGranted: number, newChipBalance: number, newStripesBalance: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatCountdown(targetIso: string): string {
  const ms = new Date(targetIso).getTime() - Date.now();
  if (ms <= 0) return '0m';
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtChips(n: number): string {
  if (n >= 1000) return `${n / 1000}k`;
  return String(n);
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DailyBonusCalendarModal({ open, onClose, onClaimed }: Props) {
  const [status,    setStatus]    = useState<DailyBonusStatus | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [claiming,  setClaiming]  = useState(false);
  const [claimed,   setClaimed]   = useState<ClaimResult | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [countdown, setCountdown] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const identity = ensurePlayerIdentity();
  const { profile: serverProfile } = useServerProfile();

  // ── Fetch status when modal opens ──────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(apiUrl(`/api/players/${identity.id}/daily-bonus/status`));
      if (!r.ok) throw new Error(`${r.status}`);
      const data: DailyBonusStatus = await r.json();
      setStatus(data);
    } catch {
      setError('Could not load daily bonus. Try again.');
    } finally {
      setLoading(false);
    }
  }, [identity.id]);

  useEffect(() => {
    if (open) {
      setClaimed(null);
      setError(null);
      fetchStatus();
    }
  }, [open, fetchStatus]);

  // ── Live countdown ─────────────────────────────────────────────────────────
  useEffect(() => {
    const target = claimed?.nextClaimAvailableAt ?? status?.nextClaimAvailableAt;
    if (!target) return;
    const tick = () => setCountdown(formatCountdown(target));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status?.nextClaimAvailableAt, claimed?.nextClaimAvailableAt]);

  // ── Claim ──────────────────────────────────────────────────────────────────
  const handleClaim = async () => {
    if (claiming || !status?.canClaim) return;
    setClaiming(true);
    setError(null);
    try {
      const r = await apiFetch(apiUrl(`/api/players/${identity.id}/daily-bonus/claim`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (r.status === 409) {
        // Already claimed today — refresh status
        await fetchStatus();
        return;
      }
      if (!r.ok) throw new Error(`${r.status}`);
      const result: ClaimResult = await r.json();
      setClaimed(result);
      onClaimed(result.chipsGranted, result.stripesGranted, result.newChipBalance, result.newStripesBalance);
    } catch {
      setError('Claim failed — please try again.');
    } finally {
      setClaiming(false);
    }
  };

  if (!open) return null;

  // Derived display values
  const streakDay      = claimed?.newStreakDay ?? status?.currentStreakDay ?? 1;
  const canClaim       = !claimed && (status?.canClaim ?? false);
  const todayReward    = SCHEDULE[(streakDay - 1) % 7];
  const isGuest        = serverProfile ? !serverProfile.hasAuth : false;

  // Calendar rendering logic
  // When canClaim=true: streakDay is the day to be claimed (not yet claimed)
  // When canClaim=false (or just claimed): streakDay is the day that was/is claimed today
  const activeDay = streakDay;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={() => { if (!claiming) onClose(); }}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(160deg, #141417 0%, #0d0d10 100%)',
          border:     '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Gold top glow */}
        <div
          className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(201,162,39,0.18) 0%, transparent 70%)' }}
        />

        <div className="relative p-5 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span
                className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold"
                style={{ color: 'rgba(201,162,39,0.65)' }}
              >
                Daily Bonus
              </span>
              <h2 className="text-lg font-black text-white leading-none" data-testid="text-daily-bonus-title">
                {claimed ? 'Reward Claimed! 🎉' : canClaim ? 'Your Reward Awaits' : 'Come Back Tomorrow'}
              </h2>
            </div>
            <button
              onClick={() => { if (!claiming) onClose(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.05] hover:bg-white/10 text-white/40 hover:text-white/70 transition-all text-sm"
              data-testid="button-close-daily-bonus"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* ── 7-Day calendar grid ─────────────────────────────────────────── */}
          <div className="grid grid-cols-7 gap-1">
            {SCHEDULE.map((tier) => {
              const dayNum    = tier.day;
              const isPast    = dayNum < activeDay;
              const isToday   = dayNum === activeDay;
              const isFuture  = dayNum > activeDay;
              const isDay7    = dayNum === 7;

              let cardBg     = 'rgba(255,255,255,0.025)';
              let cardBorder = 'rgba(255,255,255,0.05)';
              let opacity    = 1;

              if (isPast) {
                cardBg     = 'rgba(201,162,39,0.08)';
                cardBorder = 'rgba(201,162,39,0.15)';
                opacity    = 0.55;
              } else if (isToday && !isFuture) {
                cardBg     = isDay7 ? 'rgba(201,162,39,0.18)' : 'rgba(201,162,39,0.12)';
                cardBorder = isDay7 ? 'rgba(201,162,39,0.55)' : 'rgba(201,162,39,0.40)';
              } else if (isFuture) {
                opacity = 0.38;
              }

              return (
                <div
                  key={dayNum}
                  className="flex flex-col items-center gap-0.5 rounded-lg py-1.5 px-0.5 transition-all relative"
                  style={{
                    background:  cardBg,
                    border:      `1px solid ${cardBorder}`,
                    opacity,
                    boxShadow:   isToday && isDay7 ? '0 0 10px rgba(201,162,39,0.25)' : undefined,
                  }}
                  data-testid={`day-card-${dayNum}`}
                >
                  {/* Day 7 label */}
                  {isDay7 && (
                    <span
                      className="text-[6px] font-mono font-black uppercase tracking-wider leading-none mb-0.5"
                      style={{ color: '#C9A227' }}
                    >
                      MAX
                    </span>
                  )}

                  {/* State icon */}
                  {isPast && (
                    <span className="text-[11px] leading-none" style={{ color: '#C9A227' }}>✓</span>
                  )}
                  {isToday && !claimed && (
                    <span className="text-[11px] leading-none">{isDay7 ? '👑' : '🎁'}</span>
                  )}
                  {isToday && claimed && (
                    <span className="text-[11px] leading-none">✅</span>
                  )}
                  {isFuture && (
                    <span className="text-[9px] font-mono text-white/30 leading-none">{dayNum}</span>
                  )}

                  {/* Chips */}
                  <span
                    className="text-[8px] font-mono font-bold leading-none"
                    style={{ color: isToday ? '#F0B829' : 'rgba(255,255,255,0.25)' }}
                  >
                    {fmtChips(tier.chips)}
                  </span>

                  {/* Stripes badge */}
                  {tier.stripes > 0 && (
                    <div className="flex items-center gap-0.5">
                      <img src="/stripes-icon.png" alt="" className="w-2.5 h-2.5 opacity-70" />
                      <span className="text-[7px] font-mono leading-none" style={{ color: '#a855f7' }}>
                        {tier.stripes}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Day 7 banner (shown when activeDay = 7 or always as preview) */}
          {activeDay === 7 && !claimed && (
            <div
              className="w-full rounded-xl px-3 py-1.5 text-center"
              style={{ background: 'rgba(201,162,39,0.10)', border: '1px solid rgba(201,162,39,0.25)' }}
            >
              <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em]" style={{ color: '#C9A227' }}>
                ⚡ Streak Reward — Day 7 ⚡
              </span>
            </div>
          )}

          {/* ── Loading state ───────────────────────────────────────────────── */}
          {loading && (
            <div className="flex items-center justify-center py-4">
              <span className="text-xs text-white/30 font-mono animate-pulse">Loading…</span>
            </div>
          )}

          {/* ── Error state ─────────────────────────────────────────────────── */}
          {error && !loading && (
            <div
              className="rounded-xl px-4 py-3 text-center"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}
            >
              <p className="text-xs text-red-400 font-mono">{error}</p>
              <button
                onClick={fetchStatus}
                className="mt-2 text-[10px] text-white/40 hover:text-white/70 font-mono underline transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* ── Reward panel (unclaimed) ────────────────────────────────────── */}
          {!loading && !error && status && !claimed && (
            <div
              className="w-full rounded-xl p-4"
              style={{ background: 'rgba(28,28,32,0.80)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {canClaim ? (
                <>
                  <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-2">
                    Day {activeDay} Reward
                  </div>
                  <div className="flex items-end gap-3">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className="text-3xl font-black font-mono tabular-nums"
                          style={{ color: '#F0B829' }}
                          data-testid="text-bonus-chips-today"
                        >
                          +{todayReward.chips.toLocaleString()}
                        </span>
                        <span className="text-xs text-white/30 font-mono">chips</span>
                      </div>
                      {todayReward.stripes > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <img src="/stripes-icon.png" alt="" className="w-4 h-4" />
                          <span className="text-lg font-black font-mono" style={{ color: '#a855f7' }}>
                            +{todayReward.stripes}
                          </span>
                          <span className="text-xs text-white/30 font-mono">Stripes</span>
                        </div>
                      )}
                    </div>
                    {todayReward.isJackpot && <span className="text-4xl ml-auto">👑</span>}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1 py-1">
                  <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                    Next bonus in
                  </div>
                  <div
                    className="text-2xl font-black font-mono tabular-nums"
                    style={{ color: 'rgba(201,162,39,0.70)' }}
                    data-testid="text-bonus-countdown"
                  >
                    {countdown || '…'}
                  </div>
                  <div className="text-[10px] font-mono text-white/20 mt-0.5">
                    Day {activeDay} reward: +{todayReward.chips.toLocaleString()} chips
                    {todayReward.stripes > 0 ? ` + ${todayReward.stripes} Stripes` : ''}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Claim celebration (after claiming) ─────────────────────────── */}
          {claimed && (
            <div
              className="w-full rounded-xl p-4 flex flex-col gap-2"
              style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(201,162,39,0.06) 100%)',
                border:     '1px solid rgba(16,185,129,0.20)',
              }}
              data-testid="panel-claim-success"
            >
              <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'rgba(16,185,129,0.60)' }}>
                Added to your stack
              </div>
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="text-3xl font-black font-mono tabular-nums"
                      style={{ color: '#10b981' }}
                      data-testid="text-claimed-chips"
                    >
                      +{claimed.chipsGranted.toLocaleString()}
                    </span>
                    <span className="text-xs text-white/30 font-mono">chips</span>
                  </div>
                  {claimed.stripesGranted > 0 && (
                    <div className="flex items-center gap-1">
                      <img src="/stripes-icon.png" alt="" className="w-4 h-4" />
                      <span
                        className="text-xl font-black font-mono"
                        style={{ color: '#a855f7' }}
                        data-testid="text-claimed-stripes"
                      >
                        +{claimed.stripesGranted}
                      </span>
                      <span className="text-xs text-white/30 font-mono">Stripes</span>
                    </div>
                  )}
                </div>
                <span className="text-3xl ml-auto">✅</span>
              </div>
              <div className="flex flex-col gap-0.5 mt-1 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-[9px] font-mono text-white/20">
                  New balance: {claimed.newChipBalance.toLocaleString()} chips
                  {claimed.stripesGranted > 0 ? ` · ${claimed.newStripesBalance} Stripes` : ''}
                </div>
                <div className="text-[9px] font-mono" style={{ color: 'rgba(201,162,39,0.40)' }}>
                  Next bonus in {countdown || '…'}
                </div>
              </div>
            </div>
          )}

          {/* ── CTA button ──────────────────────────────────────────────────── */}
          {!loading && !error && (
            <>
              {canClaim && !claimed && (
                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full h-13 rounded-xl font-black text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.98]"
                  style={{
                    background:  claiming
                      ? 'rgba(201,162,39,0.40)'
                      : activeDay === 7
                        ? 'linear-gradient(135deg, #F0B829, #C9A227, #F0B829)'
                        : 'linear-gradient(135deg, #F0B829, #C9A227)',
                    color:       '#0B0B0D',
                    boxShadow:   claiming ? 'none' : '0 4px 20px rgba(240,184,41,0.38)',
                    cursor:      claiming ? 'not-allowed' : 'pointer',
                    padding:     '14px',
                  }}
                  data-testid="button-claim-daily-bonus"
                >
                  {claiming
                    ? 'Claiming…'
                    : activeDay === 7
                      ? '👑 Claim Day 7 Reward!'
                      : `⚡ Claim Day ${activeDay} Reward`}
                </button>
              )}

              {(!canClaim || claimed) && (
                <button
                  onClick={onClose}
                  className="w-full h-12 rounded-xl font-semibold text-sm transition-all duration-200 hover:bg-white/[0.07]"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border:     '1px solid rgba(255,255,255,0.07)',
                    color:      'rgba(255,255,255,0.55)',
                  }}
                  data-testid="button-close-daily-bonus-done"
                >
                  {claimed ? 'Let\'s Play →' : 'Close'}
                </button>
              )}
            </>
          )}

          {/* ── Guest notice ────────────────────────────────────────────────── */}
          {isGuest && (
            <div
              className="flex items-start gap-2 rounded-xl px-3 py-2"
              style={{ background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.15)' }}
            >
              <span className="text-sm leading-none mt-0.5">💡</span>
              <p className="text-[10px] font-mono leading-relaxed" style={{ color: 'rgba(168,85,247,0.70)' }}>
                You're playing as a guest. Save your progress to keep your streak permanent — guest accounts reset every 24 hours.
              </p>
            </div>
          )}

          {/* Compliance */}
          <p className="text-[9px] font-mono text-white/15 text-center leading-relaxed">
            {DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  );
}
