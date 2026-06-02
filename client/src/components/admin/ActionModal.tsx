import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { AdminActionType, CosmeticCatalogItem } from "./types";
import { ACTION_LABELS, DESTRUCTIVE_ACTIONS } from "./types";

interface CatalogResponse {
  items: CosmeticCatalogItem[];
}

interface Props {
  actionType: AdminActionType | null;
  playerId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function resetState() {
  return {
    reason:      "",
    amount:      "",
    cosmeticId:  "",
    tier:        "gold_pro" as "gold_pro" | "diamond_elite",
    durationDays: "",
    isPermanent: false,
    confirmText: "",
    error:       null as string | null,
    submitting:  false,
  };
}

export function ActionModal({ actionType, playerId, onClose, onSuccess }: Props) {
  const qc = useQueryClient();
  const [s, setS] = useState(resetState);

  useEffect(() => {
    if (actionType) setS(resetState());
  }, [actionType, playerId]);

  const needsCosmetic = actionType === "grant-cosmetic" || actionType === "revoke-cosmetic";
  const needsAmount   = actionType === "grant-chips" || actionType === "debit-chips"
                     || actionType === "grant-stripes" || actionType === "debit-stripes";
  const needsSub      = actionType === "grant-subscription";
  const needsBanDays  = actionType === "ban";
  const isDestructive = actionType !== null && DESTRUCTIVE_ACTIONS.has(actionType);

  const { data: catalog } = useQuery<CatalogResponse>({
    queryKey: ["cosmetics", "catalog"],
    queryFn: async () => {
      const res = await apiFetch("/api/cosmetics/catalog");
      if (!res.ok) throw new Error("Failed to load cosmetics");
      return res.json();
    },
    enabled: needsCosmetic,
    staleTime: 300000,
  });

  function set<K extends keyof ReturnType<typeof resetState>>(k: K, v: ReturnType<typeof resetState>[K]) {
    setS(prev => ({ ...prev, [k]: v }));
  }

  const reasonValid  = s.reason.trim().length >= 10;
  const amountValid  = !needsAmount  || (parseInt(s.amount, 10) > 0 && /^\d+$/.test(s.amount.trim()));
  const cosmeticValid = !needsCosmetic || s.cosmeticId !== "";
  const subValid     = !needsSub     || (s.durationDays !== "" && parseInt(s.durationDays, 10) >= 1);
  const confirmValid = !isDestructive || s.confirmText.trim() === "CONFIRM";
  const canSubmit    = reasonValid && amountValid && cosmeticValid && subValid && confirmValid && !s.submitting;

  async function handleSubmit() {
    if (!actionType) return;
    set("submitting", true);
    set("error", null);

    try {
      let res: Response;
      const base = `/api/admin/players/${playerId}`;

      if (actionType === "grant-chips") {
        res = await apiFetch(`${base}/grant-chips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: parseInt(s.amount, 10), reason: s.reason.trim() }) });
      } else if (actionType === "debit-chips") {
        res = await apiFetch(`${base}/debit-chips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: parseInt(s.amount, 10), reason: s.reason.trim() }) });
      } else if (actionType === "grant-stripes") {
        res = await apiFetch(`${base}/grant-stripes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: parseInt(s.amount, 10), reason: s.reason.trim() }) });
      } else if (actionType === "debit-stripes") {
        res = await apiFetch(`${base}/debit-stripes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: parseInt(s.amount, 10), reason: s.reason.trim() }) });
      } else if (actionType === "grant-cosmetic") {
        res = await apiFetch(`${base}/grant-cosmetic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cosmeticId: s.cosmeticId, reason: s.reason.trim() }) });
      } else if (actionType === "revoke-cosmetic") {
        res = await apiFetch(`${base}/revoke-cosmetic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cosmeticId: s.cosmeticId, reason: s.reason.trim() }) });
      } else if (actionType === "grant-subscription") {
        res = await apiFetch(`${base}/grant-subscription`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: s.tier, durationDays: parseInt(s.durationDays, 10), reason: s.reason.trim() }) });
      } else if (actionType === "revoke-subscription") {
        res = await apiFetch(`${base}/revoke-subscription`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: s.reason.trim() }) });
      } else if (actionType === "ban") {
        const durationDays = s.isPermanent ? null : parseInt(s.durationDays, 10);
        res = await apiFetch(`${base}/ban`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationDays, reason: s.reason.trim() }) });
      } else if (actionType === "unban") {
        res = await apiFetch(`${base}/unban`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: s.reason.trim() }) });
      } else if (actionType === "reset-password") {
        res = await apiFetch(`${base}/reset-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: s.reason.trim() }) });
      } else {
        res = await apiFetch(base, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: s.reason.trim() }) });
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        set("error", body.error ?? `Server error ${res.status}`);
        set("submitting", false);
        return;
      }

      let successMsg = `${ACTION_LABELS[actionType]} applied`;
      if (actionType === "reset-password") {
        const body = await res.json().catch(() => null) as { token?: string } | null;
        if (body?.token) {
          successMsg = `Reset token: ${body.token}`;
          console.warn("[ADMIN RESET TOKEN]", body.token);
        }
      }

      toast({ title: ACTION_LABELS[actionType], description: successMsg });

      await qc.invalidateQueries({ queryKey: ["admin", "player", playerId] });
      await qc.invalidateQueries({ queryKey: ["admin", "player", playerId, "chips"] });
      await qc.invalidateQueries({ queryKey: ["admin", "player", playerId, "stripes"] });
      await qc.invalidateQueries({ queryKey: ["admin", "player", playerId, "admin-actions"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit-log"] });

      onSuccess();
      onClose();
    } catch {
      set("error", "Connection error — please retry");
      set("submitting", false);
    }
  }

  if (!actionType) return null;

  const label = ACTION_LABELS[actionType];
  const isDelete = actionType === "delete";

  return (
    <Dialog open={actionType !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="bg-slate-900 border-white/[0.12] text-white max-w-sm w-full" data-testid={`modal-${actionType}`}>
        <DialogHeader>
          <DialogTitle className="font-mono text-base">
            {isDelete
              ? <span className="text-red-400">{label}</span>
              : label}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          {isDelete && (
            <p className="text-xs font-mono text-red-400 bg-red-400/10 border border-red-400/20 rounded p-2" data-testid="text-delete-warning">
              This will scrub PII and zero balances. Audit trail retained.
            </p>
          )}

          {needsAmount && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1 block">
                Amount
              </label>
              <Input
                data-testid="input-action-amount"
                type="number"
                min={1}
                value={s.amount}
                onChange={e => set("amount", e.target.value)}
                placeholder="e.g. 1000"
                className="bg-white/[0.04] border-white/[0.12] text-white font-mono text-sm"
              />
            </div>
          )}

          {needsCosmetic && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1 block">
                Cosmetic
              </label>
              <select
                data-testid="select-action-cosmetic"
                value={s.cosmeticId}
                onChange={e => set("cosmeticId", e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.12] rounded px-2 py-2 text-sm font-mono text-white/80 appearance-none"
              >
                <option value="">— select cosmetic —</option>
                {catalog?.items.filter(i => i.active).map(i => (
                  <option key={i.id} value={i.id}>{i.displayName} ({i.category})</option>
                ))}
              </select>
            </div>
          )}

          {needsSub && (
            <>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1 block">
                  Tier
                </label>
                <select
                  data-testid="select-action-tier"
                  value={s.tier}
                  onChange={e => set("tier", e.target.value as "gold_pro" | "diamond_elite")}
                  className="w-full bg-white/[0.04] border border-white/[0.12] rounded px-2 py-2 text-sm font-mono text-white/80 appearance-none"
                >
                  <option value="gold_pro">Gold Pro</option>
                  <option value="diamond_elite">Diamond Elite</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1 block">
                  Duration (days)
                </label>
                <Input
                  data-testid="input-action-duration"
                  type="number"
                  min={1}
                  max={3650}
                  value={s.durationDays}
                  onChange={e => set("durationDays", e.target.value)}
                  placeholder="e.g. 30"
                  className="bg-white/[0.04] border-white/[0.12] text-white font-mono text-sm"
                />
              </div>
            </>
          )}

          {needsBanDays && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  data-testid="checkbox-ban-permanent"
                  id="permanent-ban"
                  type="checkbox"
                  checked={s.isPermanent}
                  onChange={e => set("isPermanent", e.target.checked)}
                  className="accent-red-400"
                />
                <label htmlFor="permanent-ban" className="text-xs font-mono text-white/70 cursor-pointer">
                  Permanent ban
                </label>
              </div>
              {!s.isPermanent && (
                <>
                  <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1 block">
                    Duration (days)
                  </label>
                  <Input
                    data-testid="input-ban-duration"
                    type="number"
                    min={1}
                    value={s.durationDays}
                    onChange={e => set("durationDays", e.target.value)}
                    placeholder="e.g. 7"
                    className="bg-white/[0.04] border-white/[0.12] text-white font-mono text-sm"
                  />
                </>
              )}
            </div>
          )}

          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1 block">
              Reason <span className="text-white/25">(min 10 chars)</span>
            </label>
            <Textarea
              data-testid="textarea-action-reason"
              value={s.reason}
              onChange={e => set("reason", e.target.value)}
              placeholder="Explain the reason for this action…"
              rows={3}
              className="bg-white/[0.04] border-white/[0.12] text-white font-mono text-sm resize-none"
            />
            {s.reason.length > 0 && s.reason.trim().length < 10 && (
              <p className="text-[10px] text-red-400/80 font-mono mt-1" data-testid="text-reason-too-short">
                {10 - s.reason.trim().length} more chars needed
              </p>
            )}
          </div>

          {isDestructive && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1 block">
                Type <span className="text-yellow-400 font-bold">CONFIRM</span> to proceed
              </label>
              <Input
                data-testid="input-action-confirm"
                value={s.confirmText}
                onChange={e => set("confirmText", e.target.value)}
                placeholder="CONFIRM"
                className="bg-white/[0.04] border-white/[0.12] text-white font-mono text-sm"
              />
            </div>
          )}

          {s.error && (
            <p className="text-xs text-red-400 font-mono bg-red-400/10 border border-red-400/20 rounded px-2 py-1.5" data-testid="text-action-error">
              {s.error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 flex-row justify-end">
          <Button
            data-testid="btn-action-cancel"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={s.submitting}
            className="font-mono text-white/60 hover:text-white text-xs"
          >
            Cancel
          </Button>
          <Button
            data-testid="btn-action-submit"
            size="sm"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={[
              "font-mono text-xs",
              isDestructive || isDelete
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-yellow-500 hover:bg-yellow-600 text-black",
            ].join(" ")}
          >
            {s.submitting ? "Applying…" : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
