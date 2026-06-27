import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { PlayingCard } from '@/components/game/Card';
import { ChipBurst } from '@/components/flushedUp/ChipBurst';
import { evaluateKamikaze } from '@shared/modes/kamikaze';
import type { KamikazeEval } from '@shared/modes/kamikaze';
import type { GameState } from '@shared/gameTypes';

const HOLD_MS    = 6000;
const WIN_CARD_W = 52;
const WIN_CARD_H = Math.round(WIN_CARD_W / 0.714);
const YOU_CARD_W = 44;
const YOU_CARD_H = Math.round(YOU_CARD_W / 0.714);

type AnyCard = { rank: string | null; suit: string | null; isHidden: boolean };

function handLabel(ev: KamikazeEval): string {
  if (!ev.isValid) return ev.description;
  const sym: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const s = sym[ev.threeSuit] ?? '';
  function rl(v: number) {
    if (v === 1 || v === 14) return 'A';
    if (v === 13) return 'K'; if (v === 12) return 'Q'; if (v === 11) return 'J';
    return String(v);
  }
  return `3+2+1 ${s}  HI ${rl(ev.highValue)} · LO ${rl(ev.lowValue)}`;
}

function AnimatedCounter({ target }: { target: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = Date.now(); const duration = 1800; let raf: number;
    const tick = () => { const t = Math.min(1, (Date.now() - start) / duration); const e = 1 - Math.pow(1 - t, 3); setValue(Math.round(e * target)); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <>{value.toLocaleString()}</>;
}

function CardRow({ cards, glow, dim = false, cardW, cardH }: { cards: AnyCard[]; glow?: string | null; dim?: boolean; cardW: number; cardH: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'nowrap', filter: dim ? 'brightness(0.6) saturate(0.4)' : 'none' }}>
      {cards.map((card, i) => (
        <div key={i} style={{ width: cardW, height: cardH, flexShrink: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(250,204,21,0.3)', boxShadow: glow ? `0 0 14px ${glow}, 0 2px 8px rgba(0,0,0,0.7)` : '0 2px 8px rgba(0,0,0,0.7)' }}>
          <PlayingCard card={{ ...card, isHidden: false } as any} className="!w-full !h-full !rounded-none !shrink-0" />
        </div>
      ))}
    </div>
  );
}

function DeclarationBadge({ declaration, side }: { declaration: string; side: 'HIGH' | 'LOW' }) {
  const isHigh = side === 'HIGH';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 12px', borderRadius: 20, background: isHigh ? 'rgba(250,204,21,0.12)' : 'rgba(59,130,246,0.12)', border: isHigh ? '1px solid rgba(250,204,21,0.45)' : '1px solid rgba(59,130,246,0.45)', fontSize: 11, fontFamily: 'monospace', fontWeight: 800, color: isHigh ? '#facc15' : '#93c5fd', letterSpacing: '0.12em' }}>
      {declaration === side ? `▶ ${side}` : side}
    </div>
  );
}

function CountdownBar() {
  const [progress, setProgress] = useState(1);
  const rafRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const startTime = Date.now();
    const tick = () => { const p = Math.max(0, 1 - (Date.now() - startTime) / HOLD_MS); setProgress(p); if (p > 0) rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current); };
  }, []);
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.06)' }}>
      <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg, #b91c1c, #ef4444, #facc15)', borderRadius: '0 2px 2px 0', transition: 'width 0.1s linear' }} />
    </div>
  );
}

interface KamikazeShowdownProps { state: GameState; myId: string; }

