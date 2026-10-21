import { PlayingCard } from "@/components/game/Card";
import { AvatarWithFrame } from "@/components/ui/AvatarWithFrame";
import { evaluateBoxChevy10 } from "@shared/modes/boxchevy";
import { getSelectedBackground } from "@/lib/tableBackgrounds";
import type { CardType } from "@shared/gameTypes";

/**
 * Detroit 2026-10-21: Box Chevy five-seat DESIGN MOCKUP — proposal only.
 *
 * Per Detroit's correction, Box Chevy does NOT get a direct transfer of
 * the Badugi layout: it has five community cards and its own hero-hand
 * structure. This page proposes a dedicated layout for his approval
 * BEFORE any implementation:
 *   - the approved premium five-seat pod arc (Badugi geometry),
 *   - a dedicated center band for all five community cards + pot,
 *   - Box Chevy's own pieces preserved: 5 hole cards, made-hand
 *     qualifier banner (computed by the real evaluator, not typed in),
 *     declaration badges in Box Chevy's own colors (HIGH blue,
 *     LOW green, SWING purple), and its declare/draw controls.
 *
 * Static fixtures only — no WebSocket, no game, no chips.
 * Access: /dev/bc5seat?phase=declare (default) or ?phase=draw
 * Gated by import.meta.env.DEV; never ships to production.
 */

const mk = (rank: string, suit: string, hidden = false) =>
  ({ rank, suit, isHidden: hidden } as unknown as CardType);

const BOARD: CardType[] = [mk('2', 'clubs'), mk('5', 'spades'), mk('7', 'hearts'), mk('9', 'diamonds'), mk('J', 'clubs')];

const HERO_DECLARE: CardType[] = [mk('A', 'spades'), mk('3', 'hearts'), mk('4', 'diamonds'), mk('8', 'clubs'), mk('10', 'spades')];
const HERO_DRAW: CardType[] = [mk('A', 'spades'), mk('3', 'hearts'), mk('4', 'diamonds'), mk('9', 'spades'), mk('8', 'clubs')];

interface MockOpp {
  name: string; chips: number; bet: number; folded?: boolean;
  declaration?: 'HIGH' | 'LOW' | 'SWING' | null; isTurn?: boolean;
  pos: { x: number; y: number };
}

// Approved Badugi five-seat pod centers (percent of stage), hero excluded.
const OPPS: MockOpp[] = [
  { name: 'Razor', chips: 3420, bet: 100, declaration: 'LOW', pos: { x: 4, y: 35 } },
  { name: 'Ghost', chips: 2180, bet: 100, isTurn: true, pos: { x: 27.5, y: 16.5 } },
  { name: 'QueenB', chips: 5720, bet: 100, declaration: 'SWING', pos: { x: 72.5, y: 16.5 } },
  { name: 'SlimShadyFromTheWestSide', chips: 3960, bet: 0, folded: true, pos: { x: 96, y: 35 } },
];

const DECL_STYLE: Record<string, { color: string; bg: string }> = {
  HIGH: { color: '#93c5fd', bg: 'rgba(59,130,246,0.25)' },
  LOW: { color: '#86efac', bg: 'rgba(34,197,94,0.22)' },
  SWING: { color: '#d8b4fe', bg: 'rgba(168,85,247,0.25)' },
};

