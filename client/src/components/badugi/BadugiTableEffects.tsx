import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '@/lib/poker/types';
import { sfx } from '@/lib/sounds';

const CARD_BACK = '/ladyluck/card-back-cgp.png';
const CHIP_COLORS = ['#C9A227', '#D4B44A', '#E8C96B', '#A07C10'] as const;
const FLIGHT_MS = 680;

interface PlayerVisualState {
  bet: number;
  chips: number;
  cardCount: number;
  status: string;
  isWinner: boolean;
  lastDrawCount?: number;
}

export interface BadugiVisualTracker {
  phase: string;
  handId?: number;
  players: Record<string, PlayerVisualState>;
}

export interface BadugiVisualIntent {
  kind: 'bet' | 'payout' | 'fold' | 'deal' | 'draw';
  playerId: string;
  amount: number;
  cardCount: number;
}

interface MeasuredEffect extends BadugiVisualIntent {
  id: number;
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  muckDx?: number;
  muckDy?: number;
}

export function snapshotBadugiVisualState(state: GameState): BadugiVisualTracker {
  return {
    phase: state.phase,
    handId: state.handId,
    players: Object.fromEntries(state.players.map(player => [
      player.id,
      {
        bet: player.bet,
        chips: player.chips,
        cardCount: player.cards.length,
        status: player.status,
        isWinner: !!player.isWinner,
        lastDrawCount: (player as any).lastDrawCount,
      },
    ])),
  };
}

export function deriveBadugiVisualIntents(
  previous: BadugiVisualTracker | null,
  state: GameState,
): BadugiVisualIntent[] {
  if (!previous) return [];

  const intents: BadugiVisualIntent[] = [];
  for (const player of state.players) {
    const old = previous.players[player.id];
    if (!old) continue;
    const cardCount = player.cards.length;

    if (old.status !== 'folded' && player.status === 'folded' && old.cardCount > 0) {
      intents.push({
        kind: 'fold',
        playerId: player.id,
        amount: 0,
        cardCount: Math.min(4, old.cardCount),
      });
    }

    // Deal: new hand detected via handId change — cards fly from dealer (Detroit 2026-10-15)
    // The server sends new hands with cards already dealt, so we can't rely on 0→4 cardCount
    const isNewHand = previous.handId !== undefined && state.handId !== undefined && previous.handId !== state.handId;
    if (isNewHand && cardCount > 0 && player.status !== 'folded' && player.status !== 'sitting_out') {
      intents.push({
        kind: 'deal',
        playerId: player.id,
        amount: 0,
        cardCount,
      });
    }
    // Fallback: cards dealt to a player who had none (for initial load or edge cases)
    else if (old.cardCount === 0 && cardCount > 0 && player.status !== 'folded' && player.status !== 'sitting_out') {
      intents.push({
        kind: 'deal',
        playerId: player.id,
        amount: 0,
        cardCount,
      });
    }

    // Draw: player drew N cards — discards fly to muck, replacements fly from dealer (Detroit 2026-10-13)
    const newDrawCount = (player as any).lastDrawCount;
    if (newDrawCount !== undefined && newDrawCount > 0 && old.lastDrawCount !== newDrawCount) {
      intents.push({
        kind: 'draw',
        playerId: player.id,
        amount: 0,
        cardCount: newDrawCount,
      });
    }

    const betIncrease = player.bet - old.bet;
    if (previous.phase.startsWith('BET_') && betIncrease > 0) {
      intents.push({
        kind: 'bet',
        playerId: player.id,
        amount: betIncrease,
        cardCount: 0,
      });
    }

    const chipAward = player.chips - old.chips;
    if (
      state.phase === 'SHOWDOWN'
      && player.isWinner
      && chipAward > 0
      && (!old.isWinner || previous.phase !== 'SHOWDOWN')
    ) {
      intents.push({
        kind: 'payout',
        playerId: player.id,
        amount: chipAward,
        cardCount: 0,
      });
    }
  }
  return intents;
}

function pointWithin(root: DOMRect, element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - root.left,
    y: rect.top + rect.height / 2 - root.top,
  };
}

