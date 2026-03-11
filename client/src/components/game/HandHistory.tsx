import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock } from "lucide-react";
import { getHandHistory, type HandRecord } from "@/lib/persistence";

const MODE_COLORS: Record<string, string> = {
  swing: "text-blue-400",
  badugi: "text-emerald-400",
  dead7: "text-red-400",
  fifteen35: "text-amber-400",
  suitspoker: "text-cyan-400",
};

const RESULT_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  win: { label: "WIN", bg: "bg-emerald-500/15", text: "text-emerald-400" },
  loss: { label: "LOSS", bg: "bg-red-500/15", text: "text-red-400" },
  push: { label: "PUSH", bg: "bg-white/10", text: "text-white/50" },
  rollover: { label: "ROLLOVER", bg: "bg-amber-500/15", text: "text-amber-400" },
  folded: { label: "FOLDED", bg: "bg-white/10", text: "text-white/40" },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface HandHistoryProps {
  modeId?: string;
}

export function HandHistory({ modeId }: HandHistoryProps) {
  const [open, setOpen] = useState(false);
  const history = open ? getHandHistory(modeId) : [];

  const netChips = history.reduce((sum, h) => sum + h.chipChange, 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Hand history"
          className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider px-2.5 py-2 min-h-[36px] rounded-lg border border-white/10 text-white/50 hover:text-white/80 active:text-white/80 hover:border-white/25 hover:bg-white/5 transition-all touch-manipulation"
          data-testid="button-history"
        >
          <Clock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">History</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[320px] sm:w-[380px] bg-slate-950 border-slate-800 p-0" aria-describedby={undefined}>
        <SheetTitle className="sr-only">Hand History</SheetTitle>
        <ScrollArea className="h-full">
          <div className="p-5 sm:p-6 pt-10">
            <h2 className="text-lg font-bold text-white mb-1">Hand History</h2>
            <p className="text-xs text-white/50 font-mono mb-4">
              {modeId ? "This table" : "All tables"} · {history.length} hands
            </p>

            {history.length > 0 && (
              <div className="flex items-center gap-3 mb-5 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <div className="flex-1">
                  <div className="text-[10px] text-white/50 font-mono uppercase tracking-wider">Net Result</div>
                  <div className={`text-lg font-bold font-mono ${netChips > 0 ? "text-emerald-400" : netChips < 0 ? "text-red-400" : "text-white/50"}`}>
                    {netChips > 0 ? "+" : ""}{netChips === 0 ? "Even" : `$${netChips}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/50 font-mono uppercase tracking-wider">W / L</div>
                  <div className="text-sm font-mono text-white/70">
                    <span className="text-emerald-400">{history.filter(h => h.result === "win").length}</span>
                    {" / "}
                    <span className="text-red-400">{history.filter(h => h.result === "loss").length}</span>
                  </div>
                </div>
              </div>
            )}

            {history.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/50 text-sm">No hands played yet</p>
                <p className="text-white/40 text-xs mt-1">Results will appear here after each hand</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <HandRow key={h.id} hand={h} showMode={!modeId} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function HandRow({ hand, showMode }: { hand: HandRecord; showMode: boolean }) {
  const style = RESULT_STYLES[hand.result] || RESULT_STYLES.push;
  const modeColor = MODE_COLORS[hand.mode] || "text-white/50";

  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors" data-testid={`card-hand-${hand.id}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
            {style.label}
          </span>
          {showMode && (
            <span className={`text-[10px] font-mono ${modeColor}`}>
              {hand.modeName}
            </span>
          )}
        </div>
        <span className="text-[10px] text-white/45 font-mono">
          {formatTime(hand.timestamp)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/60 leading-relaxed flex-1 mr-2 line-clamp-2">
          {hand.summary}
        </p>
        <div className="text-right shrink-0">
          <div className={`text-sm font-mono font-bold ${hand.chipChange > 0 ? "text-emerald-400" : hand.chipChange < 0 ? "text-red-400" : "text-white/40"}`}>
            {hand.chipChange > 0 ? "+" : ""}{hand.chipChange === 0 ? "—" : `$${hand.chipChange}`}
          </div>
          <div className="text-[10px] text-white/40 font-mono">
            pot ${hand.potSize}
          </div>
        </div>
      </div>
    </div>
  );
}
