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

function classifyResult(messages: ResolutionMessage[]): {
  type: 'win' | 'loss' | 'split' | 'uncontested' | 'rollover';
  primary: string;
  secondary: string;
  details: string[];
} {
  const texts = messages.map(m => m.text);
  const joinedText = texts.join(' ');

  const isRollover = texts.some(t => /rolls?\s*over|carries?\s*forward|No qualif/i.test(t));
  const isSplit = texts.some(t => /Split Pot/i.test(t));
  const isWin = texts.some(t => /wins|SCOOPS|receives/i.test(t));
  const isUncontested = texts.some(t => /last player standing/i.test(t)) && !isWin;

  const amountMatch = joinedText.match(/\$[\d,]+/g);
  const amounts = amountMatch ? amountMatch.map(a => a.replace(/,/g, '')) : [];
  const primaryAmount = amounts[0] || '';

  if (isRollover) {
    const potMatch = joinedText.match(/\$([\d,]+)/);
    return {
      type: 'rollover',
      primary: 'No qualifying hands.',
      secondary: 'Pot carries forward.',
      details: texts.filter(t => !/No qualif|rolls?\s*over/i.test(t)),
    };
  }

  if (isSplit) {
    return {
      type: 'split',
      primary: 'Pot split.',
      secondary: primaryAmount ? `+${primaryAmount}` : '',
      details: texts.filter(t => !/^Split Pot/i.test(t)),
    };
  }

  if (isUncontested) {
    return {
      type: 'uncontested',
      primary: 'Uncontested.',
      secondary: primaryAmount ? `+${primaryAmount}` : '',
      details: [],
    };
  }

  if (isWin) {
    const youWon = texts.some(t => /^You\s+win|^You\s+scoop|^You\s+receive/i.test(t));
    if (youWon) {
      return {
        type: 'win',
        primary: 'Pot awarded.',
        secondary: primaryAmount ? `+${primaryAmount}` : '',
        details: texts.filter(t => !/^You\s+(win|scoop|receive)/i.test(t)),
      };
    }
    return {
      type: 'loss',
      primary: 'Hand lost.',
      secondary: primaryAmount ? `-${primaryAmount}` : '',
      details: texts,
    };
  }

  return {
    type: 'loss',
    primary: 'Hand complete.',
    secondary: '',
    details: texts,
  };
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

  const result = classifyResult(resolutionMessages);

  const accentMap = {
    win: { border: 'border-[#C9A227]/40', line: 'bg-[#C9A227]', secondaryColor: 'text-[#C9A227]' },
    loss: { border: 'border-white/10', line: 'bg-white/20', secondaryColor: 'text-white/40' },
    split: { border: 'border-[#C9A227]/30', line: 'bg-[#C9A227]/60', secondaryColor: 'text-[#C9A227]/80' },
    uncontested: { border: 'border-white/15', line: 'bg-white/20', secondaryColor: 'text-white/50' },
    rollover: { border: 'border-amber-500/20', line: 'bg-amber-500/40', secondaryColor: 'text-amber-400/70' },
  };

  const accent = accentMap[result.type];

  return (
    <div
      className="absolute inset-x-4 sm:inset-x-8 top-1/2 -translate-y-1/2 z-50 pointer-events-none flex justify-center animate-in fade-in duration-200"
      data-testid="resolution-overlay"
    >
      <div
        className={`
          bg-[#0B0B0D]/92 backdrop-blur-lg
          ${accent.border} border rounded-xl
          px-6 py-5 sm:px-10 sm:py-6
          max-w-sm w-full
          flex flex-col items-center gap-1
        `}
      >
        <p
          className="font-sans text-white/90 text-base sm:text-lg font-semibold tracking-wide text-center leading-tight animate-in fade-in duration-200"
          data-testid="text-resolution-primary"
        >
          {result.primary}
        </p>

        {result.secondary && (
          <p
            className={`font-mono text-xl sm:text-2xl font-bold tracking-tight text-center ${accent.secondaryColor} animate-in fade-in duration-200`}
            style={{ animationDelay: '80ms', animationFillMode: 'both' }}
            data-testid="text-resolution-secondary"
          >
            {result.secondary}
          </p>
        )}

        {result.details.length > 0 && (
          <>
            <div className={`w-12 h-px ${accent.line} my-2`} />
            {result.details.map((detail, i) => (
              <p
                key={i}
                className="font-mono text-white/45 text-[11px] sm:text-xs text-center leading-relaxed animate-in fade-in"
                style={{ animationDelay: `${140 + i * 60}ms`, animationFillMode: 'both' }}
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
