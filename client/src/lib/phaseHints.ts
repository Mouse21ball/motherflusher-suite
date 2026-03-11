import { GamePhase } from './poker/types';

const hints: Record<string, Record<string, string>> = {
  swing: {
    DRAW: "Tap cards to select, then discard. Keep cards that help your poker hand or suit total.",
    DECLARE_AND_BET: "High = best poker hand. Low = best suit total. Swing = win both or lose all.",
    BET_1: "The top row is revealed. Bet based on what the board offers your hand.",
    BET_2: "More board cards are visible. Adjust your strategy as paths take shape.",
  },
  badugi: {
    DRAW_1: "Discard duplicate suits or ranks to build toward a valid 4-card Badugi.",
    DRAW_2: "Focus on fixing remaining duplicates. Fewer discards this round.",
    DRAW_3: "Last chance to swap one card. Stand pat if you already have a Badugi.",
    DECLARE: "High = strongest Badugi (K-high). Low = weakest Badugi (A-low). Fold if invalid.",
  },
  dead7: {
    DRAW_1: "Get rid of any 7s first! Then aim all-high (8+) or all-low (6 or under).",
    DRAW_2: "Keep shaping your hand. Same suit = flush potential (scoops the pot).",
    DRAW_3: "Final swap. A flush or 4-suit Badugi can scoop everything.",
    DECLARE: "High = all cards 8+. Low = all cards 6 or under. Dead hand = must fold.",
  },
  fifteen35: {
    HIT_1: "Low = 13-15, High = 33-35. Hit to get closer, or stay to lock in.",
    HIT_2: "Watch your total. Face cards (J/Q/K) are only half a point each.",
    HIT_3: "Getting close? Stay to protect your qualifying range.",
    BET_1: "Bet based on your starting cards and how close you are to a target.",
  },
  suitspoker: {
    DRAW: "Keep cards that fit your best suit or poker hand. Swap the rest.",
    DECLARE_AND_BET: "Poker = best 5-card hand. Suits = highest same-suit total. Swing = win both or nothing.",
    BET_1: "Side A and B flops revealed. See which path fits your hole cards.",
    BET_2: "Center cards connect both paths. Look for straights, flushes, or suit depth.",
  },
};

export function getPhaseHint(modeId: string, phase: GamePhase): string | undefined {
  const modeHints = hints[modeId];
  if (!modeHints) return undefined;

  if (modeHints[phase]) return modeHints[phase];

  if (phase.startsWith('HIT_') && modeHints.HIT_1) {
    const hitNum = parseInt(phase.replace('HIT_', ''), 10);
    if (hitNum <= 3) return modeHints[`HIT_${hitNum}`] || modeHints.HIT_1;
    return undefined;
  }

  return undefined;
}
