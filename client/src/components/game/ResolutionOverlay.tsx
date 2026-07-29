import { useEffect, useState, useRef } from "react";
import { Player } from "@/lib/poker/types";
import { sfx } from "@/lib/sounds";
import { classifyResult, type ResolutionMessage, type ClassifiedResult, type ResultType } from "@shared/utils/classifyResult";

interface ResolutionOverlayProps {
  messages: ResolutionMessage[];
  phase: string;
  heroPlayer?: Player | null;
  heroChipChange?: number;
  players?: Player[];
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

// ── Suits Poker two-panel result ──────────────────────────────────────────────
// SP_POKER|name|handDesc|amount  and  SP_SUITS|name|handDesc|amount
interface SPPanel { pot: 'POKER' | 'SUITS'; name: string; hand: string; amount: number; }

function parseSPPanels(messages: ResolutionMessage[]): SPPanel[] {
  const panels: SPPanel[] = [];
  for (const m of messages) {
    if (m.text.startsWith('SP_POKER|') || m.text.startsWith('SP_SUITS|')) {
      const parts = m.text.split('|');
      if (parts.length >= 4) {
        panels.push({
          pot: parts[0] === 'SP_POKER' ? 'POKER' : 'SUITS',
          name: parts[1],
          hand: parts[2],
          amount: parseInt(parts[3], 10) || 0,
        });
      }
    }
  }
  return panels;
}

function SuitsPokerResult({
  panels,
  heroName,
  heroIsWinner,
  heroChipChange,
  showContinueHint,
  isFadingOut,
}: {
  panels: SPPanel[];
  heroName: string;
  heroIsWinner: boolean;
  heroChipChange: number;
  showContinueHint: boolean;
  isFadingOut: boolean;
}) {
  const pokerPanel = panels.find(p => p.pot === 'POKER');
  const suitsPanel = panels.find(p => p.pot === 'SUITS');

  // Same player wins both → combined single panel
  const sameWinner = pokerPanel && suitsPanel && pokerPanel.name === suitsPanel.name;
  const heroNet = heroChipChange > 0 ? `+$${heroChipChange}` : heroChipChange < 0 ? `-$${Math.abs(heroChipChange)}` : null;

  function PotCard({ pot, name, hand, amount, delay = 0 }: {
    pot: 'POKER' | 'SUITS' | 'BOTH'; name: string; hand: string; amount: number; delay?: number;
  }) {
    const isPoker = pot === 'POKER' || pot === 'BOTH';
    const isSuits = pot === 'SUITS' || pot === 'BOTH';
    const isHeroWinner = name === heroName && heroIsWinner;

    const potLabel = pot === 'BOTH' ? 'POKER POT + SUITS POT' : `${pot} POT`;
    const potColor = isPoker && isSuits ? '#C9A227' : isPoker ? 'rgba(248,113,113,0.70)' : 'rgba(96,165,250,0.80)';
    const borderColor = isPoker && isSuits ? 'rgba(201,162,39,0.22)' : isPoker ? 'rgba(248,113,113,0.18)' : 'rgba(96,165,250,0.18)';

    return (
      <div
        className="relative rounded-xl border px-4 py-3 flex flex-col gap-1 anim-slide-up"
        style={{ background: 'rgba(10,10,14,0.85)', borderColor, animationDelay: `${delay}ms`, animationFillMode: 'both' }}
      >
        {/* Pot label */}
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] font-bold" style={{ color: potColor }}>
          {potLabel}
        </span>

        {/* Winner name */}
        <div className="flex items-center gap-1.5">
          {isHeroWinner && <span className="text-[10px]">✓</span>}
          <span className={`text-sm font-semibold ${isHeroWinner ? 'text-emerald-300' : 'text-white/80'}`}>
            {name}
          </span>
          {isHeroWinner && (
            <span className="text-[9px] font-mono text-emerald-400/60 uppercase tracking-wider">YOU</span>
          )}
        </div>

        {/* Hand description */}
        {hand && hand !== '—' && (
          <span className="text-[11px] font-mono text-white/40 leading-tight">{hand}</span>
        )}

        {/* Amount */}
        <span className="text-lg font-mono font-black tabular-nums" style={{ color: isHeroWinner ? 'rgba(74,222,128,0.90)' : 'rgba(201,162,39,0.70)' }}>
          +${amount.toLocaleString()}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`absolute inset-x-3 sm:inset-x-8 top-1/2 -translate-y-1/2 z-50 pointer-events-none flex justify-center transition-opacity duration-[360ms] ${isFadingOut ? 'opacity-0' : 'opacity-100'}`}
      data-testid="resolution-overlay"
    >
      <div className="relative overflow-hidden bg-[#0A0A0C]/96 backdrop-blur-2xl border border-white/[0.07] rounded-2xl px-4 py-4 sm:px-6 sm:py-5 max-w-sm w-full flex flex-col gap-2 anim-slide-up">

        {/* Hero chip change — shown if they won or lost chips */}
        {heroNet && (
          <div className="text-center mb-1">
            <span
              className="text-2xl font-mono font-black tabular-nums anim-count-up"
              style={{ color: heroChipChange > 0 ? 'rgba(74,222,128,0.90)' : 'rgba(248,113,113,0.80)' }}
              data-testid="text-resolution-secondary"
            >
              {heroNet}
            </span>
          </div>
        )}

        {/* Pot winner panels */}
        {sameWinner ? (
          <PotCard
            pot="BOTH"
            name={pokerPanel!.name}
            hand={`${pokerPanel!.hand} | ${suitsPanel!.hand}`}
            amount={pokerPanel!.amount + suitsPanel!.amount}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {pokerPanel && (
              <PotCard pot="POKER" name={pokerPanel.name} hand={pokerPanel.hand} amount={pokerPanel.amount} delay={0} />
            )}
            {suitsPanel && (
              <PotCard pot="SUITS" name={suitsPanel.name} hand={suitsPanel.hand} amount={suitsPanel.amount} delay={60} />
            )}
          </div>
        )}

        {/* Next hand hint */}
        {showContinueHint && (
          <div className="flex items-center gap-1.5 mt-1 anim-slide-up" style={{ animationFillMode: 'both' }}>
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

// ── Main overlay ──────────────────────────────────────────────────────────────
export function ResolutionOverlay({ messages, phase, heroPlayer, heroChipChange }: ResolutionOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [showContinueHint, setShowContinueHint] = useState(false);
  const soundPlayed = useRef(false);
  const continueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolutionMessages = messages.filter(m => m.isResolution);
  const spPanels = parseSPPanels(resolutionMessages);
  const isSuitsPoker = spPanels.length > 0;

  useEffect(() => {
    if (phase === 'SHOWDOWN' && resolutionMessages.length > 0) {
      setVisible(true);
      setIsFadingOut(false);

      if (!soundPlayed.current) {
        soundPlayed.current = true;
        if (isSuitsPoker) {
          // For suitspoker use isWinner/isLoser directly
          if (heroPlayer?.isWinner) sfx.win();
          else if (heroPlayer?.isLoser) sfx.lose();
        } else {
          const result = classifyResult(resolutionMessages, heroPlayer, heroChipChange);
          if (result.type === 'win') sfx.win();
          else if (result.type === 'loss' || result.type === 'fold') sfx.lose();
        }
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

  // ── Suits Poker: two-panel layout ─────────────────────────────────────────
  if (isSuitsPoker) {
    return (
      <SuitsPokerResult
        panels={spPanels}
        heroName={heroPlayer?.name ?? ''}
        heroIsWinner={!!heroPlayer?.isWinner}
        heroChipChange={heroChipChange ?? 0}
        showContinueHint={showContinueHint}
        isFadingOut={isFadingOut}
      />
    );
  }

  // ── All other modes: existing single-panel layout ──────────────────────────
  let result: ClassifiedResult;
  try {
    result = classifyResult(resolutionMessages, heroPlayer, heroChipChange);
  } catch (err) {
    console.error('[CGP][ResolutionOverlay] classifyResult crashed — suppressing to avoid black screen:', err, { resolutionMessages, heroPlayer, heroChipChange });
    return null;
  }

  console.log('[CGP][ResolutionOverlay]', {
    isWinner: heroPlayer?.isWinner,
    isLoser: heroPlayer?.isLoser,
    status: heroPlayer?.status,
    heroChipChange,
    resultType: result.type,
    primary: result.primary,
    secondary: result.secondary,
  });

  const isWin  = result.type === 'win';
  const isLoss = result.type === 'loss';
  const isFold = result.type === 'fold';

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

        {/* Big chip change number */}
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
