import { isRewardAvailable, getTodayReward } from "@/lib/dailyReward";

interface BustOutModalProps {
  open: boolean;
  lifetimeBusts: number;
  sessionBusts: number;
  hasNeverPurchased: boolean;
  onRebuy: () => void;
  onLeaveTable: () => void;
  onSpectate: () => void;
  onClaimDailyBonus: () => void;
  onWatchAd?: () => void;
  onStarterPack?: () => void;
}

// ── Triage tiers ─────────────────────────────────────────────────────────────
// Tier 1: first-ever bust, never purchased  → push Starter Pack hard
// Tier 2: daily bonus available             → claim bonus CTA
// Tier 3: 2+ session busts, paid before    → watch ad CTA
// Tier 4: 2+ session busts, never purchased → push Starter Pack again
// Tier 5: default                           → plain rebuy

type Tier = 1 | 2 | 3 | 4 | 5;

function getTier(lifetimeBusts: number, sessionBusts: number, hasNeverPurchased: boolean): Tier {
  const dailyAvail = isRewardAvailable();
  if (lifetimeBusts === 1 && hasNeverPurchased) return 1;
  if (dailyAvail) return 2;
  if (sessionBusts >= 2 && !hasNeverPurchased) return 3;
  if (sessionBusts >= 2 && hasNeverPurchased) return 4;
  return 5;
}

