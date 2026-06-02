import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { PlayerSearchResult } from "./types";

interface Props {
  onSelect: (id: string) => void;
  selectedId: string | null;
}

export function PlayerSearch({ onSelect, selectedId }: Props) {
  const [input, setInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQ(input.trim()), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [input]);

  const enabled = debouncedQ.length > 0;

  const { data, isLoading, isError } = useQuery<PlayerSearchResult[]>({
    queryKey: ["admin", "search", debouncedQ],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/players/search?q=${encodeURIComponent(debouncedQ)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled,
    staleTime: 15000,
  });

  return (
    <div className="flex flex-col gap-2">
      <Input
        data-testid="input-player-search"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Search by name, email, or ID…"
        className="bg-white/[0.04] border-white/[0.12] text-white placeholder:text-white/30 font-mono text-sm"
      />

      {isLoading && (
        <p className="text-white/40 text-xs font-mono px-1 py-2" data-testid="text-search-loading">Searching…</p>
      )}

      {isError && (
        <p className="text-red-400 text-xs font-mono px-1 py-2" data-testid="text-search-error">Search failed</p>
      )}

      {!isLoading && data && data.length === 0 && enabled && (
        <p className="text-white/30 text-xs font-mono px-1 py-2" data-testid="text-search-empty">No players found</p>
      )}

      {data && data.length > 0 && (
        <div className="border border-white/[0.08] rounded-lg overflow-hidden" data-testid="list-player-results">
          {data.map(p => (
            <button
              key={p.id}
              data-testid={`row-player-${p.id}`}
              onClick={() => onSelect(p.id)}
              className={[
                "w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors",
                "border-b border-white/[0.05] last:border-b-0",
                selectedId === p.id
                  ? "bg-yellow-400/10 border-l-2 border-l-yellow-400"
                  : "hover:bg-white/[0.04]",
              ].join(" ")}
            >
              <span className="flex-1 min-w-0">
                <span className="block font-mono text-sm text-white truncate">{p.displayName}</span>
                {p.email && (
                  <span className="block font-mono text-xs text-white/40 truncate">{p.email}</span>
                )}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                {p.isAdmin && (
                  <Badge className="text-[10px] px-1 py-0 bg-yellow-400/20 text-yellow-300 border-yellow-400/30" data-testid={`badge-admin-${p.id}`}>
                    admin
                  </Badge>
                )}
                {p.isBanned && (
                  <Badge className="text-[10px] px-1 py-0 bg-red-400/20 text-red-300 border-red-400/30" data-testid={`badge-banned-${p.id}`}>
                    banned
                  </Badge>
                )}
                {p.isDeleted && (
                  <Badge className="text-[10px] px-1 py-0 bg-white/10 text-white/40 border-white/20" data-testid={`badge-deleted-${p.id}`}>
                    deleted
                  </Badge>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
