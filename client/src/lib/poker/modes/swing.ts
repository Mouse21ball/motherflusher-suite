import { GameMode } from '../engine/types';
import { GameState, Player, CardType, GamePhase, Declaration } from '../types';
import { evaluateBestHand } from '../evaluator';
import { getNextActivePlayerIndex } from '../engine/core';

export const SwingPokerMode: GameMode = {
  id: 'swing_poker',
  name: 'Swing Poker',
  phases: [
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
  ],

  deal: (deck: CardType[], players: Player[], myId: string) => {
    const freshDeck = [...deck];
    const newPlayers = players.map(p => {
      // All cards start hidden to the table, but we show them on the client if it's our id
      const cards = freshDeck.splice(0, 5).map(c => ({...c, isHidden: p.id !== myId}));
      if (p.id === myId) {
        cards.sort((a, b) => {
          const val = (r: string) => r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : parseInt(r, 10);
          return val(b.rank) - val(a.rank);
        });
      }
      return { ...p, cards };
    });
    const newCommunityCards = freshDeck.splice(0, 15).map(c => ({...c, isHidden: true}));
    
    return { players: newPlayers, communityCards: newCommunityCards, deck: freshDeck };
  },

  botAction: (state: GameState, botId: string) => {
    let newPlayers = [...state.players];
    let newDeck = [...state.deck];
    let newPot = state.pot;
    let newCurrentBet = state.currentBet;
    let message = '';
    
    const bIdx = newPlayers.findIndex(p => p.id === botId);
    const bot = newPlayers[bIdx];

    if (state.phase === 'ANTE') {
        newPlayers[bIdx] = { ...bot, chips: bot.chips - 1, hasActed: true };
        newPot += 1;
        message = `${bot.name} paid $1 Ante`;
    }
    else if (state.phase === 'DRAW') {
      // Bot draws 0-2 cards
      const numDraws = Math.floor(Math.random() * 3);
      if (numDraws > 0 && newDeck.length >= numDraws) {
        const newCards = [...bot.cards];
        for (let i=0; i<numDraws; i++) {
          newCards[i] = { ...newDeck.shift()!, isHidden: true };
        }
        newPlayers[bIdx] = { ...bot, cards: newCards, hasActed: true };
        message = `${bot.name} discarded ${numDraws} cards`;
      } else {
        newPlayers[bIdx] = { ...bot, hasActed: true };
        message = `${bot.name} stood pat`;
      }
    } 
    else if (state.phase === 'DECLARE_AND_BET') {
       const randDec = ['HIGH', 'LOW', 'SWING'][Math.floor(Math.random() * 3)] as Declaration;
       
       const callAmount = state.currentBet - bot.bet;
       newPlayers[bIdx] = { ...bot, chips: bot.chips - callAmount, bet: state.currentBet, declaration: randDec, hasActed: true };
       newPot += callAmount;
       
       message = `${bot.name} declared ${randDec} and called`;
    }
    else {
      // Betting logic (Check/Call)
      const callAmount = state.currentBet - bot.bet;
      newPlayers[bIdx] = { ...bot, chips: bot.chips - callAmount, bet: state.currentBet, hasActed: true };
      newPot += callAmount;
      message = `${bot.name} ${callAmount === 0 ? 'checked' : 'called $' + callAmount}`;
    }

    const activePlayers = newPlayers.filter(p => p.status === 'active' && p.chips > 0);
    const allActed = activePlayers.every(p => p.hasActed);
    const allBetsMatch = activePlayers.every(p => p.bet === newCurrentBet);
    const roundOver = allActed && allBetsMatch;

    let nextPlayerId = undefined;
    if (!roundOver) {
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
        nextPlayerId = newPlayers[nextIdx].id;
    }

    return {
      stateUpdates: { players: newPlayers, deck: newDeck, pot: newPot, currentBet: newCurrentBet },
      message,
      roundOver,
      nextPlayerId
    };
  },

  getAutoTransition: (phase: GamePhase) => {
    if (phase === 'REVEAL_TOP_ROW') {
      return {
        delay: 1000,
        action: (state: GameState) => ({
          stateUpdates: {
            communityCards: state.communityCards.map((c, i) => i < 10 ? { ...c, isHidden: false } : c)
          },
          message: "Top row (5 pairs) revealed",
          advancePhase: true
        })
      };
    } else if (phase === 'REVEAL_SECOND_ROW') {
      return {
        delay: 1000,
        action: (state: GameState) => ({
          stateUpdates: {
            communityCards: state.communityCards.map((c, i) => (i >= 10 && i !== 12) ? { ...c, isHidden: false } : c)
          },
          message: "Second row revealed (except factor card)",
          advancePhase: true
        })
      };
    } else if (phase === 'REVEAL_FACTOR_CARD') {
      return {
        delay: 1000,
        action: (state: GameState) => ({
          stateUpdates: {
            communityCards: state.communityCards.map((c, i) => i === 12 ? { ...c, isHidden: false } : c)
          },
          message: "Factor card revealed!",
          advancePhase: true
        })
      };
    }
    return null;
  },

  evaluateHand: (player: Player, communityCards: CardType[]) => {
    return evaluateBestHand(player.cards, communityCards);
  },

  resolveShowdown: (players: Player[], pot: number, myId: string) => {
    const finalPlayers = players.map(p => {
      if (p.id === myId || p.status === 'folded') return p;
      const newCards = p.cards.map(c => ({...c, isHidden: false}));

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

    const activePlayers = finalPlayers.filter(p => p.status !== 'folded');
    let messages: string[] = [];

    if (activePlayers.length === 1) {
      const sole = finalPlayers.find(p => p.id === activePlayers[0].id)!;
      sole.chips += pot;
      sole.isWinner = true;
      messages.push(`${sole.name} wins $${pot} (last player standing)`);
      return { players: finalPlayers, pot: 0, messages };
    }

    const highPlayers = activePlayers.filter(p => p.declaration === 'HIGH' || p.declaration === 'SWING');
    const lowPlayers = activePlayers.filter(p => (p.declaration === 'LOW' || p.declaration === 'SWING') && p.score?.low !== 'No Low');

    let highWinner: Player | null = null;
    let lowWinner: Player | null = null;

    if (highPlayers.length > 0) {
      highWinner = highPlayers.reduce((prev, current) =>
         (prev.score?.highEval?.description || "") > (current.score?.highEval?.description || "") ? prev : current
      );
    }

    if (lowPlayers.length > 0) {
      const sortedLows = [...lowPlayers].sort((a, b) => {
        const aVal = a.score?.lowEval?.description || "";
        const bVal = b.score?.lowEval?.description || "";
        return aVal.localeCompare(bVal);
      });
      lowWinner = sortedLows[0];
    }

    if (!highWinner && !lowWinner) {
      messages.push(`No qualifiers. $${pot} rolls over!`);
      return { players: finalPlayers, pot, messages };
    }

    const halfPot = Math.floor(pot / 2);
    let highPot = halfPot;
    let lowPot = halfPot;
    if (pot % 2 !== 0) highPot += 1;

    if (!highWinner) { lowPot += highPot; highPot = 0; }
    if (!lowWinner) { highPot += lowPot; lowPot = 0; }

    if (highWinner) {
      const p = finalPlayers.find(p => p.id === highWinner!.id);
      if (p) {
        p.chips += highPot;
        p.isWinner = true;
        messages.push(`${p.name} wins HIGH $${highPot} (${p.score?.high || 'Best High'})`);
      }
    }

    if (lowWinner) {
      const p = finalPlayers.find(p => p.id === lowWinner!.id);
      if (p) {
        p.chips += lowPot;
        p.isWinner = true;
        messages.push(`${p.name} wins LOW $${lowPot} (${p.score?.low || 'Best Low'})`);
      }
    }

    finalPlayers.forEach(p => {
      if (p.status !== 'folded' && !p.isWinner) {
        p.isLoser = true;
      }
    });

    return { players: finalPlayers, pot: 0, messages };
  }
};