import { useState, useCallback, useEffect, useRef } from 'react';
import type { ReactionEvent } from '@/lib/poker/types';

const REACTIONS = ['🔥', '👀', '😈', '💀', '⛓️', '💯', '😂'] as const;

interface FloatItem {
  id: number;
  emoji: string;
  leftPct: number;
  rotation: number;
}

interface ReactionBarProps {
  onReact?: (emoji: string) => void;
  incomingReactions?: ReactionEvent[];
  className?: string;
}

export function ReactionBar({ onReact, incomingReactions, className = '' }: ReactionBarProps) {
  const [floats, setFloats]       = useState<FloatItem[]>([]);
  const [cooldowns, setCooldowns] = useState<Partial<Record<string, boolean>>>({});
  const seenReactionIds           = useRef<Set<string>>(new Set());

  const fire = useCallback((emoji: string) => {
    const id       = Date.now() + Math.random();
    const leftPct  = 15 + Math.random() * 70;
    const rotation = (Math.random() - 0.5) * 26;
    setFloats(prev => [...prev.slice(-10), { id, emoji, leftPct, rotation }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 2400);
  }, []);

  const handleClick = useCallback((emoji: string) => {
    if (cooldowns[emoji]) return;
    fire(emoji);
    onReact?.(emoji);
    setCooldowns(prev => ({ ...prev, [emoji]: true }));
    setTimeout(() => setCooldowns(prev => ({ ...prev, [emoji]: false })), 1600);
  }, [cooldowns, fire, onReact]);

  useEffect(() => {
    if (!incomingReactions) return;
    for (const r of incomingReactions) {
      if (seenReactionIds.current.has(r.id)) continue;
      seenReactionIds.current.add(r.id);
      fire(r.emoji);
    }
    if (seenReactionIds.current.size > 200) {
      const arr = Array.from(seenReactionIds.current);
      seenReactionIds.current = new Set(arr.slice(-100));
    }
  }, [incomingReactions, fire]);

  return (
    <div className={`relative pointer-events-auto ${className}`}>
      {/* Float layer — travels upward into table space */}
      <div
        className="absolute bottom-full inset-x-0 h-48 pointer-events-none overflow-visible"
        aria-hidden="true"
      >
        {floats.map(f => (
          <div
            key={f.id}
            className="absolute bottom-0 anim-reaction-float select-none leading-none text-2xl"
            style={{ left: `${f.leftPct}%`, transform: 'translateX(-50%)', '--r': `${f.rotation}deg` } as React.CSSProperties}
          >
            {f.emoji}
          </div>
        ))}
      </div>

      {/* Trigger tray — compact pill at table edge */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-black/50 backdrop-blur-sm border border-white/[0.07] rounded-full">
        {REACTIONS.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleClick(emoji)}
            disabled={!!cooldowns[emoji]}
            aria-label={`React ${emoji}`}
            data-testid={`button-react-${emoji}`}
            className={[
              'text-[15px] leading-none w-7 h-7 rounded-full flex items-center justify-center select-none',
              'transition-all duration-150 cursor-pointer',
              cooldowns[emoji]
                ? 'opacity-20 scale-75 pointer-events-none'
                : 'opacity-[0.45] hover:opacity-90 hover:scale-110 active:scale-90',
            ].join(' ')}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
