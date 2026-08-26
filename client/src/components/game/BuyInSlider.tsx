import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { apiUrl } from "@/lib/apiConfig";

interface BuyInSliderProps {
  tableId: string;
  modeId: string;
  chipBalance: number;
  onConfirm: (buyinChips: number) => void;
  onCancel?: () => void;
  /** If set, this is a rebuy: currentStack is added to the validation. */
  currentStack?: number;
  /** Big blind amount (minBet from engine). Defaults to 50. */
  bigBlind?: number;
}

function formatChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function BuyInSlider({
  tableId,
  modeId,
  chipBalance,
  onConfirm,
  onCancel,
  currentStack = 0,
  bigBlind = 50,
}: BuyInSliderProps) {
  const minBuyin  = bigBlind * 20;
  const maxBuyin  = bigBlind * 200;

  // For rebuy: max is limited so current_stack + rebuy ≤ 200BB
  const maxRebuy  = Math.max(0, maxBuyin - currentStack);
  const effectiveMax = currentStack > 0
    ? Math.min(maxRebuy, chipBalance)
    : Math.min(maxBuyin, chipBalance);
  const effectiveMin = currentStack > 0 ? bigBlind : minBuyin;

  const defaultAmount = Math.min(Math.floor(effectiveMax * 0.5 / bigBlind) * bigBlind, effectiveMax);
  const safeDefault   = Math.max(effectiveMin, Math.min(defaultAmount, effectiveMax));

  const [amount, setAmount]     = useState(safeDefault);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const bbAmount = Math.round(amount / bigBlind);

  const handleSlider = useCallback((val: number[]) => {
    const snapped = Math.round((val[0] ?? effectiveMin) / bigBlind) * bigBlind;
    setAmount(Math.max(effectiveMin, Math.min(effectiveMax, snapped)));
    setError(null);
  }, [effectiveMin, effectiveMax, bigBlind]);

  const handleConfirm = useCallback(async () => {
    if (amount < effectiveMin || amount > effectiveMax) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = currentStack > 0
        ? `/api/tables/${tableId}/rebuy`
        : `/api/tables/${tableId}/join`;
      const body = currentStack > 0
        ? { rebuy_chips: amount, current_stack: currentStack, mode_id: modeId }
        : { buyin_chips: amount, mode_id: modeId };
      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as any).error ?? 'Request failed');
        setLoading(false);
        return;
      }
      onConfirm(amount);
    } catch {
      setError('Network error — please try again');
      setLoading(false);
    }
  }, [amount, currentStack, tableId, modeId, onConfirm, effectiveMin, effectiveMax]);

  const canConfirm = amount >= effectiveMin && amount <= effectiveMax && !loading;

  return (
    <div className="flex flex-col gap-4 w-full max-w-xs mx-auto" data-testid="buyin-slider-panel">
      <div className="text-center">
        <p className="text-xs text-white/60 uppercase tracking-widest mb-1">
          {currentStack > 0 ? 'Rebuy Amount' : 'Buy-In Amount'}
        </p>
        <p className="text-3xl font-mono font-bold text-white" data-testid="buyin-amount-display">
          {formatChips(amount)}
        </p>
        <p className="text-sm text-white/60 mt-0.5">{bbAmount} BB</p>
      </div>

      <Slider
        min={effectiveMin}
        max={effectiveMax}
        step={bigBlind}
        value={[amount]}
        onValueChange={handleSlider}
        className="w-full"
        data-testid="buyin-slider"
      />

      <div className="flex justify-between text-xs text-white/60 font-mono">
        <span>{formatChips(effectiveMin)} (20BB)</span>
        <span>{formatChips(effectiveMax)} (200BB)</span>
      </div>

      {chipBalance < effectiveMin && (
        <p className="text-xs text-amber-400/80 text-center" data-testid="buyin-insufficient-warning">
          Your balance ({formatChips(chipBalance)}) is below the minimum buy-in ({formatChips(effectiveMin)}).
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400/80 text-center" data-testid="buyin-error">{error}</p>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 text-white/60 border-white/10"
            data-testid="buyin-cancel"
          >
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={!canConfirm || chipBalance < effectiveMin}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-mono"
          data-testid="buyin-confirm"
        >
          {loading ? 'Joining…' : currentStack > 0 ? `Rebuy ${formatChips(amount)}` : `Join for ${formatChips(amount)}`}
        </Button>
      </div>
    </div>
  );
}
