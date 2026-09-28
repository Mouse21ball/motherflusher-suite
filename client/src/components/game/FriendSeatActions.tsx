import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { GameState } from '@/lib/poker/types';
import { apiUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';

type SeatTarget = { playerId: string; name: string; x: number; y: number };

export function FriendSeatActions({
  children,
  state,
  myId,
  myProfileId,
  disabled = false,
}: {
  children: ReactNode;
  state: GameState;
  myId: string;
  myProfileId?: string;
  disabled?: boolean;
}) {
  const [target, setTarget] = useState<SeatTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTriggered = useRef(false);
  const touchTargetEligible = useRef(false);
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const seatPlayer = (eventTarget: EventTarget | null) => {
    if (!(eventTarget instanceof Element)) return null;
    const seat = eventTarget.closest<HTMLElement>('[data-player-seat]');
    const seatId = seat?.dataset.playerSeat;
    if (!seatId) return null;
    const player = state.players.find(item => item.id === seatId);
    if (!player || !player.identityId || player.presence === 'bot' || player.presence === 'reserved' || player.presence === 'open') return null;
    if (player.id === myId || player.identityId === myProfileId) return null;
    return player;
  };

  const openForEvent = (event: { target: EventTarget | null; clientX: number; clientY: number }) => {
    if (disabled) return;
    const player = seatPlayer(event.target);
    if (!player) return;
    setMessage('');
    setTarget({
      playerId: player.identityId!,
      name: player.name,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 110),
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || disabled) return;
    touchTargetEligible.current = false;
    holdTriggered.current = false;
    const node = event.target as HTMLElement;
    if (node.closest('button, a, input, textarea, select, [role="button"]')) return;
    const player = seatPlayer(event.target);
    if (!player) return;
    touchTargetEligible.current = true;
    clearHold();
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      holdTriggered.current = true;
      setMessage('');
      setTarget({
        playerId: player.identityId!,
        name: player.name,
        x: Math.min(event.clientX, window.innerWidth - 220),
        y: Math.min(event.clientY, window.innerHeight - 110),
      });
    }, 550);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' && touchTargetEligible.current && !holdTriggered.current) openForEvent(event);
    touchTargetEligible.current = false;
    holdTriggered.current = false;
    clearHold();
  };

  const sendRequest = async () => {
    if (!target || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await apiFetch(apiUrl('/api/friends/requests'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: target.playerId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Friend request could not be sent.');
      setMessage('Request sent.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Friend request could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="relative h-full min-h-0"
      onContextMenu={event => {
        const player = seatPlayer(event.target);
        if (!player || disabled) return;
        event.preventDefault();
        openForEvent(event);
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={clearHold}
      onPointerCancel={clearHold}
    >
      {children}
      {target && (
        <>
          <button className="fixed inset-0 z-[79] cursor-default" aria-label="Close player actions" onClick={() => setTarget(null)} />
          <div
            className="fixed z-[80] w-52 rounded-xl border border-amber-200/25 bg-[#111014] p-3 shadow-2xl"
            style={{ left: Math.max(8, target.x), top: Math.max(8, target.y) }}
            role="dialog"
            aria-label={`${target.name} player actions`}
          >
            <p className="mb-2 truncate text-sm font-bold text-white">{target.name}</p>
            <button
              className="w-full rounded-lg border border-amber-300/35 bg-amber-200/10 px-3 py-2 text-xs font-mono font-bold tracking-wider text-amber-100 disabled:opacity-50"
              onClick={() => void sendRequest()}
              disabled={busy || message === 'Request sent.'}
            >
              {busy ? 'SENDING…' : message === 'Request sent.' ? 'REQUEST SENT' : 'ADD FRIEND'}
            </button>
            {message && <p className="mt-2 text-xs text-white/65" role="status">{message}</p>}
            <button className="mt-2 w-full text-[10px] text-white/40" onClick={() => setTarget(null)}>Close</button>
          </div>
        </>
      )}
    </div>
  );
}