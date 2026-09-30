import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BadugiTable } from '@/components/badugi/BadugiTable';
import { getBadugiDrawLimit, toggleBadugiDrawSelection } from '@/components/badugi/badugiDrawSelection';
import type { CardType, GamePhase, GameState } from '@/lib/poker/types';

const cards: CardType[] = [
  { rank: 'A', suit: 'spades' },
  { rank: '2', suit: 'hearts' },
  { rank: '3', suit: 'clubs' },
  { rank: '4', suit: 'diamonds' },
];

const baseState: GameState = {
  tableId: 'badugi-touch-test',
  phase: 'DRAW_3',
  pot: 0,
  currentBet: 0,
  minBet: 25,
  activePlayerId: 'hero',
  players: [{
    id: 'hero',
    name: 'Hero',
    presence: 'human',
    chips: 10_000,
    bet: 0,
    cards,
    status: 'active',
    isDealer: true,
    declaration: null,
  }],
  communityCards: [],
  messages: [],
  chatMessages: [],
  deck: [],
  discardPile: [],
};

export function BadugiDrawBrowserHarness() {
  const [phase, setPhase] = useState<GamePhase>('DRAW_3');
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [lastTappedIndex, setLastTappedIndex] = useState<number | null>(null);
  const drawLimit = getBadugiDrawLimit(phase);
  const isDrawPhase = drawLimit > 0;

  const handleCardClick = (index: number) => {
    if (!isDrawPhase) return;
    setLastTappedIndex(index);
    setSelectedIndices(previous => toggleBadugiDrawSelection(previous, index, drawLimit));
  };

  return (
    <div style={{ height: '100dvh', width: '100vw', background: '#100d05', color: 'white' }}>
      <output data-testid="draw-phase">{phase}</output>
      <output data-testid="selected-cards">{selectedIndices.join(',')}</output>
      <output data-testid="last-tapped">{lastTappedIndex ?? ''}</output>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
          <BadugiTable
            state={{ ...baseState, phase }}
            myId="hero"
            selectedCardIndices={selectedIndices}
            onCardClick={handleCardClick}
            isDrawPhase={isDrawPhase}
            animState={{ dealingIndices: [], drawingIndices: [], discardingIndices: [] }}
          />
        </div>
      </div>
      <div style={{ position: 'fixed', top: 0, left: 0, zIndex: 1000, display: 'flex', gap: 4 }}>
        {(['BET_4', 'DRAW_1', 'DRAW_2', 'DRAW_3'] as const).map(nextPhase => (
          <button
            key={nextPhase}
            type="button"
            data-testid={`phase-${nextPhase}`}
            onClick={() => {
              setPhase(nextPhase);
              setSelectedIndices([]);
            }}
          >
            {nextPhase}
          </button>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<BadugiDrawBrowserHarness />);