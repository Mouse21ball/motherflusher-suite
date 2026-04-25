import { useQuery } from "@tanstack/react-query";

interface DailyStats {
  date: string;
  uniquePlayers: number;
  sessionCount: number;
  avgSessionMs: number;
  modeBreakdown: Record<string, number>;
  returningPlayers: number;
}

const MODE_NAMES: Record<string, string> = {
  badugi: "Badugi",
  dead7: "Dead 7",
  fifteen35: "15 / 35",
  suitspoker: "Suits & Poker",
};

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export default function Admin() {
  const { data: stats, isLoading, error } = useQuery<DailyStats[]>({
    queryKey: ["/api/analytics/stats"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/stats");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <p className="text-white/50 font-mono text-sm">Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <p className="text-red-400 font-mono text-sm">Failed to load analytics</p>
      </div>
    );
  }

  const today = stats?.[0];
  const totalPlayers = stats?.reduce((sum, d) => sum + d.uniquePlayers, 0) ?? 0;
  const totalSessions = stats?.reduce((sum, d) => sum + d.sessionCount, 0) ?? 0;

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold font-mono" data-testid="text-admin-title">Analytics</h1>
          <a href="/" className="text-white/40 hover:text-white/70 text-sm font-mono transition-colors" data-testid="link-admin-back">&larr; Lobby</a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Today DAU" value={today?.uniquePlayers ?? 0} testId="stat-dau" />
          <StatCard label="Today Sessions" value={today?.sessionCount ?? 0} testId="stat-sessions-today" />
          <StatCard label="30d Players" value={totalPlayers} testId="stat-total-players" />
          <StatCard label="30d Sessions" value={totalSessions} testId="stat-total-sessions" />
        </div>

        {today && today.avgSessionMs > 0 && (
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-4 mb-6">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">Avg Session Today</p>
            <p className="text-lg font-mono font-bold" data-testid="stat-avg-session">{formatDuration(today.avgSessionMs)}</p>
          </div>
        )}

        {today && Object.keys(today.modeBreakdown).length > 0 && (
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-4 mb-6">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-3">Mode Plays Today</p>
            <div className="space-y-2">
              {Object.entries(today.modeBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([mode, count]) => (
                  <div key={mode} className="flex items-center justify-between" data-testid={`stat-mode-${mode}`}>
                    <span className="text-sm text-white/70 font-mono">{MODE_NAMES[mode] || mode}</span>
                    <span className="text-sm font-mono font-bold">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/40">Daily Breakdown (Last 30 Days)</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {(!stats || stats.length === 0) && (
              <div className="px-4 py-8 text-center">
                <p className="text-white/30 font-mono text-sm">No data yet</p>
              </div>
            )}
            {stats?.map((day) => (
              <div key={day.date} className="px-4 py-3 flex items-center gap-4" data-testid={`row-day-${day.date}`}>
                <span className="text-xs font-mono text-white/50 w-24 shrink-0">{day.date}</span>
                <span className="text-xs font-mono text-white/70 w-16 shrink-0">{day.uniquePlayers} DAU</span>
                <span className="text-xs font-mono text-white/70 w-16 shrink-0">{day.sessionCount} sess</span>
                <span className="text-xs font-mono text-white/50 w-20 shrink-0">
                  {day.avgSessionMs > 0 ? formatDuration(day.avgSessionMs) : "—"}
                </span>
                <span className="text-xs font-mono text-white/50 shrink-0">
                  {day.returningPlayers > 0 ? `${day.returningPlayers} ret` : ""}
                </span>
                {Object.keys(day.modeBreakdown).length > 0 && (
                  <span className="text-[10px] font-mono text-white/35 truncate">
                    {Object.entries(day.modeBreakdown).map(([m, c]) => `${m}:${c}`).join(" ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-3 sm:p-4" data-testid={testId}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">{label}</p>
      <p className="text-2xl font-mono font-bold">{value}</p>
    </div>
  );
}
