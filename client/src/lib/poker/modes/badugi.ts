import { GameMode } from '../engine/types';
import { GameState, Player, CardType, GamePhase, Declaration } from '../types';

const rankValue = (rank: string): number => {
  if (rank === 'A') return 1;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  return parseInt(rank, 10);
};

export const evaluateBadugi = (cards: CardType[]) => {
  if (cards.length !== 4) return undefined;

  const ranks = new Set(cards.map(c => c.rank));
  const suits = new Set(cards.map(c => c.suit));
  
  const isValidBadugi = ranks.size === 4 && suits.size === 4;
  
  let description = "Invalid Badugi";
  if (!isValidBadugi) {
    const dupRank = ranks.size < 4;
    const dupSuit = suits.size < 4;
    if (dupRank && dupSuit) description = "Duplicate Rank & Suit";
    else if (dupRank) description = "Duplicate Rank";
    else if (dupSuit) description = "Duplicate Suit";
  } else {
    const sortedRanks = cards.map(c => rankValue(c.rank)).sort((a, b) => b - a);
    const highestCard = sortedRanks[0];
    const rankNames: Record<number, string> = {
      1: 'A', 11: 'J', 12: 'Q', 13: 'K'
    };
    const highestName = rankNames[highestCard] || highestCard.toString();
    description = `${highestName}-High Badugi`;
  }
  
  return {
    description,
    isValidBadugi,
    badugiRankValues: cards.map(c => rankValue(c.rank)).sort((a, b) => b - a)
  };
};

export const BadugiMode: GameMode = {
  id: 'badugi',
  name: 'Badugi',
  phases: [
    'WAITING', 
    'ANTE', 
    'DEAL', 
    'DRAW_1', 
    'BET_1', 
    'DRAW_2', 
    'BET_2', 
    'DRAW_3', 
    'DECLARE',
    'BET_3',
    'SHOWDOWN'
  ],

  deal: (deck: CardType[], players: Player[], myId: string) => {
    const freshDeck = [...deck];
    const newPlayers = players.map(p => {
      const cards = freshDeck.splice(0, 4).map(c => ({...c, isHidden: p.id !== myId}));
      if (p.id === myId) {
        cards.sort((a, b) => rankValue(b.rank) - rankValue(a.rank));
      }
      return { ...p, cards };
    });
    
    return { players: newPlayers, communityCards: [], deck: freshDeck };
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
    else if (state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3') {
      let maxDraws = 1;
      if (state.phase === 'DRAW_1') maxDraws = 3;
      if (state.phase === 'DRAW_2') maxDraws = 2;
      
      const numDraws = Math.floor(Math.random() * (maxDraws + 1));
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
    else if (state.phase === 'DECLARE') {
       const randDec = ['HIGH', 'LOW', 'FOLD'][Math.floor(Math.random() * 3)] as Declaration;
       
       if (randDec === 'FOLD') {
           newPlayers[bIdx] = { ...bot, status: 'folded', declaration: null, hasActed: true };
           message = `${bot.name} declared FOLD`;
       } else {
           newPlayers[bIdx] = { ...bot, declaration: randDec, hasActed: true };
           message = `${bot.name} declared ${randDec}`;
       }
    }
    else {
      const callAmount = state.currentBet - bot.bet;
      newPlayers[bIdx] = { ...bot, chips: bot.chips - callAmount, bet: state.currentBet, hasActed: true };
      newPot += callAmount;
      message = `${bot.name} ${callAmount === 0 ? 'checked' : 'called $' + callAmount}`;
    }

    const activePlayers = newPlayers.filter(p => p.status === 'active' && p.chips > 0);
    const allActed = activePlayers.every(p => p.hasActed);
    const allBetsMatch = activePlayers.every(p => p.bet === newCurrentBet);
    const isDrawRound = ['DRAW_1', 'DRAW_2', 'DRAW_3'].includes(state.phase);
    const roundOver = (state.phase === 'DECLARE' || isDrawRound) ? allActed : (allActed && allBetsMatch);

    let nextPlayerId = undefined;
    if (!roundOver) {
        let nextIdx = (bIdx + 1) % newPlayers.length;
        let count = 0;
        while (count < newPlayers.length) {
            const p = newPlayers[nextIdx];
            if (p.status === 'active' && p.chips > 0 && (!p.hasActed || (state.phase !== 'DECLARE' && p.bet < newCurrentBet))) {
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

  getAutoTransition: () => null,

  evaluateHand: (player: Player, communityCards: CardType[]) => {
    return evaluateBadugi(player.cards);
  },

  resolveShowdown: (players: Player[], pot: number, myId: string) => {
    const finalPlayers = players.map(p => {
      if (p.id === myId || p.status === 'folded') return p;
      const newCards = p.cards.map((c): CardType => ({...c, isHidden: false}));
      return { ...p, cards: newCards, score: evaluateBadugi(newCards) };
    });

    const myIndex = finalPlayers.findIndex(p => p.id === myId);
    if (myIndex !== -1 && finalPlayers[myIndex].status !== 'folded') {
      finalPlayers[myIndex] = {
        ...finalPlayers[myIndex],
        score: evaluateBadugi(finalPlayers[myIndex].cards)
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

    const highPlayers = activePlayers.filter(p => p.declaration === 'HIGH' && p.score?.isValidBadugi);
    const lowPlayers = activePlayers.filter(p => p.declaration === 'LOW' && p.score?.isValidBadugi);

    let highWinner: Player | null = null;
    let lowWinner: Player | null = null;

    if (highPlayers.length > 0) {
      highPlayers.sort((a, b) => {
        const aVals = a.score!.badugiRankValues!;
        const bVals = b.score!.badugiRankValues!;
        for (let i = 0; i < 4; i++) {
          if (aVals[i] !== bVals[i]) return bVals[i] - aVals[i];
        }
        return 0;
      });
      highWinner = highPlayers[0];
    }

    if (lowPlayers.length > 0) {
      lowPlayers.sort((a, b) => {
        const aVals = a.score!.badugiRankValues!;
        const bVals = b.score!.badugiRankValues!;
        for (let i = 0; i < 4; i++) {
          if (aVals[i] !== bVals[i]) return aVals[i] - bVals[i];
        }
        return 0;
      });
      lowWinner = lowPlayers[0];
    }

    if (!highWinner && !lowWinner) {
      const activeWithValidBadugi = activePlayers.filter(p => p.score?.isValidBadugi);
      if (activeWithValidBadugi.length === 1) {
        const sole = finalPlayers.find(p => p.id === activeWithValidBadugi[0].id)!;
        sole.chips += pot;
        sole.isWinner = true;
        messages.push(`${sole.name} wins $${pot} (only valid badugi)`);
        finalPlayers.forEach(p => { if (p.status !== 'folded' && !p.isWinner) p.isLoser = true; });
        return { players: finalPlayers, pot: 0, messages };
      }
      messages.push(`No qualifying hands. $${pot} rolls over!`);
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
        messages.push(`${p.name} wins HIGH $${highPot} (${p.score?.description || 'Badugi'})`);
      }
    }

    if (lowWinner) {
      const p = finalPlayers.find(p => p.id === lowWinner!.id);
      if (p) {
        p.chips += lowPot;
        p.isWinner = true;
        messages.push(`${p.name} wins LOW $${lowPot} (${p.score?.description || 'Badugi'})`);
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
