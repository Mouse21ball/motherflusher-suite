/**
 * BadugiTable — prototype presentation engine with live server state (Detroit 2026-10-15).
 *
 * Gutted and rebuilt from the UNO prototype (client/src/proto/unoBadugi.tsx).
 * Same layout, same flights, same sounds, same animations — driven by live GameState
 * instead of the prototype's scripted state machine.
 *
 * Prototype positions (absolute, UNO-style):
 *   Hero: (50%, 88%) — bottom center, ego-style
 *   Opponents: (16%, 32%), (50%, 22%), (84%, 32%) — spread around top
 *   Pot: (50%, 52%) — center
 *   Dealer: (50%, 4%) — top
 *   Muck: (63%, 44%)
 */
import { AnimatePresence, motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '@/lib/poker/types';
import type { Player } from '@shared/gameTypes';
import { CardHand } from '@/components/flushedUp/CardHand';
import type { CardAnimState } from '@/components/flushedUp/useCardAnimations';
import { PlayingCard } from '@/components/game/Card';
import { evaluateBadugi } from '@shared/modes/badugi';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import { UniversalTableHeader } from '@/components/game/UniversalTableHeader';
import { sfx } from '@/lib/sounds';

// ── Prototype positions ──────────────────────────────────────────────────────

const DEALER_POS = { x: 50, y: 4 };
const POT_POS = { x: 50, y: 52 };
const MUCK_POS = { x: 63, y: 44 };

function seatPosition(index: number): { x: number; y: number } {
  if (index === 0) return { x: 50, y: 84 }; // hero
  const spots = [
    { x: 16, y: 32 },
    { x: 50, y: 22 },
    { x: 84, y: 32 },
  ];
  return spots[(index - 1) % spots.length];
}

function phaseLabel(phase: string): string {
  if (phase.startsWith('DRAW_')) return `DRAW ${phase.split('_')[1]} / 3`;
  if (phase.startsWith('BET_')) return 'BETTING';
  if (phase === 'SHOWDOWN') return 'SHOWDOWN';
  if (phase === 'ANTE') return 'ANTES';
  if (phase === 'WAITING') return 'WAITING';
  return phase.replace(/_/g, ' ');
}

// ── PotStack — from prototype ────────────────────────────────────────────────

function PotStack({ amount }: { amount: number }) {
  const chips = amount <= 0 ? 0
    : amount < 500 ? 3
    : amount < 2000 ? 6
    : amount < 10000 ? 10
    : 14;
  const isMax = amount >= 10000;
  if (chips === 0) return null;

  return (
    <div className="relative flex items-end justify-center my-2" style={{ height: 44 }}>
      {Array.from({ length: chips }).map((_, i) => {
        const layer = Math.floor(i / 4);
        const posInLayer = i % 4;
        const xOff = (posInLayer - 1.5) * 10 + (layer % 2 === 0 ? 3 : -3);
        const yOff = -layer * 9;
        const colors = ['#F59E0B', '#FBBF24', '#D97706', '#FCD34D'];
        return (
          <motion.div
            key={`potchip-${i}`}
            initial={{ scale: 0, y: -20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22, delay: i * 0.03 }}
            className="absolute rounded-full"
            style={{
              width: 30,
              height: 30,
              left: `calc(50% - 15px + ${xOff}px)`,
              bottom: `${6 + yOff * -1}px`,
              background: `radial-gradient(circle at 35% 30%, ${colors[i % 4]}, #92400E)`,
              border: '2px dashed rgba(255,255,255,0.5)',
              boxShadow: isMax
                ? '0 0 16px rgba(245,158,11,0.9), 0 3px 6px rgba(0,0,0,0.5)'
                : '0 3px 6px rgba(0,0,0,0.5)',
              zIndex: i,
            }}
          />
        );
      })}
      {isMax && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.35) 0%, transparent 70%)' }}
        />
      )}
    </div>
  );
}

// ── Flight state (driven by live state diffs) ────────────────────────────────

interface Flight {
  id: string;
  kind: 'card' | 'chip' | 'muck';
  fromX: number; fromY: number;
  toX: number; toY: number;
  label: string;
  faceDown: boolean;
  duration: number;
  toHero: boolean;
}

