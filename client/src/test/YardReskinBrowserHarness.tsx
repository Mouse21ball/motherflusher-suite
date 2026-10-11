import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BadugiTable } from '@/components/badugi/BadugiTable';
import { FlushedUpTable } from '@/components/flushedUp/FlushedUpTable';
import { BoxChevyTable } from '@/components/boxChevy/BoxChevyTable';
import { BadugiActionBar } from '@/components/badugi/BadugiActionBar';
import { CardHand } from '@/components/flushedUp/CardHand';
import { YardHeroIdentity } from '@/components/game/YardHeroIdentity';
import type { CardType, GamePhase, GameState } from '@/lib/poker/types';
import '@/index.css';
import '@/yard-reskin.css';

type FixtureMode = 'badugi' | 'flushed_up' | 'box_chevy';
const BADUGI_CARDS: CardType[] = [
  { rank: 'A', suit: 'spades' },
  { rank: '2', suit: 'hearts' },
  { rank: '3', suit: 'clubs' },
  { rank: '4', suit: 'diamonds' },
];
const FLUSH_CARDS: CardType[] = [
  { rank: 'A', suit: 'spades' },
  { rank: '4', suit: 'spades' },
  { rank: '6', suit: 'spades' },
  { rank: '8', suit: 'spades' },
  { rank: '10', suit: 'hearts' },
];
const COMMUNITY: CardType[] = [
  { rank: 'K', suit: 'spades' },
  { rank: 'Q', suit: 'spades' },
  { rank: 'J', suit: 'spades' },
  { rank: '9', suit: 'spades' },
  { rank: '2', suit: 'spades' },
];
const IDLE_ANIMATION = { dealingIndices: [], drawingIndices: [], discardingIndices: [] };
const TURN_DEADLINE = Date.now() + 15000;

function frame(mode: FixtureMode, phase: GamePhase, myTurn: boolean): GameState {
  const cards = mode === 'badugi' ? BADUGI_CARDS : FLUSH_CARDS;
  return {
    tableId: 'yard-visual-fixture', phase, pot: 12000,
    currentBet: 500, minBet: 250, activePlayerId: myTurn ? 'hero' : 'opponent-1',
    turnDeadline: TURN_DEADLINE,
    players: [
      { id: 'hero', name: 'Hero', presence: 'human', chips: 41000, bet: 500, cards, status: 'active', isDealer: false, declaration: null },
      ...['Yard King', 'Queen Mix', 'Steel Face'].map((name, i) => ({
        id: `opponent-${i + 1}`, name, presence: 'bot' as const,
        chips: 48000 + i * 7000, bet: 500,
        cards: cards.map(card => ({ ...card, isHidden: phase !== 'SHOWDOWN' })),
        status: 'active' as const, isDealer: i === 0, declaration: null,
      })),
    ],
    communityCards: mode === 'box_chevy' ? COMMUNITY : [],
    messages: [], chatMessages: [], deck: [], discardPile: [],
  };
}

function YardReskinBrowserHarness() {
  const [mode, setMode] = useState<FixtureMode>('badugi');
  const [phase, setPhase] = useState<GamePhase>('DRAW_1');
  const [myTurn, setMyTurn] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [lastAction, setLastAction] = useState('');
  const state = frame(mode, phase, myTurn);
  const isDrawPhase = phase.startsWith('DRAW');
  const clickCard = (index: number) => setSelected(previous => previous.includes(index)
    ? previous.filter(value => value !== index) : [...previous, index]);
  const common = { state, myId: 'hero', isDrawPhase, selectedCardIndices: selected, onCardClick: clickCard, animState: IDLE_ANIMATION };

  return <main className="yard-page" style={{ minHeight: '100dvh', background: '#150A2E', color: '#EDE9FE', display: 'flex', flexDirection: 'column' }}>
    <nav aria-label="Visual fixture controls" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 12 }}>
      {(['badugi', 'flushed_up', 'box_chevy'] as const).map(id => <button key={id}
        data-testid={`fixture-mode-${id}`} onClick={() => { setMode(id); setSelected([]); }}
        style={{ minHeight: 48, padding: 8 }}>{id}</button>)}
      <button data-testid="fixture-bet" onClick={() => setPhase('BET_4')} style={{ minHeight: 48 }}>Bet phase</button>
      <button data-testid="fixture-rival-turn" onClick={() => setMyTurn(false)} style={{ minHeight: 48 }}>Rival turn</button>
    </nav>
    <output data-testid="fixture-selected" aria-live="polite">{selected.join(',')}</output>
    <output data-testid="fixture-action" aria-live="polite">{lastAction}</output>
    <div style={{ height: 600, width: '100%', maxWidth: 1000, marginInline: 'auto' }}>
      {mode === 'badugi' && <BadugiTable {...common} />}
      {mode === 'flushed_up' && <FlushedUpTable {...common} />}
      {mode === 'box_chevy' && <BoxChevyTable state={state} myId="hero" phase={phase} isDrawPhase={isDrawPhase}
        heroCards={<div className="yard-hero-hand">
          <YardHeroIdentity state={state} myId="hero" accent="#F97316" />
          <CardHand cards={FLUSH_CARDS} selectedIndices={selected} onCardClick={clickCard} isSelectable={isDrawPhase}
            {...IDLE_ANIMATION} isShowdown={false} cardWidth={64} cardHeight={90} />
        </div>} />}
    </div>
    {mode === 'badugi' && <BadugiActionBar
      phase={phase} isDrawPhase={isDrawPhase} selectedCount={selected.length} drawLimit={3}
      isMyTurn={myTurn} chips={41000} currentBet={500} myBet={500} minBet={250}
      pot={12000} ante={25} humanCount={1} openSeatsCount={1} activeCount={4}
      isClubTable={false} locked={false} myDeclaration={null} myHasActed={false}
      onStandPat={() => setLastAction('stand_pat')} onDraw={() => setLastAction('draw')}
      onAction={(action, amount) => setLastAction(`${action}:${amount ?? ''}`)}
      onRebuy={() => setLastAction('rebuy')} />}
  </main>;
}

createRoot(document.getElementById('root')!).render(<YardReskinBrowserHarness />);
