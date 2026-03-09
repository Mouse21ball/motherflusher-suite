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
  { id: 'p1', name: 'You', chips: 1000, bet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
  { id: 'p2', name: 'Alice', chips: 1000, bet: 0, cards: [], status: 'active', isDealer: true, declaration: null, hasActed: false },
  { id: 'p3', name: 'Bob', chips: 1000, bet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
  { id: 'p4', name: 'Charlie', chips: 1000, bet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
];

const initialState: GameState = {
  tableId: 't1',
  phase: 'WAITING',
  pot: 0,
  currentBet: 0,
  minBet: 2,
  activePlayerId: 'p1',
  players: mockPlayers,
  communityCards: Array.from({ length: 15 }, () => ({ suit: 'hearts', rank: '2', isHidden: true })),
  messages: [{ id: 'm1', text: 'Game ready. Waiting for start...', time: Date.now() }],
  chatMessages: [],
  deck: []
};

// Helper: Get player index immediately left of the given index, wrapping around
const getNextActivePlayerIndex = (players: Player[], currentIndex: number): number => {
  let nextIdx = (currentIndex + 1) % players.length;
  let count = 0;
  // Skip players who folded or have 0 chips (all-in)
  while ((players[nextIdx].status !== 'active' || players[nextIdx].chips === 0) && count < players.length) {
    nextIdx = (nextIdx + 1) % players.length;
    count++;
  }
  return nextIdx;
};

// Find the index of the dealer
const getDealerIndex = (players: Player[]): number => {
  const idx = players.findIndex(p => p.isDealer);
  return idx === -1 ? 0 : idx;
};

// Move dealer button to the next active player
const moveDealer = (players: Player[]): Player[] => {
  const currentDealerIdx = getDealerIndex(players);
  const nextDealerIdx = getNextActivePlayerIndex(players, currentDealerIdx);
  
  return players.map((p, i) => ({
    ...p,
    isDealer: i === nextDealerIdx
  }));
};

export function useMockEngine(myId: string = 'p1') {
  const [state, setState] = useState<GameState>(initialState);

  const addMessage = (text: string) => {
    setState(s => ({
      ...s,
      messages: [...s.messages, { id: Math.random().toString(), text, time: Date.now() }].slice(-5)
    }));
  };

  const setNextPlayer = () => {
    setState(s => {
      // Find the current active player's index
      const currentIndex = s.players.findIndex(p => p.id === s.activePlayerId);
      if (currentIndex === -1) return s;

      const nextIndex = getNextActivePlayerIndex(s.players, currentIndex);
      
      // If we wrapped around or hit someone who already acted and bet matches, phase might end
      // For mock simplicity, we just advance
      
      return {
        ...s,
        activePlayerId: s.players[nextIndex].id
      };
    });
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
      
      // Calculate first to act: left of dealer
      const dealerIdx = getDealerIndex(s.players);
      const firstToActIdx = getNextActivePlayerIndex(s.players, dealerIdx);
      
      // Reset bets on new betting round
      const isBetRound = nextPhase.startsWith('BET') || nextPhase === 'DECLARE_AND_BET';
      return { 
        ...s, 
        phase: nextPhase, 
        currentBet: 0, 
        activePlayerId: s.players[firstToActIdx].id,
        players: s.players.map(p => ({
          ...p,
          hasActed: false,
          bet: isBetRound ? 0 : p.bet
        }))
      };
    });
  };

  // Bot logic
  useEffect(() => {
    if (state.activePlayerId === myId) return;
    
    // Only act in these phases
    if (!['ANTE', 'DRAW', 'BET_1', 'BET_2', 'DECLARE_AND_BET'].includes(state.phase)) return;

    const botId = state.activePlayerId;
    const bot = state.players.find(p => p.id === botId);
    if (!bot || bot.status !== 'active') return;

    const timer = setTimeout(() => {
      setState(s => {
        let newPlayers = [...s.players];
        let newDeck = [...s.deck];
        let newPot = s.pot;
        let newCurrentBet = s.currentBet;
        
        const bIdx = newPlayers.findIndex(p => p.id === botId);

        if (s.phase === 'ANTE') {
            newPlayers[bIdx] = { ...newPlayers[bIdx], chips: newPlayers[bIdx].chips - 1, hasActed: true };
            newPot += 1;
            addMessage(`${bot.name} paid $1 Ante`);
        }
        else if (s.phase === 'DRAW') {
          // Bot draws 0-2 cards
          const numDraws = Math.floor(Math.random() * 3);
          if (numDraws > 0 && newDeck.length >= numDraws) {
            const newCards = [...newPlayers[bIdx].cards];
            for (let i=0; i<numDraws; i++) {
              newCards[i] = { ...newDeck.shift()!, isHidden: true };
            }
            newPlayers[bIdx] = { ...newPlayers[bIdx], cards: newCards, hasActed: true };
            addMessage(`${bot.name} discarded ${numDraws} cards`);
          } else {
            newPlayers[bIdx] = { ...newPlayers[bIdx], hasActed: true };
            addMessage(`${bot.name} stood pat`);
          }
        } 
        else if (s.phase === 'DECLARE_AND_BET') {
           const randDec = ['HIGH', 'LOW', 'SWING'][Math.floor(Math.random() * 3)] as Declaration;
           
           const callAmount = s.currentBet - newPlayers[bIdx].bet;
           newPlayers[bIdx] = { ...newPlayers[bIdx], chips: newPlayers[bIdx].chips - callAmount, bet: s.currentBet, declaration: randDec, hasActed: true };
           newPot += callAmount;
           
           addMessage(`${bot.name} declared ${randDec} and called`);
        }
        else {
          // Betting logic (Check/Call)
          const callAmount = s.currentBet - newPlayers[bIdx].bet;
          newPlayers[bIdx] = { ...newPlayers[bIdx], chips: newPlayers[bIdx].chips - callAmount, bet: s.currentBet, hasActed: true };
          newPot += callAmount;
          addMessage(`${bot.name} ${callAmount === 0 ? 'checked' : 'called $' + callAmount}`);
        }

        const activePlayers = newPlayers.filter(p => p.status === 'active' && p.chips > 0);
        const allActed = activePlayers.every(p => p.hasActed);
        const allBetsMatch = activePlayers.every(p => p.bet === newCurrentBet);
        const roundOver = allActed && allBetsMatch;

        if (roundOver) {
            setTimeout(advancePhase, 500);
            return {
               ...s,
               players: newPlayers,
               deck: newDeck,
               pot: newPot,
               currentBet: newCurrentBet
            };
        } else {
            let nextIdx = (bIdx + 1) % newPlayers.length;
            let count = 0;
            while (count < newPlayers.length) {
                const p = newPlayers[nextIdx];
                if (p.status === 'active' && p.chips > 0 && (!p.hasActed || p.bet < newCurrentBet)) {
                    break;
                }
                nextIdx = (nextIdx + 1) % newPlayers.length;
                count++;
            }
            
            return {
               ...s,
               players: newPlayers,
               deck: newDeck,
               pot: newPot,
               currentBet: newCurrentBet,
               activePlayerId: newPlayers[nextIdx].id
            };
        }
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [state.activePlayerId, state.phase, myId]);


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

  // Simulating Game Loop for dealing
  useEffect(() => {
    if (state.phase === 'DEAL') {
      setState(s => {
        // Generate deck inside setState so it's fresh if React runs the updater twice
        const freshDeck = createDeck();
        
        const newPlayers = s.players.map(p => {
          // All cards start hidden to the table, but we show them on the client if it's our id
          const cards = freshDeck.splice(0, 5).map(c => ({...c, isHidden: p.id !== myId}));
          return { ...p, cards };
        });
        const newCommunityCards = freshDeck.splice(0, 15).map(c => ({...c, isHidden: true}));
        
        // Debug Deck Integrity
        const dealtCards = [...newPlayers.flatMap(p => p.cards), ...newCommunityCards];
        const uniqueCards = new Set(dealtCards.map(c => `${c.rank}-${c.suit}`));
        if (uniqueCards.size !== dealtCards.length) {
            console.error("CRITICAL ERROR: Duplicate cards dealt!", dealtCards);
        } else {
            console.log(`Deck integrity verified. Dealt ${dealtCards.length} unique cards.`);
        }

        return { ...s, players: newPlayers, communityCards: newCommunityCards, deck: freshDeck };
      });
      
      setTimeout(advancePhase, 1500);
    }
  }, [state.phase, myId]);

  const handleAction = useCallback((action: string, payload?: any) => {
    // Chat action doesn't require it to be the user's turn
    if (action === 'chat' && payload) {
        setState(s => {
            const me = s.players.find(p => p.id === myId);
            return {
                ...s,
                chatMessages: [...s.chatMessages, {
                    id: Math.random().toString(),
                    senderId: myId,
                    senderName: me?.name || 'Unknown',
                    text: payload as string,
                    time: Date.now()
                }].slice(-50) // Keep last 50 messages
            };
        });
        
        // Simulate bot reply sometimes
        if (Math.random() > 0.6) {
             setTimeout(() => {
                 setState(s => {
                     const otherPlayers = s.players.filter(p => p.id !== myId);
                     const randomBot = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
                     const responses = ["Nice hand!", "Wait what?", "I'm all in soon", "Good luck", "Fold to me please"];
                     return {
                         ...s,
                         chatMessages: [...s.chatMessages, {
                             id: Math.random().toString(),
                             senderId: randomBot.id,
                             senderName: randomBot.name,
                             text: responses[Math.floor(Math.random() * responses.length)],
                             time: Date.now()
                         }].slice(-50)
                     };
                 });
             }, 1500 + Math.random() * 2000);
        }
        return;
    }

    if (state.activePlayerId !== myId) return;

    if (action === 'start') {
      advancePhase();
      return;
    }
    
    if (action === 'restart') {
      setState(s => {
        const nextPlayers = moveDealer(s.players).map(p => ({
            ...p,
            cards: [],
            bet: 0,
            status: p.chips > 0 ? 'active' as const : 'folded' as const,
            declaration: null,
            hasActed: false,
            score: undefined
        }));
        
        return {
          ...initialState,
          players: nextPlayers,
          pot: s.pot, // Preserve pot for rollover
          messages: [{ id: Math.random().toString(), text: 'New hand started.', time: Date.now() }]
        };
      });
      return;
    }

    const processActionEnd = () => {
       setState(s => {
           const myIndex = s.players.findIndex(p => p.id === myId);
           const nextIdx = getNextActivePlayerIndex(s.players, myIndex);
           const firstToActIdx = getNextActivePlayerIndex(s.players, getDealerIndex(s.players));
           
           // If the next player to act is the one who is supposed to act first, round is over
           if (nextIdx === firstToActIdx) {
               setTimeout(advancePhase, 500);
               return s;
           } else {
               return {
                   ...s,
                   activePlayerId: s.players[nextIdx].id
               }
           }
       });
    };

    if (action === 'ante') {
      setState(s => {
        const newPlayers = s.players.map(p => {
          if (p.id === myId) return { ...p, chips: p.chips - 1, hasActed: true };
          return p;
        });
        
        return {
            ...s,
            pot: s.pot + 1, // Add my ante
            players: newPlayers
        }
      });
      
      addMessage("You paid $1 Ante");
      
      // Check if everyone has anted
      setState(s => {
        const activePlayers = s.players.filter(p => p.status === 'active');
        const allAnted = activePlayers.every(p => p.hasActed);
        
        if (allAnted) {
          setTimeout(advancePhase, 500);
          return s;
        } else {
           const myIndex = s.players.findIndex(p => p.id === myId);
           const nextIdx = getNextActivePlayerIndex(s.players, myIndex);
           return {
               ...s,
               activePlayerId: s.players[nextIdx].id
           }
        }
      });
      return;
    }


    if (action === 'fold') {
      setState(s => ({
        ...s,
        players: s.players.map(p => p.id === myId ? { ...p, status: 'folded' as const, hasActed: true } : p)
      }));
      addMessage("You folded");
      processActionEnd();
    }

    if (action === 'call' || action === 'check') {
      const callAmount = state.currentBet - (state.players.find(p => p.id === myId)?.bet || 0);
      setState(s => ({
        ...s,
        pot: s.pot + callAmount,
        players: s.players.map(p => p.id === myId ? { 
          ...p, 
          chips: p.chips - callAmount,
          bet: s.currentBet,
          hasActed: true
        } : p)
      }));
      addMessage(`You ${callAmount === 0 ? 'checked' : 'called $' + callAmount}`);
      processActionEnd();
    }

    if (action === 'raise' && typeof payload === 'number') {
      setState(s => ({
        ...s,
        currentBet: payload,
        pot: s.pot + payload,
        players: s.players.map(p => p.id === myId ? { 
          ...p, 
          chips: p.chips - payload,
          bet: payload,
          hasActed: true
        } : p)
      }));
      addMessage(`You raised to $${payload}`);
      processActionEnd();
    }

    if (action === 'draw') {
      // payload is array of indices to discard
      const indicesToDiscard: number[] = payload || [];
      
      if (indicesToDiscard.length > 0) {
        setState(s => {
          const newDeck = [...s.deck];
          const newPlayers = s.players.map(p => {
              if (p.id !== myId) return p;
              const newCards = [...p.cards];
              indicesToDiscard.forEach(idx => {
                newCards[idx] = { ...newDeck.shift()!, isHidden: true };
              });
              return { ...p, cards: newCards, hasActed: true };
            });
            
          return {
              ...s,
              deck: newDeck,
              players: newPlayers
          }
        });
        addMessage(`You discarded ${indicesToDiscard.length} cards`);
      } else {
        setState(s => ({
           ...s,
           players: s.players.map(p => p.id === myId ? { ...p, hasActed: true } : p)
        }));
        addMessage("You stood pat");
      }
      
      processActionEnd();
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
          
          return { ...p, status: pStatus, chips: pChips, bet: pBet, declaration, hasActed: true };
        });
        
        return { ...s, pot: newPot, currentBet: newCurrentBet, players: newPlayers };
      });
      
      addMessage(`You declared ${payload.declaration} and ${payload.action}`);
      processActionEnd();
    }

  }, [state, myId]);

  // Showdown effect
  useEffect(() => {
    if (state.phase === 'SHOWDOWN') {
      const timer = setTimeout(() => {
        setState(s => {
          let newPot = s.pot;
          
          const finalPlayers = s.players.map(p => {
            if (p.id === myId || p.status === 'folded') return p;
            // Reveal all remaining bot cards
            const newCards = p.cards.map(c => ({...c, isHidden: false}));
            
            // Generate mock hand evaluations
            const score = {
              high: ['Two Pair', 'Three of a Kind', 'Flush', 'Full House'][Math.floor(Math.random() * 4)],
              low: ['8-Low', '7-Low', 'Perfect 6', 'No Low'][Math.floor(Math.random() * 4)],
              highEval: {
                description: 'Mock High Hand',
                usedHoleCardIndices: [0, 1],
                usedCommunityCardIndices: [0, 1, 2]
              },
              lowEval: {
                description: 'Mock Low Hand',
                usedHoleCardIndices: [0, 1],
                usedCommunityCardIndices: [0, 1, 2]
              }
            };
            
            return { ...p, cards: newCards, score };
          });
          
          // Generate my score too if I'm active
          const myIndex = finalPlayers.findIndex(p => p.id === myId);
          if (myIndex !== -1 && finalPlayers[myIndex].status !== 'folded') {
            finalPlayers[myIndex] = {
              ...finalPlayers[myIndex],
              score: {
                high: ['Two Pair', 'Three of a Kind', 'Flush', 'Full House'][Math.floor(Math.random() * 4)],
                low: ['8-Low', '7-Low', 'Perfect 6', 'No Low'][Math.floor(Math.random() * 4)],
                highEval: {
                  description: 'Mock High Hand',
                  usedHoleCardIndices: [0, 1],
                  usedCommunityCardIndices: [0, 1, 2]
                },
                lowEval: {
                  description: 'Mock Low Hand',
                  usedHoleCardIndices: [0, 1],
                  usedCommunityCardIndices: [0, 1, 2]
                }
              }
            };
          }
          
          // MOCK EVALUATOR LOGIC
          const highPlayers = finalPlayers.filter(p => p.declaration === 'HIGH' || p.declaration === 'SWING');
          const lowPlayers = finalPlayers.filter(p => p.declaration === 'LOW' || p.declaration === 'SWING');
          
          let highWinner: Player | null = null;
          let lowWinners: Player[] = [];
          
          if (highPlayers.length > 0) highWinner = highPlayers[Math.floor(Math.random() * highPlayers.length)];
          
          if (lowPlayers.length > 0) {
            const tiedLows = lowPlayers.slice(0, 2); 
            if (tiedLows.length === 1) lowWinners = [tiedLows[0]];
            else lowWinners = Math.random() > 0.5 ? [tiedLows[0]] : tiedLows;
          }
          
          let payoutMessage = "Showdown!";
          
          if (!highWinner && lowWinners.length === 0) {
            payoutMessage = `No qualifiers. $${newPot} rolls over!`;
          } else {
            const halfPot = Math.floor(newPot / 2);
            let highPot = halfPot;
            let lowPot = halfPot;
            // Handle odd chip
            if (newPot % 2 !== 0) {
                highPot += 1; // High usually gets odd chip
            }
            
            if (!highWinner) { lowPot += highPot; highPot = 0; }
            if (lowWinners.length === 0) { highPot += lowPot; lowPot = 0; }
            
            if (highWinner) {
              const p = finalPlayers.find(p => p.id === highWinner!.id);
              if (p) p.chips += highPot;
            }
            
            if (lowWinners.length > 0) {
              const split = Math.floor(lowPot / lowWinners.length);
              const remainder = lowPot % lowWinners.length;
              lowWinners.forEach((winner, idx) => {
                const p = finalPlayers.find(p => p.id === winner.id);
                // Give odd chip to first winner for simplicity
                if (p) p.chips += split + (idx === 0 ? remainder : 0);
              });
            }
            
            newPot = 0;
            payoutMessage = "Pot distributed to winners.";
          }
          
          return { 
            ...s, 
            players: finalPlayers, 
            pot: newPot,
            messages: [...s.messages, { id: Math.random().toString(), text: payoutMessage, time: Date.now() }].slice(-5)
          };
        });
        
        // Return to ANTE after a delay
        setTimeout(() => {
            setState(s => {
                const nextPlayers = moveDealer(s.players).map(p => ({
                    ...p, 
                    cards: [], 
                    bet: 0, 
                    hasActed: false, 
                    declaration: null, 
                    status: p.chips > 0 ? 'active' : p.status,
                    score: undefined
                }));
                const dealerIdx = getDealerIndex(nextPlayers);
                const firstToActIdx = getNextActivePlayerIndex(nextPlayers, dealerIdx);
                
                return {
                    ...s,
                    phase: 'ANTE',
                    currentBet: 0,
                    activePlayerId: nextPlayers[firstToActIdx].id,
                    players: nextPlayers,
                    communityCards: Array.from({ length: 15 }, () => ({ suit: 'hearts', rank: '2', isHidden: true })),
                    deck: []
                };
            });
            addMessage("Starting new hand...");
        }, 8000);
        
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state.phase, myId]);

  return { state, handleAction };
}