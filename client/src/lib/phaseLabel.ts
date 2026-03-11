import type { GamePhase } from "./poker/types";

const PHASE_LABELS: Record<string, string> = {
  WAITING: "Waiting",
  ANTE: "Ante",
  DEAL: "Dealing",
  DRAW: "Draw",
  DRAW_1: "Draw 1 of 3",
  DRAW_2: "Draw 2 of 3",
  DRAW_3: "Draw 3 of 3",
  BET_1: "Betting",
  BET_2: "Betting",
  BET_3: "Final Bet",
  BET_4: "Betting",
  BET_5: "Betting",
  BET_6: "Betting",
  BET_7: "Betting",
  BET_8: "Betting",
  HIT_1: "Hit / Stay",
  HIT_2: "Hit / Stay",
  HIT_3: "Hit / Stay",
  HIT_4: "Hit / Stay",
  HIT_5: "Hit / Stay",
  HIT_6: "Hit / Stay",
  HIT_7: "Hit / Stay",
  HIT_8: "Hit / Stay",
  DECLARE: "Declaration",
  DECLARE_AND_BET: "Declare & Bet",
  REVEAL_TOP_ROW: "Revealing",
  REVEAL_SECOND_ROW: "Revealing",
  REVEAL_LOWER_CENTER: "Revealing",
  REVEAL_FACTOR_CARD: "Final Reveal",
  SHOWDOWN: "Showdown",
};

export function getPhaseLabel(phase: GamePhase): string {
  return PHASE_LABELS[phase] || phase.replace(/_/g, " ");
}
