import { GameState, Player, CardType, GamePhase } from '../types';

export interface GameMode {
  id: string;
  name: string;
  phases: GamePhase[];
  
  // Deals cards for a new hand
  deal: (deck: CardType[], players: Player[], myId: string) => { players: Player[], communityCards: CardType[], deck: CardType[] };
  
  // Computes the bot's action. 
  // Returns partial state updates, any message to display, and whether the betting round is over.
  botAction: (state: GameState, botId: string) => {
    stateUpdates: Partial<GameState>;
    message?: string;
    roundOver: boolean;
    nextPlayerId?: string;
  } | null;
  
  // Returns any automatic phase transition logic for the current phase (e.g. revealing cards)
  getAutoTransition: (phase: GamePhase) => {
    delay: number;
    action: (state: GameState) => { stateUpdates: Partial<GameState>; message?: string; advancePhase: boolean };
  } | null;

  // Continuously evaluates a player's hand during play
  evaluateHand: (player: Player, communityCards: CardType[]) => any;

  // Resolves the showdown at the end of the hand
  resolveShowdown: (players: Player[], pot: number, myId: string, communityCards?: CardType[]) => {
    players: Player[];
    pot: number;
    messages: string[];
  };

  getNextPhase?: (currentPhase: GamePhase, state: GameState) => GamePhase | null;

  checkAutoStay?: (state: GameState, playerId: string) => boolean;
}