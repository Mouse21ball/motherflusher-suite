import { useEffect, useRef, useState } from "react";
import { track, getModeFromPath } from "@/lib/analytics";
import { billing } from "@/lib/billing";
import { apiFetch } from "@/lib/session";
import { apiUrl } from "@/lib/apiConfig";
import { lookupTable } from "@/lib/tableSession";
import { watchRewardedAd } from "@/lib/rewardedAds";
import { BuyInSlider } from "./BuyInSlider";

interface BustOutModalProps {
  open: boolean;
  lifetimeBusts: number;
  sessionBusts: number;
  hasNeverPurchased: boolean;
  onRebuy: (amount?: number) => void | Promise<void>;
  onLeaveTable: () => void;
  onSpectate: () => void;
  onWatchAd?: () => void;
  onStarterPack?: () => void | Promise<void>;
  onBorrowChips?: () => void | Promise<void>;
  /** Ticket-7: buy-in slider for rebuy. If provided, shows slider instead of fixed rebuy. */
  tableId?: string;
  modeId?: string;
  bankrollAvailable?: number;
  bigBlind?: number;
}

// ── Triage tiers ─────────────────────────────────────────────────────────────
type Tier = 1 | 2 | 3 | 4;

function getTier(lifetimeBusts: number, sessionBusts: number, hasNeverPurchased: boolean): Tier {
  if (lifetimeBusts === 1 && hasNeverPurchased) return 1;
  if (sessionBusts >= 2 && !hasNeverPurchased) return 2;
  if (sessionBusts >= 2 && hasNeverPurchased) return 3;
  return 4;
}

