import { useState, useEffect, useCallback } from 'react';
import { GameState, Player, CardType, Declaration, GamePhase } from '../types';
import { createDeck, getNextActivePlayerIndex, getDealerIndex, moveDealer, isRoundOver } from './core';
import { GameMode } from './types';

export const mockPlayers: Player[] = [
  { id: 'p1', name: 'You', chips: 1000, bet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
  { id: 'p2', name: 'Alice', chips: 1000, bet: 0, cards: [], status: 'active', isDealer: true, declaration: null, hasActed: false },
  { id: 'p3', name: 'Bob', chips: 1000, bet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
  { id: 'p4', name: 'Charlie', chips: 1000, bet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
];

export const createInitialState = (): GameState => ({
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
});

export function useGameEngine(mode: GameMode, myId: string = 'p1') {
  const [state, setState] = useState<GameState>(createInitialState());

  const addMessage = useCallback((text: string) => {
    setState(s => ({
      ...s,
      messages: [...s.messages, { id: Math.random().toString(), text, time: Date.now() }].slice(-5)
    }));
  }, []);

  const advancePhase = useCallback(() => {
    setState(s => {
      const currentPhaseIndex = mode.phases.indexOf(s.phase);
      const nextPhaseIndex = (currentPhaseIndex + 1) % mode.phases.length;
      const nextPhase = mode.phases[nextPhaseIndex];
      
      // Calculate first to act: left of dealer
      const dealerIdx = getDealerIndex(s.players);
      const firstToActIdx = getNextActivePlayerIndex(s.players, dealerIdx);
      
      // Reset bets on new betting round
      const isBetRound = nextPhase.startsWith('BET') || nextPhase === 'DECLARE_AND_BET' || nextPhase === 'BET_3';
      return { 
        ...s, 
        phase: nextPhase, 
        currentBet: 0, 
        activePlayerId: s.players[firstToActIdx].id,
        players: s.players.map(p => ({
          ...p,
          hasActed: false,
          bet: isBetRound ? 0 : p.bet
        })),
        messages: [...s.messages, { id: Math.random().toString(), text: `Phase changed to ${nextPhase.replace(/_/g, ' ')}`, time: Date.now() }].slice(-5)
      };
    });
  }, [mode.phases]);

  // Bot logic
  useEffect(() => {
    if (state.activePlayerId === myId) return;
    if (!state.activePlayerId) return;
    
    // Check if the current phase requires bot action
    if (!['ANTE', 'DRAW', 'DRAW_1', 'DRAW_2', 'DRAW_3', 'BET_1', 'BET_2', 'BET_3', 'DECLARE', 'DECLARE_AND_BET'].includes(state.phase)) return;

    const botId = state.activePlayerId;
    const bot = state.players.find(p => p.id === botId);
    if (!bot || bot.status !== 'active') return;

    const timer = setTimeout(() => {
      setState(s => {
        const actionResult = mode.botAction(s, botId);
        if (!actionResult) return s;
        
        const { stateUpdates, message, roundOver, nextPlayerId } = actionResult;
        
        let newS = { ...s, ...stateUpdates };
        if (message) {
            newS.messages = [...newS.messages, { id: Math.random().toString(), text: message, time: Date.now() }].slice(-5);
        }

        if (roundOver) {
            setTimeout(advancePhase, 500);
        } else if (nextPlayerId) {
            newS.activePlayerId = nextPlayerId;
        }

        return newS as GameState;
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [state.activePlayerId, state.phase, myId, mode, advancePhase]);

  // Continuous Hand Evaluation for Local Player
  useEffect(() => {
    if (['REVEAL_TOP_ROW', 'DRAW', 'DRAW_1', 'DRAW_2', 'DRAW_3', 'BET_1', 'REVEAL_SECOND_ROW', 'BET_2', 'BET_3', 'REVEAL_FACTOR_CARD', 'DECLARE', 'DECLARE_AND_BET'].includes(state.phase)) {
      setState(s => {
        const myPlayerIndex = s.players.findIndex(p => p.id === myId);
        if (myPlayerIndex === -1 || s.players[myPlayerIndex].status === 'folded') return s;

        const evaluation = mode.evaluateHand(s.players[myPlayerIndex], s.communityCards);
        if (evaluation) {
          const newPlayers = [...s.players];
          newPlayers[myPlayerIndex] = {
            ...newPlayers[myPlayerIndex],
            score: evaluation
          };
          if (JSON.stringify(newPlayers[myPlayerIndex].score) !== JSON.stringify(s.players[myPlayerIndex].score)) {
              return { ...s, players: newPlayers };
          }
        }
        return s;
      });
    }
  }, [state.phase, state.communityCards, state.players.find(p => p.id === myId)?.cards, myId, mode]);

  // Automatic phase transitions
  useEffect(() => {
    const transition = mode.getAutoTransition(state.phase);
    if (transition) {
      const timer = setTimeout(() => {
        setState(s => {
          const result = transition.action(s);
          let newS = { ...s, ...result.stateUpdates };
          if (result.message) {
             newS.messages = [...newS.messages, { id: Math.random().toString(), text: result.message, time: Date.now() }].slice(-5);
          }
          if (result.advancePhase) {
             setTimeout(advancePhase, 2000);
          }
          return newS;
        });
      }, transition.delay);
      return () => clearTimeout(timer);
    }
  }, [state.phase, mode, advancePhase]);

  // Simulating Game Loop for dealing
  useEffect(() => {
    if (state.phase === 'DEAL') {
      setState(s => {
        const freshDeck = createDeck();
        const dealResult = mode.deal(freshDeck, s.players, myId);
        return { ...s, ...dealResult };
      });
      setTimeout(advancePhase, 1500);
    }
  }, [state.phase, myId, mode, advancePhase]);

  const handleAction = useCallback((action: string, payload?: any) => {
    // Chat action
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
                }].slice(-50)
            };
        });
        
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
            status: (p.chips > 0 ? 'active' : 'folded') as 'active' | 'folded' | 'sitting_out',
            declaration: null,
            hasActed: false,
            score: undefined
        }));
        
        const init = createInitialState();
        return {
          ...init,
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
           
           if (nextIdx === firstToActIdx) {
               setTimeout(advancePhase, 500);
               return s;
           } else {
               return { ...s, activePlayerId: s.players[nextIdx].id };
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
            pot: s.pot + 1,
            players: newPlayers,
            messages: [...s.messages, { id: Math.random().toString(), text: "You paid $1 Ante", time: Date.now() }].slice(-5)
        }
      });
      
      setState(s => {
        const allAnted = s.players.filter(p => p.status === 'active').every(p => p.hasActed);
        if (allAnted) {
          setTimeout(advancePhase, 500);
          return s;
        } else {
           const myIndex = s.players.findIndex(p => p.id === myId);
           const nextIdx = getNextActivePlayerIndex(s.players, myIndex);
           return { ...s, activePlayerId: s.players[nextIdx].id };
        }
      });
      return;
    }

    if (action === 'fold') {
      setState(s => ({
        ...s,
        players: s.players.map(p => p.id === myId ? { ...p, status: 'folded', hasActed: true } : p),
        messages: [...s.messages, { id: Math.random().toString(), text: "You folded", time: Date.now() }].slice(-5)
      }));
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
        } : p),
        messages: [...s.messages, { id: Math.random().toString(), text: `You ${callAmount === 0 ? 'checked' : 'called $' + callAmount}`, time: Date.now() }].slice(-5)
      }));
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
        } : p),
        messages: [...s.messages, { id: Math.random().toString(), text: `You raised to $${payload}`, time: Date.now() }].slice(-5)
      }));
      processActionEnd();
    }

    if (action === 'draw') {
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
              newCards.sort((a, b) => {
                const val = (r: string) => r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : parseInt(r, 10);
                return val(b.rank) - val(a.rank);
              });
              return { ...p, cards: newCards, hasActed: true };
            });
            
          return {
              ...s,
              deck: newDeck,
              players: newPlayers,
              messages: [...s.messages, { id: Math.random().toString(), text: `You discarded ${indicesToDiscard.length} cards`, time: Date.now() }].slice(-5)
          }
        });
      } else {
        setState(s => ({
           ...s,
           players: s.players.map(p => p.id === myId ? { ...p, hasActed: true } : p),
           messages: [...s.messages, { id: Math.random().toString(), text: "You stood pat", time: Date.now() }].slice(-5)
        }));
      }
      processActionEnd();
    }

    if (action === 'declare' && payload) {
      const { declaration } = payload;
      if (declaration === 'FOLD') {
        setState(s => ({
          ...s,
          players: s.players.map(p => p.id === myId ? { ...p, status: 'folded', declaration: null, hasActed: true } : p),
          messages: [...s.messages, { id: Math.random().toString(), text: `You declared FOLD`, time: Date.now() }].slice(-5)
        }));
      } else {
        setState(s => ({
          ...s,
          players: s.players.map(p => p.id === myId ? { ...p, declaration, hasActed: true } : p),
          messages: [...s.messages, { id: Math.random().toString(), text: `You declared ${declaration}`, time: Date.now() }].slice(-5)
        }));
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
        
        return { 
            ...s, 
            pot: newPot, 
            currentBet: newCurrentBet, 
            players: newPlayers,
            messages: [...s.messages, { id: Math.random().toString(), text: `You declared ${payload.declaration} and ${payload.action}`, time: Date.now() }].slice(-5)
        };
      });
      
      processActionEnd();
    }

  }, [state.activePlayerId, state.currentBet, state.pot, myId, advancePhase]);

  // Showdown effect
  useEffect(() => {
    if (state.phase === 'SHOWDOWN') {
      const timer = setTimeout(() => {
        setState(s => {
          const result = mode.resolveShowdown(s.players, s.pot, myId);
          
          return { 
            ...s, 
            players: result.players, 
            pot: result.pot,
            messages: [...s.messages, ...result.messages.map(m => ({ id: Math.random().toString(), text: m, time: Date.now() }))].slice(-5)
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
                    status: (p.chips > 0 ? 'active' : p.status) as 'active' | 'folded' | 'sitting_out',
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
                    communityCards: Array.from({ length: 15 }, () => ({ suit: 'hearts', rank: '2', isHidden: true } as CardType)),
                    deck: [],
                    messages: [...s.messages, { id: Math.random().toString(), text: "Starting new hand...", time: Date.now() }].slice(-5)
                };
            });
        }, 8000);
        
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state.phase, myId, mode]);

  return { state, handleAction };
}