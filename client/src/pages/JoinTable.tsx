import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { lookupTable } from "@/lib/tableSession";
import { DEFAULT_STAKE_TIER_ID, getStakeTierId, STAKE_TIERS, type StakeTierId } from "@shared/stakeTiers";

const MODE_ROUTES: Record<string, string> = {
  badugi:      "/badugi",
  dead7:       "/dead7",
  fifteen35:   "/fifteen35",
  suitspoker:  "/suitspoker",
  suits_poker: "/suitspoker",
};

export default function JoinTable() {
  const [, navigate] = useLocation();
  const params = useParams<{ code: string }>();
  const [status, setStatus] = useState<"looking" | "found" | "notfound">("looking");
  const [stakeTier, setStakeTier] = useState<StakeTierId>(DEFAULT_STAKE_TIER_ID);

  useEffect(() => {
    const code = params.code?.toUpperCase();
    if (!code) {
      setStatus("notfound");
      return;
    }

    lookupTable(code).then(table => {
      if (!table) {
        setStatus("notfound");
        return;
      }
      setStakeTier(getStakeTierId(table.stakeTier));
      setStatus("found");
      const basePath = MODE_ROUTES[table.modeId] ?? "/";
      const route = `${basePath}?t=${code}`;
      setTimeout(() => navigate(route), 200);
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#05050A] flex items-center justify-center">
      <div className="text-center space-y-3">
        {status === "looking" && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-xl border border-[#F0B829]/20 flex items-center justify-center animate-pulse text-xl">⛓️</div>
            <p className="text-white/50 text-xs font-mono tracking-widest uppercase">Looking up table…</p>
          </div>
        )}
        {status === "found" && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-xl border border-[#00C896]/30 bg-[#00C896]/10 flex items-center justify-center text-xl">⛓️</div>
            <p className="text-[#00C896] text-xs font-mono tracking-widest uppercase">Table found — joining…</p>
            <p className="text-[#F0B829]/70 text-[10px] font-mono tracking-widest uppercase" data-testid="text-table-lookup-stakes">
              {(() => { const tier = STAKE_TIERS.find(t => t.id === stakeTier)!; return `${tier.label} · ${tier.minBet} BB`; })()}
            </p>
          </div>
        )}
        {status === "notfound" && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-xl opacity-30">⛓️</div>
            <p className="text-white/40 text-xs font-mono tracking-widest uppercase">Table not found</p>
            <button
              className="mt-2 text-[#F0B829]/60 text-xs font-mono underline underline-offset-4 hover:text-[#F0B829]/90 transition-colors"
              onClick={() => navigate("/")}
              data-testid="button-join-home"
            >
              Back to home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
