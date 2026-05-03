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

type ResultType = 'win' | 'loss' | 'split' | 'fold';

interface ClassifiedResult {
  type: ResultType;
  primary: string;
  secondary: string;
  handName: string;
  winnerName: string;
  details: string[];
}

function classifyResult(
  messages: ResolutionMessage[],
  heroPlayer?: Player | null,
  heroChipChange?: number,
): ClassifiedResult {
  const texts = messages.map(m => m.text);
  const isSplit = texts.some(t => /Split Pot/i.test(t));
  const net = heroChipChange ?? 0;
  const absNet = Math.abs(net);
  const amountStr = absNet > 0 ? `$${absNet}` : '';

  const handName = heroPlayer?.score?.description
    ?? heroPlayer?.score?.highEval?.description
    ?? heroPlayer?.score?.lowEval?.description
    ?? '';

  // Find winner name from resolution messages
  let winnerName = '';
  const winMsg = texts.find(t => /wins with|scoops with|wins the|takes the/i.test(t));
  if (winMsg) {
    const m = winMsg.match(/^(.+?)\s+(wins|scoops|takes)/i);
    if (m) winnerName = m[1].trim();
  }

  // ── 1. Hero folded — distinct fold state with muted-red treatment ──
  if (heroPlayer?.status === 'folded') {
    return {
      type: 'fold',
      primary: 'You folded',
      secondary: amountStr ? `−${amountStr}` : '',
      handName: '',
      winnerName,
      details: winnerName ? [`Pot goes to ${winnerName}`] : texts,
    };
  }

  // ── 2. Hero won outright ──
  if (heroPlayer?.isWinner) {
    return {
      type: 'win',
      primary: net >= 0 ? 'You Win' : 'You Split',
      secondary: net > 0 ? `+${amountStr}` : amountStr ? `+${amountStr}` : '+$0',
      handName,
      winnerName: '',
      details: texts.filter(t => !/^You\s+(win|scoop|receive)/i.test(t)),
    };
  }

  // ── 3. Pot split ──
  if (isSplit) {
    return {
      type: net > 0 ? 'win' : net < 0 ? 'loss' : 'split',
      primary: 'Pot Split',
      secondary: net > 0 ? `+${amountStr}` : net < 0 ? `−${amountStr}` : '$0',
      handName,
      winnerName,
      details: texts.filter(t => !/^Split Pot/i.test(t)),
    };
  }

  // ── 4. Hero lost (showed cards, didn't win) ──
  if (heroPlayer?.isLoser || net < 0) {
    return {
      type: 'loss',
      primary: 'Hand Lost',
      secondary: amountStr ? `−${amountStr}` : '−$0',
      handName,
      winnerName,
      details: texts,
    };
  }

  // ── 5. Net positive but no winner flag ──
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

  // ── 6. Hand settled (no chip change and no flag) — rare ──
  return {
    type: 'loss',
    primary: 'Hand Settled',
    secondary: '$0',
    handName,
    winnerName,
    details: texts,
  };
}

// ── Color tokens per result type ──────────────────────────────────────────────
const TOKENS = {
  win:   { color: 'rgba(74,222,128,0.92)',  textShadow: '0 0 14px rgba(34,197,94,0.28)' },
  loss:  { color: 'rgba(248,113,113,0.82)', textShadow: '0 0 14px rgba(248,113,113,0.26)' },
  fold:  { color: 'rgba(220,138,138,0.66)', textShadow: '0 0 10px rgba(220,138,138,0.18)' },
  split: { color: '#C9A227',                textShadow: '0 0 14px rgba(201,162,39,0.28)' },
} as const;

// ── Animated chip-change number ───────────────────────────────────────────────
function ChipChange({ value, type }: { value: string; type: ResultType }) {
  const tok = TOKENS[type];
  return (
    <div
      className="relative font-mono text-3xl sm:text-4xl font-black tracking-tight text-center anim-count-up select-none tabular-nums"
      style={{ color: tok.color, textShadow: tok.textShadow }}
      data-testid="text-resolution-secondary"
    >
      {value}
    </div>
  );
}

