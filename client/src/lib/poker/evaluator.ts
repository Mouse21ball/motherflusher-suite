import { CardType, HandEvaluation } from './types';

const rankValues: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

function getCombinations<T>(array: T[], k: number): T[][] {
  if (k === 1) return array.map(a => [a]);
  const combs: T[][] = [];
  array.forEach((current, index) => {
    const smallerCombs = getCombinations(array.slice(index + 1), k - 1);
    smallerCombs.forEach(sc => combs.push([current, ...sc]));
  });
  return combs;
}

export function evaluateBestHand(
  holeCards: CardType[], 
  communityCards: CardType[]
): { high: string; low: string; highEval: HandEvaluation; lowEval: HandEvaluation } | null {
  const visibleHoleIndices = holeCards.map((c, i) => i).filter(i => !holeCards[i].isHidden);
  if (visibleHoleIndices.length < 2) return null;

  // Available top pairs
  const topPairs = [];
  for (let i = 0; i < 5; i++) {
    const c1 = communityCards[i * 2];
    const c2 = communityCards[i * 2 + 1];
    if (c1 && c2 && !c1.isHidden && !c2.isHidden) {
      topPairs.push({ indices: [i * 2, i * 2 + 1], cards: [c1, c2] });
    }
  }

  // Available bottom singles
  const bottomSingles = [];
  for (let i = 10; i < 15; i++) {
    const c = communityCards[i];
    if (c && !c.isHidden) {
      bottomSingles.push({ index: i, card: c });
    }
  }

  if (topPairs.length === 0 || bottomSingles.length === 0) return null;

  const holePairs = getCombinations(visibleHoleIndices, 2);

  let bestHighValue = -1;
  let bestHighStr = "";
  let bestHighIndices: { hole: number[], comm: number[] } = { hole: [], comm: [] };

  let bestLowValue = 9999999;
  let bestLowStr = "";
  let bestLowIndices: { hole: number[], comm: number[] } = { hole: [], comm: [] };

  for (const hp of holePairs) {
    for (const tp of topPairs) {
      for (const bs of bottomSingles) {
        const hCards = [holeCards[hp[0]], holeCards[hp[1]]];
        const cCards = [...tp.cards, bs.card];
        const all5 = [...hCards, ...cCards];
        
        const evaluation = eval5Cards(all5);
        if (evaluation.highValue > bestHighValue) {
          bestHighValue = evaluation.highValue;
          bestHighStr = evaluation.highName;
          bestHighIndices = { hole: hp, comm: [...tp.indices, bs.index] };
        }
        
        if (evaluation.lowValue < bestLowValue) {
          bestLowValue = evaluation.lowValue;
          bestLowStr = evaluation.lowName;
          bestLowIndices = { hole: hp, comm: [...tp.indices, bs.index] };
        }
      }
    }
  }

  return {
    high: bestHighStr,
    low: bestLowValue < 9999999 ? bestLowStr : "No Low",
    highEval: {
      description: bestHighStr,
      usedHoleCardIndices: bestHighIndices.hole,
      usedCommunityCardIndices: bestHighIndices.comm
    },
    lowEval: {
      description: bestLowValue < 9999999 ? bestLowStr : "No Low",
      usedHoleCardIndices: bestLowIndices.hole,
      usedCommunityCardIndices: bestLowIndices.comm
    }
  };
}

function eval5Cards(cards: CardType[]) {
  const ranks = cards.map(c => rankValues[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  
  const isFlush = new Set(suits).size === 1;
  const isStraight = (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) || 
                     (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2);
  
  const rankCounts = ranks.reduce((acc, r) => {
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  
  let highValue = 0;
  let highName = "";
  
  if (isStraight && isFlush) {
    highValue = 8000000 + ranks[0];
    highName = "Straight Flush";
  } else if (counts[0] === 4) {
    highValue = 7000000;
    highName = "Four of a Kind";
  } else if (counts[0] === 3 && counts[1] === 2) {
    highValue = 6000000;
    highName = "Full House";
  } else if (isFlush) {
    highValue = 5000000;
    highName = "Flush";
  } else if (isStraight) {
    highValue = 4000000;
    highName = "Straight";
  } else if (counts[0] === 3) {
    highValue = 3000000;
    highName = "Three of a Kind";
  } else if (counts[0] === 2 && counts[1] === 2) {
    highValue = 2000000;
    highName = "Two Pair";
  } else if (counts[0] === 2) {
    const pairRank = parseInt(Object.keys(rankCounts).find(k => rankCounts[parseInt(k)] === 2) || "0");
    highValue = 1000000 + pairRank * 1000;
    highName = "Pair";
  } else {
    highValue = ranks[0];
    highName = "High Card";
  }

  // Calculate low value (8 or better)
  let lowValue = 9999999;
  let lowName = "No Low";
  const lowRanks = ranks.map(r => r === 14 ? 1 : r); // Ace is low
  const uniqueLowRanks = Array.from(new Set(lowRanks)).sort((a, b) => b - a); // highest to lowest
  if (uniqueLowRanks.length === 5 && uniqueLowRanks[0] <= 8) {
    // Valid low hand
    lowValue = uniqueLowRanks[0] * 10000 + uniqueLowRanks[1] * 1000 + uniqueLowRanks[2] * 100 + uniqueLowRanks[3] * 10 + uniqueLowRanks[4];
    lowName = `${uniqueLowRanks[0]}-Low`;
  }

  return { highValue, highName, lowValue, lowName };
}