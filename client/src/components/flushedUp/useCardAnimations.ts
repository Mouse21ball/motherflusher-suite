import { useRef, useState, useCallback, useEffect } from 'react';
import type { CardType } from '@/lib/poker/types';

function cardsEqual(a: CardType, b: CardType): boolean {
  if (a.isHidden && b.isHidden) return true;
  if (a.isHidden !== b.isHidden) return false;
  return a.rank === b.rank && a.suit === b.suit;
}

export interface CardAnimState {
  dealingIndices: number[];
  drawingIndices: number[];
  discardingIndices: number[];
}

export function useCardAnimations(heroCards: CardType[], phase: string) {
  const prevCardsRef = useRef<CardType[]>([]);
  const prevPhaseRef = useRef<string>(phase);

  const [dealingIndices, setDealingIndices] = useState<number[]>([]);
  const [drawingIndices, setDrawingIndices] = useState<number[]>([]);
  const [discardingIndices, setDiscardingIndices] = useState<number[]>([]);

  useEffect(() => {
    const prev = prevCardsRef.current;
    const prevPhase = prevPhaseRef.current;

    const prevLen = prev.length;
    const currLen = heroCards.length;

    if (phase === 'WAITING' && prevPhase !== 'WAITING') {
      prevCardsRef.current = [];
      prevPhaseRef.current = phase;
      setDealingIndices([]);
      setDrawingIndices([]);
      setDiscardingIndices([]);
      return;
    }

    if (prevLen === 0 && currLen > 0) {
      const indices = Array.from({ length: currLen }, (_, i) => i);
      setDealingIndices(indices);
      const clearAt = currLen * 120 + 500;
      const t = setTimeout(() => setDealingIndices([]), clearAt);
      prevCardsRef.current = heroCards;
      prevPhaseRef.current = phase;
      return () => clearTimeout(t);
    }

    if (prevLen > 0 && currLen > 0 && prevLen === currLen) {
      const changed: number[] = [];
      for (let i = 0; i < currLen; i++) {
        if (!prev[i] || !cardsEqual(prev[i], heroCards[i])) {
          changed.push(i);
        }
      }
      if (changed.length > 0 && changed.length < currLen) {
        setDrawingIndices(changed);
        const clearAt = changed.length * 150 + 500;
        const t = setTimeout(() => setDrawingIndices([]), clearAt);
        prevCardsRef.current = heroCards;
        prevPhaseRef.current = phase;
        return () => clearTimeout(t);
      }
    }

    prevCardsRef.current = heroCards;
    prevPhaseRef.current = phase;
  }, [heroCards, phase]);

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
