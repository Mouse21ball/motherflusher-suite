import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { PlayingCard } from '@/components/game/Card';
import { ChipBurst } from '@/components/flushedUp/ChipBurst';
import { evaluateBonecrusher } from '@shared/modes/bonecrusher';
import type { BonecrusherEval } from '@shared/modes/bonecrusher';
import type { GameState } from '@shared/gameTypes';

const HOLD_MS    = 6000;
const WIN_CARD_W = 44;
const WIN_CARD_H = Math.round(WIN_CARD_W / 0.714);
const YOU_CARD_W = 34;
const YOU_CARD_H = Math.round(YOU_CARD_W / 0.714);

type AnyCard = { rank: string | null; suit: string | null; isHidden: boolean };

/* ── Countdown bar using requestAnimationFrame ──────────────────────────── */
function CountdownBar() {
  const [progress, setProgress] = useState(1);
  const rafRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const startTime = Date.now();
    const tick = () => {
      const p = Math.max(0, 1 - (Date.now() - startTime) / HOLD_MS);
      setProgress(p);
      if (p > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current); };
  }, []);
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.06)' }}>
      <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg, #92400e, #d97706, #fbbf24)', borderRadius: '0 2px 2px 0', transition: 'width 0.1s linear' }} />
    </div>
  );
}

/* ── Rolling chip counter ───────────────────────────────────────────────── */
function AnimatedCounter({ target }: { target: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = Date.now(); const duration = 1800; let raf: number;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(e * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <>{value.toLocaleString()}</>;
}

/* ── Card row using real PlayingCard ────────────────────────────────────── */
function CardRow({ cards, glow, dim = false, cardW, cardH }: {
  cards: AnyCard[]; glow?: string | null; dim?: boolean; cardW: number; cardH: number;
}) {
  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'nowrap', filter: dim ? 'brightness(0.6) saturate(0.4)' : 'none' }}>
      {cards.slice(0, 5).map((card, i) => (
        <div key={i} style={{
          width: cardW, height: cardH, flexShrink: 0, borderRadius: 5, overflow: 'hidden',
          border: '1px solid rgba(217,119,6,0.3)',
          boxShadow: glow ? `0 0 14px ${glow}, 0 2px 8px rgba(0,0,0,0.7)` : '0 2px 8px rgba(0,0,0,0.7)',
        }}>
          <PlayingCard card={{ ...card, isHidden: false } as any} className="!w-full !h-full !rounded-none !shrink-0" />
        </div>
      ))}
    </div>
  );
}

/* ── Declaration badge ──────────────────────────────────────────────────── */
function DeclarationBadge({ declaration }: { declaration: string }) {
  const styles: Record<string, { color: string; bg: string; border: string }> = {
    HIGH:  { color: '#d97706', bg: 'rgba(217,119,6,0.12)',  border: 'rgba(217,119,6,0.45)' },
    LOW:   { color: '#93c5fd', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.45)' },
    SWING: { color: '#d8b4fe', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.45)' },
  };
  const c = styles[declaration] ?? styles.HIGH;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 12px', borderRadius: 20, background: c.bg, border: `1px solid ${c.border}`, fontSize: 11, fontFamily: 'monospace', fontWeight: 800, color: c.color, letterSpacing: '0.12em' }}>
      ▶ {declaration}
    </div>
  );
}

/* ── Props ──────────────────────────────────────────────────────────────── */
interface BonecrusherShowdownProps {
  state: GameState;
  myId: string;
  onContinue?: () => void;
}

