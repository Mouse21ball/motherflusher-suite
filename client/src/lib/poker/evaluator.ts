import { CardType, HandEvaluation } from './types';

const rankToValueHigh = (rank: string): number => {
  if (rank === 'A') return 14;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  return parseInt(rank, 10);
};

const rankToValueLow = (rank: string): number => {
  if (rank === 'A') return 1; // Ace is low
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  return parseInt(rank, 10);
};

export const evaluateHigh = (cards: CardType[]) => {
  const vals = cards.map(c => rankToValueHigh(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  
  const isFlush = suits.every(s => s === suits[0]);
  
  let isStraight = false;
  let straightHigh = 0;
  if (vals[0] === vals[1] + 1 && vals[1] === vals[2] + 1 && vals[2] === vals[3] + 1 && vals[3] === vals[4] + 1) {
    isStraight = true;
    straightHigh = vals[0];
  } else if (vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
    isStraight = true;
    straightHigh = 5; // A-5 straight
  }

  const counts: Record<number, number> = {};
  vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const countPairs = Object.entries(counts).map(([v, c]) => ({ v: Number(v), c })).sort((a, b) => b.c - a.c || b.v - a.v);

  let score: number[] = [];
  let name = "";

  if (isStraight && isFlush) {
    score = [8, straightHigh];
    name = "Straight Flush";
  } else if (countPairs[0].c === 4) {
    score = [7, countPairs[0].v, countPairs[1].v];
    name = "Four of a Kind";
  } else if (countPairs[0].c === 3 && countPairs[1].c === 2) {
    score = [6, countPairs[0].v, countPairs[1].v];
    name = "Full House";
  } else if (isFlush) {
    score = [5, ...vals];
    name = "Flush";
  } else if (isStraight) {
    score = [4, straightHigh];
    name = "Straight";
  } else if (countPairs[0].c === 3) {
    score = [3, countPairs[0].v, countPairs[1].v, countPairs[2].v];
    name = "Three of a Kind";
  } else if (countPairs[0].c === 2 && countPairs[1].c === 2) {
    score = [2, countPairs[0].v, countPairs[1].v, countPairs[2].v];
    name = "Two Pair";
  } else if (countPairs[0].c === 2) {
    score = [1, countPairs[0].v, countPairs[1].v, countPairs[2].v, countPairs[3].v];
    name = "Pair";
  } else {
    score = [0, ...vals];
    name = "High Card";
  }

  return { score, name };
};

export const evaluateLow = (cards: CardType[]) => {
  const vals = cards.map(c => rankToValueLow(c.rank)).sort((a, b) => b - a); // highest down to lowest
  
  const counts: Record<number, number> = {};
  vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const countPairs = Object.entries(counts).map(([v, c]) => ({ v: Number(v), c })).sort((a, b) => b.c - a.c || b.v - a.v);
  
  let pairPenalty = 0;
  if (countPairs[0].c === 4) pairPenalty = 4;
  else if (countPairs[0].c === 3 && countPairs[1].c === 2) pairPenalty = 3.5;
  else if (countPairs[0].c === 3) pairPenalty = 3;
  else if (countPairs[0].c === 2 && countPairs[1].c === 2) pairPenalty = 2;
  else if (countPairs[0].c === 2) pairPenalty = 1;
  
  const finalScore = [pairPenalty, ...countPairs.map(cp => cp.v)];
  
  let name = "";
  if (pairPenalty === 0) {
      name = `${vals[0]}-Low`;
  } else {
      let rankName = countPairs[0].v === 1 ? 'Aces' : countPairs[0].v === 11 ? 'Jacks' : countPairs[0].v === 12 ? 'Queens' : countPairs[0].v === 13 ? 'Kings' : countPairs[0].v + 's';
      name = `Low with ${rankName}`;
  }
  
  return { score: finalScore, name };
};

export const compareHigh = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const valA = a[i] || 0;
    const valB = b[i] || 0;
    if (valA !== valB) return valA - valB;
  }
  return 0;
};

export const compareLow = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const valA = a[i] || 0;
    const valB = b[i] || 0;
    if (valA !== valB) return valB - valA; // lower value is better
  }
  return 0;
};

export interface EvaluatedHand extends HandEvaluation {
    scoreArr: number[];
}

export const getBestHands = (holeCards: CardType[], communityCards: CardType[]) => {
    let bestHighScore: number[] | null = null;
    let bestHighHand: EvaluatedHand | null = null;
    
    let bestLowScore: number[] | null = null;
    let bestLowHand: EvaluatedHand | null = null;

    const holeCombos = [];
    for(let i=0; i<holeCards.length; i++) {
        for(let j=i+1; j<holeCards.length; j++) {
            holeCombos.push([i, j]);
        }
    }
    
    const topRowPairs = [ [0,1], [2,3], [4,5], [6,7], [8,9] ];
    const secondRowSingles = [10, 11, 12, 13, 14];
    
    for (const hc of holeCombos) {
        for (const pair of topRowPairs) {
            for (const single of secondRowSingles) {
                const h1 = holeCards[hc[0]];
                const h2 = holeCards[hc[1]];
                const c1 = communityCards[pair[0]];
                const c2 = communityCards[pair[1]];
                const c3 = communityCards[single];
                
                if (!h1 || !h2 || !c1 || !c2 || !c3) continue;
                
                const cards = [h1, h2, c1, c2, c3];
                
                const highResult = evaluateHigh(cards);
                if (!bestHighScore || compareHigh(highResult.score, bestHighScore) > 0) {
                    bestHighScore = highResult.score;
                    bestHighHand = {
                        description: highResult.name,
                        usedHoleCardIndices: hc,
                        usedCommunityCardIndices: [...pair, single],
                        scoreArr: highResult.score
                    };
                }
                
                const lowResult = evaluateLow(cards);
                if (!bestLowScore || compareLow(lowResult.score, bestLowScore) > 0) {
                    bestLowScore = lowResult.score;
                    bestLowHand = {
                        description: lowResult.name,
                        usedHoleCardIndices: hc,
                        usedCommunityCardIndices: [...pair, single],
                        scoreArr: lowResult.score
                    };
                }
            }
        }
    }
    
    return {
        high: bestHighHand,
        low: bestLowHand
    };
}