import { Player, CardType, GameState } from '../types';

// Mock Deck Generator
export const createDeck = (): CardType[] => {
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

// Helper: Get player index immediately left of the given index, wrapping around
// skipAllIn: true during betting (all-in can't bet), false during declare/draw (all-in must still act)
export const getNextActivePlayerIndex = (players: Player[], currentIndex: number, skipAllIn: boolean = true): number => {
  let nextIdx = (currentIndex + 1) % players.length;
  let count = 0;
  while (count < players.length) {
    const p = players[nextIdx];
    if (p.status === 'active') {
      if (!skipAllIn || p.chips > 0) break;
    }
    nextIdx = (nextIdx + 1) % players.length;
    count++;
  }
  return nextIdx;
};

// Find the index of the dealer
export const getDealerIndex = (players: Player[]): number => {
  const idx = players.findIndex(p => p.isDealer);
  return idx === -1 ? 0 : idx;
};

// Move dealer button to the next active player
export const moveDealer = (players: Player[]): Player[] => {
  const currentDealerIdx = getDealerIndex(players);
  const nextDealerIdx = getNextActivePlayerIndex(players, currentDealerIdx);
  
  return players.map((p, i) => ({
    ...p,
    isDealer: i === nextDealerIdx
  }));
};

// Evaluate if the betting round is over
export const isRoundOver = (players: Player[], currentBet: number): boolean => {
  const activePlayers = players.filter(p => p.status === 'active' && p.chips > 0);
  const allActed = activePlayers.every(p => p.hasActed);
  const allBetsMatch = activePlayers.every(p => p.bet === currentBet);
  return allActed && allBetsMatch;
};

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

export function buildSidePots(players: Player[]): SidePot[] {
  const activePlayers = players.filter(p => p.status !== 'folded' && p.status !== 'sitting_out');

  if (activePlayers.length <= 1) {
    const totalPot = players.reduce((sum, p) => sum + (p.totalBet || 0), 0);
    if (totalPot > 0 && activePlayers.length === 1) {
      return [{ amount: totalPot, eligiblePlayerIds: [activePlayers[0].id] }];
    }
    return [];
  }

  const activeContribs = activePlayers.map(p => p.totalBet || 0).filter(c => c > 0);
  const uniqueLevels = Array.from(new Set(activeContribs)).sort((a, b) => a - b);

  if (uniqueLevels.length === 0) return [];

  if (uniqueLevels.length === 1) {
    const totalPot = players.reduce((sum, p) => sum + (p.totalBet || 0), 0);
    return [{ amount: totalPot, eligiblePlayerIds: activePlayers.map(p => p.id) }];
  }

  const pots: SidePot[] = [];
  let previousLevel = 0;

  for (const level of uniqueLevels) {
    const layerSize = level - previousLevel;
    if (layerSize <= 0) continue;

    let potAmount = 0;
    for (const p of players) {
      const contrib = p.totalBet || 0;
      potAmount += Math.min(Math.max(contrib - previousLevel, 0), layerSize);
    }

    const eligible = activePlayers.filter(p => (p.totalBet || 0) >= level);

    pots.push({
      amount: potAmount,
      eligiblePlayerIds: eligible.map(p => p.id),
    });

    previousLevel = level;
  }

  return pots;
}
