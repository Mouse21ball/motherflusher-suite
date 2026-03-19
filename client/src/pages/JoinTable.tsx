import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { lookupTable } from "@/lib/tableSession";

// MODE_ROUTES maps modeId → client path
const MODE_ROUTES: Record<string, string> = {
  swing:       "/swing",
  badugi:      "/badugi",
  dead7:       "/dead7",
  fifteen35:   "/fifteen35",
  suitspoker:  "/suitspoker",
};

export default function JoinTable() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"looking" | "found" | "notfound">("looking");

  useEffect(() => {
    const code = window.location.pathname.split("/join/")[1]?.toUpperCase();
    if (!code) {
      setStatus("notfound");
      return;
    }

    lookupTable(code).then(table => {
      if (!table) {
        setStatus("notfound");
        return;
      }
      setStatus("found");
      // For Badugi, carry the table code into the URL so the game page joins
      // the correct server-authoritative table rather than generating a new one.
      const route = table.modeId === 'badugi'
        ? `/badugi?t=${code}`
        : (MODE_ROUTES[table.modeId] ?? "/");
      setTimeout(() => navigate(route), 600);
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#0B0B0D] flex items-center justify-center">
      <div className="text-center space-y-3">
        {status === "looking" && (
          <>
            <p className="text-white/60 text-sm font-mono tracking-widest uppercase">Looking up table…</p>
          </>
        )}
        {status === "found" && (
          <>
            <p className="text-[#C9A227] text-sm font-mono tracking-widest uppercase">Table found — joining…</p>
          </>
        )}
        {status === "notfound" && (
          <>
            <p className="text-white/50 text-sm font-mono tracking-widest uppercase">Table not found</p>
            <button
              className="mt-4 text-[#C9A227]/70 text-xs font-mono underline underline-offset-2"
              onClick={() => navigate("/")}
              data-testid="button-join-home"
            >
              Back to home
            </button>
          </>
        )}
      </div>
    </div>
  );
}
