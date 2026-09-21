import { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CardType, GameState, Player } from '@/lib/poker/types';
import { PlayingCard } from '@/components/game/Card';
import { CardHand } from '@/components/flushedUp/CardHand';
import { TableDealAnimator } from '@/components/flushedUp/TableDealAnimator';
import { FiveSeatPokerTable, type FiveSeatOpponent } from '@/components/game/FiveSeatPokerTable';
import { BadugiTableEffects } from '@/components/badugi/BadugiTableEffects';

const heroCard: CardType = { rank: 'A', suit: 'spades' };
const opponentCard: CardType = { rank: 'K', suit: 'hearts', isHidden: true };

function makePlayer(id: string, cards: CardType[] = []): Player {
  return {
    id,
    name: id === 'hero' ? 'Hero' : `Opponent ${id}`,
    presence: 'human',
    chips: 1000,
    bet: 0,
    cards,
    status: 'active',
    isDealer: false,
    declaration: null,
  };
}

function initialPlayers(count = 3): Player[] {
  return [
    makePlayer('hero'),
    ...Array.from({ length: count - 1 }, (_, index) => makePlayer(`opponent-${index + 1}`)),
  ];
}

function dealtPlayers(players: Player[]): Player[] {
  return players.map((player) => ({
    ...player,
    cards: [player.id === 'hero' ? heroCard : opponentCard],
  }));
}

function FullTablePlayers(): Player[] {
  return Array.from({ length: 40 }, (_, index) =>
    makePlayer(index === 0 ? 'hero' : `opponent-${index}`)
  );
}

function effectPlayers(): Player[] {
  return [
    makePlayer('hero', [heroCard, heroCard, heroCard, heroCard]),
    makePlayer('opponent-1', [opponentCard, opponentCard, opponentCard, opponentCard]),
  ];
}

function effectGameState(players = effectPlayers(), phase: GameState['phase'] = 'BET_1'): GameState {
  return {
    tableId: 'effects-test',
    phase,
    pot: 100,
    currentBet: 0,
    minBet: 25,
    activePlayerId: 'opponent-1',
    turnDeadline: Date.now() + 15_000,
    players,
    communityCards: [],
    messages: [],
    chatMessages: [],
    deck: [],
    discardPile: [],
  };
}

function DealSeat({
  player,
  visible,
}: {
  player: Player;
  visible: boolean;
}) {
  return (
    <div
      data-deal-seat={player.id}
      style={{
        visibility: visible ? 'visible' : undefined,
        width: 62,
        height: 82,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #444',
      }}
    >
      <PlayingCard
        card={player.id === 'hero' ? player.cards[0] : undefined}
        className="!w-[38px] !h-[54px]"
      />
    </div>
  );
}

