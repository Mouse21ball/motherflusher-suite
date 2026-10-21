import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayingCard } from '../game/Card';
import type { CardType } from '@shared/gameTypes';
import type { TutorialSpec, TutCard } from './tutorialTypes';

/**
 * Shared interactive tutorial player (Detroit 2026-10-21, Phase 2).
 *
 * Hero-hand-first, card-led, mobile-first. The player taps cards to
 * select discards, taps simulated buttons to learn what each one
 * does, and walks a scripted hand with Next / Back / Restart / Skip.
 * Pure local state — a safe simulation that can never touch chips,
 * the server, or live gameplay.
 */

const ACTION_STYLES: Record<string, { bg: string; border: string; color: string }> = {
  gold:      { bg: 'rgba(201,162,39,0.20)',  border: 'rgba(201,162,39,0.65)',  color: '#fcd34d' },
  neutral:   { bg: 'rgba(255,255,255,0.07)', border: 'rgba(255,255,255,0.28)', color: '#fff' },
  danger:    { bg: 'rgba(239,68,68,0.14)',   border: 'rgba(239,68,68,0.55)',   color: '#fca5a5' },
  sky:       { bg: 'rgba(56,189,248,0.14)',  border: 'rgba(56,189,248,0.55)',  color: '#7dd3fc' },
  'suit-red':  { bg: 'rgba(229,57,53,0.16)',   border: 'rgba(229,57,53,0.6)',    color: '#fca5a5' },
  'suit-dark': { bg: 'rgba(255,255,255,0.10)', border: 'rgba(255,255,255,0.45)', color: '#fff' },
};

