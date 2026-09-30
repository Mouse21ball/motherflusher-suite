import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GameState, Player } from '@shared/gameTypes';
import { KamikazeTable } from '@/components/kamikaze/KamikazeTable';

const heroId = 'hero';
const hero: Player = {
  id: heroId,
  name: 'Hero',
  presence: 'human',
  chips: 10_000,
  bet: 0,
  cards: [
    { rank: 'A', suit: 'spades' },
    { rank: 'K', suit: 'hearts' },
    { rank: 'Q', suit: 'clubs' },
    { rank: 'J', suit: 'diamonds' },
    { rank: '10', suit: 'spades' },
    { rank: '9', suit: 'hearts' },
  ],
  status: 'active',
  isDealer: false,
  declaration: null,
};

const initialState: GameState = {
  tableId: 'kamikaze-touch-test',
  phase: 'DRAW_3',
  pot: 100,
  currentBet: 0,
  minBet: 25,
  activePlayerId: heroId,
  players: [hero],
  communityCards: [],
  messages: [],
  chatMessages: [],
  deck: [],
  discardPile: [],
};

function KamikazeTouchBrowserHarness() {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  const toggleCard = (index: number) => {
    setSelectedIndices(current => current.includes(index)
      ? current.filter(selected => selected !== index)
      : [...current, index]
    );
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100dvh', overflow: 'hidden', background: '#090909' }}>
      <button
        type="button"
        data-testid="clear-selection"
        onClick={() => setSelectedIndices([])}
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 100, opacity: 0.01 }}
      >
        Clear selection
      </button>
      <div data-testid="selection-state" style={{ color: '#fff' }}>{selectedIndices.join(',')}</div>
      <KamikazeTable
        state={initialState}
        myId={heroId}
        selectedCardIndices={selectedIndices}
        onCardClick={toggleCard}
        isDrawPhase
        animState={{ dealingIndices: [], drawingIndices: [], discardingIndices: [] }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<KamikazeTouchBrowserHarness />);