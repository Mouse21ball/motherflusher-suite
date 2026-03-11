import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3 } from "lucide-react";
import { getHandHistory, getAllChips, type HandRecord } from "@/lib/persistence";

const MODE_NAMES: Record<string, string> = {
  swing: "Mother Flusher",
  badugi: "Badugi",
  dead7: "Dead 7",
  fifteen35: "15 / 35",
  suitspoker: "Suits & Poker",
};

const MODE_COLORS: Record<string, string> = {
  swing: "text-blue-400",
  badugi: "text-emerald-400",
  dead7: "text-red-400",
  fifteen35: "text-amber-400",
  suitspoker: "text-cyan-400",
};

const MODE_BAR_COLORS: Record<string, string> = {
  swing: "bg-blue-500",
  badugi: "bg-emerald-500",
  dead7: "bg-red-500",
  fifteen35: "bg-amber-500",
  suitspoker: "bg-cyan-500",
};

interface StatsViewProps {
  modeId?: string;
}

function computeStats(history: HandRecord[]) {
  const total = history.length;
  const wins = history.filter(h => h.result === "win").length;
  const losses = history.filter(h => h.result === "loss").length;
  const rollovers = history.filter(h => h.result === "rollover").length;
  const folds = history.filter(h => h.result === "folded").length;
  const pushes = history.filter(h => h.result === "push").length;
  const net = history.reduce((s, h) => s + h.chipChange, 0);

  const biggestWin = history.reduce((max, h) => h.chipChange > max ? h.chipChange : max, 0);
  const biggestLoss = history.reduce((min, h) => h.chipChange < min ? h.chipChange : min, 0);
  const biggestPot = history.reduce((max, h) => h.potSize > max ? h.potSize : max, 0);

  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const byMode: Record<string, { hands: number; net: number; wins: number }> = {};
  for (const h of history) {
    if (!byMode[h.mode]) byMode[h.mode] = { hands: 0, net: 0, wins: 0 };
    byMode[h.mode].hands++;
    byMode[h.mode].net += h.chipChange;
    if (h.result === "win") byMode[h.mode].wins++;
  }

  return { total, wins, losses, rollovers, folds, pushes, net, biggestWin, biggestLoss, biggestPot, winRate, byMode };
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <div className="text-[10px] text-white/40 font-mono uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-base font-bold font-mono ${color || "text-white/80"}`}>{value}</div>
    </div>
  );
}

export function StatsView({ modeId }: StatsViewProps) {
  const [open, setOpen] = useState(false);
  const history = open ? getHandHistory(modeId) : [];
  const chipMap = open ? getAllChips() : {};
  const stats = computeStats(history);

  const currentStack = modeId
    ? chipMap[modeId] ?? 1000
    : Object.values(chipMap).reduce((s, v) => s + v, 0) || 5000;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white/80 hover:border-white/25 hover:bg-white/5 transition-all"
          data-testid="button-stats"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Stats</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[320px] sm:w-[380px] bg-slate-950 border-slate-800 p-0">
        <ScrollArea className="h-full">
          <div className="p-5 sm:p-6">
            <h2 className="text-lg font-bold text-white mb-1" data-testid="text-stats-title">
              {modeId ? MODE_NAMES[modeId] || "Stats" : "Overall Stats"}
            </h2>
            <p className="text-xs text-white/40 font-mono mb-5">
              {stats.total} hands tracked
            </p>

            {stats.total === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/30 text-sm">No stats yet</p>
                <p className="text-white/20 text-xs mt-1">Play a few hands to see your stats here</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <StatBox label="Hands" value={stats.total} />
                  <StatBox
                    label="Win Rate"
                    value={`${stats.winRate}%`}
                    color={stats.winRate >= 50 ? "text-emerald-400" : stats.winRate >= 30 ? "text-amber-400" : "text-red-400"}
                  />
                  <StatBox
                    label="Net"
                    value={`${stats.net >= 0 ? "+" : ""}$${stats.net}`}
                    color={stats.net > 0 ? "text-emerald-400" : stats.net < 0 ? "text-red-400" : "text-white/50"}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <StatBox label="Wins" value={stats.wins} color="text-emerald-400" />
                  <StatBox label="Losses" value={stats.losses} color="text-red-400" />
                  <StatBox label="Folds" value={stats.folds} color="text-white/50" />
                  <StatBox label="Rollovers" value={stats.rollovers} color="text-amber-400" />
                </div>

                {stats.pushes > 0 && (
                  <div className="grid grid-cols-1 gap-2 mb-4">
                    <StatBox label="Pushes" value={stats.pushes} />
                  </div>
                )}

                <div className="space-y-2 mb-5">
                  <h3 className="text-xs font-mono text-white/40 uppercase tracking-wider font-bold">Highlights</h3>
                  <div className="space-y-1.5">
                    {stats.biggestWin > 0 && (
                      <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                        <span className="text-xs text-white/50">Biggest Win</span>
                        <span className="text-sm font-mono font-bold text-emerald-400">+${stats.biggestWin}</span>
                      </div>
                    )}
                    {stats.biggestLoss < 0 && (
                      <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10">
                        <span className="text-xs text-white/50">Biggest Loss</span>
                        <span className="text-sm font-mono font-bold text-red-400">${stats.biggestLoss}</span>
                      </div>
                    )}
                    {stats.biggestPot > 0 && (
                      <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                        <span className="text-xs text-white/50">Biggest Pot</span>
                        <span className="text-sm font-mono font-bold text-white/70">${stats.biggestPot}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                      <span className="text-xs text-white/50">Current Stack</span>
                      <span className="text-sm font-mono font-bold text-primary">${currentStack}</span>
                    </div>
                  </div>
                </div>

                {!modeId && Object.keys(stats.byMode).length > 1 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-mono text-white/40 uppercase tracking-wider font-bold">By Mode</h3>
                    <div className="space-y-1.5">
                      {Object.entries(stats.byMode)
                        .sort((a, b) => b[1].hands - a[1].hands)
                        .map(([mId, data]) => {
                          const maxHands = Math.max(...Object.values(stats.byMode).map(d => d.hands));
                          const pct = maxHands > 0 ? (data.hands / maxHands) * 100 : 0;
                          return (
                            <div key={mId} className="px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                              <div className="flex justify-between items-center mb-1.5">
                                <span className={`text-xs font-mono font-bold ${MODE_COLORS[mId] || "text-white/50"}`}>
                                  {MODE_NAMES[mId] || mId}
                                </span>
                                <span className={`text-xs font-mono font-bold ${data.net > 0 ? "text-emerald-400" : data.net < 0 ? "text-red-400" : "text-white/40"}`}>
                                  {data.net > 0 ? "+" : ""}{data.net === 0 ? "Even" : `$${data.net}`}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${MODE_BAR_COLORS[mId] || "bg-white/30"} transition-all`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-white/30 font-mono shrink-0">
                                  {data.hands}h · {data.wins}w
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