function CardRow({ cards, variant, size, selected, onTap, dimmed }: {
  cards: TutCard[];
  variant: 'premium' | 'classic';
  size: 'hero' | 'small';
  selected?: Set<number>;
  onTap?: (i: number) => void;
  dimmed?: boolean;
}) {
  const cls = size === 'hero' ? '!w-[52px] !h-[74px]' : '!w-[38px] !h-[54px]';
  return (
    <div className="flex gap-1.5 justify-center flex-wrap" style={{ opacity: dimmed ? 0.55 : 1 }}>
      {cards.map((card, i) => {
        const isSel = selected?.has(i) ?? false;
        return (
          <button
            key={`${card.rank}-${card.suit}-${i}`}
            type="button"
            disabled={!onTap}
            onClick={() => onTap?.(i)}
            data-testid={`tutorial-card-${i}`}
            className="relative rounded-lg transition-transform"
            style={{
              transform: isSel ? 'translateY(-8px)' : undefined,
              boxShadow: isSel ? '0 0 0 2px #f0b829, 0 8px 18px rgba(0,0,0,0.55)' : undefined,
              cursor: onTap ? 'pointer' : 'default',
              background: 'transparent',
              border: 'none',
              padding: 0,
            }}
            aria-pressed={onTap ? isSel : undefined}
          >
            <PlayingCard card={{ rank: card.rank as CardType['rank'], suit: card.suit as CardType['suit'], isHidden: false }} variant={variant} density="full" className={cls} />
            {isSel && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-mono font-bold px-1 rounded-full" style={{ background: '#f0b829', color: '#1a1205' }}>
                SWAP
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Tutorial({ spec, onClose, onPractice }: {
  spec: TutorialSpec;
  onClose: () => void;
  /** Badugi keeps its practice-table entry point on the last step. */
  onPractice?: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawnCards, setDrawnCards] = useState<TutCard[] | null>(null);
  const [carried, setCarried] = useState<TutCard[] | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackGood, setFeedbackGood] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const step = spec.steps[stepIdx];
  const isLast = stepIdx === spec.steps.length - 1;

  // The hero hand carries forward across steps until a step replaces it —
  // the walk-through is one continuous hand, like the real game. A hand
  // the player actually drew in an interactive step carries too, so the
  // betting steps show YOUR cards, not a canned hand.
  const baseHero = useMemo(() => {
    if (spec.steps[stepIdx].heroCards) return spec.steps[stepIdx].heroCards!;
    if (carried) return carried;
    for (let i = stepIdx; i >= 0; i--) {
      if (spec.steps[i].heroCards) return spec.steps[i].heroCards!;
    }
    return [];
  }, [spec, stepIdx, carried]);
  const heroCards = drawnCards ?? baseHero;

  useEffect(() => {
    setSelected(new Set());
    setDrawnCards(null);
    setFeedback(null);
    setFeedbackGood(false);
  }, [stepIdx]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const toggleCard = (i: number) => {
    if (!step.draw || drawnCards) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else if (next.size < step.draw!.max) next.add(i);
      return next;
    });
  };

  const doDraw = () => {
    if (!step.draw) return;
    const picks = [...selected].sort((a, b) => a - b);
    const next = [...baseHero];
    picks.forEach((cardIdx, k) => {
      const replacement = step.draw!.replacements[k];
      if (replacement) next[cardIdx] = replacement;
    });
    setDrawnCards(next);
    setCarried(next);
    setFeedback(step.draw.afterText);
    setFeedbackGood(true);
  };

  const verdictStyle = step.verdictKind === 'win'
    ? { bg: 'rgba(16,185,129,0.16)', border: 'rgba(16,185,129,0.6)', color: '#6ee7b7' }
    : step.verdictKind === 'lose'
      ? { bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.55)', color: '#fca5a5' }
      : { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.85)' };

  return (
    <div
      ref={dialogRef}
      data-testid="modal-how-to-play"
      role="dialog"
      aria-modal="true"
      aria-label={`${spec.name} how to play`}
      tabIndex={-1}
      style={{ position: 'fixed', inset: 0, background: 'rgba(4,2,12,0.97)', zIndex: 100, display: 'flex', flexDirection: 'column', outline: 'none' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: spec.color }} />
          <span data-testid="text-how-to-play-mode-name" style={{ fontFamily: 'Anton, Impact, "Arial Narrow Bold", sans-serif', fontSize: 20, color: spec.color, letterSpacing: '1px' }}>{spec.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span data-testid="text-slide-counter" style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{stepIdx + 1} of {spec.steps.length}</span>
          <button data-testid="button-how-to-play-restart" onClick={() => { setCarried(null); setStepIdx(0); }} aria-label="Restart tutorial" style={{ background: 'none', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 20, padding: '5px 12px', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}>↻ RESTART</button>
          <button data-testid="button-how-to-play-skip" onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 20, padding: '5px 14px', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.55)', cursor: 'pointer', letterSpacing: '0.06em' }}>SKIP</button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '12px 0 0' }}>
        {spec.steps.map((s, i) => (
          <div key={s.id} style={{ width: i === stepIdx ? 18 : 6, height: 6, borderRadius: 3, background: i === stepIdx ? spec.color : 'rgba(255,255,255,0.18)', transition: 'all 0.25s' }} />
        ))}
      </div>

      {/* Stage */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 18px 6px', width: '100%', maxWidth: 430, margin: '0 auto', boxSizing: 'border-box' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 800, letterSpacing: '0.22em', color: spec.color, border: `1px solid ${spec.color}66`, background: `${spec.color}14`, borderRadius: 999, padding: '3px 10px' }}>{step.phase}</span>
        <div data-testid="text-slide-title" style={{ fontFamily: 'Anton, Impact, "Arial Narrow Bold", sans-serif', fontSize: 23, color: 'white', letterSpacing: '0.5px', marginTop: 10, textAlign: 'center' }}>{step.title}</div>
        <p data-testid="text-slide-desc" style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, textAlign: 'center', margin: '8px 0 14px', maxWidth: 340 }}>{step.body}</p>

        {step.boardCards && (
          <div style={{ marginBottom: 14, width: '100%' }}>
            <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>{step.boardLabel ?? 'BOARD'}</div>
            <CardRow cards={step.boardCards} variant={spec.cardVariant} size="small" />
          </div>
        )}

        {step.rivalCards && (
          <div style={{ marginBottom: 14, width: '100%' }}>
            <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>{step.rivalLabel ?? 'OPPONENT'}</div>
            <CardRow cards={step.rivalCards} variant={spec.cardVariant} size="small" />
            {step.rivalNote && <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>{step.rivalNote}</div>}
          </div>
        )}

        {heroCards.length > 0 && (
          <div style={{ width: '100%' }}>
            <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
              {step.heroLabel ?? 'YOUR HAND'}{step.draw && !drawnCards ? ` — TAP UP TO ${step.draw.max} TO SWAP` : ''}
            </div>
            <CardRow
              cards={heroCards}
              variant={spec.cardVariant}
              size="hero"
              selected={step.draw && !drawnCards ? selected : undefined}
              onTap={step.draw && !drawnCards ? toggleCard : undefined}
            />
          </div>
        )}

        {step.verdict && (
          <div data-testid="tutorial-verdict" style={{ marginTop: 16, borderRadius: 12, padding: '9px 16px', fontFamily: 'monospace', fontWeight: 800, fontSize: 13, letterSpacing: '0.04em', textAlign: 'center', background: verdictStyle.bg, border: `1px solid ${verdictStyle.border}`, color: verdictStyle.color }}>
            {step.verdict}
          </div>
        )}

        {/* Simulated controls */}
        {step.draw && !drawnCards && (
          <button
            type="button"
            data-testid="tutorial-draw-button"
            onClick={doDraw}
            style={{ marginTop: 18, background: 'rgba(201,162,39,0.20)', border: '1px solid rgba(201,162,39,0.65)', color: '#fcd34d', borderRadius: 24, padding: '11px 26px', fontFamily: 'monospace', fontWeight: 800, fontSize: 13, cursor: 'pointer', letterSpacing: '0.04em' }}
          >
            {selected.size === 0 ? 'STAND PAT — KEEP ALL' : `${step.draw.buttonLabel} (${selected.size})`}
          </button>
        )}
        {step.actions && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 }}>
            {step.actions.map(a => {
              const st = ACTION_STYLES[a.kind];
              return (
                <button
                  key={a.label}
                  type="button"
                  data-testid={`tutorial-action-${a.label.replace(/\s+/g, '-').toLowerCase()}`}
                  onClick={() => { setFeedback(a.response); setFeedbackGood(!!a.correct); }}
                  style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color, borderRadius: 24, padding: '10px 18px', fontFamily: 'monospace', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', letterSpacing: '0.03em' }}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
        {feedback && (
          <div data-testid="tutorial-feedback" style={{ marginTop: 14, maxWidth: 340, textAlign: 'center', fontSize: 13.5, lineHeight: 1.5, color: feedbackGood ? '#6ee7b7' : 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '9px 14px' }}>
            {feedback}
          </div>
        )}
        {step.note && (
          <div style={{ marginTop: 12, fontSize: 11.5, color: 'rgba(255,255,255,0.45)', textAlign: 'center', maxWidth: 330, lineHeight: 1.5 }}>{step.note}</div>
        )}
      </div>

      {/* Footer nav */}
      <div style={{ padding: '0 20px 34px', maxWidth: 430, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {isLast && onPractice && (
          <button type="button" data-testid="button-how-to-practice-badugi" onClick={onPractice} style={{ background: 'rgba(110,231,183,0.14)', border: '1px solid rgba(110,231,183,0.55)', borderRadius: 24, padding: '10px 24px', fontFamily: 'monospace', fontWeight: 800, fontSize: 12, color: '#6ee7b7', cursor: 'pointer', letterSpacing: '0.06em', width: '100%', marginBottom: 12 }}>
            PRACTICE BADUGI
          </button>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <button data-testid="button-how-to-play-back" onClick={() => setStepIdx(v => Math.max(0, v - 1))} disabled={stepIdx === 0} style={{ background: 'none', border: `1px solid ${stepIdx === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.22)'}`, borderRadius: 24, padding: '12px 30px', fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: stepIdx === 0 ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.65)', cursor: stepIdx === 0 ? 'default' : 'pointer' }}>BACK</button>
          <button data-testid={isLast ? 'button-how-to-play-finish' : 'button-how-to-play-next'} onClick={() => isLast ? onClose() : setStepIdx(v => v + 1)} style={{ background: spec.color, border: 'none', borderRadius: 24, padding: '12px 30px', fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: 'white', cursor: 'pointer', boxShadow: `0 0 20px ${spec.color}66` }}>{isLast ? "LET'S PLAY" : 'NEXT'}</button>
        </div>
      </div>
    </div>
  );
}
