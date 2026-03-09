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
  messages: [{ id: 'm1', text: 'Game ready. Waiting for start...', time: Date.now() }]
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
      
      addMessage(`Phase changed to ${nextPhase.replace('_', ' ')}`);
      
      // Reset bets on new betting round
      const isBetRound = nextPhase.startsWith('BET');
      return { 
        ...s, 
        phase: nextPhase, 
        currentBet: 0, 
        activePlayerId: myId,
        players: s.players.map(p => ({
          ...p,
          bet: isBetRound ? 0 : p.bet
        }))
      };
    });
  };

  // Simulating Game Loop for dealing and bot actions
  useEffect(() => {
    if (state.phase === 'DEAL') {
      // Deal 5 cards to everyone
      const newDeck = createDeck();
      
      setState(s => {
        const newPlayers = s.players.map(p => {
          // All cards start hidden to the table, but we show them on the client if it's our id
          const cards = newDeck.splice(0, 5).map(c => ({...c, isHidden: true}));
          return { ...p, cards };
        });
        return { ...s, players: newPlayers };
      });
      setDeck(newDeck);
      
      setTimeout(advancePhase, 1500);
    }
  }, [state.phase, myId]);

  const handleAction = useCallback((action: string, payload?: any) => {
    if (state.activePlayerId !== myId) return;

    if (action === 'start') {
      advancePhase();
      return;
    }
    
    if (action === 'restart') {
      setState(initialState);
      setDeck([]);
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

    if (action === 'raise' && typeof payload === 'number') {
      setState(s => ({
        ...s,
        currentBet: payload,
        pot: s.pot + payload,
        players: s.players.map(p => p.id === myId ? { 
          ...p, 
          chips: p.chips - payload,
          bet: payload
        } : p)
      }));
      addMessage(`You raised to $${payload}`);
      setTimeout(advancePhase, 1000);
    }

    if (action === 'draw') {
      // payload is array of indices to discard
      const indicesToDiscard: number[] = payload || [];
      
      if (indicesToDiscard.length > 0) {
        setDeck(currentDeck => {
          const newDeck = [...currentDeck];
          
          setState(s => ({
            ...s,
            players: s.players.map(p => {
              if (p.id !== myId) return p;
              
              const newCards = [...p.cards];
              indicesToDiscard.forEach(idx => {
                newCards[idx] = { ...newDeck.shift()!, isHidden: true };
              });
              return { ...p, cards: newCards };
            })
          }));
          
          return newDeck;
        });
        addMessage(`You discarded ${indicesToDiscard.length} cards`);
      } else {
        addMessage("You stood pat");
      }
      
      // Simulate bots drawing
      addMessage("Other players drew cards");
      setTimeout(advancePhase, 1500);
    }
    
    if (action === 'reveal') {
      // payload is the index to reveal
      const indexToReveal: number = payload;
      
      setState(s => ({
        ...s,
        players: s.players.map(p => {
          if (p.id !== myId) return p;
          const newCards = [...p.cards];
          newCards[indexToReveal] = { ...newCards[indexToReveal], isHidden: false };
          return { ...p, cards: newCards };
        })
      }));
      
      addMessage("You revealed a card");
      
      // Simulate bots revealing a card
      setTimeout(() => {
        setState(s => ({
          ...s,
          players: s.players.map(p => {
            if (p.id === myId || p.status === 'folded') return p;
            const newCards = [...p.cards];
            const hiddenIndices = newCards.map((c, i) => c.isHidden ? i : -1).filter(i => i !== -1);
            if (hiddenIndices.length > 0) {
              const randIdx = hiddenIndices[Math.floor(Math.random() * hiddenIndices.length)];
              newCards[randIdx] = { ...newCards[randIdx], isHidden: false };
            }
            return { ...p, cards: newCards };
          })
        }));
        addMessage("Other players revealed a card");
        setTimeout(advancePhase, 1500);
      }, 1000);
    }

    if (action === 'declare' && typeof payload === 'number') {
      const declarations: Record<number, Declaration> = { 1: 'HIGH', 2: 'LOW', 3: 'SWING' };
      setState(s => ({
        ...s,
        players: s.players.map(p => p.id === myId ? { ...p, declaration: declarations[payload] } : p)
      }));
      addMessage(`You declared ${declarations[payload]}`);
      
      // Simulate bots declaring and showdown
      setTimeout(() => {
        setState(s => ({
          ...s,
          players: s.players.map(p => {
            if (p.id === myId || p.status === 'folded') return p;
            
            // Reveal all remaining bot cards
            const newCards = p.cards.map(c => ({...c, isHidden: false}));
            const randDec = [1, 2, 3][Math.floor(Math.random() * 3)];
            return { ...p, declaration: declarations[randDec], cards: newCards };
          })
        }));
        advancePhase(); // -> SHOWDOWN
      }, 1500);
    }

  }, [state, myId]);

  return { state, handleAction };
}