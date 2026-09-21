import { useRef, useState, useCallback, useEffect } from 'react';
import type { CardType, Player } from '@/lib/poker/types';

function cardsEqual(a: CardType, b: CardType): boolean {
  if (a.isHidden && b.isHidden) return true;
  // Card was hidden then revealed — same card, just flipped face-up. Don't
  // treat as a new card arriving from the deck (would wrongly trigger draw anim).
  if (a.isHidden && !b.isHidden) return true;
  // Shouldn't happen for hero cards, but treat visible→hidden as a change.
  if (!a.isHidden && b.isHidden) return false;
  return a.rank === b.rank && a.suit === b.suit;
}

export interface CardAnimState {
  dealingIndices: number[];
  drawingIndices: number[];
  discardingIndices: number[];
}

export interface TableDealEvent {
  playerId: string;
  slot: number;
  faceDown: boolean;
  /** Only populated for the hero; opponents intentionally carry no card data. */
  card?: CardType;
}

export interface TableDealSnapshot {
  events: TableDealEvent[];
  generation: number;
}

export interface TableDealTracker {
  ids: string[];
  counts: { id: string; count: number }[];
  phase: string;
}

const DEAL_PHASES = new Set(['WAITING', 'ANTE', 'DEAL', '']);

/** Pure, privacy-safe deal diff. Keep this free of React so it can be tested. */
export function deriveTableDealEvents(
  previous: ReadonlyArray<{ id: string; count: number }>,
  next: Player[],
  phase: string,
  previousPhase: string,
  myId: string,
): TableDealEvent[] {
  // The server can move directly from ANTE/DEAL to the first betting phase in
  // the same authoritative snapshot that adds cards.
  if (!DEAL_PHASES.has(previousPhase)) return [];
  const old = new Map(previous.map(p => [p.id, p.count]));
  const active = next.filter(p => p.presence !== 'open' && p.presence !== 'reserved');
  const fresh = active.filter(p => (old.get(p.id) ?? 0) === 0 && p.cards.length > 0);
  if (!fresh.length) return [];
  const max = Math.max(...fresh.map(p => p.cards.length));
  const events: TableDealEvent[] = [];
  // Slot first, then stable authoritative seat order: classic round-robin.
  for (let slot = 0; slot < max; slot++) {
    for (const player of active) {
      if (!fresh.includes(player) || slot >= player.cards.length) continue;
      const hero = player.id === myId;
      events.push(hero
        ? { playerId: player.id, slot, faceDown: !!player.cards[slot].isHidden, card: player.cards[slot] }
        : { playerId: player.id, slot, faceDown: true });
    }
  }
  return events;
}

export const deriveDealEvents = deriveTableDealEvents;
export function getDealStagger(total: number): number {
  if (total <= 1) return 0;
  return Math.min(82, Math.max(28, 1100 / total));
}

/** Pure snapshot advance used by the hook and interruption/reconnect tests. */
export function advanceTableDealTracker(
  previous: TableDealTracker | null,
  players: Player[],
  phase: string,
  myId: string,
): { tracker: TableDealTracker; events: TableDealEvent[]; reset: boolean } {
  const active = players.filter(p => p.presence !== 'open' && p.presence !== 'reserved');
  const tracker: TableDealTracker = {
    ids: active.map(p => p.id),
    counts: players.map(p => ({ id: p.id, count: p.cards.length })),
    phase,
  };
  if (!previous) return { tracker, events: [], reset: false };

  const playerRemoved = previous.ids.some(id => !tracker.ids.includes(id));
  const returnedToWaiting = phase === 'WAITING' && previous.phase !== 'WAITING';
  const restartedAnte = phase === 'ANTE' && !DEAL_PHASES.has(previous.phase);
  if (playerRemoved || returnedToWaiting || restartedAnte) {
    return { tracker, events: [], reset: true };
  }

  return {
    tracker,
    events: deriveTableDealEvents(previous.counts, players, phase, previous.phase, myId),
    reset: false,
  };
}

