import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BoxChevyTable } from '../components/boxChevy/BoxChevyTable';
import { createInitialState } from '../lib/poker/engine/useGameEngine';
import type { CardType, GameState } from '@shared/gameTypes';
import '../index.css';

const cards = (ranks: CardType['rank'][]): CardType[] =>
  ranks.map(rank => ({ rank, suit: 'hearts', isHidden: false }));
function Fixture() {
  const [state, setState] = useState<GameState>(() => {
    const initial = createInitialState();
    return { ...initial, phase: 'DRAW_2', communityCards: cards(['2', '4', '6', '8', '10']),
      players: initial.players.map((p, i) => ({ ...p,
        cards: i === 0 ? cards(['A', '3', '5', '7', '10']) : [],
        presence: i === 0 ? 'human' : 'open', status: i === 0 ? 'active' : 'sitting_out',
      })) };
  });
  return <main style={{ color: 'white', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
    <nav style={{ display: 'flex', gap: 10, padding: 12 }}>
      <button onClick={() => setState(s => ({ ...s, players: s.players.map(p => p.id === 'p1' ? { ...p, cards: cards(['A', '3', '5', '7', '9']) } : p) }))}>Repair hand</button>
      <button onClick={() => setState(s => ({ ...s, phase: 'DECLARE' }))}>Enter declaration</button>
    </nav>
    <BoxChevyTable state={state} myId="p1" phase={state.phase} isDrawPhase={state.phase.startsWith('DRAW')} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
