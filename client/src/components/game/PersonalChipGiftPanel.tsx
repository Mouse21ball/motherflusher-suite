import { useRef, useState } from 'react';
import { apiUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';

interface GiftPlayer {
  id: string;
  name: string;
  presence?: string;
}

interface PersonalChipGiftPanelProps {
  tableId?: string;
  modeId: string;
  myId: string;
  players: GiftPlayer[];
  onGiftSuccess?: () => void;
  /** Render in the page flow instead of as a fixed overlay. The fixed
   *  variant (top-24, left-3) sat on top of table geometry on phone
   *  widths (Detroit 2026-10-22) — Flushed Up and Box Chevy pages pass
   *  inline and host the panel in a slim strip under the status bar. */
  inline?: boolean;
}

export function PersonalChipGiftPanel({ tableId, modeId, myId, players, onGiftSuccess, inline }: PersonalChipGiftPanelProps) {
  const recipients = players.filter(player => player.id !== myId && player.presence === 'human');
  const [recipientSeatId, setRecipientSeatId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const requestRef = useRef<{ target: string; id: string } | null>(null);

  async function sendGift() {
    if (!tableId || !recipientSeatId || busy) return;
    const target = `${tableId}:${modeId}:${recipientSeatId}`;
    const requestId = requestRef.current?.target === target
      ? requestRef.current.id
      : crypto.randomUUID();
    requestRef.current = { target, id: requestId };
    setBusy(true);
    setMessage('');
    try {
      const response = await apiFetch(apiUrl(`/api/tables/${encodeURIComponent(tableId)}/personal-gifts`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode_id: modeId,
          recipient_seat_id: recipientSeatId,
          request_id: requestId,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not send gift.');
      const recipient = recipients.find(player => player.id === recipientSeatId);
      setMessage(`Sent 100 chips to ${recipient?.name ?? 'player'}.`);
      if (requestRef.current?.id === requestId) requestRef.current = null;
      onGiftSuccess?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send gift.');
    } finally {
      setBusy(false);
    }
  }

  if (!tableId || recipients.length === 0) return null;

  return (
    <details className={inline
      ? 'relative max-w-[calc(100vw-24px)] rounded-lg border border-amber-400/25 bg-black/85 p-1.5 text-xs text-white shadow-lg'
      : 'fixed left-3 top-24 z-30 max-w-[calc(100vw-24px)] rounded-lg border border-amber-400/25 bg-black/85 p-2 text-xs text-white shadow-lg'}>
      <summary className="cursor-pointer select-none font-mono text-amber-200">🎁 Gift 100 chips</summary>
      <div className="mt-2 flex items-center gap-2">
        <select
          aria-label="Gift recipient"
          className="max-w-40 rounded bg-white/10 px-2 py-1 text-white"
          value={recipientSeatId}
          disabled={busy}
          onChange={event => {
            requestRef.current = null;
            setRecipientSeatId(event.target.value);
          }}
        >
          <option value="">Choose seated player</option>
          {recipients.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
        </select>
        <button
          type="button"
          disabled={!recipientSeatId || busy}
          onClick={sendGift}
          className="rounded bg-amber-400 px-2 py-1 font-bold text-black disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {message && <p role="status" className="mt-2 max-w-60 text-white/80">{message}</p>}
    </details>
  );
}