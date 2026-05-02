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
  players?: Player[];
}

function classifyResult(
  messages: ResolutionMessage[],
  heroPlayer?: Player | null,
  heroChipChange?: number,
): {
  type: 'win' | 'loss' | 'split';
  primary: string;
  secondary: string;
  handName: string;
  winnerName: string;
  details: string[];
} {
  const texts = messages.map(m => m.text);
  const isSplit = texts.some(t => /Split Pot/i.test(t));
  const net = heroChipChange ?? 0;
  const absNet = Math.abs(net);
  const amountStr = absNet > 0 ? `$${absNet}` : '';

  // Extract hand description from hero score
  const handName = heroPlayer?.score?.description
    ?? heroPlayer?.score?.highEval?.description
    ?? heroPlayer?.score?.lowEval?.description
    ?? '';

  // Find winner name from resolution messages
  let winnerName = '';
  const winMsg = texts.find(t => /wins with|scoops with|wins the/i.test(t));
  if (winMsg) {
    const m = winMsg.match(/^(.+?)\s+(wins|scoops)/i);
    if (m) winnerName = m[1].trim();
  }

  if (heroPlayer?.isWinner) {
    return {
      type: 'win',
      primary: net >= 0 ? 'You Win' : 'You Split',
      secondary: amountStr ? `+${amountStr}` : '',
      handName,
      winnerName: '',
      details: texts.filter(t => !/^You\s+(win|scoop|receive)/i.test(t)),
    };
  }

  if (isSplit) {
    return {
      type: net > 0 ? 'win' : net < 0 ? 'loss' : 'split',
      primary: 'Pot Split',
      secondary: net > 0 ? `+${amountStr}` : net < 0 ? `-${amountStr}` : '',
      handName,
      winnerName,
      details: texts.filter(t => !/^Split Pot/i.test(t)),
    };
  }

  if (heroPlayer?.isLoser || net < 0) {
    return {
      type: 'loss',
      primary: 'Hand Lost',
      secondary: amountStr ? `-${amountStr}` : '',
      handName,
      winnerName,
      details: texts,
    };
  }

  if (net === 0 && heroPlayer?.status === 'folded') {
    return {
      type: 'loss',
      primary: 'Folded',
      secondary: '',
      handName: '',
      winnerName,
      details: texts,
    };
  }

  if (net > 0) {
    return {
      type: 'win',
      primary: 'You Win',
      secondary: `+${amountStr}`,
      handName,
      winnerName: '',
      details: texts,
    };
  }

  return {
    type: 'loss',
    primary: 'Hand Settled',
    secondary: '',
    handName,
    winnerName,
    details: texts,
  };
}

// ── Animated chip-change number ───────────────────────────────────────────────
function ChipChange({ value, isWin }: { value: string; isWin: boolean }) {
  return (
    <div
      className="relative font-mono text-3xl sm:text-4xl font-black tracking-tight text-center anim-count-up select-none"
      style={{
        color: isWin ? '#C9A227' : 'rgba(248,113,113,0.80)',
        textShadow: isWin
          ? '0 0 28px rgba(201,162,39,0.55), 0 0 56px rgba(201,162,39,0.25)'
          : '0 0 20px rgba(248,113,113,0.35)',
      }}
      data-testid="text-resolution-secondary"
    >
      {value}
    </div>
  );
}

// ── Hand name badge ───────────────────────────────────────────────────────────
function HandBadge({ name, isWin }: { name: string; isWin: boolean }) {
  if (!name) return null;
  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono tracking-wide font-semibold border anim-slide-up"
      style={isWin
        ? { background: 'rgba(201,162,39,0.10)', borderColor: 'rgba(201,162,39,0.30)', color: 'rgba(201,162,39,0.85)' }
        : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.38)' }
      }
      data-testid="text-hand-name"
    >
      {isWin ? '♠' : '—'}&ensp;{name}
    </div>
  );
}

// ── Winner name (when hero loses) ─────────────────────────────────────────────
function WinnerLine({ name }: { name: string }) {
  if (!name) return null;
  return (
    <div
      className="text-[11px] font-mono text-center anim-slide-up"
      style={{ color: 'rgba(255,255,255,0.30)', animationDelay: '80ms', animationFillMode: 'both' }}
      data-testid="text-winner-name"
    >
      <span style={{ color: 'rgba(201,162,39,0.55)' }}>{name}</span> takes the pot
    </div>
  );
}

