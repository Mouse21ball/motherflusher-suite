import { useState, useCallback, useEffect, useRef } from 'react';
import type { ReactionEvent } from '@/lib/poker/types';

const REACTIONS = ['🔥', '👀', '😈', '😂', '💀', '⛓️', '💯'] as const;

interface FloatItem {
  id: number;
  emoji: string;
  offset: number;
  fromName?: string;
}

interface ReactionBarProps {
  onReact?: (emoji: string) => void;
  incomingReactions?: ReactionEvent[];
}

export function ReactionBar({ onReact, incomingReactions }: ReactionBarProps) {
  const [floats, setFloats]       = useState<FloatItem[]>([]);
  const [cooldowns, setCooldowns] = useState<Partial<Record<string, boolean>>>({});
  const seenReactionIds            = useRef<Set<string>>(new Set());

  const fire = useCallback((emoji: string, fromName?: string) => {
    const id     = Date.now() + Math.random();
    const offset = Math.random() * 60 - 30;
    setFloats(prev => [...prev.slice(-8), { id, emoji, offset, fromName }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 1800);
  }, []);

  const handleClick = useCallback((emoji: string) => {
    if (cooldowns[emoji]) return;
    fire(emoji);
    onReact?.(emoji);
    setCooldowns(prev => ({ ...prev, [emoji]: true }));
    setTimeout(() => setCooldowns(prev => ({ ...prev, [emoji]: false })), 1400);
  }, [cooldowns, fire, onReact]);

  useEffect(() => {
    if (!incomingReactions) return;
    for (const r of incomingReactions) {
      if (seenReactionIds.current.has(r.id)) continue;
      seenReactionIds.current.add(r.id);
      fire(r.emoji, r.playerName);
    }
    if (seenReactionIds.current.size > 200) {
      const arr = Array.from(seenReactionIds.current);
      seenReactionIds.current = new Set(arr.slice(-100));
    }
  }, [incomingReactions, fire]);

  return (
    <div className="relative flex flex-col items-center pointer-events-auto">
      {floats.map(f => (
        <div
          key={f.id}
          className="absolute bottom-full mb-1 pointer-events-none select-none flex flex-col items-center anim-reaction-float"
          style={{ left: `calc(50% + ${f.offset}px)`, transform: 'translateX(-50%)' }}
          aria-hidden="true"
        >
          <span className="text-xl leading-none">{f.emoji}</span>
          {f.fromName && (
            <span className="text-[8px] font-mono text-white/40 mt-0.5 whitespace-nowrap">{f.fromName}</span>
          )}
        </div>
      ))}

      <div className="flex items-center gap-0.5 px-2 py-1.5">
        {REACTIONS.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleClick(emoji)}
            disabled={!!cooldowns[emoji]}
            aria-label={`React ${emoji}`}
            data-testid={`button-react-${emoji}`}
            className={[
              'text-[15px] leading-none w-8 h-8 rounded-lg flex items-center justify-center',
              'border-0 bg-transparent select-none transition-all duration-150 cursor-pointer',
              cooldowns[emoji]
                ? 'opacity-20 scale-90 pointer-events-none'
                : 'opacity-40 hover:opacity-90 hover:bg-white/[0.05] active:scale-90',
            ].join(' ')}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
