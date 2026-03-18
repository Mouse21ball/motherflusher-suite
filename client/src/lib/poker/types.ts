export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface CardType {
  suit: Suit;
  rank: Rank;
  isHidden?: boolean;
}

export type PlayerStatus = 'active' | 'folded' | 'sitting_out';
export type Declaration = 'HIGH' | 'LOW' | 'SWING' | 'FOLD' | 'STAY' | 'BUST' | 'POKER' | 'SUITS' | null;

export interface HandEvaluation {
  description: string;
  usedHoleCardIndices: number[];
  usedCommunityCardIndices: number[];
  isValidBadugi?: boolean;
  badugiRankValues?: number[];
}

export interface Player {
  id: string;
  name: string;
  avatarUrl?: string;
  chips: number;
  bet: number;
  totalBet?: number;
  cards: CardType[];
  status: PlayerStatus;
  isDealer: boolean;
  declaration: Declaration;
  hasActed?: boolean;
  isWinner?: boolean;
  isLoser?: boolean;
  score?: {
    high?: string;
    low?: string;
    highEval?: HandEvaluation;
    lowEval?: HandEvaluation;
    description?: string;
    isValidBadugi?: boolean;
    badugiRankValues?: number[];
    pokerValue?: number;
    suitsScore?: number;
    suitsValid?: boolean;
    swingPokerValue?: number;
    swingSuitsScore?: number;
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
  | 'SHOWDOWN'
  | 'DRAW_1'
  | 'DRAW_2'
  | 'DRAW_3'
  | 'DECLARE'
  | 'BET_3'
  | 'HIT_1'
  | 'HIT_2'
  | 'HIT_3'
  | 'HIT_4'
  | 'HIT_5'
  | 'HIT_6'
  | 'HIT_7'
  | 'HIT_8'
  | 'BET_4'
  | 'BET_5'
  | 'BET_6'
  | 'BET_7'
  | 'BET_8'
  | 'REVEAL_LOWER_CENTER';

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
  messages: { id: string; text: string; time: number; isResolution?: boolean }[];
  chatMessages: ChatMessage[];
  deck: CardType[];
  discardPile: CardType[];
  heroChipChange?: number;
}