import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '@/lib/poker/types';

const CARD_BACK = '/ladyluck/card-back-cgp.png';
const CHIP_COLORS = {
  badugi: ['#C9A227', '#D4B44A', '#E8C96B', '#A07C10'],
  dead7: ['#B91C1C', '#DC2626', '#F87171', '#7F1D1D'],
} as const;
const FLIGHT_MS = 680;

interface PlayerVisualState {
  bet: number;
  chips: number;
  cardCount: number;
  status: string;
  isWinner: boolean;
}

export interface BadugiVisualTracker {
  phase: string;
  players: Record<string, PlayerVisualState>;
}

export interface BadugiVisualIntent {
  kind: 'bet' | 'payout' | 'fold';
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
}

export function snapshotBadugiVisualState(state: GameState): BadugiVisualTracker {
  return {
    phase: state.phase,
    players: Object.fromEntries(state.players.map(player => [
      player.id,
      {
        bet: player.bet,
        chips: player.chips,
        cardCount: player.cards.length,
        status: player.status,
        isWinner: !!player.isWinner,
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

    if (old.status !== 'folded' && player.status === 'folded' && old.cardCount > 0) {
      intents.push({
        kind: 'fold',
        playerId: player.id,
        amount: 0,
        cardCount: Math.min(4, old.cardCount),
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

function ChipStack({ effect, variant }: { effect: MeasuredEffect; variant: 'badugi' | 'dead7' }) {
  return (
    <motion.div
      {...(variant === 'badugi'
        ? { 'data-badugi-chip-flight': effect.kind }
        : { 'data-dead7-chip-flight': effect.kind })}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.72 }}
      animate={{
        x: effect.dx,
        y: effect.dy,
        opacity: [0, 1, 1, 0],
        scale: [0.72, 1.08, 1, 0.88],
      }}
      transition={{
        duration: FLIGHT_MS / 1000,
        ease: [0.22, 1, 0.36, 1],
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
      {CHIP_COLORS[variant].slice(0, 3).map((color, index) => (
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
      <span style={{
        position: 'absolute',
        top: 23,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '2px 5px',
        borderRadius: 8,
        background: 'rgba(3,3,5,0.86)',
        color: variant === 'dead7' ? '#FCA5A5' : '#F3D66F',
        font: '700 10px monospace',
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 7px rgba(0,0,0,0.5)',
      }}>
        {effect.kind === 'payout' ? '+' : ''}{effect.amount.toLocaleString()}
      </span>
    </motion.div>
  );
}

function FoldedCards({ effect, variant }: { effect: MeasuredEffect; variant: 'badugi' | 'dead7' }) {
  return (
    <div
      {...(variant === 'badugi'
        ? { 'data-badugi-fold-flight': effect.playerId }
        : { 'data-dead7-fold-flight': effect.playerId })}
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
          initial={{ x: index * 5 - (effect.cardCount - 1) * 2.5, y: 0, rotate: (index - 1.5) * 5, opacity: 1 }}
          animate={{
            x: effect.dx + (index - 1.5) * 2,
            y: effect.dy,
            rotate: 160 + index * 9,
            opacity: [1, 1, 0],
            scale: [1, 0.78, 0.48],
          }}
          transition={{
            duration: FLIGHT_MS / 1000,
            delay: index * 0.025,
            ease: [0.4, 0, 0.2, 1],
            opacity: { times: [0, 0.72, 1] },
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
  variant = 'badugi',
}: {
  state: GameState;
  tableRoot: HTMLElement | null;
  variant?: 'badugi' | 'dead7';
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
    if (!pot || !muck) return;
    const potPoint = pointWithin(rootRect, pot);
    const muckPoint = pointWithin(rootRect, muck);

    const measured = intents.flatMap((intent): MeasuredEffect[] => {
      const seat = tableRoot.querySelector(`[data-player-seat="${CSS.escape(intent.playerId)}"]`);
      if (!seat) return [];
      const seatPoint = pointWithin(rootRect, seat);
      const from = intent.kind === 'payout' ? potPoint : seatPoint;
      const to = intent.kind === 'bet' ? potPoint : intent.kind === 'payout' ? seatPoint : muckPoint;
      return [{
        ...intent,
        id: ++nextIdRef.current,
        sx: from.x,
        sy: from.y,
        dx: to.x - from.x,
        dy: to.y - from.y,
      }];
    });

    if (measured.length === 0) return;
    setEffects(current => [...current, ...measured]);
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
        ? <FoldedCards key={effect.id} effect={effect} variant={variant} />
        : <ChipStack key={effect.id} effect={effect} variant={variant} />)}
    </>
  );
}