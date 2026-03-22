import { Eye, Users } from 'lucide-react';
import { useLocation } from 'wouter';

interface SpectatorBannerProps {
  spectatorCount?: number;
}

export function SpectatorBanner({ spectatorCount }: SpectatorBannerProps) {
  const [, navigate] = useLocation();

  return (
    <div className="w-full px-2 pt-2">
      <div className="max-w-md mx-auto rounded-xl bg-purple-500/[0.08] border border-purple-500/25 px-3.5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
            <Eye className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-purple-400 font-bold leading-none">
                Spectating
              </span>
              {spectatorCount != null && spectatorCount > 0 && (
                <span className="flex items-center gap-0.5 text-[9px] text-purple-400/50 font-mono">
                  <Users className="w-2.5 h-2.5" />
                  {spectatorCount}
                </span>
              )}
            </div>
            <span className="text-[10px] text-white/30 leading-none truncate">
              Table full — watching live. Chat and react freely.
            </span>
          </div>
        </div>
        <button
          onClick={() => navigate('/')}
          className="shrink-0 text-[9px] font-mono uppercase tracking-widest px-2.5 py-1.5 rounded-lg border border-purple-500/20 text-purple-400/60 hover:text-purple-400 hover:border-purple-500/35 bg-purple-500/[0.05] hover:bg-purple-500/[0.1] transition-all duration-200 touch-manipulation"
          data-testid="button-find-table"
        >
          Find Table
        </button>
      </div>
    </div>
  );
}

export function SpectatorWatchingBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div
      className="flex items-center gap-1 text-[9px] font-mono text-white/25 px-2 py-1 rounded-full border border-white/[0.04] bg-white/[0.02]"
      data-testid="badge-spectator-count"
    >
      <Eye className="w-2.5 h-2.5" />
      <span>{count} watching</span>
    </div>
  );
}
