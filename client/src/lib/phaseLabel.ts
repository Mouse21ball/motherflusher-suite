import type { GamePhase } from "./poker/types";

const PHASE_LABELS: Record<string, string> = {
  WAITING:             "Ready",
  ANTE:                "Ante",
  DEAL:                "Dealing",
  DRAW:                "Draw",
  DRAW_1:              "Draw — Round 1",
  DRAW_2:              "Draw — Round 2",
  DRAW_3:              "Draw — Final",
  BET_1:               "Betting",
  BET_2:               "Betting",
  BET_3:               "Betting",
  BET_4:               "Betting",
  DECLARE:             "Declaration",
  SHOWDOWN:            "Showdown",
};

export function getPhaseLabel(phase: GamePhase): string {
  return PHASE_LABELS[phase] || phase.replace(/_/g, " ");
}
