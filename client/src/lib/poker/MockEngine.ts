import { useState, useEffect, useCallback } from 'react';
import { GameState, Player, CardType, Declaration, GamePhase } from './types';

// Mock Deck Generator
const createDeck = (): CardType[] => {
  const suits: CardType['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: CardType['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: CardType[] = [];
  
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, isHidden: true });
    }
  }
  
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
};

// Initial Mock State
const mockPlayers: Player[] = [
  { id: 'p1', name: 'You', chips: 1000, bet: 0, cards: [], status: 'active', isDealer: false, declaration: null },
  { id: 'p2', name: 'Alice', chips: 1000, bet: 0, cards: [], status: 'active', isDealer: true, declaration: null },
  { id: 'p3', name: 'Bob', chips: 1000, bet: 0, cards: [], status: 'active', isDealer: false, declaration: null },
  { id: 'p4', name: 'Charlie', chips: 1000, bet: 0, cards: [], status: 'active', isDealer: false, declaration: null },
];

const initialState: GameState = {
  tableId: 't1',
  phase: 'WAITING',
  pot: 0,
  currentBet: 0,
  minBet: 2,
  activePlayerId: null,
  players: mockPlayers,
  messages: [{ id: 'm1', text: 'Waiting for game to start...', time: Date.now() }]
};

export function useMockEngine(myId: string = 'p1') {
  const [state, setState] = useState<GameState>(initialState);
  const [deck, setDeck] = useState<CardType[]>([]);

  const addMessage = (text: string) => {
    setState(s => ({
      ...s,
      messages: [...s.messages, { id: Math.random().toString(), text, time: Date.now() }].slice(-5)
    }));
  };

  const advancePhase = () => {
    setState(s => {
      const phases: GamePhase[] = [
        'WAITING', 'ANTE', 'DEAL', 'DRAW', 
        'REVEAL_1', 'BET_1', 
        'REVEAL_2', 'BET_2', 
        'REVEAL_3', 'BET_3', 
        'DECLARE', 'SHOWDOWN'
      ];
      const nextIdx = (phases.indexOf(s.phase) + 1) % phases.length;
      const nextPhase = phases[nextIdx];
      
      addMessage(`Phase changed to ${nextPhase}`);
      return { ...s, phase: nextPhase, currentBet: 0, activePlayerId: myId };
    });
  };

  // Simulating Game Loop
  useEffect(() => {
    if (state.phase === 'DEAL') {
      // Deal 5 cards to everyone
      const newDeck = createDeck();
      
      setState(s => {
        const newPlayers = s.players.map(p => {
          const cards = newDeck.splice(0, 5).map(c => ({...c, isHidden: p.id !== myId})); // Only I see my cards initially
          return { ...p, cards };
        });
        return { ...s, players: newPlayers };
      });
      setDeck(newDeck);
      
      setTimeout(advancePhase, 2000);
    }
  }, [state.phase, myId]);

  const handleAction = useCallback((action: string, amount?: number) => {
    if (state.activePlayerId !== myId) return;

    if (action === 'start') {
      advancePhase();
      return;
    }

    if (action === 'ante') {
      setState(s => ({
        ...s,
        pot: s.pot + s.players.length * 1, // Everyone antes 1
        players: s.players.map(p => ({ ...p, chips: p.chips - 1 }))
      }));
      addMessage("Everyone paid $1 Ante");
      advancePhase(); // Go to DEAL
      return;
    }

    if (action === 'fold') {
      setState(s => ({
        ...s,
        players: s.players.map(p => p.id === myId ? { ...p, status: 'folded' as const } : p)
      }));
      addMessage("You folded");
      // Simulate others acting, then advance
      setTimeout(advancePhase, 1000);
    }

    if (action === 'call' || action === 'check') {
      const callAmount = state.currentBet - (state.players.find(p => p.id === myId)?.bet || 0);
      setState(s => ({
        ...s,
        pot: s.pot + callAmount,
        players: s.players.map(p => p.id === myId ? { 
          ...p, 
          chips: p.chips - callAmount,
          bet: s.currentBet
        } : p)
      }));
      addMessage(`You ${callAmount === 0 ? 'checked' : 'called $' + callAmount}`);
      setTimeout(advancePhase, 1000);
    }

    if (action === 'raise' && amount) {
      setState(s => ({
        ...s,
        currentBet: amount,
        pot: s.pot + amount,
        players: s.players.map(p => p.id === myId ? { 
          ...p, 
          chips: p.chips - amount,
          bet: amount
        } : p)
      }));
      addMessage(`You raised to $${amount}`);
      setTimeout(advancePhase, 1000);
    }

    if (action === 'draw') {
      addMessage("You kept your hand");
      setTimeout(advancePhase, 1000);
    }

    if (action === 'declare' && amount) {
      const declarations: Record<number, Declaration> = { 1: 'HIGH', 2: 'LOW', 3: 'SWING' };
      setState(s => ({
        ...s,
        players: s.players.map(p => p.id === myId ? { ...p, declaration: declarations[amount] } : p)
      }));
      addMessage(`You declared ${declarations[amount]}`);
      setTimeout(advancePhase, 1000);
    }

  }, [state, myId]);

  return { state, handleAction };
}