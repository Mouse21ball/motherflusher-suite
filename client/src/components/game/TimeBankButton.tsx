import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/apiConfig";

interface TimeBankButtonProps {
  playerId: string;
  tableId: string;
  modeId: string;
  /** Whether it's currently the hero's turn (timer must be running to use). */
  isMyTurn: boolean;
  /** Remaining ms on the turn timer (for disabling when timer not active). */
  timerRemainingMs?: number;
  onExtended?: (newDeadline: number) => void;
}

export function TimeBankButton({
  playerId,
  tableId,
  modeId,
  isMyTurn,
  timerRemainingMs,
  onExtended,
}: TimeBankButtonProps) {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [usedThisTurn, setUsedThisTurn] = useState(false);
  const [lastUsedTurnKey, setLastUsedTurnKey] = useState<string>('');

  // Disable if: not our turn, timer not running, already used this turn, or loading
  const timerActive  = timerRemainingMs != null && timerRemainingMs > 0;
  const canUse       = isMyTurn && timerActive && !usedThisTurn && !loading;

  const handleUse = useCallback(async () => {
    if (!canUse) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/players/${playerId}/time-bank/use`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: tableId, mode_id: modeId }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errCode = (data as any).error ?? 'failed';
        if (errCode === 'already_used_this_turn') {
          setUsedThisTurn(true);
        } else if (errCode === 'no_uses_available') {
          setError('No time bank uses left');
        } else {
          setError((data as any).message ?? 'Could not extend timer');
        }
        setLoading(false);
        return;
      }
      setUsedThisTurn(true);
      if (onExtended && (data as any).new_timer_expires_at) {
        onExtended((data as any).new_timer_expires_at as number);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [canUse, playerId, tableId, modeId, onExtended]);

  // Reset used-this-turn when it's no longer our turn (next player acts)
  // This is handled by the parent resetting via key or re-mounting when turn changes.

  if (!isMyTurn) return null;

  return (
    <div className="flex flex-col items-center gap-0.5" data-testid="time-bank-container">
      <Button
        size="sm"
        variant="outline"
        onClick={handleUse}
        disabled={!canUse}
        className={[
          "text-[12px] font-mono uppercase tracking-widest transition-all",
          "border-amber-500/30 text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10",
          usedThisTurn ? "opacity-40 cursor-not-allowed" : "",
          !timerActive ? "opacity-30 cursor-not-allowed" : "",
        ].join(' ')}
        data-testid="button-time-bank"
      >
        {loading ? '…' : usedThisTurn ? '⏱ Used' : '⏱ +20s'}
      </Button>
      {error && (
        <p className="text-[12px] text-red-400/70" data-testid="time-bank-error">{error}</p>
      )}
    </div>
  );
}
