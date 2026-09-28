import { useState, useCallback, useEffect, useRef } from 'react';
import type { ReactionEvent } from '@/lib/poker/types';
import { getEntitledReactions, getStarterEmoteCount } from '@/lib/retention';

// Key written by StarterPackModal when the pack (including emotes) is claimed.
// Cleared here after showing the one-time starter-emotes badge.
const EMOTES_UNLOCKED_KEY = 'cgp_emotes_just_unlocked';

function consumeEmotesUnlockedFlag(): boolean {
  try {
    if (localStorage.getItem(EMOTES_UNLOCKED_KEY) === '1') {
      localStorage.removeItem(EMOTES_UNLOCKED_KEY);
      return true;
    }
  } catch {}
  return false;
}

interface FloatItem {
  id: number;
  emoji: string;
  leftPct: number;
  rotation: number;
}

interface ReactionBarProps {
  onReact?: (emoji: string) => void;
  incomingReactions?: ReactionEvent[];
  level?: number;
  className?: string;
}

export function ReactionBar({ onReact, incomingReactions, level, className = '' }: ReactionBarProps) {
  const [floats, setFloats]         = useState<FloatItem[]>([]);
  const [cooldowns, setCooldowns]   = useState<Partial<Record<string, boolean>>>({});
  const [showUnlocked, setShowUnlocked] = useState(false);
  const [starterPackEmoteCount, setStarterPackEmoteCount] = useState(() => getStarterEmoteCount());
  const seenReactionIds             = useRef<Set<string>>(new Set());
  const reactions = getEntitledReactions(level, starterPackEmoteCount);

  // One-time starter-emotes badge after StarterPack is claimed.
  useEffect(() => {
    setStarterPackEmoteCount(getStarterEmoteCount());
    if (consumeEmotesUnlockedFlag()) {
      setShowUnlocked(true);
      const t = setTimeout(() => setShowUnlocked(false), 3200);
      return () => clearTimeout(t);
    }
  }, []);

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

      {/* One-time starter-emotes badge after StarterPack claim (T09) */}
      {showUnlocked && (
        <div
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
          data-testid="text-emotes-unlocked"
          style={{
            background: 'rgba(52,211,153,0.12)',
            border: '1px solid rgba(52,211,153,0.28)',
            borderRadius: '999px',
            padding: '4px 12px',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: 'rgba(52,211,153,0.85)',
            letterSpacing: '0.12em',
            animation: 'fadeIn 0.3s ease',
          }}
        >
          🎭 Starter emotes unlocked!
        </div>
      )}

      {/* Trigger tray — compact pill at table edge */}
      <div
        className="flex max-w-full items-center gap-0.5 px-2 py-1 bg-black/50 backdrop-blur-sm border border-white/[0.07] rounded-full overflow-x-auto"
        aria-label="Available reactions"
        data-testid="reaction-tray"
      >
        {reactions.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleClick(emoji)}
            disabled={!!cooldowns[emoji]}
            aria-label={`React ${emoji}`}
            data-testid={`button-react-${emoji}`}
            className={[
              'text-[15px] leading-none w-7 h-7 shrink-0 rounded-full flex items-center justify-center select-none',
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
