import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";

interface DiscardPileProps {
  messages: { id: string; text: string; time: number }[];
  isDrawPhase: boolean;
}

const DISCARD_TTL = 1400;

export function DiscardPile({ messages, isDrawPhase }: DiscardPileProps) {
  const [discardEvents, setDiscardEvents] = useState<{ count: number; name: string; key: string; exiting: boolean }[]>([]);
  const [flash, setFlash] = useState(false);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!messages.length) return;
    const latest = messages[messages.length - 1];
    const match = latest.text.match(/^(.+?) discarded (\d+) cards?$/);
    if (!match) return;

    const name = match[1];
    const count = parseInt(match[2], 10);
    const key = latest.id;

    setDiscardEvents(prev => {
      if (prev.some(e => e.key === key)) return prev;
      return [...prev, { count, name, key, exiting: false }];
    });

    setFlash(true);
    const flashTimer = setTimeout(() => setFlash(false), 600);

    // Begin exit animation after TTL, then remove from DOM
    const exitTimer = setTimeout(() => {
      setDiscardEvents(prev =>
        prev.map(e => e.key === key ? { ...e, exiting: true } : e)
      );
    }, DISCARD_TTL);

    const removeTimer = setTimeout(() => {
      setDiscardEvents(prev => prev.filter(e => e.key !== key));
    }, DISCARD_TTL + 200);

    timersRef.current[key] = exitTimer;

    return () => {
      clearTimeout(flashTimer);
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [messages]);

  // Full clear on phase change (safety net)
  useEffect(() => {
    if (!isDrawPhase) {
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
      setDiscardEvents([]);
    }
  }, [isDrawPhase]);

  const totalDiscards = discardEvents.reduce((sum, e) => sum + e.count, 0);
  const allExiting = discardEvents.length > 0 && discardEvents.every(e => e.exiting);

  if (!isDrawPhase && totalDiscards === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 transition-opacity duration-200",
        flash && "anim-pot-collect",
        allExiting && "opacity-0"
      )}
      style={{ transition: allExiting ? 'opacity 180ms ease-out' : undefined }}
      data-testid="discard-pile"
    >
      <div className="relative w-16 h-14 sm:w-20 sm:h-16">
        {Array.from({ length: Math.min(totalDiscards, 6) }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "absolute w-8 h-11 sm:w-10 sm:h-14 playing-card-back rounded-sm shadow-md border border-white/5",
              flash && i === Math.min(totalDiscards, 6) - 1 && "animate-in zoom-in-50 duration-200"
            )}
            style={{
              left: `${6 + i * 2}px`,
              top: `${2 + i * 1}px`,
              transform: `rotate(${(i - 2.5) * 7}deg)`,
              zIndex: i,
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