function TableDealAnimatorBrowserHarness() {
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableRoot, setTableRoot] = useState<HTMLElement | null>(null);
  const [players, setPlayers] = useState<Player[]>(initialPlayers());
  const [phase, setPhase] = useState('ANTE');
  const [mounted, setMounted] = useState(true);
  const [showDeck, setShowDeck] = useState(true);
  const [visibleSeats, setVisibleSeats] = useState<Record<string, boolean>>({});
  const [fullDealRequested, setFullDealRequested] = useState(false);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [effectState, setEffectState] = useState<GameState>(() => effectGameState());

  useLayoutEffect(() => {
    setTableRoot(tableRef.current);
  }, []);

  const startDeal = () => {
    setShowDeck(true);
    setVisibleSeats({});
    setPlayers((current) => dealtPlayers(current));
    setPhase('BET_1');
  };

  const interruptDeal = () => {
    setPhase('BET_2');
  };

  const samePhaseUpdate = () => {
    setPlayers(current => current.map(player => ({ ...player, chips: player.chips + 1 })));
  };

  const startMissingDeal = (missing: 'deck' | 'seat') => {
    setShowDeck(missing !== 'deck');
    setVisibleSeats(missing === 'seat' ? { 'opponent-1': false } : {});
    setPlayers((current) => dealtPlayers(current));
    setPhase('BET_1');
  };

  const startFullDeal = () => {
    setShowDeck(true);
    setVisibleSeats({});
    setFullDealRequested(true);
    setPlayers(FullTablePlayers());
    setPhase('ANTE');
  };

  useLayoutEffect(() => {
    if (!fullDealRequested || players.length !== 40 || players.some((player) => player.cards.length > 0)) {
      return;
    }
    const timer = window.setTimeout(() => {
      setPlayers(dealtPlayers(FullTablePlayers()));
      setPhase('BET_1');
      setFullDealRequested(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fullDealRequested, players]);

  return (
    <>
      <div data-testid="controls">
        <button type="button" data-testid="deal" onClick={startDeal}>Deal</button>
        <button type="button" data-testid="same-phase-update" onClick={samePhaseUpdate}>Same-phase update</button>
        <button type="button" data-testid="interrupt" onClick={interruptDeal}>Interrupt</button>
        <button type="button" data-testid="missing-deck" onClick={() => startMissingDeal('deck')}>Missing deck</button>
        <button type="button" data-testid="missing-seat" onClick={() => startMissingDeal('seat')}>Missing seat</button>
        <button type="button" data-testid="full-deal" onClick={startFullDeal}>Full deal</button>
        <button type="button" data-testid="unmount" onClick={() => setMounted(false)}>Unmount</button>
        <button type="button" data-testid="effect-bet" onClick={() => setEffectState(current => ({
          ...current,
          pot: current.pot + 50,
          currentBet: 50,
          players: current.players.map(player => player.id === 'opponent-1'
            ? { ...player, bet: player.bet + 50, chips: player.chips - 50 }
            : player),
        }))}>Animate bet</button>
        <button type="button" data-testid="effect-payout" onClick={() => setEffectState(current => ({
          ...current,
          phase: 'SHOWDOWN',
          pot: 0,
          activePlayerId: null,
          turnDeadline: null,
          players: current.players.map(player => ({ ...player, chips: player.chips + 50, isWinner: true })),
        }))}>Animate split payout</button>
        <button type="button" data-testid="effect-fold" onClick={() => setEffectState(current => ({
          ...current,
          players: current.players.map(player => player.id === 'opponent-1'
            ? { ...player, status: 'folded' }
            : player),
        }))}>Animate fold</button>
      </div>
      <div data-testid="interactive-hand" style={{ width: 240 }}>
        <CardHand
          cards={[heroCard]}
          selectedIndices={selectedCards}
          onCardClick={(index) => setSelectedCards(current =>
            current.includes(index) ? current.filter(selected => selected !== index) : [...current, index]
          )}
          isSelectable
          dealingIndices={[0]}
          testIdPrefix="interactive-card"
        />
        <output data-testid="selected-cards">{selectedCards.join(',')}</output>
      </div>
      <div
        ref={tableRef}
        data-testid="table"
        style={{
          position: 'relative',
          width: '375px',
          height: '560px',
          overflow: 'hidden',
          background: '#111',
        }}
      >
        {showDeck && (
          <div
            data-deal-anchor="deck"
            data-testid="deck"
            style={{
              position: 'absolute',
              left: '180px',
              top: '270px',
              width: '44px',
              height: '44px',
            }}
          />
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '8px' }}>
          {players.map((player) => (
            (visibleSeats[player.id] !== false || player.id !== 'opponent-1') && (
              <DealSeat key={player.id} player={player} visible={visibleSeats[player.id] !== false} />
            )
          ))}
        </div>
        {mounted && tableRoot && (
          <TableDealAnimator
            players={players}
            phase={phase}
            myId="hero"
            tableRoot={tableRoot}
          />
        )}
      </div>
      <div data-testid="badugi-effects-table" style={{ width: 375, height: 500 }}>
        <FiveSeatPokerTable
          players={effectState.players}
          phase={effectState.phase}
          myId="hero"
          opponents={effectState.players.filter(player => player.id !== 'hero').map((player): FiveSeatOpponent => ({
            id: player.id,
            name: player.name,
            chips: player.chips,
            cardCount: player.cards.length,
            status: player.status,
            isActive: effectState.activePlayerId === player.id,
            isWinner: !!player.isWinner,
            isDealer: player.isDealer,
            seatNum: 2,
          }))}
          hero={<div style={{ width: 180, height: 70 }}>Hero</div>}
          center={<div>Pot {effectState.pot}</div>}
          accent="#c9a227"
          modeLabel="badugi-effects-test"
          activePlayerId={effectState.activePlayerId}
          turnDeadline={effectState.turnDeadline}
          effects={root => <BadugiTableEffects state={effectState} tableRoot={root} />}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<TableDealAnimatorBrowserHarness />);