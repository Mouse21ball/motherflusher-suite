import { useState, useEffect } from 'react';
import { Eye, Users, Clock } from 'lucide-react';
import { Link } from 'wouter';

interface SpectatorBannerProps {
  spectatorCount?: number;
  openSeats?: number;
  onTakeSeat?: () => void;
  tableId?: string; // Detroit 2026-10-12: for waitlist
}

export function SpectatorBanner({ spectatorCount, openSeats = 0, onTakeSeat, tableId }: SpectatorBannerProps) {
  // Detroit 2026-10-11: if seats are open, offer to take one instead of just watching
  if (openSeats > 0 && onTakeSeat) {
    return (
      <div className="w-full px-2 pt-2">
        <div className="max-w-md mx-auto rounded-xl px-3.5 py-3 flex items-center justify-between gap-3 shadow-lg"
          style={{
            background: 'linear-gradient(145deg, rgba(28,22,38,.95), rgba(14,11,20,.96))',
            border: '1px solid rgba(201,162,39,.30)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07), 0 4px 14px rgba(0,0,0,.4)',
          }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(201,162,39,.12)' }}>
              <Eye className="w-3.5 h-3.5 text-amber-200" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[12px] font-mono uppercase tracking-[0.18em] text-amber-200 font-bold leading-none">
                Seat open
              </span>
              <span className="text-[12px] text-white/70 leading-none truncate">
                {openSeats} seat{openSeats > 1 ? 's' : ''} available — jump in!
              </span>
            </div>
          </div>
          <button
            onClick={onTakeSeat}
            className="shrink-0 text-[12px] font-mono uppercase tracking-widest px-3 py-2 rounded-lg font-bold transition-all duration-200 touch-manipulation"
            style={{
              background: 'linear-gradient(145deg, rgba(201,162,39,.25), rgba(201,162,39,.15))',
              border: '1px solid rgba(201,162,39,.45)',
              color: '#F2C14E',
            }}
          >
            Take a seat
          </button>
        </div>
      </div>
    );
  }

  // Detroit 2026-10-12: Waitlist when table is full
  return <WaitlistBanner spectatorCount={spectatorCount} tableId={tableId} />;
}

function WaitlistBanner({ spectatorCount, tableId }: { spectatorCount?: number; tableId?: string }) {
  const [position, setPosition] = useState<number | null>(null); // null = not on waitlist
  const [joining, setJoining] = useState(false);

  // Poll for position updates
  useEffect(() => {
    if (!tableId || position === null) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/badugi/${tableId}/waitlist`, { credentials: 'include' });
        const data = await res.json();
        if (data.promoted) {
          // Promoted! Reload to get the seat
          window.location.reload();
        } else if (data.position >= 0) {
          setPosition(data.position);
        } else {
          setPosition(null); // Removed from waitlist
        }
      } catch {}
    };
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [tableId, position]);

  const joinWaitlist = async () => {
    if (!tableId || joining) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/badugi/${tableId}/waitlist`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.position) setPosition(data.position);
    } catch {}
    setJoining(false);
  };

  const leaveWaitlist = async () => {
    if (!tableId) return;
    try {
      await fetch(`/api/badugi/${tableId}/waitlist`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {}
    setPosition(null);
  };

  // On waitlist — show position
  if (position !== null && position > 0) {
    return (
      <div className="w-full px-2 pt-2">
        <div className="max-w-md mx-auto rounded-xl px-3.5 py-3 flex items-center justify-between gap-3 shadow-lg"
          style={{
            background: 'linear-gradient(145deg, rgba(28,22,38,.95), rgba(14,11,20,.96))',
            border: '1px solid rgba(201,162,39,.30)',
          }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(201,162,39,.12)' }}>
              <Clock className="w-3.5 h-3.5 text-amber-200" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[12px] font-mono uppercase tracking-[0.18em] text-amber-200 font-bold leading-none">
                #{position} in line
              </span>
              <span className="text-[12px] text-white/70 leading-none">
                You'll auto-join when a seat opens
              </span>
            </div>
          </div>
          <button
            onClick={leaveWaitlist}
            className="shrink-0 text-[12px] font-mono uppercase tracking-widest px-3 py-2 rounded-lg transition-all duration-200 touch-manipulation text-white/60 border border-white/10 hover:border-white/20"
          >
            Leave
          </button>
        </div>
      </div>
    );
  }

  // Not on waitlist — offer to join
  return (
    <div className="w-full px-2 pt-2">
      <div className="max-w-md mx-auto rounded-xl bg-[#192320]/95 border border-[#a8d5be]/25 px-3.5 py-3 flex items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#a8d5be]/10 flex items-center justify-center shrink-0">
            <Eye className="w-3.5 h-3.5 text-[#b6e3c8]" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-mono uppercase tracking-[0.18em] text-[#b6e3c8] font-bold leading-none">
                Table full
              </span>
              {spectatorCount != null && spectatorCount > 0 && (
                <span className="flex items-center gap-0.5 text-[12px] text-[#b6e3c8]/65 font-mono">
                  <Users className="w-2.5 h-2.5" />
                  {spectatorCount}
                </span>
              )}
            </div>
            <span className="text-[12px] text-white/70 leading-none truncate">
              Join the waitlist — auto-seat when one opens.
            </span>
          </div>
        </div>
        {tableId ? (
          <button
            onClick={joinWaitlist}
            disabled={joining}
            className="shrink-0 text-[12px] font-mono uppercase tracking-widest px-3 py-2 rounded-lg font-bold transition-all duration-200 touch-manipulation disabled:opacity-50"
            style={{
              background: 'linear-gradient(145deg, rgba(201,162,39,.25), rgba(201,162,39,.15))',
              border: '1px solid rgba(201,162,39,.45)',
              color: '#F2C14E',
            }}
          >
            {joining ? 'Joining...' : 'Join waitlist'}
          </button>
        ) : (
          <Link
            href="/shop"
            className="shrink-0 text-[12px] font-mono uppercase tracking-widest px-2.5 py-1.5 rounded-lg border border-[#b6e3c8]/30 text-[#b6e3c8] hover:text-[#d8f3e2] hover:border-[#b6e3c8]/55 bg-[#a8d5be]/10 hover:bg-[#a8d5be]/15 transition-all duration-200 touch-manipulation"
          >
            Get chips
          </Link>
        )}
      </div>
    </div>
  );
}

export function SpectatorWatchingBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div
      className="flex items-center gap-1 text-[12px] font-mono text-white/60 px-2 py-1 rounded-full border border-white/[0.04] bg-white/[0.02]"
      data-testid="badge-spectator-count"
    >
      <Eye className="w-2.5 h-2.5" />
      <span>{count} watching</span>
    </div>
  );
}
