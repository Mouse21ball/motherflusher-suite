import { useEffect, useState, useRef } from "react";
import { Player } from "@/lib/poker/types";
import { sfx } from "@/lib/sounds";

interface ResolutionMessage {
  id: string;
  text: string;
  time: number;
  isResolution?: boolean;
}

interface ResolutionOverlayProps {
  messages: ResolutionMessage[];
  phase: string;
  heroPlayer?: Player | null;
  heroChipChange?: number;
}

function classifyResult(messages: ResolutionMessage[], heroPlayer?: Player | null, heroChipChange?: number): {
  type: 'win' | 'loss' | 'split' | 'uncontested' | 'rollover';
  primary: string;
  secondary: string;
  details: string[];
} {
  const texts = messages.map(m => m.text);

  const isRollover = texts.some(t => /rolls?\s*over|carries?\s*forward|No qualif/i.test(t));
  const isSplit = texts.some(t => /Split Pot/i.test(t));

  if (isRollover) {
    return {
      type: 'rollover',
      primary: 'No qualifying hands',
      secondary: 'Pot carries forward',
      details: texts.filter(t => !/No qualif|rolls?\s*over/i.test(t)),
    };
  }

  const net = heroChipChange ?? 0;
  const absNet = Math.abs(net);
  const amountStr = absNet > 0 ? `$${absNet}` : '';

  if (heroPlayer?.isWinner) {
    const isUncontested = texts.some(t => /last player standing/i.test(t));
    return {
      type: isUncontested ? 'uncontested' : 'win',
      primary: isUncontested ? 'Uncontested' : 'You win',
      secondary: amountStr ? `+${amountStr}` : '',
      details: isUncontested ? [] : texts.filter(t => !/^You\s+(win|scoop|receive)/i.test(t)),
    };
  }

  if (isSplit) {
    return {
      type: net > 0 ? 'win' : net < 0 ? 'loss' : 'split',
      primary: 'Pot split',
      secondary: net > 0 ? `+${amountStr}` : net < 0 ? `-${amountStr}` : '',
      details: texts.filter(t => !/^Split Pot/i.test(t)),
    };
  }

  if (heroPlayer?.isLoser || net < 0) {
    return {
      type: 'loss',
      primary: 'Hand lost',
      secondary: amountStr ? `-${amountStr}` : '',
      details: texts,
    };
  }

  if (net === 0 && heroPlayer?.status === 'folded') {
    return {
      type: 'loss',
      primary: 'Folded',
      secondary: '',
      details: texts,
    };
  }

  if (net > 0) {
    return {
      type: 'win',
      primary: 'You win',
      secondary: `+${amountStr}`,
      details: texts,
    };
  }

  return {
    type: 'loss',
    primary: 'Hand complete',
    secondary: '',
    details: texts,
  };
}

export function ResolutionOverlay({ messages, phase, heroPlayer, heroChipChange }: ResolutionOverlayProps) {
  const [visible, setVisible] = useState(false);
  const soundPlayed = useRef(false);

  const resolutionMessages = messages.filter(m => m.isResolution);

  useEffect(() => {
    if (phase === 'SHOWDOWN' && resolutionMessages.length > 0) {
      setVisible(true);
      if (!soundPlayed.current) {
        soundPlayed.current = true;
        const result = classifyResult(resolutionMessages, heroPlayer, heroChipChange);
        if (result.type === 'win' || result.type === 'uncontested') {
          sfx.win();
        } else if (result.type === 'loss') {
          sfx.lose();
        }
      }
    } else if (phase !== 'SHOWDOWN') {
      setVisible(false);
      soundPlayed.current = false;
    }
  }, [phase, resolutionMessages.length]);

  if (!visible || resolutionMessages.length === 0) return null;

  const result = classifyResult(resolutionMessages, heroPlayer, heroChipChange);

  const isWin = result.type === 'win' || result.type === 'uncontested';
  const isLoss = result.type === 'loss';

  return (
    <div
      className="absolute inset-x-4 sm:inset-x-8 top-1/2 -translate-y-1/2 z-50 pointer-events-none flex justify-center"
      data-testid="resolution-overlay"
    >
      <div
        className={`
          relative overflow-hidden
          bg-[#0B0B0D]/94 backdrop-blur-xl
          border rounded-2xl
          px-8 py-6 sm:px-12 sm:py-8
          max-w-sm w-full
          flex flex-col items-center gap-1.5
          anim-slide-up
          ${isWin ? 'border-[#C9A227]/30' : isLoss ? 'border-white/[0.06]' : 'border-[#C9A227]/15'}
        `}
      >
        {isWin && (
          <div className="absolute inset-0 bg-gradient-to-b from-[#C9A227]/[0.06] to-transparent pointer-events-none" />
        )}

        <p
          className={`relative font-sans text-base sm:text-lg font-semibold tracking-wide text-center leading-tight ${
            isWin ? 'text-[#C9A227]' : isLoss ? 'text-white/50' : 'text-white/70'
          }`}
          data-testid="text-resolution-primary"
        >
          {result.primary}
        </p>

        {result.secondary && (
          <p
            className={`relative font-mono text-2xl sm:text-3xl font-bold tracking-tight text-center anim-count-up ${
              isWin ? 'text-[#C9A227]' : isLoss ? 'text-red-400/70' : 'text-white/50'
            }`}
            data-testid="text-resolution-secondary"
          >
            {result.secondary}
          </p>
        )}

        {result.details.length > 0 && (
          <>
            <div className={`w-8 h-px my-2 ${isWin ? 'bg-[#C9A227]/30' : 'bg-white/[0.08]'}`} />
            {result.details.map((detail, i) => (
              <p
                key={i}
                className="relative font-mono text-white/35 text-[10px] sm:text-[11px] text-center leading-relaxed anim-slide-up"
                style={{ animationDelay: `${100 + i * 60}ms`, animationFillMode: 'both' }}
                data-testid={`text-resolution-${i}`}
              >
                {detail}
              </p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
