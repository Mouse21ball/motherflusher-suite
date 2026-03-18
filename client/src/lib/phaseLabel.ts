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
  BET_5:               "Betting",
  BET_6:               "Betting",
  BET_7:               "Betting",
  BET_8:               "Betting",
  HIT_1:               "Hit or Stay",
  HIT_2:               "Hit or Stay",
  HIT_3:               "Hit or Stay",
  HIT_4:               "Hit or Stay",
  HIT_5:               "Hit or Stay",
  HIT_6:               "Hit or Stay",
  HIT_7:               "Hit or Stay",
  HIT_8:               "Hit or Stay",
  DECLARE:             "Declaration",
  DECLARE_AND_BET:     "Declare + Bet",
  REVEAL_TOP_ROW:      "Board — Top Row",
  REVEAL_SECOND_ROW:   "Board — Center",
  REVEAL_LOWER_CENTER: "Board — Lower",
  REVEAL_FACTOR_CARD:  "Final Card",
  SHOWDOWN:            "Showdown",
};

export function getPhaseLabel(phase: GamePhase): string {
  return PHASE_LABELS[phase] || phase.replace(/_/g, " ");
}