export function BustOutModal({
  open,
  lifetimeBusts,
  sessionBusts,
  hasNeverPurchased,
  onRebuy,
  onLeaveTable,
  onSpectate,
  onClaimDailyBonus,
  onWatchAd,
  onStarterPack,
}: BustOutModalProps) {
  if (!open) return null;

  const tier = getTier(lifetimeBusts, sessionBusts, hasNeverPurchased);
  const todayReward = getTodayReward();
  const dailyChips = todayReward?.chips ?? 250;

  // ── Secondary button helper ────────────────────────────────────────────────
  const SecBtn = ({
    label,
    onClick,
    testId,
    disabled,
  }: {
    label: string;
    onClick?: () => void;
    testId: string;
    disabled?: boolean;
  }) => (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      data-testid={testId}
      className={`w-full py-2.5 rounded-xl font-mono text-[11px] uppercase tracking-widest border transition-all
        ${disabled
          ? "border-white/[0.06] text-white/25 cursor-not-allowed bg-transparent"
          : "border-white/[0.08] text-white/55 hover:bg-white/[0.06] hover:text-white/80 bg-white/[0.03] active:scale-[0.98]"}`}
    >
      {label}
    </button>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
      data-testid="modal-bust-out"
    >
      <div className="bg-[#0a0a0e] border border-[#C9A227]/30 rounded-2xl p-6 max-w-sm w-full shadow-[0_0_60px_rgba(201,162,39,0.2)]">

        {/* Header */}
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">💀</div>
          <h2 className="text-xl font-bold text-[#C9A227] tracking-wide">YOU'RE OUT</h2>
          <p className="text-xs text-white/50 font-mono mt-1">
            {sessionBusts > 1 ? `${sessionBusts}× this session` : "Stack hit zero"}
          </p>
        </div>

        {/* ── TIER 1: First bust + never purchased → Starter Pack ── */}
        {tier === 1 && (
          <>
            <button
              onClick={() => { onStarterPack ? onStarterPack() : console.log("TODO: IAP integration"); }}
              data-testid="button-bust-starter-pack"
              className="w-full bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] py-4 rounded-xl font-black text-lg tracking-wider shadow-[0_0_20px_rgba(201,162,39,0.4)] mb-1 active:scale-[0.98] flex flex-col items-center gap-0.5"
            >
              <span>🎁 STARTER PACK — $0.99</span>
              <span className="text-[11px] font-bold opacity-70 tracking-wide">5,000 chips · 5 emotes · VIP card back</span>
            </button>
            <p className="text-center text-[10px] text-white/30 font-mono mb-3">Best value for new players</p>
            <div className="space-y-2">
              <SecBtn label="Free Rebuy ($1,000)" onClick={onRebuy} testId="button-bust-rebuy" />
              <SecBtn label="Watch This Table" onClick={onSpectate} testId="button-bust-spectate" />
            </div>
          </>
        )}

        {/* ── TIER 2: Daily bonus available ── */}
        {tier === 2 && (
          <>
            <button
              onClick={onClaimDailyBonus}
              data-testid="button-bust-daily-bonus"
              className="w-full bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] py-4 rounded-xl font-black text-lg tracking-wider shadow-[0_0_20px_rgba(201,162,39,0.4)] mb-3 active:scale-[0.98] flex flex-col items-center gap-0.5"
            >
              <span>⚡ CLAIM DAILY BONUS</span>
              <span className="text-[11px] font-bold opacity-70 tracking-wide">+{dailyChips.toLocaleString()} chips waiting</span>
            </button>
            <div className="space-y-2">
              <SecBtn label="Free Rebuy ($1,000)" onClick={onRebuy} testId="button-bust-rebuy" />
              <SecBtn
                label={onWatchAd ? "Watch Ad for $500 Chips" : "Watch Ad — Coming Soon"}
                onClick={onWatchAd ?? (() => console.log("TODO: AdMob integration"))}
                testId="button-bust-watch-ad"
                disabled={!onWatchAd}
              />
              <SecBtn label="Watch This Table" onClick={onSpectate} testId="button-bust-spectate" />
            </div>
          </>
        )}

        {/* ── TIER 3: 2+ session busts, paid before → ad CTA ── */}
        {tier === 3 && (
          <>
            <button
              onClick={onWatchAd ?? (() => console.log("TODO: AdMob integration"))}
              disabled={!onWatchAd}
              data-testid="button-bust-watch-ad"
              className={`w-full py-4 rounded-xl font-black text-lg tracking-wider mb-3 active:scale-[0.98] flex flex-col items-center gap-0.5 transition-all
                ${onWatchAd
                  ? "bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] shadow-[0_0_20px_rgba(201,162,39,0.4)]"
                  : "bg-white/[0.06] border border-white/[0.10] text-white/40 cursor-not-allowed"}`}
            >
              <span>🎬 WATCH AD FOR $500 CHIPS</span>
              {!onWatchAd && <span className="text-[11px] font-bold opacity-70 tracking-wide">Coming Soon</span>}
            </button>
            <div className="space-y-2">
              <SecBtn label="Buy $4.99 Chips" onClick={() => console.log("TODO: IAP $4.99")} testId="button-bust-iap-499" />
              <SecBtn label="Buy $9.99 Chips" onClick={() => console.log("TODO: IAP $9.99")} testId="button-bust-iap-999" />
              <SecBtn label="Watch This Table" onClick={onSpectate} testId="button-bust-spectate" />
              <SecBtn label="Back to Lobby" onClick={onLeaveTable} testId="button-bust-leave" />
            </div>
          </>
        )}

        {/* ── TIER 4: 2+ session busts, never purchased → Starter Pack push ── */}
        {tier === 4 && (
          <>
            <button
              onClick={() => { onStarterPack ? onStarterPack() : console.log("TODO: IAP integration"); }}
              data-testid="button-bust-starter-pack"
              className="w-full bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] py-4 rounded-xl font-black text-lg tracking-wider shadow-[0_0_20px_rgba(201,162,39,0.4)] mb-1 active:scale-[0.98] flex flex-col items-center gap-0.5"
            >
              <span>🎁 STARTER PACK — $0.99</span>
              <span className="text-[11px] font-bold opacity-70 tracking-wide">5,000 chips · 5 emotes · VIP card back</span>
            </button>
            <p className="text-center text-[10px] text-white/30 font-mono mb-3">
              You've busted {sessionBusts}× this session — best value to keep rolling
            </p>
            <div className="space-y-2">
              <SecBtn
                label={onWatchAd ? "Watch Ad for $500 Chips" : "Watch Ad — Coming Soon"}
                onClick={onWatchAd ?? (() => console.log("TODO: AdMob integration"))}
                testId="button-bust-watch-ad"
                disabled={!onWatchAd}
              />
              <SecBtn label="Watch This Table" onClick={onSpectate} testId="button-bust-spectate" />
              <SecBtn label="Back to Lobby" onClick={onLeaveTable} testId="button-bust-leave" />
            </div>
          </>
        )}

        {/* ── TIER 5: Default — plain rebuy ── */}
        {tier === 5 && (
          <>
            <button
              onClick={onRebuy}
              data-testid="button-bust-rebuy"
              className="w-full bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] py-4 rounded-xl font-black text-lg tracking-wider shadow-[0_0_20px_rgba(201,162,39,0.4)] mb-3 active:scale-[0.98]"
            >
              REBUY $1,000
            </button>
            <div className="space-y-2">
              <SecBtn label="Watch This Table" onClick={onSpectate} testId="button-bust-spectate" />
              <SecBtn label="Back to Lobby" onClick={onLeaveTable} testId="button-bust-leave" />
            </div>
          </>
        )}

      </div>
    </div>
  );
}
