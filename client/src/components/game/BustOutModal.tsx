import { useEffect, useState } from "react";
import { isRewardAvailable, getTodayReward } from "@/lib/dailyReward";
import { track, getModeFromPath } from "@/lib/analytics";
import { BuyInSlider } from "./BuyInSlider";

interface BustOutModalProps {
  open: boolean;
  lifetimeBusts: number;
  sessionBusts: number;
  hasNeverPurchased: boolean;
  onRebuy: (amount?: number) => void;
  onLeaveTable: () => void;
  onSpectate: () => void;
  onClaimDailyBonus: () => void;
  onWatchAd?: () => void;
  onStarterPack?: () => void;
  /** Ticket-7: buy-in slider for rebuy. If provided, shows slider instead of fixed rebuy. */
  tableId?: string;
  modeId?: string;
  bankrollAvailable?: number;
  bigBlind?: number;
}

// ── Triage tiers ─────────────────────────────────────────────────────────────
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
  tableId,
  modeId,
  bankrollAvailable,
  bigBlind,
}: BustOutModalProps) {
  const [showRebuySlider, setShowRebuySlider] = useState(false);

  // ── Track bust modal shown ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    track({ name: 'bust_modal_shown', mode: getModeFromPath() });
  }, [open]);

  // ── Block Android back button / browser back while modal is open ──────────
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ bustModalOpen: true }, '');
    const handlePopState = () => {
      window.history.pushState({ bustModalOpen: true }, '');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [open]);

  // ── Block Escape key ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [open]);

  // ── Lock body scroll while modal is open ─────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; };
  }, [open]);

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

  // ── Rebuy section: slider when table context available, fallback button ────
  const RebuyBtn = ({ testId }: { testId: string }) => {
    const hasSlider = !!(tableId && modeId && bankrollAvailable != null);
    if (hasSlider && showRebuySlider) {
      return (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-2">
          <BuyInSlider
            tableId={tableId!}
            modeId={modeId!}
            chipBalance={bankrollAvailable!}
            currentStack={0}
            bigBlind={bigBlind ?? 50}
            onConfirm={(amount) => { setShowRebuySlider(false); onRebuy(amount); }}
            onCancel={() => setShowRebuySlider(false)}
          />
        </div>
      );
    }
    return (
      <SecBtn
        label={hasSlider ? "Rebuy (choose amount)" : "Free Rebuy ($5,000)"}
        onClick={() => hasSlider ? setShowRebuySlider(true) : onRebuy()}
        testId={testId}
      />
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => e.stopPropagation()}
      data-testid="bust-out-modal"
    >
      <div
        className="bg-[#0a0a0e] border border-[#C9A227]/30 rounded-2xl p-6 max-w-sm w-full shadow-[0_0_60px_rgba(201,162,39,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">💀</div>
          <h2 className="text-xl font-bold text-[#C9A227] tracking-wide">YOU'RE OUT</h2>
          <p className="text-xs text-white/50 font-mono mt-1">
            {sessionBusts > 1 ? `${sessionBusts}× this session` : "Stack hit zero"}
          </p>
        </div>

        {/* ── TIER 1: First bust + never purchased → Free Rebuy ── */}
        {tier === 1 && (
          <>
            <button
              onClick={() => onStarterPack?.()}
              data-testid="button-bust-starter-pack"
              className="w-full bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] py-4 rounded-xl font-black text-lg tracking-wider shadow-[0_0_20px_rgba(201,162,39,0.4)] mb-1 active:scale-[0.98] flex flex-col items-center gap-0.5"
            >
              <span>🎁 FREE REBUY — GET 1,000 CHIPS</span>
              <span className="text-[11px] font-bold opacity-70 tracking-wide">Back in the game instantly</span>
            </button>
            <p className="text-center text-[10px] text-white/30 font-mono mb-3">Keep rolling — chips on us</p>
            <div className="space-y-2">
              <RebuyBtn testId="button-bust-rebuy" />
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
              <RebuyBtn testId="button-bust-rebuy" />
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
              <SecBtn label="Free Rebuy — Get 1,000 Chips" onClick={() => onStarterPack?.()} testId="button-bust-free-rebuy" />
              <SecBtn label="Watch This Table" onClick={onSpectate} testId="button-bust-spectate" />
              <SecBtn label="Back to Lobby" onClick={onLeaveTable} testId="button-bust-leave" />
            </div>
          </>
        )}

        {/* ── TIER 4: 2+ session busts, never purchased → Free Rebuy push ── */}
        {tier === 4 && (
          <>
            <button
              onClick={() => onStarterPack?.()}
              data-testid="button-bust-starter-pack"
              className="w-full bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] py-4 rounded-xl font-black text-lg tracking-wider shadow-[0_0_20px_rgba(201,162,39,0.4)] mb-1 active:scale-[0.98] flex flex-col items-center gap-0.5"
            >
              <span>🎁 FREE REBUY — GET 1,000 CHIPS</span>
              <span className="text-[11px] font-bold opacity-70 tracking-wide">Back in the game instantly</span>
            </button>
            <p className="text-center text-[10px] text-white/30 font-mono mb-3">
              Busted {sessionBusts}× this session — chips on us, keep rolling
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
            {showRebuySlider && tableId && modeId && bankrollAvailable != null ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-3">
                <BuyInSlider
                  tableId={tableId}
                  modeId={modeId}
                  chipBalance={bankrollAvailable}
                  currentStack={0}
                  bigBlind={bigBlind ?? 50}
                  onConfirm={(amount) => { setShowRebuySlider(false); onRebuy(amount); }}
                  onCancel={() => setShowRebuySlider(false)}
                />
              </div>
            ) : (
              <button
                onClick={() => tableId && modeId && bankrollAvailable != null ? setShowRebuySlider(true) : onRebuy()}
                data-testid="button-bust-rebuy"
                className="w-full bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] py-4 rounded-xl font-black text-lg tracking-wider shadow-[0_0_20px_rgba(201,162,39,0.4)] mb-3 active:scale-[0.98]"
              >
                {tableId && modeId ? 'REBUY (CHOOSE AMOUNT)' : 'REBUY $5,000'}
              </button>
            )}
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
