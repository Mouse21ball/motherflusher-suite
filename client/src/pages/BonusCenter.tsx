import { useState, useEffect, useCallback } from 'react';
import { track } from '@/lib/analytics';
import { useLocation } from 'wouter';
import {
  isHourlyReady, getHourlyCountdown, getHourlyBonusChips,
  shouldShowStarterPack, getVipTier,
  VIP_TIERS, DISCLAIMER,
} from '@/lib/retention';
import { getLevelInfo, getProgression, xpForLevel } from '@/lib/progression';
import { useServerProfile } from '@/lib/useServerProfile';
import { useBonusStatus } from '@/lib/useBonusStatus';
import { HourlyBonusModal } from '@/components/HourlyBonusModal';
import { StarterPackModal } from '@/components/StarterPackModal';
import { Award, Check, Clock3, Gift, Smile, TrendingUp, Zap } from 'lucide-react';
import { YardBottomNav } from '@/components/YardBottomNav';
import '@/yard-reskin.css';

const GOLD  = '#FBBF24';
const PINK  = '#EF4444';

function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/30 mb-2.5">{children}</div>
  );
}

function NotifDot() {
  return (
    <span
      className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#05050A]"
      style={{ backgroundColor: PINK }}
    />
  );
}

export default function BonusCenter() {
  const [, navigate] = useLocation();

  const progression = getProgression();
  const { profile: serverProfile } = useServerProfile();
  const bonusStatus = useBonusStatus();
  const levelInfo   = getLevelInfo(serverProfile?.xp ?? 0);
  const level       = levelInfo.level;
  const vip         = getVipTier(level);

  const [hourlyOpen,  setHourlyOpen]  = useState(false);
  const [starterOpen, setStarterOpen] = useState(false);

  const [hourlyReady, setHourlyReady] = useState(false);
  const [starterAvailable, setStarterAvailable] = useState(false);
  const [countdown,   setCountdown]   = useState(() => getHourlyCountdown());

  useEffect(() => {
    setHourlyReady(bonusStatus?.hourly.available ?? false);
    setStarterAvailable(bonusStatus?.welcomeKitClaimed === false);
  }, [bonusStatus]);

  useEffect(() => { track({ name: 'bonus_page_visited' }); }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const remaining = bonusStatus?.hourly.nextAt
        ? Math.max(0, new Date(bonusStatus.hourly.nextAt).getTime() - Date.now()) : 0;
      setCountdown(remaining);
      if (bonusStatus && remaining === 0 && bonusStatus.hourly.available) setHourlyReady(true);
    }, 1000);
    return () => clearInterval(id);
  }, [bonusStatus]);

  const handleHourlyClose = useCallback(() => {
    setHourlyOpen(false);
    setHourlyReady(false);
    setCountdown(3600000);
  }, []);

  const handleStarterClose = useCallback(() => {
    setStarterOpen(false);
    setStarterAvailable(false);
  }, []);

  const hourlyChips = bonusStatus?.hourly.chips ?? getHourlyBonusChips(level);

  // VIP progress to next tier
  const nextTierInfo = vip.nextLevel != null
    ? { level: vip.nextLevel, xpNeeded: xpForLevel(vip.nextLevel) - (serverProfile?.xp ?? 0) }
    : null;
  const vipProgressPct = vip.nextLevel != null
    ? Math.min(100, Math.round(
        ((level - vip.minLevel) / (vip.nextLevel - vip.minLevel)) * 100
      ))
    : 100;

  return (
    <div className="yard-bonus-page yard-page min-h-[100dvh] flex flex-col">

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(240,184,41,0.14) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(255,20,147,0.07) 0%, transparent 70%)' }} />
      </div>

      {/* Header */}
      <header
        className="sticky top-0 z-40 w-full px-4 py-3 flex items-center gap-3 border-b"
        style={{ backgroundColor: 'rgba(5,5,10,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="text-[10px] font-mono text-white/30 hover:text-white/60 uppercase tracking-widest transition-colors"
          data-testid="link-back-home-bonus"
        >
          ‹ Lobby
        </button>
        <span className="text-white/10">·</span>
        <div className="flex items-center gap-1.5">
          <Zap size={16} color="#FBBF24" aria-hidden="true" />
          <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Bonus Center</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ backgroundColor: vip.bg, border: `1px solid ${vip.border}` }}>
          <span aria-label={`${vip.name} VIP tier`} className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FBBF24] text-xs font-black text-[#150A2E]">{vip.name.slice(0, 1)}</span>
          <span className="text-[10px] font-mono font-bold" style={{ color: vip.color }}>{vip.name}</span>
        </div>
      </header>

      {/* Modals */}
      <HourlyBonusModal open={hourlyOpen} onClose={handleHourlyClose} />
      <StarterPackModal open={starterOpen} onClose={handleStarterClose} />

      <div className="flex-1 flex flex-col items-center relative">
        <div className="w-full max-w-lg px-4 pt-5 pb-10 flex flex-col gap-5">

          {/* ── HOURLY BONUS ───────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Hourly Bonus</SectionLabel>
            <button
              onClick={() => setHourlyOpen(true)}
              className="w-full rounded-2xl p-4 flex items-center gap-4 transition-all duration-200 active:scale-[0.99] relative overflow-hidden text-left"
              style={
                hourlyReady
                  ? { background: 'linear-gradient(135deg, rgba(240,184,41,0.12) 0%, rgba(240,184,41,0.04) 100%)', border: '1px solid rgba(240,184,41,0.35)' }
                  : { backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.05)' }
              }
              data-testid="button-hourly-bonus-center"
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 relative"
                style={{
                  backgroundColor: hourlyReady ? 'rgba(240,184,41,0.12)' : 'rgba(255,255,255,0.04)',
                  border: hourlyReady ? '1px solid rgba(240,184,41,0.25)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {hourlyReady ? <Zap size={26} color="#FBBF24" /> : <Clock3 size={26} color="#C4B5FD" />}
                {hourlyReady && <NotifDot />}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="font-bold text-sm font-sans"
                  style={{ color: hourlyReady ? GOLD : 'rgba(255,255,255,0.5)' }}
                >
                  {hourlyReady ? 'Hourly Bonus Ready!' : 'Hourly Bonus'}
                </div>
                <div className="text-[11px] font-mono text-white/40 mt-0.5">
                  {hourlyReady
                    ? `+${hourlyChips.toLocaleString()} chips available now`
                    : `Next bonus in ${formatCountdown(countdown)}`}
                </div>
                {vip.hourlyBonusPct > 0 && (
                  <div className="text-[10px] font-mono mt-1" style={{ color: vip.color + 'aa' }}>
                    {vip.name} VIP: +{vip.hourlyBonusPct}% bonus applied
                  </div>
                )}
              </div>
              <div className="text-white/30 text-lg shrink-0">›</div>
            </button>
          </div>

          {/* ── STARTER KIT ────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Starter Kit</SectionLabel>
            {starterAvailable ? (
              <button
                onClick={() => setStarterOpen(true)}
                className="w-full rounded-2xl p-4 flex items-center gap-4 transition-all duration-200 active:scale-[0.99] relative overflow-hidden text-left"
                style={{ background: 'linear-gradient(135deg, rgba(240,184,41,0.12) 0%, rgba(255,107,0,0.06) 100%)', border: '1px solid rgba(240,184,41,0.30)' }}
                data-testid="button-starter-bonus-center"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 relative"
                  style={{ backgroundColor: 'rgba(240,184,41,0.10)', border: '1px solid rgba(240,184,41,0.22)' }}
                >
                  <Gift size={26} color="#FBBF24" />
                  <NotifDot />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm font-sans" style={{ color: GOLD }}>
                    New Player Advantage Kit
                  </div>
                  <div className="text-[11px] font-mono text-white/40 mt-0.5">
                    2,500 chips · badge · emotes · time bank — unclaimed
                  </div>
                  <div
                    className="mt-1.5 inline-flex text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                    style={{ backgroundColor: 'rgba(240,184,41,0.15)', color: 'rgba(240,184,41,0.8)' }}
                  >
                    One-time free claim
                  </div>
                </div>
                <div className="text-white/30 text-lg shrink-0">›</div>
              </button>
            ) : (
              <div
                className="w-full rounded-2xl p-4 flex items-center gap-4"
                style={{ backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.04)' }}
                data-testid="status-starter-claimed"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ backgroundColor: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.16)' }}
                >
                  <Check size={26} color="#22C55E" />
                </div>
                <div>
                  <div className="font-bold text-sm text-white/55 font-sans">Starter Kit Claimed</div>
                  <div className="text-[11px] font-mono text-white/25 mt-0.5">
                    2,500 chips already added to your stack
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── VIP TIER ───────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>VIP Tier Progress</SectionLabel>
            <div
              className="w-full rounded-2xl p-4 flex flex-col gap-3"
              style={{ backgroundColor: '#0D0D14', border: `1px solid ${vip.border}` }}
              data-testid="section-vip-tier"
            >
              {/* Current tier */}
              <div className="flex items-center gap-3">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ backgroundColor: vip.bg, border: `1.5px solid ${vip.border}` }}
                >
                  {vip.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base font-sans" style={{ color: vip.color }}>
                      {vip.name} VIP
                    </span>
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: vip.bg, color: vip.color, border: `1px solid ${vip.border}` }}
                    >
                      Lv {level}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-white/35 mt-0.5">
                    {vip.name === 'Platinum+' ? 'Maximum tier — all perks unlocked' : `Level ${vip.minLevel}–${(vip.nextLevel ?? 0) - 1}`}
                  </div>
                </div>
              </div>

              {/* Progress bar to next tier */}
              {nextTierInfo && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono text-white/25 uppercase tracking-widest">Progress to next tier</span>
                    <span className="text-[9px] font-mono text-white/35">Lv {vip.nextLevel}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${vipProgressPct}%`, background: `linear-gradient(90deg, ${vip.color}88, ${vip.color})` }}
                    />
                  </div>
                  <div className="text-[9px] font-mono text-white/20 mt-1">
                    {level} / {vip.nextLevel} levels to unlock {VIP_TIERS[VIP_TIERS.indexOf(vip) + 1]?.name ?? 'Max'}
                  </div>
                </div>
              )}

              {/* Tier perks grid */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {[
                  { icon: <Award size={17} />, label: 'VIP Badge', sub: 'Profile border + badge' },
                  { icon: <Smile size={17} />, label: `+${vip.extraEmotes} Emotes`, sub: 'Extra table reactions/session' },
                  { icon: <TrendingUp size={17} />, label: `+${vip.dailyBonusPct}% Daily`, sub: 'Daily reward multiplier', locked: vip.dailyBonusPct === 0 },
                  { icon: <Zap size={17} />, label: `+${vip.hourlyBonusPct}% Hourly`, sub: 'Hourly bonus multiplier', locked: vip.hourlyBonusPct === 0 },
                ].map((perk, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-2.5 flex items-start gap-2"
                    style={{
                      backgroundColor: perk.locked ? 'rgba(255,255,255,0.02)' : vip.bg,
                      border: `1px solid ${perk.locked ? 'rgba(255,255,255,0.05)' : vip.border}`,
                      opacity: perk.locked ? 0.5 : 1,
                    }}
                  >
                    <span className="text-base leading-none shrink-0 text-[#FBBF24]">{perk.icon}</span>
                    <div>
                      <div
                        className="text-[11px] font-bold font-sans"
                        style={{ color: perk.locked ? 'rgba(255,255,255,0.3)' : vip.color }}
                      >
                        {perk.label}
                      </div>
                      <div className="text-[9px] font-mono text-white/25 mt-0.5 leading-tight">{perk.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* All tiers overview */}
              <div
                className="rounded-xl p-3 flex items-center gap-2 flex-wrap"
                style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest mr-1">Tiers:</span>
                {VIP_TIERS.map((tier) => (
                  <div
                    key={tier.name}
                    className="flex items-center gap-1 text-[9px] font-mono"
                    style={{
                      color: tier.name === vip.name ? tier.color : 'rgba(255,255,255,0.25)',
                      fontWeight: tier.name === vip.name ? 700 : 400,
                    }}
                  >
                    <span className="font-bold">{tier.name.slice(0, 1)}</span>
                    <span>{tier.name}</span>
                    {tier.nextLevel && <span className="text-white/15">·</span>}
                  </div>
                ))}
              </div>

              <p className="text-[9px] font-mono text-white/20 leading-relaxed">
                VIP tiers are earned through gameplay and XP only. No purchase required. All perks are cosmetic and quality-of-life only — no gameplay advantage.
              </p>
            </div>
          </div>

          {/* ── COMPLIANCE ─────────────────────────────────────────────────── */}
          <div
            className="w-full rounded-2xl p-4"
            style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
            data-testid="section-compliance"
          >
            <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest mb-2">Legal Disclosure</div>
            <p className="text-[11px] font-mono text-white/30 leading-relaxed" data-testid="text-bonus-disclaimer">
              {DISCLAIMER} This app involves no real-money gambling. No purchase is necessary to play. All rewards are virtual chips for entertainment only.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <a href="/terms"   className="text-[9px] font-mono text-white/20 hover:text-white/40 transition-colors underline underline-offset-2">Terms</a>
              <span className="text-white/10">·</span>
              <a href="/privacy" className="text-[9px] font-mono text-white/20 hover:text-white/40 transition-colors underline underline-offset-2">Privacy Policy</a>
            </div>
          </div>

        </div>
      </div>
      <YardBottomNav active="MORE" />
    </div>
  );
}
