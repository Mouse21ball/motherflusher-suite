import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/session";
import { Button } from "@/components/ui/button";
import type { AdminAuditLogEntry } from "./types";
import { KNOWN_ACTION_TYPES } from "./types";

const PAGE_SIZE = 50;

function formatTs(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
}

function DiffBlock({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  if (!before && !after) return null;
  return (
    <pre className="mt-2 text-[10px] font-mono text-white/50 bg-black/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
      {before && <span className="text-red-400/80">before: {JSON.stringify(before, null, 2)}{"\n"}</span>}
      {after  && <span className="text-emerald-400/80">after:  {JSON.stringify(after, null, 2)}</span>}
    </pre>
  );
}

function AuditRow({ entry }: { entry: AdminAuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = entry.beforeState !== null || entry.afterState !== null;

  return (
    <div
      className="px-3 py-3 border-b border-white/[0.05] last:border-b-0"
      data-testid={`row-audit-${entry.id}`}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className="text-[10px] font-mono text-white/40 shrink-0 w-28">{formatTs(entry.createdAt)}</span>
        <span className="text-[10px] font-mono text-yellow-300/80 shrink-0">{entry.adminName}</span>
        <span className="text-[10px] font-mono text-white/60 bg-white/[0.06] px-1 rounded shrink-0">{entry.actionType}</span>
        <span className="text-[10px] font-mono text-white/70 shrink-0">→ {entry.targetName}</span>
      </div>
      <p className="text-xs font-mono text-white/50 mt-1 ml-0 truncate">{entry.reason}</p>
      {hasDiff && (
        <button
          data-testid={`btn-audit-diff-${entry.id}`}
          onClick={() => setExpanded(x => !x)}
          className="mt-1 text-[10px] font-mono text-white/30 hover:text-white/60 transition-colors"
        >
          {expanded ? "▲ hide diff" : "▼ show diff"}
        </button>
      )}
      {expanded && hasDiff && <DiffBlock before={entry.beforeState} after={entry.afterState} />}
    </div>
  );
}

export function AuditLogFeed() {
  const [actionTypeFilter, setActionTypeFilter] = useState("");
  const [adminIdFilter, setAdminIdFilter] = useState("");
  const [accumulated, setAccumulated] = useState<AdminAuditLogEntry[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const qsBase = () => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: "0" });
    if (actionTypeFilter) params.set("actionType", actionTypeFilter);
    if (adminIdFilter)    params.set("adminId",    adminIdFilter);
    return params.toString();
  };

  const { isLoading, isError } = useQuery<AdminAuditLogEntry[]>({
    queryKey: ["admin", "audit-log", { actionTypeFilter, adminIdFilter }],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/audit-log?${qsBase()}`);
      if (!res.ok) throw new Error("Failed to load audit log");
      const rows: AdminAuditLogEntry[] = await res.json();
      setAccumulated(rows);
      setOffset(rows.length);
      setHasMore(rows.length === PAGE_SIZE);
      return rows;
    },
    staleTime: 10000,
  });

  async function loadMore() {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (actionTypeFilter) params.set("actionType", actionTypeFilter);
      if (adminIdFilter)    params.set("adminId",    adminIdFilter);
      const res = await apiFetch(`/api/admin/audit-log?${params.toString()}`);
      if (!res.ok) throw new Error("Failed");
      const rows: AdminAuditLogEntry[] = await res.json();
      setAccumulated(prev => [...prev, ...rows]);
      setOffset(prev => prev + rows.length);
      setHasMore(rows.length === PAGE_SIZE);
    } catch {
    } finally {
      setLoadingMore(false);
    }
  }

  const uniqueAdmins = Array.from(
    new Map(accumulated.map(e => [e.adminId, e.adminName])).entries()
  );

  function handleFilterChange() {
    setAccumulated([]);
    setOffset(0);
    setHasMore(true);
  }

  return (
    <div className="flex flex-col gap-4" data-testid="section-audit-log">
      <div className="flex flex-wrap gap-2">
        <select
          data-testid="select-audit-action-type"
          value={actionTypeFilter}
          onChange={e => { setActionTypeFilter(e.target.value); handleFilterChange(); }}
          className="bg-white/[0.04] border border-white/[0.12] rounded px-2 py-1.5 text-xs font-mono text-white/80 appearance-none"
        >
          <option value="">All action types</option>
          {KNOWN_ACTION_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {uniqueAdmins.length > 1 && (
          <select
            data-testid="select-audit-admin"
            value={adminIdFilter}
            onChange={e => { setAdminIdFilter(e.target.value); handleFilterChange(); }}
            className="bg-white/[0.04] border border-white/[0.12] rounded px-2 py-1.5 text-xs font-mono text-white/80 appearance-none"
          >
            <option value="">All admins</option>
            {uniqueAdmins.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
      </div>

      {isLoading && (
        <p className="text-white/40 font-mono text-sm py-8 text-center" data-testid="text-audit-loading">Loading…</p>
      )}

      {isError && (
        <p className="text-red-400 font-mono text-sm py-4 text-center" data-testid="text-audit-error">Failed to load audit log</p>
      )}

      {!isLoading && accumulated.length === 0 && (
        <p className="text-white/30 font-mono text-sm py-8 text-center" data-testid="text-audit-empty">No entries</p>
      )}

      {accumulated.length > 0 && (
        <div className="border border-white/[0.08] rounded-lg overflow-hidden">
          {accumulated.map(e => <AuditRow key={e.id} entry={e} />)}
        </div>
      )}

      {hasMore && accumulated.length > 0 && (
        <Button
          data-testid="btn-audit-load-more"
          variant="outline"
          size="sm"
          onClick={loadMore}
          disabled={loadingMore}
          className="self-center border-white/20 text-white/60 hover:text-white hover:bg-white/[0.06] font-mono text-xs"
        >
          {loadingMore ? "Loading…" : "Load More"}
        </Button>
      )}
    </div>
  );
}
