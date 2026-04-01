// ─── Shared Game Types ────────────────────────────────────────────────────────
// Single source of truth for all poker game types.
// Imported by both client and server — no browser APIs, no Node-only APIs.
// Client:  import { ... } from '@shared/gameTypes'
// Server:  import { ... } from '../shared/gameTypes'

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface CardType {
  suit: Suit;
  rank: Rank;
  isHidden?: boolean;
}

export type PlayerStatus = 'active' | 'folded' | 'sitting_out';
export type Declaration = 'HIGH' | 'LOW' | 'SWING' | 'FOLD' | 'STAY' | 'BUST' | 'POKER' | 'SUITS' | null;

// Distinguishes a real human seat from a bot seat.
// 'reserved' = open seat held for a human during the join window; excluded
//              from all game logic until the window expires or the hand starts.
export type PlayerPresence = 'human' | 'bot' | 'reserved';

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
  presence?: PlayerPresence;
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

// Aggregated stats computed from HandRecord history.
export interface PlayerStats {
  handsPlayed: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  biggestWin: number;
  biggestLoss: number;
  currentStreak: number;
  streakType: 'win' | 'loss' | 'none';
  totalChipChange: number;
  byMode: Record<string, { played: number; wins: number; chipChange: number }>;
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

export interface GameMessage {
  id: string;
  text: string;
  time: number;
  isResolution?: boolean;
}

export interface ReactionEvent {
  id: string;
  playerId: string;
  playerName: string;
  emoji: string;
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
  messages: GameMessage[];
  chatMessages: ChatMessage[];
  liveReactions?: ReactionEvent[];
  deck: CardType[];
  discardPile: CardType[];
  heroChipChange?: number;
  spectatorCount?: number;
}

// ─── GameMode interface ───────────────────────────────────────────────────────
// Defines the contract every game mode must implement.
// Lives here so both the client engine and the server authoritative engine
// can import it from a single source — no circular dependencies.

export interface GameMode {
  id: string;
  name: string;
  phases: GamePhase[];

  deal: (
    deck: CardType[],
    players: Player[],
    myId: string
  ) => { players: Player[]; communityCards: CardType[]; deck: CardType[] };

  botAction: (
    state: GameState,
    botId: string
  ) => {
    stateUpdates: Partial<GameState>;
    message?: string;
    roundOver: boolean;
    nextPlayerId?: string;
  } | null;

  getAutoTransition: (phase: GamePhase) => {
    delay: number;
    action: (state: GameState) => { stateUpdates: Partial<GameState>; message?: string; advancePhase: boolean };
  } | null;

  evaluateHand: (player: Player, communityCards: CardType[]) => any;

  resolveShowdown: (
    players: Player[],
    pot: number,
    myId: string,
    communityCards?: CardType[]
  ) => { players: Player[]; pot: number; messages: string[] };

  getNextPhase?: (currentPhase: GamePhase, state: GameState) => GamePhase | null;
  checkAutoStay?: (state: GameState, playerId: string) => boolean;
}
