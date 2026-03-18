import { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Player, CardType, Declaration, GamePhase, PlayerStatus } from '../types';
import { createDeck, getNextActivePlayerIndex, getDealerIndex, moveDealer, buildSidePots } from './core';
import { GameMode } from './types';
import { getChips, saveChips, addHandRecord, HandRecord, getPlayerName } from '../../persistence';

export const createMockPlayers = (heroChips: number): Player[] => [
  { id: 'p1', name: getPlayerName() || 'You', chips: heroChips, bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
  { id: 'p2', name: 'Alice', chips: 1000, bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: true, declaration: null, hasActed: false },
  { id: 'p3', name: 'Bob', chips: 1000, bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
  { id: 'p4', name: 'Charlie', chips: 1000, bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
];

export const createInitialState = (heroChips: number = 1000): GameState => ({
  tableId: 't1',
  phase: 'WAITING',
  pot: 0,
  currentBet: 0,
  minBet: 2,
  activePlayerId: 'p1',
  players: createMockPlayers(heroChips),
  communityCards: Array.from({ length: 15 }, () => ({ suit: 'hearts', rank: '2', isHidden: true })),
  messages: [{ id: 'm1', text: 'Game ready. Waiting for start...', time: Date.now() }],
  chatMessages: [],
  deck: [],
  discardPile: []
});

function resolveWithSidePots(
  mode: GameMode,
  players: Player[],
  totalPot: number,
  myId: string,
  communityCards?: CardType[]
): { players: Player[]; pot: number; messages: string[] } {
  const sidePots = buildSidePots(players);

  if (sidePots.length <= 1) {
    return mode.resolveShowdown(players, totalPot, myId, communityCards);
  }

  const totalContributed = players.reduce((sum, p) => sum + (p.totalBet || 0), 0);
  const extra = Math.max(0, totalPot - totalContributed);
  if (extra > 0 && sidePots.length > 0) {
    sidePots[0].amount += extra;
  }

  let currentPlayers = players.map(p => ({ ...p }));
  let allMessages: string[] = [];
  let totalRemainingPot = 0;

  for (let i = 0; i < sidePots.length; i++) {
    const sp = sidePots[i];
    const potLabel = i === 0 ? 'Main pot' : `Side pot`;

    if (sp.eligiblePlayerIds.length === 1) {
      const winnerId = sp.eligiblePlayerIds[0];
      const winner = currentPlayers.find(p => p.id === winnerId);
      if (winner) {
        winner.chips += sp.amount;
        allMessages.push(`${winner.name} receives $${sp.amount} (excess returned)`);
      }
      continue;
    }

    const modifiedPlayers = currentPlayers.map(p => {
      if (sp.eligiblePlayerIds.includes(p.id) || p.status === 'folded') {
        return { ...p };
      }
      return { ...p, status: 'folded' as PlayerStatus };
    });

    const result = mode.resolveShowdown(modifiedPlayers, sp.amount, myId, communityCards);

    for (const rp of result.players) {
      const cp = currentPlayers.find(p => p.id === rp.id);
      if (cp) {
        cp.chips = rp.chips;
        cp.cards = rp.cards;
        cp.score = rp.score || cp.score;
        cp.isWinner = cp.isWinner || rp.isWinner;
        cp.isLoser = rp.isLoser && !cp.isWinner;
      }
    }

    totalRemainingPot += result.pot;

    for (const m of result.messages) {
      allMessages.push(sidePots.length > 1 ? `[${potLabel}] ${m}` : m);
    }
  }

  return { players: currentPlayers, pot: totalRemainingPot, messages: allMessages };
}

export function useGameEngine(mode: GameMode, myId: string = 'p1') {
  const savedChips = getChips(mode.id);
  const [state, setState] = useState<GameState>(() => createInitialState(savedChips));
  const chipsBeforeHandRef = useRef<number>(savedChips);
  const mountedRef = useRef(true);
  const pendingTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const advancingFromPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingTimers.current.forEach(t => clearTimeout(t));
      pendingTimers.current.clear();
    };
  }, []);

  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      pendingTimers.current.delete(id);
      if (mountedRef.current) fn();
    }, ms);
    pendingTimers.current.add(id);
    return id;
  }, []);

  const addMessage = useCallback((text: string) => {
    setState(s => ({
      ...s,
      messages: [...s.messages, { id: Math.random().toString(), text, time: Date.now() }].slice(-5)
    }));
  }, []);

  const advancePhase = useCallback(() => {
    setState(s => {
      if (s.phase === 'SHOWDOWN') return s;
      if (advancingFromPhaseRef.current === s.phase) return s;
      advancingFromPhaseRef.current = s.phase;

      const overridePhase = mode.getNextPhase?.(s.phase, s);
      const currentPhaseIndex = mode.phases.indexOf(s.phase);
      const nextPhaseIndex = (currentPhaseIndex + 1) % mode.phases.length;
      const nextPhase = overridePhase ?? mode.phases[nextPhaseIndex];
      
      const isBetRound = nextPhase.startsWith('BET') || nextPhase === 'DECLARE_AND_BET';
      const isDrawRound = nextPhase.startsWith('DRAW');
      const isHitRound = nextPhase.startsWith('HIT_');
      const isDeclareRound = nextPhase === 'DECLARE' || nextPhase === 'DECLARE_AND_BET';
      const skipAllIn = !isDeclareRound && !isDrawRound && !isHitRound;
      
      const dealerIdx = getDealerIndex(s.players);
      const firstToActIdx = getNextActivePlayerIndex(s.players, dealerIdx, skipAllIn);
      
      return { 
        ...s, 
        phase: nextPhase, 
        currentBet: 0, 
        activePlayerId: s.players[firstToActIdx].id,
        players: s.players.map(p => ({
          ...p,
          hasActed: false,
          bet: (isBetRound || isDrawRound || isHitRound) ? 0 : p.bet
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
    if (!['ANTE', 'DRAW', 'DRAW_1', 'DRAW_2', 'DRAW_3', 'BET_1', 'BET_2', 'BET_3', 'BET_4', 'BET_5', 'BET_6', 'BET_7', 'BET_8', 'DECLARE', 'DECLARE_AND_BET', 'HIT_1', 'HIT_2', 'HIT_3', 'HIT_4', 'HIT_5', 'HIT_6', 'HIT_7', 'HIT_8', 'REVEAL_LOWER_CENTER'].includes(state.phase)) return;

    const botId = state.activePlayerId;
    const bot = state.players.find(p => p.id === botId);
    if (!bot || bot.status !== 'active') {
      if (bot && bot.status !== 'active') {
        const timer = setTimeout(() => {
          setState(s => {
            const curIdx = s.players.findIndex(p => p.id === botId);
            if (curIdx === -1) return s;
            const isHitPhase = s.phase.startsWith('HIT_');
            const isDeclarePhase = s.phase === 'DECLARE' || s.phase === 'DECLARE_AND_BET';
            const isDrawPhase = s.phase.startsWith('DRAW');
            const skipAllIn = !isDeclarePhase && !isDrawPhase && !isHitPhase;
            const nextIdx = getNextActivePlayerIndex(s.players, curIdx, skipAllIn);
            const nextPlayer = s.players[nextIdx];
            if (!nextPlayer || nextPlayer.status !== 'active' || nextPlayer.id === botId) {
              safeTimeout(advancePhase, 500);
              return s;
            }
            return { ...s, activePlayerId: nextPlayer.id };
          });
        }, 100);
        return () => clearTimeout(timer);
      }
      return;
    }

    // Betting phases get more "think" time — builds pressure at the table
    const thinkMs = (state.phase.startsWith('BET') || state.phase === 'DECLARE_AND_BET')
      ? 1200 + Math.random() * 600   // 1200–1800ms during betting
      : 700 + Math.random() * 400;   // 700–1100ms during ante/draw/declare

    const timer = setTimeout(() => {
      setState(s => {
        const actionResult = mode.botAction(s, botId);
        if (!actionResult) return s;
        
        const { stateUpdates, message, roundOver, nextPlayerId } = actionResult;
        
        let newS = { ...s, ...stateUpdates };

        if (stateUpdates.players) {
          newS.players = newS.players.map(p => {
            const oldP = s.players.find(op => op.id === p.id);
            if (!oldP) return p;
            const prevTotalBet = oldP.totalBet || 0;
            const chipLoss = Math.max(0, oldP.chips - p.chips);
            return { ...p, totalBet: prevTotalBet + chipLoss };
          });
        }

        if (message) {
            newS.messages = [...newS.messages, { id: Math.random().toString(), text: message, time: Date.now() }].slice(-5);
        }

        if (roundOver) {
            // Raises get a longer hold before the phase advances — the bet needs to land
            const wasRaise = (stateUpdates.currentBet ?? s.currentBet) > (s.currentBet ?? 0);
            safeTimeout(advancePhase, wasRaise ? 750 : 500);
        } else if (nextPlayerId) {
            newS.activePlayerId = nextPlayerId;
        }

        return newS as GameState;
      });
    }, Math.round(thinkMs));

    return () => clearTimeout(timer);
  }, [state.activePlayerId, state.phase, myId, mode, advancePhase]);

  // Continuous Hand Evaluation for Local Player
  useEffect(() => {
    if (['REVEAL_TOP_ROW', 'DRAW', 'DRAW_1', 'DRAW_2', 'DRAW_3', 'BET_1', 'REVEAL_SECOND_ROW', 'BET_2', 'BET_3', 'BET_4', 'BET_5', 'BET_6', 'BET_7', 'BET_8', 'REVEAL_FACTOR_CARD', 'REVEAL_LOWER_CENTER', 'DECLARE', 'DECLARE_AND_BET', 'HIT_1', 'HIT_2', 'HIT_3', 'HIT_4', 'HIT_5', 'HIT_6', 'HIT_7', 'HIT_8'].includes(state.phase)) {
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

  useEffect(() => {
    if (state.phase.startsWith('HIT_') || state.phase.startsWith('BET_')) {
      const overridePhase = mode.getNextPhase?.(state.phase, state);
      if (overridePhase) {
        const timer = safeTimeout(() => advancePhase(), 500);
        return () => clearTimeout(timer);
      }
    }
  }, [state.phase, mode, advancePhase, safeTimeout]);

  useEffect(() => {
    if (!state.phase.startsWith('HIT_')) return;
    if (state.activePlayerId !== myId) return;
    const me = state.players.find(p => p.id === myId);
    if (!me || me.hasActed) return;
    if (me.declaration === 'STAY' || me.declaration === 'BUST') {
      const timer = safeTimeout(() => {
        setState(s => {
          const p = s.players.find(p => p.id === myId);
          if (!p || p.hasActed) return s;
          return {
            ...s,
            players: s.players.map(p => p.id === myId ? { ...p, hasActed: true } : p),
            messages: [...s.messages, { id: Math.random().toString(), text: me.declaration === 'STAY' ? "You stayed" : "You busted", time: Date.now() }].slice(-5)
          };
        });
        setState(s => {
          const activePlayers = s.players.filter(p => p.status === 'active');
          if (activePlayers.length <= 1) {
            safeTimeout(advancePhase, 500);
            return s;
          }
          const overridePhase = mode.getNextPhase?.(s.phase, s);
          if (overridePhase) {
            safeTimeout(advancePhase, 500);
            return s;
          }
          const allActed = activePlayers.every(p => p.hasActed);
          if (allActed) {
            safeTimeout(advancePhase, 500);
            return s;
          }
          const myIndex = s.players.findIndex(p => p.id === myId);
          const nextIdx = getNextActivePlayerIndex(s.players, myIndex, false);
          return { ...s, activePlayerId: s.players[nextIdx].id };
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.activePlayerId, myId, mode, advancePhase, safeTimeout]);

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
             safeTimeout(advancePhase, 2000);
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
        return { ...s, ...dealResult, discardPile: [] };
      });
      safeTimeout(advancePhase, 1500);
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
             safeTimeout(() => {
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

    if (action === 'rebuy') {
      setState(s => {
        const me = s.players.find(p => p.id === myId);
        if (!me || me.chips > 0) return s;
        saveChips(mode.id, 1000);
        return {
          ...s,
          players: s.players.map(p => p.id === myId ? { ...p, chips: 1000, status: 'active' as PlayerStatus } : p),
          messages: [...s.messages, { id: Math.random().toString(), text: 'You rebought for $1000', time: Date.now() }].slice(-5)
        };
      });
      return;
    }

    if (action === 'restart') {
      setState(s => {
        if (s.phase !== 'SHOWDOWN') return s;
        const isRollover = s.pot > 0;
        const basePlayers = isRollover ? s.players : moveDealer(s.players);
        const nextPlayers = basePlayers.map(p => {
            const isBotBusted = p.id !== myId && p.chips === 0;
            const newChips = isBotBusted ? 1000 : p.chips;
            return {
                ...p,
                cards: [],
                bet: 0,
                totalBet: 0,
                chips: newChips,
                status: isRollover
                    ? (p.status === 'active' && newChips > 0 ? 'active' : 'sitting_out') as PlayerStatus
                    : (newChips > 0 ? 'active' : 'sitting_out') as PlayerStatus,
                declaration: null,
                hasActed: false,
                isWinner: undefined,
                isLoser: undefined,
                score: undefined
            };
        });

        const dealerIdx = getDealerIndex(nextPlayers);
        const firstToActIdx = getNextActivePlayerIndex(nextPlayers, dealerIdx);
        const rolloverMsg = isRollover
            ? `Rollover hand — $${s.pot} carries over.`
            : 'New hand started.';

        return {
          ...s,
          phase: 'ANTE' as GamePhase,
          currentBet: 0,
          heroChipChange: undefined,
          activePlayerId: nextPlayers[firstToActIdx].id,
          players: nextPlayers,
          communityCards: Array.from({ length: 15 }, () => ({ suit: 'hearts', rank: '2', isHidden: true } as CardType)),
          deck: [],
          discardPile: [],
          messages: [{ id: Math.random().toString(), text: rolloverMsg, time: Date.now() }]
        };
      });
      return;
    }

    if (state.activePlayerId !== myId) return;

    if (action === 'start') {
      advancePhase();
      return;
    }

    const processActionEnd = (advanceDelay = 500) => {
       setState(s => {
           const isBetPhase = s.phase.startsWith('BET') || s.phase === 'DECLARE_AND_BET';
           const isDeclarePhase = s.phase === 'DECLARE' || s.phase === 'DECLARE_AND_BET';
           const isDrawPhase = s.phase.startsWith('DRAW');
           const isHitPhase = s.phase.startsWith('HIT_');
           const skipAllIn = !isDeclarePhase && !isDrawPhase && !isHitPhase;
           
           const activePlayers = skipAllIn
             ? s.players.filter(p => p.status === 'active' && p.chips > 0)
             : s.players.filter(p => p.status === 'active');
           
           if (activePlayers.length <= 1) {
               safeTimeout(advancePhase, 500);
               return s;
           }

           if (s.phase.startsWith('HIT_')) {
               const overridePhase = mode.getNextPhase?.(s.phase, s);
               if (overridePhase) {
                   safeTimeout(advancePhase, 500);
                   return s;
               }
           }

           const allActed = activePlayers.every(p => p.hasActed);
           const allBetsMatch = activePlayers.every(p => p.bet === s.currentBet || p.chips === 0);
           const roundDone = isBetPhase ? (allActed && allBetsMatch) : allActed;

           if (roundDone) {
               safeTimeout(advancePhase, advanceDelay);
               return s;
           }

           const myIndex = s.players.findIndex(p => p.id === myId);
           const nextIdx = getNextActivePlayerIndex(s.players, myIndex, skipAllIn);
           return { ...s, activePlayerId: s.players[nextIdx].id };
       });
    };

    if (action === 'ante') {
      setState(s => {
        const newPlayers = s.players.map(p => {
          if (p.id === myId) return { ...p, chips: p.chips - 1, hasActed: true, totalBet: (p.totalBet || 0) + 1 };
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
          safeTimeout(advancePhase, 500);
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
      setState(s => {
        const me = s.players.find(p => p.id === myId);
        const rawCall = s.currentBet - (me?.bet || 0);
        const callAmount = Math.min(rawCall, me?.chips || 0);
        return {
          ...s,
          pot: s.pot + callAmount,
          players: s.players.map(p => p.id === myId ? { 
            ...p, 
            chips: p.chips - callAmount,
            bet: (me?.bet || 0) + callAmount,
            hasActed: true,
            totalBet: (p.totalBet || 0) + callAmount
          } : p),
          messages: [...s.messages, { id: Math.random().toString(), text: `You ${callAmount === 0 ? 'checked' : 'called $' + callAmount}`, time: Date.now() }].slice(-5)
        };
      });
      processActionEnd();
    }

    if (action === 'raise' && typeof payload === 'number') {
      setState(s => {
        const me = s.players.find(p => p.id === myId);
        const prevBet = me?.bet || 0;
        const increment = Math.min(payload - prevBet, me?.chips || 0);
        return {
          ...s,
          currentBet: payload,
          pot: s.pot + increment,
          players: s.players.map(p => p.id === myId ? { 
            ...p, 
            chips: p.chips - increment,
            bet: prevBet + increment,
            hasActed: true,
            totalBet: (p.totalBet || 0) + increment
          } : p),
          messages: [...s.messages, { id: Math.random().toString(), text: `You raised to $${prevBet + increment}`, time: Date.now() }].slice(-5)
        };
      });
      // Raise gets more weight before the phase moves on
      processActionEnd(700);
    }

    if (action === 'draw') {
      const indicesToDiscard: number[] = payload || [];
      
      if (indicesToDiscard.length > 0) {
        setState(s => {
          let newDeck = [...s.deck];
          const newDiscard = [...(s.discardPile || [])];
          const newPlayers = s.players.map(p => {
              if (p.id !== myId) return p;
              const newCards = [...p.cards];
              indicesToDiscard.forEach(idx => {
                newDiscard.push(newCards[idx]);
                if (newDeck.length === 0 && newDiscard.length > 0) {
                  const reshuffled = [...newDiscard];
                  newDiscard.length = 0;
                  for (let i = reshuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]];
                  }
                  newDeck = reshuffled;
                }
                newCards[idx] = { ...newDeck.shift()!, isHidden: false };
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
              discardPile: newDiscard,
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

    if (action === 'hit') {
      setState(s => {
        const newDeck = [...s.deck];
        const newDiscard = [...(s.discardPile || [])];
        if (newDeck.length === 0 && newDiscard.length > 0) {
          newDeck.push(...newDiscard.sort(() => Math.random() - 0.5));
          newDiscard.length = 0;
        }
        const newPlayers = s.players.map(p => {
          if (p.id !== myId) return p;
          const hitCard = newDeck.shift();
          if (!hitCard) return { ...p, hasActed: true };
          const newCards = [...p.cards, { ...hitCard, isHidden: false }];
          const eval_ = mode.evaluateHand({ ...p, cards: newCards }, s.communityCards);
          const isBust = eval_?.description?.startsWith('BUST');
          return {
            ...p,
            cards: newCards,
            hasActed: true,
            score: eval_,
            ...(isBust ? { declaration: 'BUST' as Declaration, status: 'folded' as const } : {})
          };
        });
        const me = newPlayers.find(p => p.id === myId);
        let bustMsg = me?.declaration === 'BUST' ? "You busted!" : "You hit";

        if (me && me.status === 'active' && !me.declaration) {
          const tempState = { ...s, players: newPlayers, deck: newDeck };
          if (mode.checkAutoStay?.(tempState, myId)) {
            const meIdx = newPlayers.findIndex(p => p.id === myId);
            newPlayers[meIdx] = { ...newPlayers[meIdx], declaration: 'STAY' as Declaration };
            bustMsg = "You hit and auto-stayed!";
          }
        }

        return {
          ...s,
          deck: newDeck,
          discardPile: newDiscard,
          players: newPlayers,
          messages: [...s.messages, { id: Math.random().toString(), text: bustMsg, time: Date.now() }].slice(-5)
        };
      });
      processActionEnd();
    }

    if (action === 'stay') {
      setState(s => ({
        ...s,
        players: s.players.map(p => p.id === myId ? { ...p, declaration: 'STAY' as Declaration, hasActed: true } : p),
        messages: [...s.messages, { id: Math.random().toString(), text: "You stayed", time: Date.now() }].slice(-5)
      }));
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
          let chipDelta = 0;
          
          if (betAction === 'fold') {
            pStatus = 'folded';
          } else if (betAction === 'call' || betAction === 'check') {
            const callAmount = Math.min(s.currentBet - p.bet, p.chips);
            chipDelta = callAmount;
            pChips -= callAmount;
            pBet = p.bet + callAmount;
            newPot += callAmount;
          } else if (betAction === 'raise' && amount) {
            const increment = Math.min(amount - p.bet, p.chips);
            chipDelta = increment;
            pChips -= increment;
            pBet = p.bet + increment;
            newPot += increment;
            newCurrentBet = pBet;
          }
          
          return { ...p, status: pStatus, chips: pChips, bet: pBet, declaration, hasActed: true, totalBet: (p.totalBet || 0) + chipDelta };
        });
        
        return { 
            ...s, 
            pot: newPot, 
            currentBet: newCurrentBet, 
            players: newPlayers,
            messages: [...s.messages, { id: Math.random().toString(), text: `You declared ${payload.declaration} and ${payload.action}`, time: Date.now() }].slice(-5)
        };
      });
      
      // Raises in declare_and_bet also hold slightly longer
      processActionEnd(payload.action === 'raise' ? 700 : 500);
    }

  }, [state.activePlayerId, state.currentBet, state.pot, myId, advancePhase]);

  useEffect(() => {
    advancingFromPhaseRef.current = null;
    if (state.phase === 'ANTE') {
      const me = state.players.find(p => p.id === myId);
      if (me) chipsBeforeHandRef.current = me.chips;
    }
  }, [state.phase, myId]);

  useEffect(() => {
    if (state.phase === 'SHOWDOWN') {
      // Longer pre-resolution pause — give the table a beat before cards flip
      const timer = setTimeout(() => {
        setState(s => {
          try {
            const activePlayers = s.players.filter(p => p.status !== 'folded' && p.status !== 'sitting_out');
            const contribs = activePlayers.map(p => p.totalBet || 0);
            const uniqueContribs = new Set(contribs);
            const needsSidePots = activePlayers.length > 1 && uniqueContribs.size > 1;

            const result = needsSidePots
              ? resolveWithSidePots(mode, s.players, s.pot, myId, s.communityCards)
              : mode.resolveShowdown(s.players, s.pot, myId, s.communityCards);

            const potAwarded = result.pot === 0;
            const resolvedMessages = potAwarded
              ? result.messages.filter(m => !/rolls?\s*over/i.test(m))
              : result.messages;
            if (!potAwarded && resolvedMessages.length === 0) {
              resolvedMessages.push(`No qualifying hands. $${result.pot} rolls over!`);
            }

            const me = result.players.find(p => p.id === myId);
            const chipsBefore = chipsBeforeHandRef.current;
            const chipChange = me ? me.chips - chipsBefore : 0;

            if (me) {
              saveChips(mode.id, me.chips);

              const isRollover = result.pot > 0;
              const heroFolded = me.status === 'folded';

              let resultType: HandRecord['result'];
              if (isRollover) resultType = 'rollover';
              else if (heroFolded) resultType = 'folded';
              else if (chipChange > 0) resultType = 'win';
              else if (chipChange < 0) resultType = 'loss';
              else resultType = 'push';

              const summary = resolvedMessages.join(' · ') || (isRollover ? `$${result.pot} rolls over` : 'Hand complete');

              addHandRecord({
                id: Math.random().toString(36).slice(2),
                mode: mode.id,
                modeName: mode.name,
                timestamp: Date.now(),
                potSize: s.pot,
                chipsBefore,
                chipsAfter: me.chips,
                chipChange,
                result: resultType,
                summary,
                isRollover,
              });
            }
            
            return { 
              ...s, 
              players: result.players, 
              pot: result.pot,
              heroChipChange: chipChange,
              messages: [...s.messages, ...resolvedMessages.map(m => ({ id: Math.random().toString(), text: m, time: Date.now(), isResolution: true }))].slice(-10)
            };
          } catch (err) {
            console.error('[SHOWDOWN] Resolution error:', err);
            return {
              ...s,
              heroChipChange: 0,
              messages: [...s.messages, { id: Math.random().toString(), text: 'Hand complete.', time: Date.now(), isResolution: true }].slice(-10)
            };
          }
        });
        
        safeTimeout(() => {
            setState(s => {
                if (s.phase !== 'SHOWDOWN') return s;

                const isRollover = s.pot > 0;
                const basePlayers = isRollover ? s.players : moveDealer(s.players);
                const nextPlayers = basePlayers.map(p => {
                    const isBotBusted = p.id !== myId && p.chips === 0;
                    const newChips = isBotBusted ? 1000 : p.chips;
                    return {
                        ...p, 
                        cards: [], 
                        bet: 0, 
                        totalBet: 0,
                        chips: newChips,
                        hasActed: false, 
                        declaration: null, 
                        isWinner: undefined,
                        isLoser: undefined,
                        status: isRollover
                            ? (p.status === 'active' && newChips > 0 ? 'active' : 'sitting_out') as PlayerStatus
                            : (newChips > 0 ? 'active' : 'sitting_out') as PlayerStatus,
                        score: undefined
                    };
                });

                const activePlayers = nextPlayers.filter(p => p.status === 'active');
                if (isRollover && activePlayers.length <= 1) {
                    if (activePlayers.length === 1) {
                        const winIdx = nextPlayers.findIndex(p => p.id === activePlayers[0].id);
                        const winnerChips = nextPlayers[winIdx].chips + s.pot;
                        nextPlayers[winIdx] = { ...nextPlayers[winIdx], chips: winnerChips };
                        if (nextPlayers[winIdx].id === myId) saveChips(mode.id, winnerChips);
                        const allBack = moveDealer(nextPlayers).map(p => {
                            const isBotBusted = p.id !== myId && p.chips === 0;
                            const newChips = isBotBusted ? 1000 : p.chips;
                            return {
                                ...p,
                                chips: newChips,
                                totalBet: 0,
                                status: (newChips > 0 ? 'active' : 'sitting_out') as PlayerStatus
                            };
                        });
                        return {
                            ...s,
                            phase: 'ANTE' as GamePhase,
                            currentBet: 0,
                            pot: 0,
                            heroChipChange: undefined,
                            activePlayerId: allBack[getNextActivePlayerIndex(allBack, getDealerIndex(allBack))].id,
                            players: allBack,
                            communityCards: Array.from({ length: 15 }, () => ({ suit: 'hearts', rank: '2', isHidden: true } as CardType)),
                            deck: [],
                            discardPile: [],
                            messages: [{ id: Math.random().toString(), text: `${nextPlayers[winIdx].name} wins rollover pot $${s.pot}. All players rejoin.`, time: Date.now() }]
                        };
                    }
                }

                const dealerIdx = getDealerIndex(nextPlayers);
                const firstToActIdx = getNextActivePlayerIndex(nextPlayers, dealerIdx);

                const rolloverMsg = isRollover
                    ? `Rollover hand — $${s.pot} carries over. ${nextPlayers.filter(p => p.status === 'sitting_out').map(p => p.name).join(', ')} sitting out.`
                    : "Starting new hand...";
                
                return {
                    ...s,
                    phase: 'ANTE' as GamePhase,
                    currentBet: 0,
                    heroChipChange: undefined,
                    activePlayerId: nextPlayers[firstToActIdx].id,
                    players: nextPlayers,
                    communityCards: Array.from({ length: 15 }, () => ({ suit: 'hearts', rank: '2', isHidden: true } as CardType)),
                    deck: [],
                    discardPile: [],
                    messages: [{ id: Math.random().toString(), text: rolloverMsg, time: Date.now() }]
                };
            });
        }, 5000);
        
      // 900ms pre-resolution: table breathes before cards flip
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [state.phase, myId, mode]);

  return { state, handleAction };
}