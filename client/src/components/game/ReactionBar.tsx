import { useState, useCallback } from 'react';

const REACTIONS = ['🔥', '👀', '😈', '😂', '💀'] as const;

interface FloatItem {
  id: number;
  emoji: string;
  offset: number;
}

export function ReactionBar() {
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const [cooldowns, setCooldowns] = useState<Partial<Record<string, boolean>>>({});

  const fire = useCallback((emoji: string) => {
    if (cooldowns[emoji]) return;

    const id = Date.now() + Math.random();
    const offset = Math.random() * 48 - 24;

    setFloats(prev => [...prev.slice(-5), { id, emoji, offset }]);
    setCooldowns(prev => ({ ...prev, [emoji]: true }));

    setTimeout(() => {
      setFloats(prev => prev.filter(f => f.id !== id));
    }, 1500);

    setTimeout(() => {
      setCooldowns(prev => ({ ...prev, [emoji]: false }));
    }, 1200);
  }, [cooldowns]);

  return (
    <div className="relative flex flex-col items-center pointer-events-auto">
      {floats.map(f => (
        <div
          key={f.id}
          className="absolute bottom-full mb-1 pointer-events-none select-none text-xl leading-none anim-reaction-float"
          style={{ left: `calc(50% + ${f.offset}px)`, transform: 'translateX(-50%)' }}
          aria-hidden="true"
        >
          {f.emoji}
        </div>
      ))}

      <div className="flex items-center gap-0.5 px-2 py-1.5">
        {REACTIONS.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => fire(emoji)}
            disabled={!!cooldowns[emoji]}
            aria-label={`React ${emoji}`}
            data-testid={`button-react-${emoji}`}
            className={[
              'text-[15px] leading-none w-8 h-8 rounded-lg flex items-center justify-center',
              'border-0 bg-transparent select-none',
              'transition-all duration-150 cursor-pointer',
              cooldowns[emoji]
                ? 'opacity-20 scale-90 pointer-events-none'
                : 'opacity-40 hover:opacity-80 hover:bg-white/[0.04] active:scale-90',
            ].join(' ')}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