// ── Main overlay ──────────────────────────────────────────────────────────────
export function ResolutionOverlay({ messages, phase, heroPlayer, heroChipChange }: ResolutionOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [showContinueHint, setShowContinueHint] = useState(false);
  const soundPlayed = useRef(false);
  const continueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolutionMessages = messages.filter(m => m.isResolution);

  useEffect(() => {
    if (phase === 'SHOWDOWN' && resolutionMessages.length > 0) {
      setVisible(true);
      setIsFadingOut(false);

      if (!soundPlayed.current) {
        soundPlayed.current = true;
        const result = classifyResult(resolutionMessages, heroPlayer, heroChipChange);
        if (result.type === 'win') sfx.win();
        else if (result.type === 'loss') sfx.lose();
      }

      if (continueTimerRef.current) clearTimeout(continueTimerRef.current);
      continueTimerRef.current = setTimeout(() => setShowContinueHint(true), 1400);
    } else if (phase !== 'SHOWDOWN') {
      if (continueTimerRef.current) clearTimeout(continueTimerRef.current);
      setShowContinueHint(false);

      if (visible) {
        setIsFadingOut(true);
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = setTimeout(() => {
          setVisible(false);
          setIsFadingOut(false);
          soundPlayed.current = false;
        }, 360);
      } else {
        soundPlayed.current = false;
      }
    }
    return () => { if (continueTimerRef.current) clearTimeout(continueTimerRef.current); };
  }, [phase, resolutionMessages.length]);

  if (!visible || resolutionMessages.length === 0) return null;

  const result = classifyResult(resolutionMessages, heroPlayer, heroChipChange);
  const isWin  = result.type === 'win';
  const isLoss = result.type === 'loss';

  return (
    <div
      className={`absolute inset-x-3 sm:inset-x-8 top-1/2 -translate-y-1/2 z-50 pointer-events-none flex justify-center transition-opacity duration-[360ms] ${isFadingOut ? 'opacity-0' : 'opacity-100'}`}
      data-testid="resolution-overlay"
    >
      <div
        className={`
          relative overflow-hidden
          bg-[#0A0A0C]/96 backdrop-blur-2xl
          border rounded-2xl
          px-6 py-5 sm:px-10 sm:py-7
          max-w-sm w-full
          flex flex-col items-center gap-2
          anim-slide-up
          ${isWin ? 'border-[#C9A227]/35' : isLoss ? 'border-white/[0.06]' : 'border-[#C9A227]/15'}
        `}
      >
        {/* Glow overlay */}
        {isWin && (
          <div className="absolute inset-0 bg-gradient-to-b from-[#C9A227]/[0.07] via-transparent to-transparent pointer-events-none" />
        )}

        {/* Primary label */}
        <p
          className={`relative font-sans text-sm font-semibold tracking-[0.12em] uppercase text-center ${
            isWin ? 'text-[#C9A227]/70' : isLoss ? 'text-white/35' : 'text-white/50'
          }`}
          data-testid="text-resolution-primary"
        >
          {result.primary}
        </p>

        {/* Big chip change number */}
        {result.secondary && (
          <ChipChange value={result.secondary} isWin={isWin} />
        )}

        {/* Hand name badge */}
        {result.handName && (
          <HandBadge name={result.handName} isWin={isWin} />
        )}

        {/* Who won (if hero lost) */}
        {!isWin && result.winnerName && (
          <WinnerLine name={result.winnerName} />
        )}

        {/* Divider + details */}
        {result.details.length > 0 && (
          <>
            <div className={`w-6 h-px my-1 ${isWin ? 'bg-[#C9A227]/25' : 'bg-white/[0.07]'}`} />
            {result.details.slice(0, 3).map((detail, i) => (
              <p
                key={i}
                className="relative font-mono text-white/30 text-[10px] sm:text-[11px] text-center leading-relaxed anim-slide-up"
                style={{ animationDelay: `${80 + i * 55}ms`, animationFillMode: 'both' }}
                data-testid={`text-resolution-${i}`}
              >
                {detail}
              </p>
            ))}
          </>
        )}

        {/* Next hand pulse */}
        {showContinueHint && (
          <div className="flex items-center gap-1.5 mt-2 anim-slide-up" style={{ animationFillMode: 'both' }}>
            <div className="w-8 h-px bg-white/10 flex-1" />
            <span className="text-white/20 text-[9px] font-mono uppercase tracking-[0.24em] anim-pulse-gold">
              Next hand…
            </span>
            <div className="w-8 h-px bg-white/10 flex-1" />
          </div>
        )}
      </div>
    </div>
  );
}
