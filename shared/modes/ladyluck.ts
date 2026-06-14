export type LadyLuckRoom = 'pony' | 'thoroughbred' | 'champion';
export type LadyLuckSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export interface LadyLuckPlayer {
  id: string;
  name: string;
  chips: number;
  suit: LadyLuckSuit | null;
  wager: number;
  presence: 'human' | 'bot' | 'open';
  wagered: boolean;
  seatIndex: number;
}

export interface LadyLuckSideBet {
  playerId: string;
  playerName: string;
  suit: LadyLuckSuit;
  amount: number;
}

export interface LadyLuckState {
  phase: 'LOBBY' | 'SELECT' | 'WAGER' | 'RACE' | 'RESULTS' | 'BET';
  players: LadyLuckPlayer[];
  positions: Record<LadyLuckSuit, number>;
  flippedCards: { rank: string; suit: LadyLuckSuit }[];
  currentCard: { rank: string; suit: LadyLuckSuit } | null;
  winner: LadyLuckSuit | null;
  pot: number;
  sideBets: LadyLuckSideBet[];
  roomType: LadyLuckRoom;
  dealerIndex: number;
  currentPickIndex: number;
  claimedSuits: LadyLuckSuit[];
  /** Countdown seconds remaining before auto-start from LOBBY (null when not counting down) */
  startingIn: number | null;
  /** Seconds remaining in RESULTS window (10→0) */
  resultsTimeLeft: number | null;
  /** Seconds remaining in BET window (30→0) */
  betTimeLeft: number | null;
  /** How many spectators are watching this table */
  spectatorCount: number;
}

export const LADY_LUCK_ROOMS: Record<LadyLuckRoom, { minWager: number; maxWager: number; maxSideBet: number }> = {
  pony:         { minWager: 100,  maxWager: 500,   maxSideBet: 200  },
  thoroughbred: { minWager: 500,  maxWager: 2000,  maxSideBet: 1000 },
  champion:     { minWager: 2000, maxWager: 5000,  maxSideBet: 2500 },
};

export const SUITS: LadyLuckSuit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export const SUIT_SYMBOLS: Record<LadyLuckSuit, string> = {
  spades:   '♠',
  hearts:   '♥',
  diamonds: '♦',
  clubs:    '♣',
};

export const SUIT_COLORS: Record<LadyLuckSuit, string> = {
  spades:   '#ffffff',
  hearts:   '#e53935',
  diamonds: '#e53935',
  clubs:    '#ffffff',
};