function ChipStack({ effect }: { effect: MeasuredEffect }) {
  // Payouts fly multiple chips scaled to pot size, capped (Detroit 2026-10-13)
  const chipCount = effect.kind === 'payout'
    ? effect.amount < 500 ? 3 : effect.amount < 2000 ? 5 : effect.amount < 10000 ? 7 : 8
    : 1;

  return (
    <>
      {Array.from({ length: chipCount }).map((_, ci) => (
        <motion.div
          key={`chip-${ci}`}
          data-badugi-chip-flight={effect.kind}
          initial={{ x: (ci - chipCount / 2) * 6, y: (ci % 3) * 4, opacity: 0, scale: 0.72 }}
          animate={{
            x: effect.dx + (ci - chipCount / 2) * 8,
            y: effect.dy + (ci % 3) * 6,
            opacity: [0, 1, 1, 0],
            scale: [0.72, 1.08, 1, 0.88],
          }}
          transition={{
            duration: FLIGHT_MS / 1000,
            ease: [0.22, 1, 0.36, 1],
            delay: ci * 0.05,
            opacity: { times: [0, 0.08, 0.82, 1] },
            scale: { times: [0, 0.24, 0.78, 1] },
          }}
          style={{
            position: 'absolute',
            zIndex: 70,
            left: effect.sx - 13,
            top: effect.sy - 13,
            width: 28,
            height: 28,
            pointerEvents: 'none',
            willChange: 'transform, opacity',
          }}
        >
          {CHIP_COLORS.slice(0, 3).map((color, index) => (
            <span
              key={color}
              style={{
                position: 'absolute',
                left: index * 4,
                top: index * -3,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: color,
                border: '2px dashed rgba(255,255,255,0.72)',
                boxShadow: '0 2px 5px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(65,38,0,0.36)',
              }}
            />
          ))}
          {ci === 0 && (
            <span style={{
              position: 'absolute',
              top: 23,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '2px 5px',
              borderRadius: 8,
              background: 'rgba(3,3,5,0.86)',
              color: '#F3D66F',
              font: '700 10px monospace',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 7px rgba(0,0,0,0.5)',
            }}>
              {effect.kind === 'payout' ? '+' : ''}{effect.amount.toLocaleString()}
            </span>
          )}
        </motion.div>
      ))}
    </>
  );
}

// ─── Draw exchange: discards to muck, replacements from dealer ───────────────

function DrawExchange({ effect, muckDx, muckDy }: { effect: MeasuredEffect; muckDx: number; muckDy: number }) {
  // For draw: effect.sx/sy = dealer, dx/dy = dealer→seat. Seat = (sx - dx, sy - dy).
  const seatX = effect.sx - effect.dx;
  const seatY = effect.sy - effect.dy;
  return (
    <>
      {/* Discards fly face-down from seat to muck */}
      <div
        data-badugi-draw-discard={effect.playerId}
        style={{
          position: 'absolute',
          zIndex: 69,
          left: seatX - 20,
          top: seatY - 28,
          width: 40,
          height: 56,
          pointerEvents: 'none',
        }}
      >
        {Array.from({ length: effect.cardCount }).map((_, index) => (
          <motion.img
            key={`discard-${index}`}
            src={CARD_BACK}
            alt=""
            initial={{ x: index * 4, y: 0, rotate: (index - 1) * 6, opacity: 1, scale: 1 }}
            animate={{
              x: muckDx + index * 2,
              y: [0, -10, muckDy],
              rotate: 140 + index * 8,
              opacity: [1, 1, 0],
              scale: [1, 1.15, 0.5],
            }}
            transition={{
              duration: 0.55,
              delay: index * 0.04,
              ease: [0.4, 0, 0.2, 1],
              opacity: { times: [0, 0.7, 1] },
              y: { times: [0, 0.2, 1] },
            }}
            style={{
              position: 'absolute',
              width: 26,
              borderRadius: 3,
              boxShadow: '0 2px 6px rgba(0,0,0,0.55)',
              willChange: 'transform, opacity',
            }}
          />
        ))}
      </div>
      {/* Replacements fly from dealer to seat (delayed) */}
      <div
        data-badugi-draw-deal={effect.playerId}
        style={{
          position: 'absolute',
          zIndex: 69,
          left: effect.sx - 20,
          top: effect.sy - 28,
          width: 40,
          height: 56,
          pointerEvents: 'none',
        }}
      >
        {Array.from({ length: effect.cardCount }).map((_, index) => (
          <motion.img
            key={`replace-${index}`}
            src={CARD_BACK}
            alt=""
            initial={{ x: effect.dx, y: effect.dy, rotate: 0, opacity: 0, scale: 0.9 }}
            animate={{
              x: 0,
              y: [-8, 0],
              rotate: (index - 1) * 6,
              opacity: [0, 1, 1],
              scale: [0.9, 1.1, 1],
            }}
            transition={{
              duration: 0.42,
              delay: 0.35 + index * 0.09,
              ease: [0.4, 0, 0.2, 1],
            }}
            style={{
              position: 'absolute',
              width: 28,
              borderRadius: 3,
              boxShadow: '0 2px 6px rgba(0,0,0,0.55)',
              willChange: 'transform, opacity',
            }}
          />
        ))}
      </div>
    </>
  );
}