function FlightView({ flight }: { flight: Flight }) {
  const isCard = flight.kind !== 'chip';
  const liftTime = isCard ? 0.18 : 0;
  return (
    <motion.div
      className="absolute z-30 pointer-events-none"
      style={{
        left: `${flight.fromX}%`,
        top: `${flight.fromY}%`,
        transformStyle: 'preserve-3d',
      }}
      initial={{ x: '-50%', y: '-50%', opacity: 1, scale: 1, rotateY: isCard ? -70 : 0, rotateX: isCard ? 12 : 0 }}
      animate={{
        left: `${flight.toX}%`,
        top: `${flight.toY}%`,
        opacity: 1,
        scale: isCard ? [1, 1.35, 1] : 0.85,
        y: isCard ? ['-50%', '-80%', '-50%'] : '-50%',
        rotateY: 0,
        rotateX: 0,
      }}
      transition={{
        duration: flight.duration + liftTime,
        ease: [0.3, 0.7, 0.4, 1],
        times: isCard ? [0, liftTime / (flight.duration + liftTime), 1] : undefined,
      }}
    >
      {flight.kind === 'chip' ? (
        <div
          className="rounded-full px-3 py-1.5 font-mono font-bold text-xs text-amber-200 whitespace-nowrap"
          style={{
            background: 'rgba(20,10,40,0.95)',
            border: '2px solid rgba(240,184,41,0.8)',
            boxShadow: '0 0 16px rgba(240,184,41,0.5)',
          }}
        >
          {flight.label}
        </div>
      ) : (
        <div
          className="rounded"
          style={{
            width: flight.toHero ? 44 : 20,
            height: flight.toHero ? 62 : 30,
            background: flight.faceDown
              ? 'linear-gradient(135deg, #2d1b69, #1a0f2e)'
              : 'linear-gradient(135deg, #f5f0ff, #d9ccff)',
            border: '1px solid rgba(139,92,246,0.6)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        />
      )}
    </motion.div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface BadugiTableProps {
  state: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isDrawPhase: boolean;
  animState: CardAnimState;
}

export function BadugiTable({ state, myId, selectedCardIndices, onCardClick, isDrawPhase, animState }: BadugiTableProps) {
  const reduced = useReducedMotion();
  const [tableRoot, setTableRoot] = useState<HTMLElement | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [rake, setRake] = useState<{ active: boolean; winnerIndex: number; amount: number }>({ active: false, winnerIndex: -1, amount: 0 });
  const [celebration, setCelebration] = useState<{ active: boolean; winnerName: string; amount: number }>({ active: false, winnerName: '', amount: 0 });

  const me = state.players.find(p => p.id === myId);
  const myIndex = state.players.findIndex(p => p.id === myId);
  const isShowdown = state.phase === 'SHOWDOWN';
  const isHeroDealer = !!(me as any)?.isDealer;

  // Order: hero first (seat 0), then opponents clockwise
  const opponents = state.players.filter(p => p.id !== myId).slice(0, 3);
  const activeCount = state.players.filter(p => p.status === 'active').length;

  // Pot spring (smooth count-up)
  const potSpring = useSpring(state.pot, { stiffness: 120, damping: 20 });
  useEffect(() => { potSpring.set(state.pot); }, [state.pot, potSpring]);
  const potDisplay = useTransform(potSpring, v => Math.round(v).toLocaleString());

  // Hero hand eval
  const heroHandEval = me && me.cards.length > 0 && !me.cards.some(card => card.isHidden)
    ? evaluateBadugi(me.cards)
    : undefined;
  const heroIsLoser = isShowdown && !(me as any)?.isWinner && me?.status !== 'folded';
  const heroFilter = heroIsLoser ? 'brightness(0.6) saturate(0.5)' : 'none';

  // ── Flight helpers ─────────────────────────────────────────────────────────
  const flightId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  const addFlight = (f: Omit<Flight, 'id'>): string => {
    const id = `f${++flightId.current}`;
    setFlights(s => [...s, { ...f, id }]);
    return id;
  };
  const removeFlight = (id: string) => {
    setFlights(s => s.filter(f => f.id !== id));
  };

  // ── Drive flights from live state diffs ────────────────────────────────────
  const prevRef = useRef<{ handId?: number; phase: string; bets: Record<string, number>; cards: Record<string, number>; winners: Record<string, boolean>; draws: Record<string, number | undefined> } | null>(null);

  useEffect(() => {
    if (reduced) { prevRef.current = null; return; }
    const prev = prevRef.current;
    const curr = {
      handId: state.handId,
      phase: state.phase,
      bets: Object.fromEntries(state.players.map(p => [p.id, p.bet])),
      cards: Object.fromEntries(state.players.map(p => [p.id, p.cards.length])),
      winners: Object.fromEntries(state.players.map(p => [p.id, !!(p as any).isWinner])),
      draws: Object.fromEntries(state.players.map(p => [p.id, (p as any).lastDrawCount])),
    };

    if (prev) {
      // NEW HAND → deal flights from dealer to each seat (prototype: 160ms apart, 0.32s duration)
      const isNewHand = prev.handId !== undefined && curr.handId !== undefined && prev.handId !== curr.handId;
      if (isNewHand) {
        const order = [myIndex, ...opponents.map((_, i) => i + 1)].filter(i => i >= 0);
        order.forEach((seatIdx, i) => {
          later(i * 160, () => {
            const pos = seatPosition(seatIdx);
            const isHero = seatIdx === 0;
            const fid = addFlight({
              kind: 'card',
              fromX: DEALER_POS.x, fromY: DEALER_POS.y,
              toX: pos.x, toY: pos.y - 6,
              label: '', faceDown: !isHero, duration: 0.32, toHero: isHero,
            });
            if (isHero) sfx.dealSelf(); else sfx.dealSingle();
            later(320, () => removeFlight(fid));
          });
        });
      }

      // DRAWS → discards fly to muck, replacements fly from dealer (prototype: 1400ms apart)
      // Detected via lastDrawCount changes
      for (const p of state.players) {
        const prevDraw = (prev as any).draws?.[p.id];
        const currDraw = (p as any).lastDrawCount;
        if (currDraw !== undefined && currDraw > 0 && prevDraw !== currDraw) {
          const seatIdx = p.id === myId ? 0 : opponents.findIndex(o => o.id === p.id) + 1;
          const pos = seatPosition(seatIdx);
          const isHero = seatIdx === 0;
          // Discards fly face-down to muck (120ms apart, 0.35s duration)
          for (let d = 0; d < currDraw; d++) {
            const fid = addFlight({
              kind: 'muck',
              fromX: pos.x, fromY: pos.y - 6,
              toX: MUCK_POS.x + d * 1.5, toY: MUCK_POS.y,
              label: '', faceDown: true, duration: 0.35, toHero: false,
            });
            later(d * 120 + 350, () => removeFlight(fid));
          }
          sfx.dealSingle();
          // Replacements fly from dealer (after discards, 0.32s duration)
          later(currDraw * 120 + 400, () => {
            for (let d = 0; d < currDraw; d++) {
              const dfid = addFlight({
                kind: 'card',
                fromX: DEALER_POS.x, fromY: DEALER_POS.y,
                toX: pos.x, toY: pos.y - 6,
                label: '', faceDown: !isHero, duration: 0.32, toHero: isHero,
              });
              if (isHero) sfx.dealSelf(); else sfx.dealSingle();
              later(d * 120 + 320, () => removeFlight(dfid));
            }
          });
        }
      }

      // BETS → chips fly from bettor to pot
      for (const p of state.players) {
        const betIncrease = (curr.bets[p.id] ?? 0) - (prev.bets[p.id] ?? 0);
        if (betIncrease > 0 && curr.phase.startsWith('BET')) {
          const seatIdx = p.id === myId ? 0 : opponents.findIndex(o => o.id === p.id) + 1;
          const pos = seatPosition(seatIdx);
          const fid = addFlight({
            kind: 'chip',
            fromX: pos.x, fromY: pos.y - 4,
            toX: POT_POS.x, toY: POT_POS.y,
            label: `$${betIncrease}`, faceDown: false, duration: 0.45, toHero: false,
          });
          sfx.betPlace();
          later(450, () => removeFlight(fid));
        }
      }

      // SHOWDOWN → reveal, rake-in, celebration (prototype sequence)
      if (curr.phase === 'SHOWDOWN' && prev.phase !== 'SHOWDOWN') {
        const winner = state.players.find(p => (p as any).isWinner);
        if (winner) {
          const winnerIdx = winner.id === myId ? 0 : opponents.findIndex(o => o.id === winner.id) + 1;
          later(2500, () => {
            setRake({ active: true, winnerIndex: winnerIdx, amount: state.pot });
            sfx.chipRake();
          });
          later(3700, () => {
            setRake({ active: false, winnerIndex: -1, amount: 0 });
            setCelebration({ active: true, winnerName: winner.name, amount: state.pot });
            sfx.bigWin();
          });
          later(9200, () => {
            setCelebration({ active: false, winnerName: '', amount: 0 });
          });
        }
      }
    }

    prevRef.current = curr;
  }, [state, myId, myIndex, opponents, reduced]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const isDealing = state.phase === 'DEAL';

  return (
    <div ref={setTableRoot as any} className="w-full h-full relative" style={{ perspective: '1200px' }}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <UniversalTableHeader mode="badugi" title="BADUGI" subtitle="4-CARD DRAW" hideHelp />
        <div className="flex justify-center items-center gap-3 px-4 py-1 text-[10px] font-mono text-white/60">
          <span><b className="text-amber-300/80">PLAYERS</b> {activeCount}/{Math.min(state.players.length, 4)}</span>
          <span><b className="text-amber-300/80">DRAW</b> {state.phase.startsWith('DRAW_') ? `${state.phase.split('_')[1]}/3` : '–'}</span>
          <span><b className="text-amber-300/80">PHASE</b> {phaseLabel(state.phase)}</span>
        </div>
      </div>

      {/* Invisible anchors for flights */}
      <div data-dealer-anchor aria-hidden="true" className="absolute" style={{ left: `${DEALER_POS.x}%`, top: `${DEALER_POS.y}%` }} />
      <div data-muck-anchor aria-hidden="true" className="absolute" style={{ left: `${MUCK_POS.x}%`, top: `${MUCK_POS.y}%` }} />

      {/* Dealer — top center, rotates during dealing (prototype) */}
      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ top: '4%' }}>
        <motion.div
          className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold"
          style={{ background: 'rgba(240,184,41,0.15)', border: '2px solid rgba(240,184,41,0.5)' }}
          animate={{ rotate: isDealing ? 360 : 0 }}
          transition={{ duration: 2, ease: 'linear' }}
        >
          <span className="text-amber-300 text-[10px] font-mono">D</span>
        </motion.div>
      </div>

      {/* Pot — center (prototype style with scale pulse) */}
      <div className="absolute" style={{ left: `${POT_POS.x}%`, top: `${POT_POS.y}%`, transform: 'translate(-50%, -50%)' }}>
        <motion.div
          key={`pot-${state.pot}`}
          initial={{ scale: 1.15 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl px-6 py-3 text-center"
          style={{
            background: 'rgba(240,184,41,0.08)',
            border: '1px solid rgba(240,184,41,0.25)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 24px rgba(240,184,41,0.15)',
          }}
          data-pot-anchor
        >
          <div className="text-amber-300/70 text-[10px] font-mono tracking-widest">POT</div>
          <PotStack amount={state.pot} />
          <motion.div className="text-amber-200 text-2xl font-bold font-mono mt-1">{potDisplay}</motion.div>
        </motion.div>
        {(state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3') && (
          <div className="mt-1 text-center text-white/30 text-[10px] font-mono">🂠 muck</div>
        )}
      </div>

      {/* Flights */}
      {flights.map(f => <FlightView key={f.id} flight={f} />)}

      {/* Rake-in — chips fly from pot to winner (prototype) */}
      {rake.active && rake.winnerIndex >= 0 && (() => {
        const wpos = seatPosition(rake.winnerIndex);
        const amt = rake.amount;
        const flyCount = amt < 500 ? 3 : amt < 2000 ? 5 : amt < 10000 ? 7 : 8;
        return (
          <>
            {Array.from({ length: flyCount }).map((_, i) => (
              <motion.div
                key={`rakechip-${i}`}
                className="absolute z-20 rounded-full pointer-events-none"
                style={{
                  left: '50%', top: '52%',
                  width: 26, height: 26,
                  background: 'radial-gradient(circle at 35% 30%, #FBBF24, #92400E)',
                  border: '2px dashed rgba(255,255,255,0.5)',
                  boxShadow: '0 0 12px rgba(245,158,11,0.6)',
                }}
                initial={{ x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
                animate={{
                  x: `calc(-50% + ${(wpos.x - 50) * 3.5 + (i - flyCount / 2) * 8}px)`,
                  y: `calc(-50% + ${(wpos.y - 52) * 3.5 + (i % 3) * 6}px)`,
                  scale: 0.6, opacity: 0.9,
                }}
                transition={{ duration: 0.9, ease: [0.3, 0.7, 0.4, 1], delay: i * 0.06 }}
              />
            ))}
            <motion.div
              className="absolute z-20 flex flex-col items-center pointer-events-none"
              style={{ left: '50%', top: '52%' }}
              initial={{ x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
              animate={{
                x: `calc(-50% + ${(wpos.x - 50) * 3.5}px)`,
                y: `calc(-50% + ${(wpos.y - 52) * 3.5}px)`,
                scale: 0.7, opacity: 0.9,
              }}
              transition={{ duration: 1.0, ease: [0.3, 0.7, 0.4, 1] }}
            >
              <div
                className="rounded-full px-4 py-2 font-mono font-bold text-amber-200 whitespace-nowrap"
                style={{
                  background: 'rgba(20,10,40,0.9)',
                  border: '2px solid rgba(240,184,41,0.7)',
                  boxShadow: '0 0 24px rgba(240,184,41,0.4)',
                }}
              >
                ${rake.amount.toLocaleString()}
              </div>
              <div className="text-amber-300/80 text-[10px] font-mono mt-1">◀◀ RAKING IT IN</div>
            </motion.div>
          </>
        );
      })()}

      {/* Seats — opponents */}
      {opponents.map((opp, i) => {
        const pos = seatPosition(i + 1);
        const isActive = opp.id === state.activePlayerId && (state.phase.startsWith('BET') || state.phase.startsWith('DRAW'));
        const isDealer = !!(opp as any).isDealer;
        const isFolded = opp.status === 'folded';
        const drawBadge = !isDrawPhase || isFolded ? null
          : (opp as any).lastDrawCount === undefined ? 'WAITING'
          : (opp as any).lastDrawCount === 0 ? 'STAND PAT'
          : `DREW ${(opp as any).lastDrawCount}`;
        return (
          <div
            key={opp.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, opacity: isFolded ? 0.45 : 1 }}
            data-player-seat={opp.id}
          >
            {isActive && (
              <motion.div
                className="absolute -inset-2 rounded-xl pointer-events-none"
                style={{ border: '2px solid rgba(240,184,41,0.6)' }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-10 h-10 rounded-full overflow-hidden border-2 border-amber-400/40 shadow-lg">
                <img src={getAvatarForSeat(i + 2)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} className="w-full h-full object-cover" />
              </span>
              <div>
                <div className="text-white text-xs font-bold whitespace-nowrap">{opp.name}</div>
                <div className="text-amber-200/80 text-[10px] font-mono">{opp.chips.toLocaleString()}</div>
              </div>
              {isDealer && <span className="text-amber-300 text-[10px] font-mono ml-1">D</span>}
              {isFolded && <span className="text-red-400/70 text-[10px] font-mono ml-1">FOLD</span>}
            </div>
            {opp.bet > 0 && (
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-amber-300 text-[10px] font-mono mt-0.5">
                ${opp.bet}
              </motion.div>
            )}
            {/* Opponent cards — tiny, tight fan (prototype) */}
            <div className="flex mt-1" style={{ transform: 'rotateX(18deg)', transformStyle: 'preserve-3d', gap: '-8px' }}>
              <AnimatePresence>
                {Array.from({ length: 4 }).map((_, ci) => {
                  const fanAngle = (ci - 1.5) * 10;
                  return (
                    <motion.div
                      key={`${opp.id}-c${ci}`}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1, rotate: fanAngle }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: isShowdown ? 0.15 : 0.2, ease: 'easeOut' }}
                      style={{ transformOrigin: 'bottom center', marginLeft: ci === 0 ? 0 : -8 }}
                    >
                      <div className="rounded" style={{ width: 20, height: 30, background: 'linear-gradient(135deg, #2d1b69, #1a0f2e)', border: '1px solid rgba(139,92,246,0.4)' }} />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            {drawBadge && (
              <div className={`text-[9px] font-mono px-2 py-0.5 rounded-full mt-1 whitespace-nowrap ${drawBadge === 'WAITING' ? 'bg-white/10 text-white/50' : 'bg-amber-400/20 text-amber-200 border border-amber-400/40'}`}>
                {drawBadge}
              </div>
            )}
          </div>
        );
      })}

      {/* Hero — bottom center, ego style */}
      {(() => {
        const pos = seatPosition(0);
        const isActive = myId === state.activePlayerId && (state.phase.startsWith('BET') || state.phase.startsWith('DRAW'));
        return (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: '92%', maxWidth: '400px' }}
            data-player-seat={myId}
          >
            {isActive && (
              <motion.div
                className="absolute -inset-2 rounded-xl pointer-events-none"
                style={{ border: '2px solid rgba(240,184,41,0.6)' }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
            <div className="flex items-center gap-2 mb-1">
              {isHeroDealer && (
                <div className="w-6 h-6 rounded-full bg-amber-400 text-black text-xs font-bold flex items-center justify-center shadow-lg">D</div>
              )}
              <span className="w-8 h-8 rounded-full overflow-hidden border-2 border-amber-400/60 shadow-lg">
                <img src={getAvatarForSeat(myIndex + 1)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} className="w-full h-full object-cover" />
              </span>
              <div className="text-left">
                <div className="text-amber-200 text-sm font-bold">{me?.name ?? 'YOU'}</div>
                <div className="text-white/60 text-[11px] font-mono">{(me?.chips ?? 0).toLocaleString()}</div>
              </div>
              {me && me.bet > 0 && (
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-amber-300 text-xs font-mono ml-2">
                  ${me.bet}
                </motion.div>
              )}
            </div>
            {me && me.cards.length > 0 && me.status !== 'folded' ? (
              <>
                <div style={{ filter: heroFilter }}>
                  <CardHand
                    cards={me.cards}
                    celebrationCardMarkers
                    selectedIndices={selectedCardIndices}
                    onCardClick={onCardClick}
                    isSelectable={isDrawPhase}
                    dealingIndices={animState.dealingIndices}
                    drawingIndices={animState.drawingIndices}
                    discardingIndices={animState.discardingIndices}
                    isShowdown={isShowdown}
                    cardWidth={88}
                    cardHeight={124}
                    testIdPrefix="badugi-card"
                  />
                </div>
                <div className="text-white/60 text-[10px] font-mono mt-1 text-center min-h-[14px]">
                  {isDrawPhase ? `Tap cards to discard${selectedCardIndices.length ? ` · ${selectedCardIndices.length} selected` : ''}`
                    : heroHandEval ? heroHandEval.description : ''}
                </div>
              </>
            ) : me?.status === 'folded' ? (
              <div className="text-white/40 text-sm font-mono py-4">FOLDED</div>
            ) : (
              <div className="text-white/40 text-[10px] font-mono py-4">DEALT IN NEXT HAND</div>
            )}
          </div>
        );
      })()}

      {/* Win celebration — full-screen UNO-style (prototype) */}
      <AnimatePresence>
        {celebration.active && (
          <motion.div
            className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ background: 'radial-gradient(ellipse at center, rgba(240,184,41,0.15) 0%, transparent 70%)' }}
          >
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i / 24) * Math.PI * 2;
              const dist = 120 + Math.random() * 80;
              return (
                <motion.div
                  key={`coin-${i}`}
                  className="absolute rounded-full"
                  style={{
                    width: 10, height: 10,
                    background: 'radial-gradient(circle at 30% 30%, #FDE68A, #F59E0B)',
                    boxShadow: '0 0 8px rgba(245,158,11,0.8)',
                    left: '50%', top: '45%',
                  }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 40, opacity: 0, scale: 0.4 }}
                  transition={{ duration: 1.2 + Math.random() * 0.6, ease: 'easeOut', delay: Math.random() * 0.3 }}
                />
              );
            })}
            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.2, 1.4, 0.4, 1] }}
              className="text-center"
            >
              <div
                className="font-black tracking-wider"
                style={{
                  fontSize: 'clamp(48px, 12vw, 96px)',
                  color: '#FDE68A',
                  textShadow: '0 0 40px rgba(245,158,11,0.8), 0 4px 0 #92400E, 0 8px 24px rgba(0,0,0,0.6)',
                  WebkitTextStroke: '2px #92400E',
                }}
              >
                WINNER
              </div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-2">
                <span className="text-white text-2xl font-bold font-mono">{celebration.winnerName}</span>
                <span className="text-amber-300 text-2xl font-mono ml-3">+${celebration.amount.toLocaleString()}</span>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legacy effects removed — flight system is now built-in (Detroit 2026-10-15) */}
    </div>
  );
}
