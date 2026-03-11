import { useEffect, useState } from "react";

interface ResolutionMessage {
  id: string;
  text: string;
  time: number;
  isResolution?: boolean;
}

interface ResolutionOverlayProps {
  messages: ResolutionMessage[];
  phase: string;
}

export function ResolutionOverlay({ messages, phase }: ResolutionOverlayProps) {
  const [visible, setVisible] = useState(false);

  const resolutionMessages = messages.filter(m => m.isResolution);

  useEffect(() => {
    if (phase === 'SHOWDOWN' && resolutionMessages.length > 0) {
      setVisible(true);
    } else if (phase !== 'SHOWDOWN') {
      setVisible(false);
    }
  }, [phase, resolutionMessages.length]);

  if (!visible || resolutionMessages.length === 0) return null;

  const isWin = resolutionMessages.some(m =>
    /wins|SCOOPS|receives/.test(m.text)
  );
  const isSplit = resolutionMessages.some(m =>
    /Split Pot/.test(m.text)
  );
  const isRollover = resolutionMessages.some(m =>
    /rolls over/i.test(m.text)
  );

  let borderColor = "border-white/30";
  let glowColor = "";
  if (isRollover) {
    borderColor = "border-orange-400/60";
    glowColor = "shadow-[0_0_30px_rgba(251,146,60,0.3)]";
  } else if (isSplit) {
    borderColor = "border-yellow-400/60";
    glowColor = "shadow-[0_0_30px_rgba(250,204,21,0.25)]";
  } else if (isWin) {
    borderColor = "border-green-400/60";
    glowColor = "shadow-[0_0_30px_rgba(74,222,128,0.25)]";
  }

  return (
    <div
      className={`
        absolute inset-x-4 sm:inset-x-8 top-1/2 -translate-y-1/2
        z-50 pointer-events-none
        flex justify-center
        animate-in fade-in zoom-in-95 duration-300
      `}
      data-testid="resolution-overlay"
    >
      <div
        className={`
          bg-black/85 backdrop-blur-md
          ${borderColor} border-2 rounded-2xl
          px-5 py-4 sm:px-8 sm:py-5
          max-w-md w-full
          flex flex-col items-center gap-2
          ${glowColor}
        `}
      >
        <div className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-white/50 font-bold mb-1">
          Hand Result
        </div>
        {resolutionMessages.map((msg, i) => {
          const isHeader = /^Split Pot/.test(msg.text);
          const isPerPlayer = /wins|receives|SCOOPS/.test(msg.text);

          return (
            <p
              key={msg.id}
              className={`
                font-mono text-center leading-relaxed
                animate-in fade-in slide-in-from-bottom-1
                ${isHeader
                  ? "text-yellow-300 text-sm sm:text-base font-bold"
                  : isPerPlayer
                    ? "text-white text-sm sm:text-base"
                    : "text-white/80 text-xs sm:text-sm"
                }
              `}
              style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}
              data-testid={`text-resolution-${i}`}
            >
              {msg.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}