function OppPod({ opp }: { opp: MockOpp }) {
  const decl = opp.declaration ? DECL_STYLE[opp.declaration] : null;
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: `${opp.pos.x}%`, top: `${opp.pos.y}%`,
        transform: 'translate(-50%, -50%)', width: 86,
        opacity: opp.folded ? 0.45 : 1, zIndex: 6,
      }}
    >
      <div className="flex -space-x-2 mb-0.5" style={{ transform: 'rotateX(18deg)' }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="rounded" style={{
            width: 17, height: 24,
            background: 'linear-gradient(135deg, #2d1b69, #1a0f2e)',
            border: '1px solid rgba(139,92,246,0.4)',
          }} />
        ))}
      </div>
      <div
        className="flex items-center gap-1 px-1 rounded-xl"
        style={{
          background: 'rgba(10,5,25,0.72)', backdropFilter: 'blur(6px)',
          border: opp.isTurn ? '1px solid rgba(240,184,41,0.8)' : '1px solid rgba(255,255,255,0.10)',
          maxWidth: 86,
        }}
      >
        <AvatarWithFrame initials={opp.name.slice(0, 2).toUpperCase()} initialsColor="#FDE68A" frameSrc={null} size={22} />
        <div className="flex flex-col min-w-0 py-0.5">
          <span className="text-[9px] font-mono font-bold text-white/90 truncate" style={{ maxWidth: 56 }}>{opp.name}</span>
          <span className="text-[8px] font-mono text-white/55 leading-none">${opp.chips.toLocaleString()}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-0.5" style={{ minHeight: 13 }}>
        {opp.bet > 0 && <span className="text-[8px] font-mono font-bold text-amber-300">${opp.bet}</span>}
        {opp.folded && <span className="text-[8px] font-mono font-bold px-1 py-px rounded-full" style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.45)' }}>FOLD</span>}
        {decl && opp.declaration && (
          <span className="text-[8px] font-mono font-bold px-1 py-px rounded-full" style={{ color: decl.color, background: decl.bg, border: `1px solid ${decl.color}55` }}>{opp.declaration}</span>
        )}
      </div>
    </div>
  );
}

