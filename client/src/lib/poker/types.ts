export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface CardType {
  suit: Suit;
  rank: Rank;
  isHidden?: boolean;
}

export type PlayerStatus = 'active' | 'folded' | 'sitting_out';
export type Declaration = 'HIGH' | 'LOW' | 'SWING' | null;

export interface HandEvaluation {
  description: string;
  usedHoleCardIndices: number[];
  usedCommunityCardIndices: number[];
  scoreArr?: number[];
}

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
  hasActed?: boolean;
  score?: {
    high: string;
    low: string;
    highEval?: HandEvaluation;
    lowEval?: HandEvaluation;
  };
}

export type GamePhase = 
  | 'WAITING' 
  | 'ANTE' 
  | 'DEAL' 
  | 'REVEAL_TOP_ROW'
  | 'DRAW' 
  | 'BET_1' 
  | 'REVEAL_SECOND_ROW'
  | 'BET_2'
  | 'REVEAL_FACTOR_CARD'
  | 'DECLARE_AND_BET'
  | 'SHOWDOWN';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  time: number;
}

export interface GameState {
  tableId: string;
  phase: GamePhase;
  pot: number;
  currentBet: number;
  minBet: number;
  activePlayerId: string | null;
  players: Player[];
  communityCards: CardType[];
  messages: { id: string; text: string; time: number }[];
  chatMessages: ChatMessage[];
  deck: CardType[];
}