export function BustOutModal({
  open,
  lifetimeBusts,
  sessionBusts,
  hasNeverPurchased,
  onRebuy,
  onLeaveTable,
  onSpectate,
  onWatchAd,
  onStarterPack,
  onBorrowChips,
  tableId,
  modeId,
  bankrollAvailable,
  bigBlind,
}: BustOutModalProps) {
  const [showRebuySlider, setShowRebuySlider] = useState(false);
  const [rescueOffer, setRescueOffer] = useState<{
    issuedAt: number; expiresAt: number; claimed: boolean; available: boolean;
  } | null>(null);
  const [rescueNow, setRescueNow] = useState(Date.now());
  const [rescueBusy, setRescueBusy] = useState(false);
  const [rescueMessage, setRescueMessage] = useState("");
  const [adBusy, setAdBusy] = useState(false);
  const [adMessage, setAdMessage] = useState("");
  const [adTestMode, setAdTestMode] = useState(false);
  const [rebuyBusy, setRebuyBusy] = useState(false);
  const [rebuyError, setRebuyError] = useState("");
  const [tableBigBlind, setTableBigBlind] = useState<number | null>(null);
  const rebuyBusyRef = useRef(false);

  useEffect(() => {
    if (!open || !tableId) {
      setTableBigBlind(null);
      return;
    }
    let cancelled = false;
    setTableBigBlind(null);
    void lookupTable(tableId).then(table => {
      if (!cancelled && table?.minBet != null && Number.isFinite(table.minBet) && table.minBet > 0) {
        setTableBigBlind(table.minBet);
      }
    });
    return () => { cancelled = true; };
  }, [open, tableId]);

  const handleRebuy = async (
    path: "free" | "reserve" | "borrow",
    amount?: number,
    rethrowError = false,
  ) => {
    if (rebuyBusyRef.current) return;
    rebuyBusyRef.current = true;
    setRebuyBusy(true);
    setRebuyError("");
    try {
      const callback = path === "free" ? onStarterPack : path === "borrow" ? onBorrowChips : onRebuy;
      if (!callback) throw new Error("Rebuy is unavailable. Your chips were not credited.");
      if (path === "reserve") await onRebuy(amount);
      else await callback();
      if (amount !== undefined) setShowRebuySlider(false);
    } catch (error) {
      setRebuyError(error instanceof Error
        ? error.message
        : "Rebuy failed. Your chips were not credited. Please try again.");
      if (rethrowError) throw error;
    } finally {
      rebuyBusyRef.current = false;
      setRebuyBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch(apiUrl("/api/billing/bust-rescue-offer"), { method: "POST" })
      .then(async response => {
        if (!response.ok) throw new Error("Limited rescue offer unavailable.");
        return response.json();
      })
      .then(data => {
        if (cancelled) return;
        setRescueOffer({
          issuedAt: new Date(data.issuedAt).getTime(),
          expiresAt: new Date(data.expiresAt).getTime(),
          claimed: !!data.claimed,
          available: !!data.available,
        });
      })
      .catch(error => {
        if (!cancelled) setRescueMessage(error.message || "Limited rescue offer unavailable.");
      });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open || !rescueOffer?.available) return;
    const timer = window.setInterval(() => setRescueNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, rescueOffer?.available]);

  async function handlePaidRescue() {
    if (rescueBusy) return;
    setRescueBusy(true);
    setRescueMessage("");
    try {
      const claim = await apiFetch(apiUrl("/api/billing/bust-rescue-offer/claim"), { method: "POST" });
      const claimData = await claim.json().catch(() => ({}));
      if (!claim.ok) throw new Error(claimData.error ?? "This rescue offer has expired.");
      const isIOS = typeof window !== "undefined" && (
        /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
      );
      const productId = isIOS ? claimData.appleProductId : claimData.productId;
      if (!productId) throw new Error("Rescue purchase is unavailable on this store.");
      await billing.purchase(productId);
      setRescueOffer(current => current ? { ...current, claimed: true, available: false } : current);
      setRescueMessage("✓ 3,000 chips added to your personal balance.");
    } catch (error) {
      setRescueMessage(error instanceof Error ? error.message : "Rescue purchase failed. Contact support if charged.");
    } finally {
      setRescueBusy(false);
    }
  }

  async function handleWatchReward() {
    if (adBusy) return;
    setAdBusy(true);
    setAdMessage("");
    setAdTestMode(false);
    try {
      if (onWatchAd) {
        await onWatchAd();
        setAdMessage("Reward flow completed.");
      } else {
        const result = await watchRewardedAd(setAdTestMode);
        setAdTestMode(result.testMode);
        setAdMessage(result.pendingVerification
          ? "Ad watched. Your 500-chip reward is awaiting secure server verification."
          : "✓ 500 chips credited to your personal balance.");
      }
    } catch (error) {
      setAdMessage(error instanceof Error ? error.message : "Unable to show a rewarded video.");
    } finally {
      setAdBusy(false);
    }
  }

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
  const rescueSecondsLeft = rescueOffer
    ? Math.max(0, Math.ceil((rescueOffer.expiresAt - rescueNow) / 1000))
    : 0;
  const rescueAvailable = !!rescueOffer?.available && !rescueOffer.claimed && rescueSecondsLeft > 0;
  const effectiveBigBlind = tableBigBlind ?? bigBlind ?? 50;

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
      onClick={disabled || rebuyBusy ? undefined : onClick}
      disabled={disabled || rebuyBusy}
      data-testid={testId}
      className={`w-full py-2.5 rounded-xl font-mono text-[11px] uppercase tracking-widest border transition-all
        ${disabled
          ? "border-white/[0.06] text-white/60 cursor-not-allowed bg-transparent"
          : "border-white/[0.08] text-white/60 hover:bg-white/[0.06] hover:text-white/80 bg-white/[0.03] active:scale-[0.98]"}`}
    >
      {label}
    </button>
  );

  // ── Reserve rebuy: the slider is only for choosing a bankroll-backed amount. ──
  const RebuyBtn = ({ testId }: { testId: string }) => {
    const hasSlider = !!(tableId && modeId && bankrollAvailable != null);
    if (hasSlider && showRebuySlider) {
      return (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-2">
          <BuyInSlider
            tableId={tableId!}
            modeId={modeId!}
            chipBalance={bankrollAvailable!}
            purpose="rebuy"
            pending={rebuyBusy}
            currentStack={0}
            bigBlind={effectiveBigBlind}
            onConfirm={(amount) => handleRebuy("reserve", amount, true)}
            onCancel={() => setShowRebuySlider(false)}
          />
        </div>
      );
    }
    return (
      <SecBtn
        label={hasSlider ? "Rebuy (choose amount)" : "Free Rebuy ($5,000)"}
        onClick={() => hasSlider ? setShowRebuySlider(true) : void handleRebuy("reserve")}
        testId={testId}
      />
    );
  };

  // ── Loan button (shown on every tier when onBorrowChips is provided) ────────
  const LoanBtn = () => onBorrowChips ? (
    <button
      onClick={() => { void handleRebuy("borrow"); }}
      disabled={rebuyBusy}
      aria-busy={rebuyBusy || undefined}
      data-testid="button-bust-borrow-chips"
      style={{
        width: '100%', padding: '10px 20px', borderRadius: 20,
        border: '1px solid rgba(201,162,39,0.4)',
        background: 'rgba(201,162,39,0.1)',
        color: '#C9A227', fontFamily: 'monospace', fontSize: 11,
        fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        cursor: 'pointer', transition: 'background 0.15s',
      }}
    >
      Borrow 1,000 Chips — repaid from next earnings
    </button>
  ) : null;

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
          <p className="text-xs text-white/60 font-mono mt-1">
            {sessionBusts > 1 ? `${sessionBusts}× this session` : "Stack hit zero"}
          </p>
        </div>

        {/* ── TIER 1: First bust + never purchased → Free Rebuy ── */}
        {tier === 1 && (
          <>
            <button
              onClick={() => { void handleRebuy("free"); }}
              disabled={rebuyBusy || !onStarterPack}
              aria-busy={rebuyBusy || undefined}
              data-testid="button-bust-starter-pack"
              className="w-full bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] py-4 rounded-xl font-black text-lg tracking-wider shadow-[0_0_20px_rgba(201,162,39,0.4)] mb-1 active:scale-[0.98] flex flex-col items-center gap-0.5"
            >
              <span>{rebuyBusy ? "CREDITING CHIPS…" : "🎁 FREE REBUY — GET 1,000 CHIPS"}</span>
              <span className="text-[11px] font-bold opacity-70 tracking-wide">Back in the game instantly</span>
            </button>
            <p className="text-center text-[12px] text-white/60 font-mono mb-3">Keep rolling — chips on us</p>
            <div className="space-y-2">
              <RebuyBtn testId="button-bust-rebuy" />
              <LoanBtn />
              <SecBtn label="Watch This Table" onClick={onSpectate} testId="button-bust-spectate" />
            </div>
          </>
        )}

        {/* ── TIER 2: 2+ session busts, paid before → ad CTA ── */}
        {tier === 2 && (
          <>
            <button
              onClick={handleWatchReward}
              disabled={adBusy}
              data-testid="button-bust-watch-ad"
              className={`w-full py-4 rounded-xl font-black text-lg tracking-wider mb-3 active:scale-[0.98] flex flex-col items-center gap-0.5 transition-all
                ${!adBusy
                  ? "bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] shadow-[0_0_20px_rgba(201,162,39,0.4)]"
                  : "bg-white/[0.06] border border-white/[0.10] text-white/60 cursor-not-allowed"}`}
            >
              <span>{adBusy ? "LOADING REWARDED VIDEO…" : "🎬 WATCH AD FOR 500 CHIPS"}</span>
            </button>
            {adTestMode && <p className="mb-2 text-center text-[10px] font-mono font-bold text-amber-300">TEST REWARD — DEVELOPMENT ONLY</p>}
            {adMessage && <p className="mb-3 text-center text-xs text-white/75" role="status">{adMessage}</p>}
            <div className="space-y-2">
              <SecBtn
                label={rebuyBusy ? "Crediting chips…" : "Free Rebuy — Get 1,000 Chips"}
                onClick={() => { void handleRebuy("free"); }}
                testId="button-bust-free-rebuy"
                disabled={!onStarterPack}
              />
              <LoanBtn />
              <SecBtn label="Watch This Table" onClick={onSpectate} testId="button-bust-spectate" />
              <SecBtn label="Back to Lobby" onClick={onLeaveTable} testId="button-bust-leave" />
            </div>
          </>
        )}

        {/* ── TIER 3: 2+ session busts, never purchased → Free Rebuy push ── */}
        {tier === 3 && (
          <>
            <button
              onClick={() => { void handleRebuy("free"); }}
              disabled={rebuyBusy || !onStarterPack}
              aria-busy={rebuyBusy || undefined}
              data-testid="button-bust-starter-pack"
              className="w-full bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] py-4 rounded-xl font-black text-lg tracking-wider shadow-[0_0_20px_rgba(201,162,39,0.4)] mb-1 active:scale-[0.98] flex flex-col items-center gap-0.5"
            >
              <span>{rebuyBusy ? "CREDITING CHIPS…" : "🎁 FREE REBUY — GET 1,000 CHIPS"}</span>
              <span className="text-[11px] font-bold opacity-70 tracking-wide">Back in the game instantly</span>
            </button>
            <p className="text-center text-[12px] text-white/60 font-mono mb-3">
              Busted {sessionBusts}× this session — chips on us, keep rolling
            </p>
            <div className="space-y-2">
              <LoanBtn />
              <SecBtn
                label={adBusy ? "Preparing rewarded video…" : "Watch Ad for 500 Chips"}
                onClick={handleWatchReward}
                testId="button-bust-watch-ad"
                disabled={adBusy}
              />
              {adTestMode && <p className="text-center text-[10px] font-mono font-bold text-amber-300">TEST REWARD — DEVELOPMENT ONLY</p>}
              {adMessage && <p className="text-center text-xs text-white/75" role="status">{adMessage}</p>}
              <SecBtn label="Watch This Table" onClick={onSpectate} testId="button-bust-spectate" />
              <SecBtn label="Back to Lobby" onClick={onLeaveTable} testId="button-bust-leave" />
            </div>
          </>
        )}

        {/* ── TIER 4: Default — plain rebuy ── */}
        {tier === 4 && (
          <>
            {showRebuySlider && tableId && modeId && bankrollAvailable != null ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-3">
                <BuyInSlider
                  tableId={tableId}
                  modeId={modeId}
                  chipBalance={bankrollAvailable}
                  purpose="rebuy"
                  pending={rebuyBusy}
                  currentStack={0}
                  bigBlind={effectiveBigBlind}
                  onConfirm={(amount) => handleRebuy("reserve", amount, true)}
                  onCancel={() => setShowRebuySlider(false)}
                />
              </div>
            ) : (
              <button
                onClick={() => tableId && modeId && bankrollAvailable != null ? setShowRebuySlider(true) : void handleRebuy("reserve")}
                disabled={rebuyBusy}
                aria-busy={rebuyBusy || undefined}
                data-testid="button-bust-rebuy"
                className="w-full bg-gradient-to-b from-[#D4B44A] to-[#9c7e1c] text-[#0B0B0D] py-4 rounded-xl font-black text-lg tracking-wider shadow-[0_0_20px_rgba(201,162,39,0.4)] mb-3 active:scale-[0.98]"
              >
                {rebuyBusy ? 'CREDITING CHIPS…' : tableId && modeId ? 'REBUY (CHOOSE AMOUNT)' : 'REBUY $5,000'}
              </button>
            )}
            <div className="space-y-2">
              <LoanBtn />
              <SecBtn label="Watch This Table" onClick={onSpectate} testId="button-bust-spectate" />
              <SecBtn label="Back to Lobby" onClick={onLeaveTable} testId="button-bust-leave" />
            </div>
          </>
        )}

        {rebuyBusy && (
          <p className="text-center text-xs text-white/75" role="status" data-testid="bust-rebuy-pending">
            Waiting for the table to confirm your chip balance…
          </p>
        )}
        {rebuyError && (
          <p className="mt-2 text-center text-xs text-red-300" role="alert" data-testid="bust-rebuy-error">
            {rebuyError}
          </p>
        )}

        {/* Paid offer supplements all free triage choices; it never replaces them. */}
        {!rescueOffer?.claimed && (
          <section
            className="mt-4 rounded-xl border border-[#4FD1C5]/30 bg-[#4FD1C5]/[0.06] p-3 text-center"
            data-testid="bust-rescue-offer"
          >
            <div className="text-[11px] font-mono font-bold tracking-widest text-[#4FD1C5]">
              {hasNeverPurchased ? "FIRST-TIME PLAYER RESCUE" : "LIMITED TABLE RESCUE"}
            </div>
            <p className="mt-1 text-xs text-white/75">
              Get 3,000 personal chips for $0.99
            </p>
            {rescueAvailable ? (
              <>
                <p className="mt-1 text-[10px] font-mono text-white/55" data-testid="bust-rescue-countdown">
                  OFFER ENDS IN {Math.floor(rescueSecondsLeft / 60)}:{String(rescueSecondsLeft % 60).padStart(2, "0")}
                </p>
                <button
                  onClick={handlePaidRescue}
                  disabled={rescueBusy}
                  data-testid="button-bust-paid-rescue"
                  className="mt-2 w-full rounded-lg bg-[#4FD1C5] px-3 py-2.5 text-sm font-black text-[#0B0B0D] disabled:opacity-60"
                >
                  {rescueBusy ? "OPENING STORE…" : "GET 3,000 CHIPS — $0.99"}
                </button>
              </>
            ) : (
              <p className="mt-1 text-[10px] font-mono text-white/45">
                {rescueOffer?.claimed ? "Offer claimed" : rescueOffer && !rescueSecondsLeft ? "Offer expired" : "Loading limited offer…"}
              </p>
            )}
            {rescueMessage && <p className="mt-2 text-[10px] text-white/70" role="status">{rescueMessage}</p>}
          </section>
        )}

      </div>
    </div>
  );
}
