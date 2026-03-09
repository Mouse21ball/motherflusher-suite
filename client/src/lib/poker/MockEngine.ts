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
  activePlayerId: 'p1',
  players: mockPlayers,
  communityCards: Array(15).fill({ suit: 'hearts', rank: '2', isHidden: true }),
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
        'WAITING', 
        'ANTE', 
        'DEAL', 
        'REVEAL_TOP_ROW', 
        'DRAW', 
        'BET_1', 
        'REVEAL_SECOND_ROW', 
        'BET_2', 
        'REVEAL_FACTOR_CARD', 
        'DECLARE_AND_BET', 
        'SHOWDOWN'
      ];
      const nextIdx = (phases.indexOf(s.phase) + 1) % phases.length;
      const nextPhase = phases[nextIdx];
      
      addMessage(`Phase changed to ${nextPhase.replace(/_/g, ' ')}`);
      
      // Reset bets on new betting round
      const isBetRound = nextPhase.startsWith('BET') || nextPhase === 'DECLARE_AND_BET';
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

  // Automatic phase transitions for reveals
  useEffect(() => {
    if (state.phase === 'REVEAL_TOP_ROW') {
      setTimeout(() => {
        setState(s => ({
          ...s,
          communityCards: s.communityCards.map((c, i) => i < 10 ? { ...c, isHidden: false } : c)
        }));
        addMessage("Top row (5 pairs) revealed");
        setTimeout(advancePhase, 2000);
      }, 1000);
    } else if (state.phase === 'REVEAL_SECOND_ROW') {
      setTimeout(() => {
        setState(s => ({
          ...s,
          communityCards: s.communityCards.map((c, i) => (i >= 10 && i !== 12) ? { ...c, isHidden: false } : c)
        }));
        addMessage("Second row revealed (except factor card)");
        setTimeout(advancePhase, 2000);
      }, 1000);
    } else if (state.phase === 'REVEAL_FACTOR_CARD') {
      setTimeout(() => {
        setState(s => ({
          ...s,
          communityCards: s.communityCards.map((c, i) => i === 12 ? { ...c, isHidden: false } : c)
        }));
        addMessage("Factor card revealed!");
        setTimeout(advancePhase, 2000);
      }, 1000);
    }
  }, [state.phase]);

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
      setState(s => ({
        ...initialState,
        pot: s.pot, // Preserve pot for rollover
        messages: [{ id: Math.random().toString(), text: 'New hand started.', time: Date.now() }]
      }));
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
      
      // Simulate bots drawing sequentially
      setTimeout(() => {
        addMessage("Other players are drawing...");
        setTimeout(advancePhase, 2000);
      }, 1000);
    }

    if (action === 'declare_and_bet' && payload) {
      const { declaration, action: betAction, amount } = payload;
      
      setState(s => {
        let newPot = s.pot;
        let newCurrentBet = s.currentBet;
        
        let newPlayers = s.players.map(p => {
          if (p.id !== myId) return p;
          
          let pChips = p.chips;
          let pBet = p.bet;
          let pStatus = p.status;
          
          if (betAction === 'fold') {
            pStatus = 'folded';
          } else if (betAction === 'call' || betAction === 'check') {
            const callAmount = s.currentBet - p.bet;
            pChips -= callAmount;
            pBet = s.currentBet;
            newPot += callAmount;
          } else if (betAction === 'raise' && amount) {
            pChips -= amount;
            pBet = amount;
            newPot += amount;
            newCurrentBet = amount;
          }
          
          return { ...p, status: pStatus, chips: pChips, bet: pBet, declaration };
        });
        
        return { ...s, pot: newPot, currentBet: newCurrentBet, players: newPlayers };
      });
      
      addMessage(`You declared ${payload.declaration} and ${payload.action}`);
      
      // Simulate bots declaring and showdown
      setTimeout(() => {
        setState(s => {
          let newPot = s.pot;
          
          const finalPlayers = s.players.map(p => {
            if (p.id === myId || p.status === 'folded') return p;
            
            // Reveal all remaining bot cards
            const newCards = p.cards.map(c => ({...c, isHidden: false}));
            const randDec = [1, 2, 3][Math.floor(Math.random() * 3)] as 1 | 2 | 3;
            const declarations: Record<number, Declaration> = { 1: 'HIGH', 2: 'LOW', 3: 'SWING' };
            return { ...p, declaration: declarations[randDec], cards: newCards };
          });
          
          // MOCK EVALUATOR LOGIC:
          // 1. Group players by declaration
          const highPlayers = finalPlayers.filter(p => p.declaration === 'HIGH' || p.declaration === 'SWING');
          const lowPlayers = finalPlayers.filter(p => p.declaration === 'LOW' || p.declaration === 'SWING');
          
          let highWinner: Player | null = null;
          let lowWinners: Player[] = [];
          
          // Mock HIGH eval
          if (highPlayers.length > 0) {
            highWinner = highPlayers[Math.floor(Math.random() * highPlayers.length)];
          }
          
          // Mock LOW eval with FACTOR CARD rule
          if (lowPlayers.length > 0) {
            // Assume we evaluated and found a tie for best low hand
            const tiedLows = lowPlayers.slice(0, 2); 
            
            if (tiedLows.length === 1) {
              lowWinners = [tiedLows[0]];
            } else {
              // Apply factor card tiebreaker
              // Compare the lowest card of the tied hands by suit (Spades > Hearts > Diamonds > Clubs)
              const factorCardBreaksTie = Math.random() > 0.5;
              if (factorCardBreaksTie) {
                // Factor rule produces a single winner
                lowWinners = [tiedLows[0]];
              } else {
                // Still tied (exact identical cards if using multiple decks, or mock scenario)
                lowWinners = tiedLows;
              }
            }
          }
          
          let payoutMessage = "Showdown!";
          
          if (!highWinner && lowWinners.length === 0) {
            // Rollover
            payoutMessage = `No qualifiers. $${newPot} rolls over!`;
          } else {
            // Payout
            const halfPot = newPot / 2;
            let highPot = halfPot;
            let lowPot = halfPot;
            
            if (!highWinner) lowPot += highPot; // Scoop if no high
            if (lowWinners.length === 0) highPot += lowPot; // Scoop if no low
            
            if (highWinner) {
              const p = finalPlayers.find(p => p.id === highWinner!.id);
              if (p) p.chips += highPot;
            }
            
            if (lowWinners.length > 0) {
              const split = lowPot / lowWinners.length;
              lowWinners.forEach(winner => {
                const p = finalPlayers.find(p => p.id === winner.id);
                if (p) p.chips += split;
              });
            }
            
            newPot = 0; // Pot is cleared
            payoutMessage = "Pot distributed to winners.";
          }
          
          return { 
            ...s, 
            players: finalPlayers, 
            phase: 'SHOWDOWN',
            pot: newPot,
            messages: [...s.messages, { id: Math.random().toString(), text: payoutMessage, time: Date.now() }].slice(-5)
          };
        });
      }, 1500);
    }

  }, [state, myId]);

  return { state, handleAction };
}