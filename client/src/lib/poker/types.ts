export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface CardType {
  suit: Suit;
  rank: Rank;
  isHidden?: boolean;
}

export type PlayerStatus = 'active' | 'folded' | 'sitting_out';
export type Declaration = 'HIGH' | 'LOW' | 'SWING' | null;

export interface Player {
  id: string;
  name: string;
  avatarUrl?: string;
  chips: number;
  bet: number;
  cards: CardType[];
  status: PlayerStatus;
  isDealer: boolean;
  declaration: Declaration;
  score?: {
    high: string;
    low: string;
  };
}

export type GamePhase = 
  | 'WAITING' 
  | 'ANTE' 
  | 'DEAL' 
  | 'DRAW' 
  | 'REVEAL_1' | 'BET_1' 
  | 'REVEAL_2' | 'BET_2'
  | 'REVEAL_3' | 'BET_3'
  | 'DECLARE_AND_BET'
  | 'SHOWDOWN';

export interface GameState {
  tableId: string;
  phase: GamePhase;
  pot: number;
  currentBet: number;
  minBet: number;
  activePlayerId: string | null;
  players: Player[];
  messages: { id: string; text: string; time: number }[];
}