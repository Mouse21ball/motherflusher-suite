import { Eye, Users } from 'lucide-react';
import { Link } from 'wouter';

interface SpectatorBannerProps {
  spectatorCount?: number;
}

export function SpectatorBanner({ spectatorCount }: SpectatorBannerProps) {
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
                Watching only
              </span>
              {spectatorCount != null && spectatorCount > 0 && (
                <span className="flex items-center gap-0.5 text-[12px] text-[#b6e3c8]/65 font-mono">
                  <Users className="w-2.5 h-2.5" />
                  {spectatorCount}
                </span>
              )}
            </div>
            <span className="text-[12px] text-white/70 leading-none truncate" data-testid="text-spectator-watch-only">
              Watching only — get chips to play.
            </span>
          </div>
        </div>
        <Link
          href="/shop"
          className="shrink-0 text-[12px] font-mono uppercase tracking-widest px-2.5 py-1.5 rounded-lg border border-[#b6e3c8]/30 text-[#b6e3c8] hover:text-[#d8f3e2] hover:border-[#b6e3c8]/55 bg-[#a8d5be]/10 hover:bg-[#a8d5be]/15 transition-all duration-200 touch-manipulation"
          data-testid="button-get-chips"
        >
          Get chips
        </Link>
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
