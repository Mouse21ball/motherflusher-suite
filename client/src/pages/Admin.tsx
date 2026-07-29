import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/session";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayerSearch } from "@/components/admin/PlayerSearch";
import { PlayerPanel } from "@/components/admin/PlayerPanel";
import { AuditLogFeed } from "@/components/admin/AuditLogFeed";
import type { MeResponse, PlayerSearchResult } from "@/components/admin/types";

// ── Member list component ─────────────────────────────────────────────────────

interface MemberListResponse {
  members: PlayerSearchResult[];
  limit:   number;
  offset:  number;
}

function MemberList({ onSelect, selectedId }: { onSelect: (id: string) => void; selectedId: string | null }) {
  const [offset, setOffset] = useState(0);
  const PAGE = 20;

  const { data, isLoading, isError } = useQuery<MemberListResponse>({
    queryKey: ["admin", "members", offset],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/members?limit=${PAGE}&offset=${offset}`);
      if (!res.ok) throw new Error("Failed to load members");
      return res.json();
    },
    staleTime: 30000,
  });

  const members = data?.members ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">
          Members {offset > 0 ? `(${offset + 1}–${offset + members.length})` : `(newest first)`}
        </p>
        <div className="flex gap-2">
          {offset > 0 && (
            <button onClick={() => setOffset(o => Math.max(0, o - PAGE))}
              className="text-[10px] font-mono text-white/40 hover:text-white/70 px-2 py-0.5 border border-white/10 rounded"
            >← prev</button>
          )}
          {members.length === PAGE && (
            <button onClick={() => setOffset(o => o + PAGE)}
              className="text-[10px] font-mono text-white/40 hover:text-white/70 px-2 py-0.5 border border-white/10 rounded"
            >next →</button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-white/40 text-xs font-mono py-2">Loading…</p>}
      {isError   && <p className="text-red-400 text-xs font-mono py-2">Failed to load</p>}

      {!isLoading && members.length > 0 && (
        <div className="border border-white/[0.08] rounded-lg overflow-hidden" data-testid="list-members">
          {members.map(p => (
            <button
              key={p.id}
              data-testid={`row-member-${p.id}`}
              onClick={() => onSelect(p.id)}
              className={[
                "w-full text-left px-3 py-2 flex items-center gap-2 transition-colors",
                "border-b border-white/[0.05] last:border-b-0 text-sm",
                selectedId === p.id
                  ? "bg-yellow-400/10 border-l-2 border-l-yellow-400"
                  : "hover:bg-white/[0.04]",
              ].join(" ")}
            >
              <span className="flex-1 min-w-0">
                <span className="block font-mono text-white truncate">{p.displayName}</span>
                {p.email && (
                  <span className="block font-mono text-[10px] text-white/35 truncate">{p.email}</span>
                )}
              </span>
              <span className="flex flex-col items-end shrink-0 gap-0.5">
                <span className="font-mono text-[10px] text-white/40">
                  ${p.chipBalance.toLocaleString()}
                </span>
                <span className="font-mono text-[10px] text-white/25">
                  {new Date(p.createdAt).toLocaleDateString()}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {!isLoading && members.length === 0 && (
        <p className="text-white/20 font-mono text-xs py-2">No members yet</p>
      )}
    </div>
  );
}

// ── Analytics helpers (preserved from original) ──────────────────────────────

interface RakeStats {
  totalAllTime: number;
  byMode: Record<string, number>;
  today: number;
  thisWeek: number;
}

interface DailyStats {
  date: string;
  uniquePlayers: number;
  sessionCount: number;
  avgSessionMs: number;
  modeBreakdown: Record<string, number>;
  returningPlayers: number;
}

const MODE_NAMES: Record<string, string> = {
  badugi:     "Badugi",
  dead7:      "Dead 7",
  fifteen35:  "15 / 35",
  suitspoker: "Suits & Poker",
  ladyluck:   "Lady Luck",
};

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function StatCard({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-3 sm:p-4" data-testid={testId}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">{label}</p>
      <p className="text-2xl font-mono font-bold">{value}</p>
    </div>
  );
}

function AnalyticsTab({ meIsAdmin }: { meIsAdmin: boolean }) {
  const { data: stats, isLoading, error } = useQuery<DailyStats[]>({
    queryKey: ["/api/analytics/stats"],
    queryFn: async () => {
      const res = await apiFetch("/api/analytics/stats");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: meIsAdmin,
    refetchInterval: 30000,
  });

  const { data: rakeStats } = useQuery<RakeStats>({
    queryKey: ["/api/admin/rake-stats"],
    queryFn: async () => {
      const res = await apiFetch("/api/admin/rake-stats");
      if (!res.ok) throw new Error("Failed to fetch rake stats");
      return res.json();
    },
    enabled: meIsAdmin,
    refetchInterval: 30000,
  });

  if (isLoading) return (
    <p className="text-white/40 font-mono text-sm py-8 text-center">Loading analytics…</p>
  );

  if (error) return (
    <p className="text-red-400 font-mono text-sm py-4 text-center">Failed to load analytics</p>
  );

  const today        = stats?.[0];
  const totalPlayers  = stats?.reduce((sum, d) => sum + d.uniquePlayers, 0) ?? 0;
  const totalSessions = stats?.reduce((sum, d) => sum + d.sessionCount,  0) ?? 0;

  return (
    <div className="flex flex-col gap-4" data-testid="section-analytics">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Today DAU"      value={today?.uniquePlayers ?? 0} testId="stat-dau" />
        <StatCard label="Today Sessions" value={today?.sessionCount  ?? 0} testId="stat-sessions-today" />
        <StatCard label="30d Players"    value={totalPlayers}              testId="stat-total-players" />
        <StatCard label="30d Sessions"   value={totalSessions}             testId="stat-total-sessions" />
      </div>

      {today && today.avgSessionMs > 0 && (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">Avg Session Today</p>
          <p className="text-lg font-mono font-bold" data-testid="stat-avg-session">{formatDuration(today.avgSessionMs)}</p>
        </div>
      )}

      {today && Object.keys(today.modeBreakdown).length > 0 && (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-4">
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

      {/* ── HOUSE RAKE ── */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg overflow-hidden" data-testid="section-rake">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/40">House Rake</p>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div data-testid="rake-stat-alltime">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">All Time</p>
            <p className="text-2xl font-mono font-bold text-amber-400">{(rakeStats?.totalAllTime ?? 0).toLocaleString()}</p>
          </div>
          <div data-testid="rake-stat-today">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">Today</p>
            <p className="text-2xl font-mono font-bold">{(rakeStats?.today ?? 0).toLocaleString()}</p>
          </div>
          <div data-testid="rake-stat-week">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">This Week</p>
            <p className="text-2xl font-mono font-bold">{(rakeStats?.thisWeek ?? 0).toLocaleString()}</p>
          </div>
          <div data-testid="rake-stat-modes">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">Modes</p>
            <div className="space-y-1">
              {rakeStats && Object.keys(rakeStats.byMode).length > 0
                ? Object.entries(rakeStats.byMode)
                    .sort(([, a], [, b]) => b - a)
                    .map(([mode, amt]) => (
                      <div key={mode} className="flex items-center justify-between gap-2" data-testid={`rake-mode-${mode}`}>
                        <span className="text-[10px] font-mono text-white/60">{MODE_NAMES[mode] || mode}</span>
                        <span className="text-[10px] font-mono font-bold">{amt.toLocaleString()}</span>
                      </div>
                    ))
                : <p className="text-[10px] font-mono text-white/30">No data yet</p>
              }
            </div>
          </div>
        </div>
      </div>

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
          {stats?.map(day => (
            <div key={day.date} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1" data-testid={`row-day-${day.date}`}>
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
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Admin() {
  const [, navigate]       = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // FIX 2: staleTime:0 + refetchOnMount:'always' forces a fresh /api/auth/me fetch
  // on every Admin page mount, bypassing any stale cache from before isAdmin was added.
  // FIX 3: Use apiFetch (same helper as the rest of the app) to avoid two-implementation
  // divergence under the shared ["/api/auth/me"] React Query cache key.
  const { data: me, isLoading: meLoading } = useQuery<MeResponse>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await apiFetch("/api/auth/me");
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });

  // FIX 1: Only redirect when the fetch is definitively complete AND isAdmin is
  // explicitly not true. Never redirect while meLoading is true or me is undefined.
  const isDefinitelyNotAdmin =
    !meLoading && me !== undefined && me.isAdmin !== true;

  useEffect(() => {
    if (isDefinitelyNotAdmin) {
      navigate("/");
    }
  }, [isDefinitelyNotAdmin, navigate]);

  // Still checking auth
  if (meLoading || me === undefined) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <p className="text-white/50 font-mono text-sm" data-testid="text-admin-checking">Checking access…</p>
      </div>
    );
  }

  // Auth settled but not admin
  if (me.isAdmin !== true) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <p className="text-red-400 font-mono text-sm" data-testid="text-admin-denied">Not authorized</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/[0.07] px-4 py-3 flex items-center justify-between sticky top-0 bg-slate-950/95 backdrop-blur z-10">
        <div>
          <h1 className="text-base font-mono font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
          <p className="text-[10px] font-mono text-white/40" data-testid="text-admin-who">{me.displayName}</p>
        </div>
        <a
          href="/"
          className="text-white/40 hover:text-white/70 text-xs font-mono transition-colors"
          data-testid="link-admin-back"
        >
          ← Lobby
        </a>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <Tabs defaultValue="players">
          <TabsList className="bg-white/[0.04] border border-white/[0.08] mb-4 w-full" data-testid="tabs-main">
            <TabsTrigger
              value="players"
              className="flex-1 font-mono text-xs data-[state=active]:bg-white/10"
              data-testid="tab-main-players"
            >
              Players
            </TabsTrigger>
            <TabsTrigger
              value="audit"
              className="flex-1 font-mono text-xs data-[state=active]:bg-white/10"
              data-testid="tab-main-audit"
            >
              Audit Log
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="flex-1 font-mono text-xs data-[state=active]:bg-white/10"
              data-testid="tab-main-analytics"
            >
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Players tab */}
          <TabsContent value="players">
            <div className="flex flex-col gap-4">
              {/* Member list + search side-by-side on large screens */}
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Left: member list + search */}
                <div className="lg:w-80 shrink-0 flex flex-col gap-4">
                  <MemberList onSelect={id => setSelectedId(id)} selectedId={selectedId} />
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">Search Players</p>
                    <PlayerSearch
                      onSelect={id => setSelectedId(id)}
                      selectedId={selectedId}
                    />
                  </div>
                </div>

                {/* Detail panel */}
                <div className="flex-1 min-w-0">
                  {selectedId ? (
                    <PlayerPanel
                      key={selectedId}
                      playerId={selectedId}
                      meId={me.profileId}
                    />
                  ) : (
                    <div className="flex items-center justify-center py-16 border border-white/[0.06] rounded-lg" data-testid="text-player-placeholder">
                      <p className="text-white/20 font-mono text-sm">Select a player to view details</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Audit Log tab */}
          <TabsContent value="audit">
            <AuditLogFeed />
          </TabsContent>

          {/* Analytics tab */}
          <TabsContent value="analytics">
            <AnalyticsTab meIsAdmin={me.isAdmin === true} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
