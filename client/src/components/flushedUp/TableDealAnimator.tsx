import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Player } from '@/lib/poker/types';
import { PlayingCard } from '@/components/game/Card';
import { getDealStagger, useTableDealAnimations, type TableDealEvent } from './useCardAnimations';

interface TableDealAnimatorProps {
  players: Player[];
  phase: string;
  myId: string;
  tableRoot: HTMLElement | null;
}

const CARD_W = 38;
const CARD_H = 54;
const TRAVEL_MS = 340;

interface MeasuredFlight extends TableDealEvent {
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  curve: number;
}

/**
 * A table-scoped compositor. It deliberately knows only about anchor geometry;
 * the game remains authoritative and CardHand remains responsible for draw UI.
 */
export function TableDealAnimator({ players, phase, myId, tableRoot }: TableDealAnimatorProps) {
  const reduced = useReducedMotion();
  const deal = useTableDealAnimations(players, phase, myId);
  const [flights, setFlights] = useState<MeasuredFlight[]>([]);
  const cleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenSeatsRef = useRef<Map<HTMLElement, string>>(new Map());

  const restoreSeats = useCallback(() => {
    hiddenSeatsRef.current.forEach((visibility, element) => {
      element.style.visibility = visibility;
    });
    hiddenSeatsRef.current.clear();
  }, []);

  useEffect(() => {
    if (cleanupRef.current) clearTimeout(cleanupRef.current);
    restoreSeats();
    if (reduced || !tableRoot || !deal.events.length) {
      setFlights([]);
      return;
    }
    const deck = tableRoot.querySelector<HTMLElement>('[data-deal-anchor="deck"]');
    if (!deck) { setFlights([]); return; }
    const seatIds = [...new Set(deal.events.map(e => e.playerId))];
    const seats = new Map<string, HTMLElement>();
    for (const id of seatIds) {
      const seat = tableRoot.querySelector<HTMLElement>(`[data-deal-seat="${CSS.escape(id)}"]`);
      if (!seat) { setFlights([]); return; }
      seats.set(id, seat);
    }

    const rootRect = tableRoot.getBoundingClientRect();
    const deckRect = deck.getBoundingClientRect();
    const sx = deckRect.left + deckRect.width / 2 - rootRect.left;
    const sy = deckRect.top + deckRect.height / 2 - rootRect.top;
    const measured = deal.events.map(event => {
      const seatRect = seats.get(event.playerId)!.getBoundingClientRect();
      const ex = seatRect.left + seatRect.width / 2 - rootRect.left;
      const ey = seatRect.top + seatRect.height / 2 - rootRect.top;
      const dx = ex - sx;
      const dy = ey - sy;
      return {
        ...event,
        sx,
        sy,
        dx,
        dy,
        curve: Math.max(26, Math.min(110, Math.abs(dx) * 0.22 + Math.abs(dy) * 0.08)),
      };
    });

    seats.forEach(seat => {
      hiddenSeatsRef.current.set(seat, seat.style.visibility);
      seat.style.visibility = 'hidden';
    });
    setFlights(measured);
    const stagger = getDealStagger(measured.length);
    const sequenceMs = TRAVEL_MS + Math.max(0, measured.length - 1) * stagger;
    cleanupRef.current = setTimeout(() => {
      setFlights([]);
      restoreSeats();
    }, sequenceMs);
    return () => {
      if (cleanupRef.current) clearTimeout(cleanupRef.current);
      restoreSeats();
    };
  }, [deal.generation, deal.events, reduced, tableRoot, restoreSeats]);

  useEffect(() => () => {
    if (cleanupRef.current) clearTimeout(cleanupRef.current);
    restoreSeats();
  }, [restoreSeats]);

  if (reduced || !tableRoot || !flights.length) return null;
  const stagger = getDealStagger(flights.length);

  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 400, pointerEvents: 'none' }}>
      {flights.map((event, index) => {
        const delay = index * stagger;
        return (
          <motion.div
            key={`${deal.generation}-${event.playerId}-${event.slot}`}
            data-deal-flight=""
            initial={{ x: 0, y: 0, rotate: 0, opacity: 0.15, scale: 0.78 }}
            animate={{ x: [0, event.dx * 0.5, event.dx], y: [0, event.dy * 0.5 - event.curve, event.dy], rotate: [0, event.dx * 0.08, 0], opacity: [0.15, 1, 1], scale: [0.78, 1.04, 0.94] }}
            transition={{ duration: TRAVEL_MS / 1000, delay: delay / 1000, ease: ['easeOut', 'easeInOut'] }}
            style={{ position: 'absolute', left: event.sx - CARD_W / 2, top: event.sy - CARD_H / 2, width: CARD_W, height: CARD_H, willChange: 'transform, opacity' }}
          >
            <PlayingCard card={event.playerId === myId ? event.card : undefined} className="!w-full !h-full !rounded-[5px]" />
          </motion.div>
        );
      })}
    </div>
  );
}