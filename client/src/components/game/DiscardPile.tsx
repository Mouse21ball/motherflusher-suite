import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";

interface DiscardPileProps {
  messages: { id: string; text: string; time: number }[];
  isDrawPhase: boolean;
}

// How long the discard feedback is visible before the exit animation starts.
// Kept short so the play area clears quickly between draw actions.
const DISCARD_TTL = 650;
const DISCARD_EXIT_MS = 130;

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
    const flashTimer = setTimeout(() => setFlash(false), 300);

    // Start exit animation after TTL, then remove from DOM
    const exitTimer = setTimeout(() => {
      setDiscardEvents(prev =>
        prev.map(e => e.key === key ? { ...e, exiting: true } : e)
      );
    }, DISCARD_TTL);

    const removeTimer = setTimeout(() => {
      setDiscardEvents(prev => prev.filter(e => e.key !== key));
    }, DISCARD_TTL + DISCARD_EXIT_MS + 20);

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
    <div className="flex flex-col items-center gap-1" data-testid="discard-pile">
      {/* Card stack — flies up and out when exiting */}
      <div
        className={cn(
          "relative w-16 h-14 sm:w-20 sm:h-16",
          flash && "anim-pot-collect",
          allExiting && "anim-discard-exit"
        )}
      >
        {Array.from({ length: Math.min(totalDiscards, 6) }).map((_, i) => (
          <div
            key={i}
            className="absolute w-8 h-11 sm:w-10 sm:h-14 playing-card-back rounded-sm shadow-md border border-white/5"
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
            <div className="w-10 h-14 sm:w-12 sm:h-16 rounded-sm border border-dashed border-white/12 flex items-center justify-center">
              <span className="text-white/20 text-[8px] font-mono">MUCK</span>
            </div>
          </div>
        )}
      </div>
      {/* Label disappears with the cards — not during exit */}
      {totalDiscards > 0 && !allExiting && (
        <span className="text-white/35 text-[9px] font-mono">{totalDiscards} discarded</span>
      )}
    </div>
  );
}