/* ── Showdown ───────────────────────────────────────────────────────────── */
export function BonecrusherShowdown({ state, myId, onContinue }: BonecrusherShowdownProps) {
  const me           = state.players.find(p => p.id === myId);
  const winners      = state.players.filter(p => (p as any).isWinner);
  const heroIsWinner = winners.some(w => w.id === myId);
  const isSplitPot   = winners.length > 1;

  const primaryWinner = heroIsWinner ? me : (winners[0] ?? null);

  const resMsg      = state.messages.find(m => (m as any).isResolution);
  const amountMatch = resMsg?.text?.match(/\$(\d+)/);
  const potAmount   = amountMatch ? parseInt(amountMatch[1], 10) : 0;

  const evalCards = (cards: AnyCard[]): BonecrusherEval | null =>
    cards.every(c => c.rank !== null && c.suit !== null)
      ? evaluateBonecrusher(cards.map(c => ({ ...c, isHidden: false })) as any)
      : null;

  const heroEval: BonecrusherEval | null = me?.cards?.length
    ? evalCards(me.cards as AnyCard[]) : null;
  const winnerEval: BonecrusherEval | null = !heroIsWinner && primaryWinner?.cards?.length
    ? evalCards(primaryWinner.cards as AnyCard[]) : null;

  /* Auto-advance after HOLD_MS */
  useEffect(() => {
    const timer = setTimeout(() => { onContinue?.(); }, HOLD_MS);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: heroIsWinner
          ? 'radial-gradient(ellipse at 50% 42%, rgba(15,8,0,0.98) 0%, rgba(0,0,0,0.99) 100%)'
          : 'rgba(0,0,0,0.98)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '12px 12px 16px', overflowY: 'hidden',
      }}>

      {heroIsWinner ? (
        /* ── Hero wins ── */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
          <ChipBurst active={true} originX={0.5} originY={0.42} />
          <motion.div
            animate={{ scale: [1, 1.05, 1], opacity: [0.88, 1, 0.88] }}
            transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 800, color: '#d97706', letterSpacing: '0.28em', textShadow: '0 0 32px rgba(217,119,6,0.55)' }}>
              {isSplitPot ? '⚡  SPLIT POT  ⚡' : '★    WINNER    ★'}
            </div>
            <div style={{ fontSize: 28, fontFamily: 'monospace', fontWeight: 900, color: '#fff', letterSpacing: '0.05em' }}>
              {me?.name ?? 'You'}
            </div>
          </motion.div>
          {me?.declaration && me.declaration !== 'FOLD' && (
            <DeclarationBadge declaration={me.declaration} />
          )}
          {me?.cards?.length ? (
            <CardRow cards={me.cards as AnyCard[]} glow="rgba(217,119,6,0.7)" cardW={WIN_CARD_W} cardH={WIN_CARD_H} />
          ) : null}
          {heroEval && (
            <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#d97706', letterSpacing: '0.1em' }}>
              {heroEval.highName} · {heroEval.lowDesc}
            </div>
          )}
          {potAmount > 0 && (
            <div style={{ fontSize: 21, fontFamily: 'monospace', fontWeight: 800, color: '#d97706', letterSpacing: '0.08em' }}>
              +<AnimatedCounter target={potAmount} /> chips
            </div>
          )}
        </div>
      ) : (
        /* ── Hero loses ── */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', width: '100%', maxWidth: 420 }}>
          {primaryWinner && (
            <div style={{ width: '100%', padding: '12px', borderRadius: 14, background: 'rgba(217,119,6,0.06)', border: '1.5px solid rgba(217,119,6,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 800, color: 'rgba(217,119,6,0.75)', letterSpacing: '0.24em' }}>WINNER</div>
              <div style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>{primaryWinner.name}</div>
              {primaryWinner.declaration && primaryWinner.declaration !== 'FOLD' && (
                <DeclarationBadge declaration={primaryWinner.declaration} />
              )}
              {primaryWinner.cards?.length ? (
                <CardRow cards={primaryWinner.cards as AnyCard[]} glow="rgba(217,119,6,0.7)" cardW={WIN_CARD_W} cardH={WIN_CARD_H} />
              ) : null}
              {winnerEval && (
                <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#d97706', letterSpacing: '0.09em' }}>
                  {winnerEval.highName} · {winnerEval.lowDesc}
                </div>
              )}
            </div>
          )}
          {me?.cards?.length ? (
            <div style={{ width: '100%', padding: '10px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.22em' }}>YOU HAD</div>
              {me.declaration && me.declaration !== 'FOLD' && (
                <DeclarationBadge declaration={me.declaration} />
              )}
              <CardRow cards={me.cards as AnyCard[]} glow={null} dim={true} cardW={YOU_CARD_W} cardH={YOU_CARD_H} />
              {heroEval && (
                <div style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 400, color: 'rgba(255,255,255,0.36)', letterSpacing: '0.09em' }}>
                  {heroEval.highName} · {heroEval.lowDesc}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      <CountdownBar />
    </motion.div>
  );
}
