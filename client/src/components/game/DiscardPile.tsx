import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface DiscardPileProps {
  messages: { id: string; text: string; time: number }[];
  isDrawPhase: boolean;
}

export function DiscardPile({ messages, isDrawPhase }: DiscardPileProps) {
  const [discardEvents, setDiscardEvents] = useState<{ count: number; name: string; key: string }[]>([]);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!messages.length) return;
    const latest = messages[messages.length - 1];
    const match = latest.text.match(/^(.+?) discarded (\d+) cards?$/);
    if (match) {
      const name = match[1];
      const count = parseInt(match[2], 10);
      setDiscardEvents(prev => [...prev, { count, name, key: latest.id }]);
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      return () => clearTimeout(t);
    }
  }, [messages]);

  useEffect(() => {
    if (!isDrawPhase) return;
    setDiscardEvents([]);
  }, [isDrawPhase]);

  const totalDiscards = discardEvents.reduce((sum, e) => sum + e.count, 0);

  if (!isDrawPhase && totalDiscards === 0) return null;

  return (
    <div className={cn(
      "flex flex-col items-center gap-1",
      flash && "anim-pot-collect"
    )} data-testid="discard-pile">
      <div className="relative w-14 h-10 sm:w-16 sm:h-12">
        {Array.from({ length: Math.min(totalDiscards, 6) }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "absolute w-8 h-11 sm:w-10 sm:h-14 playing-card-back rounded-sm shadow-md border border-white/5",
              flash && i === Math.min(totalDiscards, 6) - 1 && "animate-in zoom-in-50 duration-300"
            )}
            style={{
              left: `${4 + i * 2}px`,
              top: `${-2 + i * 1}px`,
              transform: `rotate(${(i - 2) * 8}deg)`,
              zIndex: i
            }}
          />
        ))}
        {totalDiscards === 0 && isDrawPhase && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-14 sm:w-12 sm:h-16 rounded-sm border-2 border-dashed border-white/20 flex items-center justify-center">
              <span className="text-white/35 text-[8px] font-mono">MUCK</span>
            </div>
          </div>
        )}
      </div>
      {totalDiscards > 0 && (
        <span className="text-white/40 text-[9px] font-mono">{totalDiscards} discarded</span>
      )}
    </div>
  );
}
