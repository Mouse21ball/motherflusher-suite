import type { GameMode, GameState, Player } from '../shared/gameTypes';
import type { GenericTable } from './genericEngine';

/** Table plumbing calls these ports; mechanics belong to individual engines. */
export interface ModeEngine {
  mode: GameMode;
  drawCap(phase: string): number | null;
  onPhaseEnter?(state: GameState, addMessage: (state: GameState, text: string) => GameState): GameState;
  canWinUncontested?(player: Player): boolean;
  resolveUncontested?(state: GameState, winner: Player, netPot: number): GameState;
  scheduleBotFill?(key: string, host: BotFillHost): void;
}

export interface BotFillHost {
  getTable(key: string): GenericTable | undefined;
  broadcast(table: GenericTable): void;
  startHand(table: GenericTable): void;
}
