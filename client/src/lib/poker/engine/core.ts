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
