import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionModal } from "./ActionModal";
import type { AdminPlayerDetails, ChipTransaction, StripeTransaction, AdminAction, AdminActionType } from "./types";

interface Props {
  playerId: string;
  meId: string;
}

function age(createdAt: string | null | undefined) {
  if (!createdAt) return "N/A";
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return "N/A";
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function fmtDate(ts: string | null | undefined) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTs(ts: string | null | undefined) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtNum(n: number) {
  return n.toLocaleString("en-US");
}

function BanBadge({ bannedAt, banExpiresAt }: { bannedAt: string | null; banExpiresAt: string | null }) {
  if (!bannedAt) return null;
  const perm = !banExpiresAt;
  return (
    <Badge className="text-[10px] px-1 py-0 bg-red-400/20 text-red-300 border-red-400/30" data-testid="badge-player-banned">
      {perm ? "banned ∞" : `banned until ${fmtDate(banExpiresAt)}`}
    </Badge>
  );
}

function ChipHistoryTab({ playerId }: { playerId: string }) {
  const { data, isLoading } = useQuery<ChipTransaction[]>({
    queryKey: ["admin", "player", playerId, "chips"],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/players/${playerId}/chip-history?limit=50&offset=0`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 10000,
  });
  if (isLoading) return <p className="text-white/40 font-mono text-xs py-4 text-center">Loading…</p>;
  if (!data || data.length === 0) return <p className="text-white/30 font-mono text-xs py-4 text-center">No transactions</p>;
  return (
    <div className="space-y-0 border border-white/[0.06] rounded-lg overflow-hidden">
      {data.map(tx => (
        <div key={tx.id} className="px-3 py-2 border-b border-white/[0.04] last:border-b-0 flex items-center gap-3" data-testid={`row-chip-tx-${tx.id}`}>
          <span className={`text-sm font-mono font-bold shrink-0 ${tx.amountChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {tx.amountChange >= 0 ? "+" : ""}{fmtNum(tx.amountChange)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-mono text-white/60 truncate">{tx.reason} · {tx.source}</span>
            <span className="block text-[10px] font-mono text-white/30">{fmtTs(tx.createdAt)} · bal: {fmtNum(tx.afterBalance)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function StripesHistoryTab({ playerId }: { playerId: string }) {
  const { data, isLoading } = useQuery<StripeTransaction[]>({
    queryKey: ["admin", "player", playerId, "stripes"],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/players/${playerId}/stripes-history?limit=50&offset=0`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 10000,
  });
  if (isLoading) return <p className="text-white/40 font-mono text-xs py-4 text-center">Loading…</p>;
  if (!data || data.length === 0) return <p className="text-white/30 font-mono text-xs py-4 text-center">No transactions</p>;
  return (
    <div className="space-y-0 border border-white/[0.06] rounded-lg overflow-hidden">
      {data.map(tx => (
        <div key={tx.id} className="px-3 py-2 border-b border-white/[0.04] last:border-b-0 flex items-center gap-3" data-testid={`row-stripe-tx-${tx.id}`}>
          <span className={`text-sm font-mono font-bold shrink-0 ${tx.amount >= 0 ? "text-yellow-400" : "text-red-400"}`}>
            {tx.amount >= 0 ? "+" : ""}{fmtNum(tx.amount)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-mono text-white/60 truncate">{tx.reason}</span>
            <span className="block text-[10px] font-mono text-white/30">{fmtTs(tx.createdAt)} · bal: {fmtNum(tx.balanceAfter)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function AdminActionsTab({ playerId }: { playerId: string }) {
  const { data, isLoading } = useQuery<AdminAction[]>({
    queryKey: ["admin", "player", playerId, "admin-actions"],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/players/${playerId}/admin-actions?limit=50&offset=0`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 10000,
  });
  if (isLoading) return <p className="text-white/40 font-mono text-xs py-4 text-center">Loading…</p>;
  if (!data || data.length === 0) return <p className="text-white/30 font-mono text-xs py-4 text-center">No admin actions</p>;
  return (
    <div className="space-y-0 border border-white/[0.06] rounded-lg overflow-hidden">
      {data.map(a => (
        <div key={a.id} className="px-3 py-2 border-b border-white/[0.04] last:border-b-0" data-testid={`row-admin-action-${a.id}`}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/60 bg-white/[0.06] px-1 rounded">{a.actionType}</span>
            <span className="text-[10px] font-mono text-white/30">{fmtTs(a.createdAt)}</span>
          </div>
          <p className="text-xs font-mono text-white/50 mt-0.5 truncate">{a.reason}</p>
        </div>
      ))}
    </div>
  );
}

const ACTION_GROUPS: { label: string; actions: AdminActionType[] }[] = [
  { label: "Chips",        actions: ["grant-chips", "debit-chips"] },
  { label: "Stripes",      actions: ["grant-stripes", "debit-stripes"] },
  { label: "Cosmetics",    actions: ["grant-cosmetic", "revoke-cosmetic"] },
  { label: "Subscription", actions: ["grant-subscription", "revoke-subscription"] },
  { label: "Account",      actions: ["ban", "unban", "reset-password", "delete"] },
];

const ACTION_BUTTON_LABELS: Partial<Record<AdminActionType, string>> = {
  "grant-chips":         "Grant Chips",
  "debit-chips":         "Debit Chips",
  "grant-stripes":       "Grant Stripes",
  "debit-stripes":       "Debit Stripes",
  "grant-cosmetic":      "Grant Cosmetic",
  "revoke-cosmetic":     "Revoke Cosmetic",
  "grant-subscription":  "Grant Sub",
  "revoke-subscription": "Revoke Sub",
  "ban":                 "Ban",
  "unban":               "Unban",
  "reset-password":      "Reset Password",
  "delete":              "Delete Account",
};

export function PlayerPanel({ playerId, meId }: Props) {
  const [activeModal, setActiveModal] = useState<AdminActionType | null>(null);

  const { data, isLoading, isError } = useQuery<AdminPlayerDetails>({
    queryKey: ["admin", "player", playerId],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/players/${playerId}`);
      if (res.status === 404) throw new Error("not_found");
      if (!res.ok) throw new Error("fetch_failed");
      return res.json();
    },
    staleTime: 15000,
    enabled: playerId !== "",
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-16" data-testid="text-player-loading">
      <p className="text-white/40 font-mono text-sm">Loading player…</p>
    </div>
  );

  if (isError) {
    const isNotFound = false; // can't easily inspect error type here; server 404 → generic
    return (
      <div className="flex items-center justify-center py-16" data-testid="text-player-error">
        <p className="text-red-400 font-mono text-sm">{isNotFound ? "Player not found" : "Failed to load player"}</p>
      </div>
    );
  }

  if (!data) return null;

  const { profile } = data;
  const isSelf = playerId === meId;
  const isBanned = profile.bannedAt !== null;

  return (
    <div className="flex flex-col gap-4" data-testid={`panel-player-${playerId}`}>
      {/* Header */}
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-4">
        <div className="flex flex-wrap items-start gap-2 mb-2">
          <h2 className="text-base font-mono font-bold text-white" data-testid="text-player-name">{profile.displayName}</h2>
          {profile.isAdmin && (
            <Badge className="text-[10px] px-1 py-0 bg-yellow-400/20 text-yellow-300 border-yellow-400/30" data-testid="badge-is-admin">admin</Badge>
          )}
          <BanBadge bannedAt={profile.bannedAt} banExpiresAt={profile.banExpiresAt} />
          {profile.isDeleted && (
            <Badge className="text-[10px] px-1 py-0 bg-white/10 text-white/40 border-white/20" data-testid="badge-is-deleted">deleted</Badge>
          )}
        </div>

        <div className="grid grid-cols-1 gap-0.5 text-[11px] font-mono text-white/50">
          {profile.email && (
            <span data-testid="text-player-email">{profile.email}</span>
          )}
          <span data-testid="text-player-id" className="break-all text-white/30">{profile.id}</span>
          <span data-testid="text-player-age">Account: {age(profile.createdAt)}</span>
          {isBanned && profile.banReason && (
            <span className="text-red-400/70" data-testid="text-ban-reason">Ban reason: {profile.banReason}</span>
          )}
        </div>

        {/* Balances */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <BalStat label="Chips"        value={fmtNum(profile.chipBalance)} testId="stat-chip-balance" />
          <BalStat label="Stripes"      value={fmtNum(profile.stripes)}     testId="stat-stripes" />
          <BalStat label="Hands"        value={fmtNum(profile.handsPlayed)} testId="stat-hands" />
          <BalStat label="Lifetime P/L" value={(profile.lifetimeProfit >= 0 ? "+" : "") + fmtNum(profile.lifetimeProfit)} testId="stat-lifetime-pl" />
        </div>

        {/* Subscription */}
        {profile.activeSubscriptionTier && (
          <div className="mt-2 text-[11px] font-mono text-yellow-300/70" data-testid="text-subscription">
            Sub: {profile.activeSubscriptionTier} · expires {fmtDate(profile.subscriptionExpiresAt)}
          </div>
        )}
      </div>

      {/* Self-protection notice */}
      {isSelf && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg px-3 py-2" data-testid="notice-self-protection">
          <p className="text-xs font-mono text-yellow-300">Cannot perform admin actions on your own account.</p>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="actions">
        <TabsList className="bg-white/[0.04] border border-white/[0.08] w-full h-auto flex-wrap">
          <TabsTrigger value="actions"       className="font-mono text-xs data-[state=active]:bg-white/10 flex-1" data-testid="tab-actions">Actions</TabsTrigger>
          <TabsTrigger value="chip-history"  className="font-mono text-xs data-[state=active]:bg-white/10 flex-1" data-testid="tab-chip-history">Chips</TabsTrigger>
          <TabsTrigger value="stripe-history" className="font-mono text-xs data-[state=active]:bg-white/10 flex-1" data-testid="tab-stripe-history">Stripes</TabsTrigger>
          <TabsTrigger value="admin-history" className="font-mono text-xs data-[state=active]:bg-white/10 flex-1" data-testid="tab-admin-history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="actions" className="mt-3">
          {isSelf ? (
            <p className="text-white/30 font-mono text-xs text-center py-4">No actions available</p>
          ) : (
            <div className="flex flex-col gap-3">
              {ACTION_GROUPS.map(group => {
                const visibleActions = group.actions.filter(a => {
                  if (a === "unban" && !isBanned) return false;
                  if (a === "ban" && isBanned) return false;
                  if (a === "revoke-subscription" && !profile.activeSubscriptionTier) return false;
                  return true;
                });
                if (visibleActions.length === 0) return null;
                return (
                  <div key={group.label}>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-white/25 mb-1.5">{group.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {visibleActions.map(a => {
                        const isDestructive = a === "debit-chips" || a === "debit-stripes" || a === "ban" || a === "delete";
                        return (
                          <Button
                            key={a}
                            data-testid={`btn-action-${a}`}
                            size="sm"
                            variant="outline"
                            onClick={() => setActiveModal(a)}
                            disabled={profile.isDeleted && a !== "delete"}
                            className={[
                              "font-mono text-xs h-7 px-2",
                              isDestructive
                                ? "border-red-400/30 text-red-300/80 hover:bg-red-400/10 hover:text-red-300"
                                : "border-white/[0.12] text-white/60 hover:bg-white/[0.06] hover:text-white",
                            ].join(" ")}
                          >
                            {ACTION_BUTTON_LABELS[a] ?? a}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="chip-history" className="mt-3">
          <ChipHistoryTab playerId={playerId} />
        </TabsContent>

        <TabsContent value="stripe-history" className="mt-3">
          <StripesHistoryTab playerId={playerId} />
        </TabsContent>

        <TabsContent value="admin-history" className="mt-3">
          <AdminActionsTab playerId={playerId} />
        </TabsContent>
      </Tabs>

      <ActionModal
        actionType={activeModal}
        playerId={playerId}
        ownedCosmetics={data.ownedCosmetics.map(c => ({ id: c.id, displayName: c.displayName, category: c.category }))}
        onClose={() => setActiveModal(null)}
        onSuccess={() => setActiveModal(null)}
      />
    </div>
  );
}

function BalStat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded p-2" data-testid={testId}>
      <p className="text-[9px] font-mono uppercase tracking-widest text-white/30 mb-0.5">{label}</p>
      <p className="text-sm font-mono font-bold text-white">{value}</p>
    </div>
  );
}