// ─── Dealt cards flight (dealer → seat, prototype style) ─────────────────────

function DealCards({ effect }: { effect: MeasuredEffect }) {
  return (
    <div
      data-badugi-deal-flight={effect.playerId}
      style={{
        position: 'absolute',
        zIndex: 69,
        left: effect.sx - 20,
        top: effect.sy - 28,
        width: 40,
        height: 56,
        pointerEvents: 'none',
      }}
    >
      {Array.from({ length: effect.cardCount }).map((_, index) => (
        <motion.img
          key={index}
          src={CARD_BACK}
          alt=""
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 0.9 }}
          animate={{
            x: effect.dx,
            // Two-beat: lift up first, then fly to seat (Detroit 2026-10-13)
            y: [-8, effect.dy],
            rotate: (index - 1.5) * 8,
            opacity: [1, 1, 1],
            scale: [0.9, 1.1, 1],
          }}
          transition={{
            duration: 0.42,
            delay: index * 0.09,
            ease: [0.4, 0, 0.2, 1],
            y: { times: [0, 1] },
            scale: { times: [0, 0.25, 1] },
          }}
          style={{
            position: 'absolute',
            width: 28,
            borderRadius: 3,
            boxShadow: '0 2px 6px rgba(0,0,0,0.55)',
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  );
}

// ─── Folded cards flight ──────────────────────────────────────────────────────

function FoldedCards({ effect }: { effect: MeasuredEffect }) {
  return (
    <div
      data-badugi-fold-flight={effect.playerId}
      style={{
        position: 'absolute',
        zIndex: 69,
        left: effect.sx - 20,
        top: effect.sy - 28,
        width: 40,
        height: 56,
        pointerEvents: 'none',
      }}
    >
      {Array.from({ length: effect.cardCount }).map((_, index) => (
        <motion.img
          key={index}
          src={CARD_BACK}
          alt=""
          initial={{ x: index * 5 - (effect.cardCount - 1) * 2.5, y: 0, rotate: (index - 1.5) * 5, opacity: 1, scale: 1 }}
          animate={{
            x: effect.dx + (index - 1.5) * 2,
            // Two-beat: lift up first (UNO feel), then fly to muck (Detroit 2026-10-13)
            y: [0, -14, effect.dy],
            rotate: 160 + index * 9,
            opacity: [1, 1, 0],
            scale: [1, 1.28, 0.48],
          }}
          transition={{
            duration: (FLIGHT_MS + 120) / 1000,
            delay: index * 0.025,
            ease: [0.4, 0, 0.2, 1],
            opacity: { times: [0, 0.72, 1] },
            y: { times: [0, 0.18, 1] },
            scale: { times: [0, 0.18, 1] },
          }}
          style={{
            position: 'absolute',
            width: 28,
            borderRadius: 3,
            boxShadow: '0 2px 6px rgba(0,0,0,0.55)',
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  );
}

export function BadugiTableEffects({
  state,
  tableRoot,
  myId,
}: {
  state: GameState;
  tableRoot: HTMLElement | null;
  myId?: string;
}) {
  const reducedMotion = useReducedMotion();
  const previousRef = useRef<BadugiVisualTracker | null>(null);
  const nextIdRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [effects, setEffects] = useState<MeasuredEffect[]>([]);

  useEffect(() => {
    const previous = previousRef.current;
    const intents = deriveBadugiVisualIntents(previous, state);
    previousRef.current = snapshotBadugiVisualState(state);

    if (reducedMotion || !tableRoot || intents.length === 0) return;

    const rootRect = tableRoot.getBoundingClientRect();
    const pot = tableRoot.querySelector('[data-pot-anchor]');
    const muck = tableRoot.querySelector('[data-muck-anchor]');
    const dealer = tableRoot.querySelector('[data-dealer-anchor]');
    if (!pot || !muck) return;
    const potPoint = pointWithin(rootRect, pot);
    const muckPoint = pointWithin(rootRect, muck);
    const dealerPoint = dealer ? pointWithin(rootRect, dealer) : potPoint;

    const measured = intents.flatMap((intent): MeasuredEffect[] => {
      const seat = tableRoot.querySelector(`[data-player-seat="${CSS.escape(intent.playerId)}"]`);
      if (!seat) return [];
      const seatPoint = pointWithin(rootRect, seat);
      // deal: dealer → seat; payout: pot → seat; bet: seat → pot; fold: seat → muck
      // draw: seat → muck (discards) + dealer → seat (replacements)
      const from = intent.kind === 'payout' ? potPoint : intent.kind === 'deal' ? dealerPoint : seatPoint;
      const to = intent.kind === 'bet' ? potPoint : intent.kind === 'payout' ? seatPoint : intent.kind === 'deal' ? seatPoint : muckPoint;
      const effect: MeasuredEffect = {
        ...intent,
        id: ++nextIdRef.current,
        sx: from.x,
        sy: from.y,
        dx: to.x - from.x,
        dy: to.y - from.y,
      };
      if (intent.kind === 'draw') {
        // For draw: sx/sy = dealer (replacements start), dx/dy = dealer→seat
        // muckDx/muckDy = seat→muck (discards)
        effect.sx = dealerPoint.x;
        effect.sy = dealerPoint.y;
        effect.dx = seatPoint.x - dealerPoint.x;
        effect.dy = seatPoint.y - dealerPoint.y;
        effect.muckDx = muckPoint.x - seatPoint.x;
        effect.muckDy = muckPoint.y - seatPoint.y;
      }
      return [effect];
    });

    if (measured.length === 0) return;
    setEffects(current => [...current, ...measured]);
    // Prototype sounds (Detroit 2026-10-15) — match the UNO prototype audio
    for (const effect of measured) {
      if (effect.kind === 'bet') sfx.betPlace();
      else if (effect.kind === 'deal') {
        // Higher pitch for hero's cards, like the prototype
        if (myId && effect.playerId === myId) sfx.dealSelf();
        else sfx.dealSingle();
      }
      else if (effect.kind === 'payout') sfx.chipRake();
      else if (effect.kind === 'draw') sfx.dealSingle();
    }
    const ids = new Set(measured.map(effect => effect.id));
    const timer = setTimeout(() => {
      setEffects(current => current.filter(effect => !ids.has(effect.id)));
    }, FLIGHT_MS + 140);
    timersRef.current.push(timer);
  }, [state, tableRoot, reducedMotion]);

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  if (reducedMotion || effects.length === 0) return null;
  return (
    <>
      {effects.map(effect => effect.kind === 'fold'
        ? <FoldedCards key={effect.id} effect={effect} />
        : effect.kind === 'deal'
        ? <DealCards key={effect.id} effect={effect} />
        : effect.kind === 'draw'
        ? <DrawExchange key={effect.id} effect={effect} muckDx={effect.muckDx ?? 0} muckDy={effect.muckDy ?? 0} />
        : <ChipStack key={effect.id} effect={effect} />)}
    </>
  );
}