export function useTableDealAnimations(players: Player[], phase: string, myId: string): TableDealSnapshot {
  const previousRef = useRef<TableDealTracker | null>(null);
  const tokenRef = useRef(0);
  const activeSequenceRef = useRef(false);
  const [snapshot, setSnapshot] = useState<TableDealSnapshot>({ events: [], generation: 0 });
  useEffect(() => {
    const previous = previousRef.current;
    const next = advanceTableDealTracker(previous, players, phase, myId);
    previousRef.current = next.tracker;

    if (next.reset) {
      activeSequenceRef.current = false;
      tokenRef.current++;
      setSnapshot({ events: [], generation: tokenRef.current });
      return;
    }

    if (next.events.length) {
      const generation = ++tokenRef.current;
      activeSequenceRef.current = true;
      setSnapshot({ events: next.events, generation });
    } else if (activeSequenceRef.current && previous?.phase !== phase) {
      // Same-phase snapshots are common while bots advance and must not erase
      // a flight before it can be seen. A real phase transition still
      // interrupts the visual-only sequence.
      activeSequenceRef.current = false;
      const generation = ++tokenRef.current;
      setSnapshot({ events: [], generation });
    }
  }, [players, phase, myId]);
  return snapshot;
}

export function useCardAnimations(heroCards: CardType[], phase: string) {
  const prevCardsRef = useRef<CardType[]>([]);
  const prevPhaseRef = useRef<string>(phase);
  const dealingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dealingIndices, setDealingIndices] = useState<number[]>([]);
  const [drawingIndices, setDrawingIndices] = useState<number[]>([]);
  const [discardingIndices, setDiscardingIndices] = useState<number[]>([]);

  useEffect(() => {
    const prev = prevCardsRef.current;
    const prevPhase = prevPhaseRef.current;

    const prevLen = prev.length;
    const currLen = heroCards.length;

    if (phase === 'WAITING' && prevPhase !== 'WAITING') {
      if (dealingTimerRef.current) clearTimeout(dealingTimerRef.current);
      if (drawingTimerRef.current) clearTimeout(drawingTimerRef.current);
      dealingTimerRef.current = null;
      drawingTimerRef.current = null;
      prevCardsRef.current = [];
      prevPhaseRef.current = phase;
      setDealingIndices([]);
      setDrawingIndices([]);
      setDiscardingIndices([]);
      return;
    }

    if (prevLen === 0 && currLen > 0) {
      // Only animate as a fresh deal when coming from a pre-game phase.
      // Mid-game the server may briefly send cards:[] before re-populating
      // (e.g. between DRAW and BET phases). In that case suppress the animation
      // so kept cards don't fly back in as if freshly dealt.
      const fromPreGame =
        prevPhase === 'WAITING' || prevPhase === 'ANTE' ||
        prevPhase === 'DEAL'    || prevPhase === '';
      if (fromPreGame) {
        if (dealingTimerRef.current) clearTimeout(dealingTimerRef.current);
        const indices = Array.from({ length: currLen }, (_, i) => i);
        setDealingIndices(indices);
        const clearAt = currLen * 120 + 500;
        dealingTimerRef.current = setTimeout(() => {
          dealingTimerRef.current = null;
          setDealingIndices([]);
        }, clearAt);
        prevCardsRef.current = heroCards;
        prevPhaseRef.current = phase;
        return;
      }
      // Mid-game blank → refill: just record the new cards, no animation
      prevCardsRef.current = heroCards;
      prevPhaseRef.current = phase;
      return;
    }

    if (prevLen > 0 && currLen > 0 && prevLen === currLen) {
      const changed: number[] = [];
      for (let i = 0; i < currLen; i++) {
        if (!prev[i] || !cardsEqual(prev[i], heroCards[i])) {
          changed.push(i);
        }
      }
      if (changed.length > 0 && changed.length < currLen) {
        if (drawingTimerRef.current) clearTimeout(drawingTimerRef.current);
        setDrawingIndices(changed);
        const clearAt = changed.length * 150 + 500;
        drawingTimerRef.current = setTimeout(() => {
          drawingTimerRef.current = null;
          setDrawingIndices([]);
        }, clearAt);
        prevCardsRef.current = heroCards;
        prevPhaseRef.current = phase;
        return;
      }
    }

    prevCardsRef.current = heroCards;
    prevPhaseRef.current = phase;
  }, [heroCards, phase]);

  useEffect(() => () => {
    if (dealingTimerRef.current) clearTimeout(dealingTimerRef.current);
    if (drawingTimerRef.current) clearTimeout(drawingTimerRef.current);
  }, []);

  const triggerDiscard = useCallback((indices: number[]) => {
    setDiscardingIndices(indices);
    const t = setTimeout(() => setDiscardingIndices([]), 400);
    return () => clearTimeout(t);
  }, []);

  return {
    dealingIndices,
    drawingIndices,
    discardingIndices,
    triggerDiscard,
  };
}