export function KamikazeShowdown({ state, myId }: KamikazeShowdownProps) {
  const me = state.players.find(p => p.id === myId);
  const winners = state.players.filter(p => (p as any).isWinner);
  const heroIsWinner = winners.some(w => w.id === myId);
  const isSplitPot = winners.length > 1;

  const primaryWinner = heroIsWinner ? me : (winners[0] ?? null);

  const resMsg = state.messages.find(m => (m as any).isResolution);
  const amountMatch = resMsg?.text?.match(/\$(\d+)/);
  const potAmount = amountMatch ? parseInt(amountMatch[1], 10) : 0;

  const evalCards = (cards: AnyCard[]) =>
    cards.every(c => c.rank !== null && c.suit !== null)
      ? evaluateKamikaze(cards.map(c => ({ ...c, isHidden: false })) as any)
      : null;

  const heroEval: KamikazeEval | null = me?.cards?.length ? evalCards(me.cards as AnyCard[]) : null;
  const winnerEval: KamikazeEval | null = !heroIsWinner && primaryWinner?.cards?.length
    ? evalCards(primaryWinner.cards as AnyCard[]) : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: heroIsWinner ? 'radial-gradient(ellipse at 50% 42%, rgba(20,10,0,0.98) 0%, rgba(0,0,0,0.99) 100%)' : 'rgba(0,0,0,0.98)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 12px 16px', overflowY: 'hidden' }}>

      {heroIsWinner ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
          <ChipBurst active={true} originX={0.5} originY={0.42} />
          <motion.div animate={{ scale: [1, 1.05, 1], opacity: [0.88, 1, 0.88] }} transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 800, color: '#facc15', letterSpacing: '0.28em', textShadow: '0 0 32px rgba(250,204,21,0.55)' }}>
              {isSplitPot ? '⚡  SPLIT POT  ⚡' : '★    WINNER    ★'}
            </div>
            <div style={{ fontSize: 28, fontFamily: 'monospace', fontWeight: 900, color: '#fff', letterSpacing: '0.05em' }}>
              {me?.name ?? 'You'}
            </div>
          </motion.div>
          {me?.declaration && me.declaration !== 'FOLD' && (
            <DeclarationBadge declaration={me.declaration} side={me.declaration as 'HIGH' | 'LOW'} />
          )}
          {me?.cards?.length ? <CardRow cards={me.cards as AnyCard[]} glow="rgba(250,204,21,0.7)" cardW={WIN_CARD_W} cardH={WIN_CARD_H} /> : null}
          {heroEval && <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#facc15', letterSpacing: '0.1em' }}>{handLabel(heroEval)}</div>}
          {potAmount > 0 && (
            <div style={{ fontSize: 21, fontFamily: 'monospace', fontWeight: 800, color: '#facc15', letterSpacing: '0.08em' }}>
              +<AnimatedCounter target={potAmount} /> chips
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', width: '100%', maxWidth: 420 }}>
          {primaryWinner && (
            <div style={{ width: '100%', padding: '12px', borderRadius: 14, background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 800, color: 'rgba(239,68,68,0.75)', letterSpacing: '0.24em' }}>WINNER</div>
              <div style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>{primaryWinner.name}</div>
              {primaryWinner.declaration && primaryWinner.declaration !== 'FOLD' && (
                <DeclarationBadge declaration={primaryWinner.declaration} side={primaryWinner.declaration as 'HIGH' | 'LOW'} />
              )}
              {primaryWinner.cards?.length ? <CardRow cards={primaryWinner.cards as AnyCard[]} glow="rgba(239,68,68,0.7)" cardW={WIN_CARD_W} cardH={WIN_CARD_H} /> : null}
              {winnerEval && <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#ef4444', letterSpacing: '0.09em' }}>{handLabel(winnerEval)}</div>}
            </div>
          )}
          {me?.cards?.length ? (
            <div style={{ width: '100%', padding: '10px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.22em' }}>YOU HAD</div>
              {me.declaration && me.declaration !== 'FOLD' && (
                <DeclarationBadge declaration={me.declaration} side={me.declaration as 'HIGH' | 'LOW'} />
              )}
              <CardRow cards={me.cards as AnyCard[]} glow={null} dim={true} cardW={YOU_CARD_W} cardH={YOU_CARD_H} />
              {heroEval && <div style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 400, color: 'rgba(255,255,255,0.36)', letterSpacing: '0.09em' }}>{handLabel(heroEval)}</div>}
            </div>
          ) : null}
        </div>
      )}

      <CountdownBar />
    </motion.div>
  );
}