// ── Hand name badge ───────────────────────────────────────────────────────────
function HandBadge({ name, type }: { name: string; type: ResultType }) {
  if (!name) return null;
  const styles =
    type === 'win'  ? { background: 'rgba(34,197,94,0.06)',  borderColor: 'rgba(34,197,94,0.18)',  color: 'rgba(74,222,128,0.78)' }
  : type === 'loss' ? { background: 'rgba(248,113,113,0.05)', borderColor: 'rgba(248,113,113,0.16)', color: 'rgba(248,113,113,0.70)' }
                    : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.40)' };
  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono tracking-wide font-semibold border anim-slide-up"
      style={styles}
      data-testid="text-hand-name"
    >
      {type === 'win' ? '♠' : '—'}&ensp;{name}
    </div>
  );
}

// ── Winner name (when hero loses or folds) ────────────────────────────────────
function WinnerLine({ name, type }: { name: string; type: ResultType }) {
  if (!name) return null;
  const accentColor = type === 'fold' ? 'rgba(220,138,138,0.65)' : 'rgba(201,162,39,0.55)';
  return (
    <div
      className="text-[11px] font-mono text-center anim-slide-up"
      style={{ color: 'rgba(255,255,255,0.30)', animationDelay: '80ms', animationFillMode: 'both' }}
      data-testid="text-winner-name"
    >
      <span style={{ color: accentColor }}>{name}</span> takes the pot
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
        else if (result.type === 'loss' || result.type === 'fold') sfx.lose();
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
  const isFold = result.type === 'fold';

  // Border + primary-text styling per result type
  const borderClass = isWin
    ? 'border-[rgba(34,197,94,0.20)]'
    : isFold
      ? 'border-[rgba(220,138,138,0.14)]'
      : isLoss
        ? 'border-[rgba(248,113,113,0.16)]'
        : 'border-[#C9A227]/12';

  const primaryClass = isWin
    ? 'text-[rgba(74,222,128,0.78)]'
    : isFold
      ? 'text-[rgba(220,138,138,0.60)]'
      : isLoss
        ? 'text-[rgba(248,113,113,0.70)]'
        : 'text-white/45';

  return (
    <div
      className={`absolute inset-x-3 sm:inset-x-8 top-1/2 -translate-y-1/2 z-50 pointer-events-none flex justify-center transition-opacity duration-[360ms] ${isFadingOut ? 'opacity-0' : 'opacity-100'}`}
      data-testid="resolution-overlay"
      data-result-type={result.type}
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
          ${borderClass}
        `}
      >
        {/* Glow overlay (win only) */}
        {isWin && (
          <div className="absolute inset-0 bg-gradient-to-b from-[rgba(34,197,94,0.035)] via-transparent to-transparent pointer-events-none" />
        )}

        {/* Primary label */}
        <p
          className={`relative font-sans text-sm font-semibold tracking-[0.12em] uppercase text-center ${primaryClass}`}
          data-testid="text-resolution-primary"
        >
          {result.primary}
        </p>

        {/* Big chip change number — always shown for win/loss/fold when amount known */}
        {result.secondary && (
          <ChipChange value={result.secondary} type={result.type} />
        )}

        {/* Hand name badge */}
        {result.handName && (
          <HandBadge name={result.handName} type={result.type} />
        )}

        {/* Who won (when hero lost or folded) */}
        {!isWin && result.winnerName && (
          <WinnerLine name={result.winnerName} type={result.type} />
        )}

        {/* Divider + details */}
        {result.details.length > 0 && (
          <>
            <div className={`w-6 h-px my-1 ${isWin ? 'bg-[rgba(34,197,94,0.18)]' : isFold ? 'bg-[rgba(220,138,138,0.12)]' : 'bg-white/[0.06]'}`} />
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