export default function BoxChevyFiveSeatMockupPage() {
  const params = new URLSearchParams(window.location.search);
  const phase = params.get('phase') === 'draw' ? 'draw' : 'declare';
  const hero = phase === 'draw' ? HERO_DRAW : HERO_DECLARE;
  const ev = evaluateBoxChevy10(hero as any, BOARD as any);
  const bg = getSelectedBackground();

  return (
    <div style={{ width: '100vw', height: '100dvh', background: '#0a0618', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'rgba(255,180,0,0.9)', color: '#000', textAlign: 'center', fontSize: 12, padding: '4px', fontWeight: 700, flexShrink: 0 }}>
        DESIGN MOCKUP — Box Chevy 5-seat proposal ({phase}) — not a real game
      </div>

      {/* Status strip (the real one now reads capacity from table settings) */}
      <div className="flex items-center justify-center gap-5 shrink-0" style={{ background: 'rgba(0,0,0,0.7)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '6px 0' }}>
        <span className="text-[10px] font-mono text-white/60">MIN BET <b className="text-white">$50</b></span>
        <span className="text-[10px] font-mono text-white/60">PLAYERS <b className="text-white">5 / 5</b></span>
        <span className="text-[10px] font-mono text-white/60">POT <b style={{ color: '#C9A227' }}>$1,250</b></span>
      </div>

      <div className="relative flex-1" style={{ backgroundImage: `url(${bg.url})`, backgroundSize: 'cover', backgroundPosition: 'center top', maxWidth: 430, width: '100%', margin: '0 auto' }}>
        {OPPS.map(o => <OppPod key={o.name} opp={o} />)}

        {/* Dedicated community center — the piece Badugi doesn't have */}
        <div className="absolute left-1/2 flex flex-col items-center" style={{ top: '41%', transform: 'translate(-50%, -50%)', zIndex: 5 }}>
          <div className="text-white/45 text-[9px] font-mono tracking-[0.25em] mb-1">COMMUNITY</div>
          <div className="flex gap-1.5">
            {BOARD.map((card, i) => (
              <PlayingCard key={i} card={card} className="!w-[44px] !h-[62px]" />
            ))}
          </div>
          <div className="text-amber-300/70 text-[10px] font-mono tracking-widest mt-2.5">POT</div>
          <div className="text-amber-200 text-[22px] font-bold font-mono leading-none" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>$1,250</div>
        </div>

        {/* Made-hand qualifier banner (real evaluator output) */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '57%', zIndex: 5 }}>
          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={ev.isMade
            ? { color: '#6ee7b7', background: 'rgba(16,185,129,0.16)', border: '1px solid rgba(16,185,129,0.55)' }
            : { color: '#fca5a5', background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.5)' }}>
            {ev.isMade ? '✓ MADE HAND · 10 UNIQUE RANKS' : '✗ NO MADE HAND · DUPLICATE RANK'}
          </span>
        </div>

        {/* Hero hand */}
        <div className="absolute left-1/2 flex gap-1" style={{ top: '65%', transform: 'translateX(-50%)', zIndex: 6 }}>
          {hero.map((card, i) => {
            const selected = phase === 'draw' && i === 3;
            return (
              <div key={i} style={{
                transform: selected ? 'translateY(-10px)' : undefined,
                boxShadow: selected ? '0 0 0 2px #f0b829, 0 8px 18px rgba(0,0,0,0.55)' : undefined,
                borderRadius: 8, position: 'relative',
              }}>
                <PlayingCard card={card} className="!w-[56px] !h-[78px]" />
                {selected && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-mono font-bold px-1 rounded-full" style={{ background: '#f0b829', color: '#1a1205' }}>SWAP</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Hero pod */}
        <div className="absolute flex flex-col items-center" style={{ left: '50%', top: '88%', transform: 'translate(-50%, -50%)', zIndex: 6 }}>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl" style={{ background: 'rgba(10,5,25,0.78)', backdropFilter: 'blur(6px)', border: '1px solid rgba(240,184,41,0.55)' }}>
            <AvatarWithFrame initials="OG" initialsColor="#FDE68A" frameSrc={null} size={30} />
            <div className="flex flex-col">
              <span className="text-[11px] font-mono font-bold text-amber-200">OG PLAYER</span>
              <span className="text-[9px] font-mono text-white/60 leading-none">$125,430 · BET $100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar — Box Chevy's own controls and colors */}
      <div className="shrink-0" style={{ background: 'rgba(5,2,15,0.96)', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '10px 14px 26px', maxWidth: 430, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {phase === 'declare' ? (
          <>
            <div className="text-center text-[11px] font-mono mb-2" style={{ color: 'rgba(147,197,253,0.85)', letterSpacing: '0.12em' }}>DECLARE HIGH · LOW · SWING</div>
            <div className="flex gap-2">
              <button className="flex-1 rounded-xl font-mono font-black text-sm py-3.5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #1d4ed8)', color: '#93c5fd', border: 'none' }}>HIGH</button>
              <button className="flex-1 rounded-xl font-mono font-black text-sm py-3.5" style={{ background: 'linear-gradient(135deg, #064e3b, #10b981)', color: '#fff', border: 'none' }}>LOW</button>
              <button className="flex-1 rounded-xl font-mono font-black text-sm py-3.5" style={{ background: 'linear-gradient(135deg, #6b21a8, #a855f7)', color: '#fff', border: 'none' }}>SWING</button>
            </div>
            <div className="text-center text-[10px] font-mono mt-2" style={{ color: 'rgba(216,180,254,0.7)' }}>SWING = must win both HIGH &amp; LOW — or forfeit</div>
          </>
        ) : (
          <>
            <div className="text-center text-[11px] font-mono mb-2" style={{ color: 'rgba(255,255,255,0.6)', letterSpacing: '0.12em' }}>DRAW 1 OF 3 — TAP CARDS TO SWAP (MAX 3)</div>
            <div className="flex gap-2">
              <button className="flex-1 rounded-xl font-mono font-black text-sm py-3.5" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}>KEEP CARDS</button>
              <button className="flex-1 rounded-xl font-mono font-black text-sm py-3.5" style={{ background: 'rgba(201,162,39,0.22)', color: '#fcd34d', border: '1px solid rgba(201,162,39,0.65)' }}>SWAP (1)</button>
            </div>
            <div className="text-center text-[10px] font-mono mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>Only your hole cards swap — the board never moves</div>
          </>
        )}
      </div>
    </div>
  );
}
