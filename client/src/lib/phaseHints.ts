import { GamePhase } from './poker/types';

const hints: Record<string, Record<string, string>> = {
  swing: {
    DRAW: "Discard up to 2. Shape your poker hand or suit run.",
    DECLARE_AND_BET: "High = poker. Low = suit total. Swing = win both or lose all.",
    BET_1: "Top row out. Bet what you see.",
    BET_2: "Paths taking shape. Adjust.",
  },
  badugi: {
    DRAW_1: "Discard duplicate suits or ranks. Want all 4 unique.",
    DRAW_2: "Fix remaining duplicates. Max 2 this round.",
    DRAW_3: "Last swap. Stand pat if you have a Badugi.",
    DECLARE: "High = K-high Badugi. Low = A-low. No hand = Fold.",
  },
  dead7: {
    DRAW_1: "7s are dead — ditch them first. Then aim high or low.",
    DRAW_2: "Same suit cards = flush potential (scoops pot).",
    DRAW_3: "Final swap. Flush or all-different suits scoops.",
    DECLARE: "High = all cards 8+. Low = all 6 or under.",
  },
  fifteen35: {
    HIT_1: "Low = 13–15. High = 33–35. Hit or lock in.",
    HIT_2: "J/Q/K = ½ pt. Stay if you're in range.",
    HIT_3: "Getting close? Stay to protect your range.",
    BET_1: "Bet your hand strength.",
  },
  suitspoker: {
    DRAW: "Keep your best suit group or poker cards. Swap up to 2.",
    DECLARE_AND_BET: "Poker = best hand. Suits = highest flush total. Swing = both.",
    BET_1: "A and B revealed. Which path fits?",
    BET_2: "Center connects both paths. Look for depth.",
  },
};

interface SimpleCard { rank: string; suit: string; isHidden?: boolean; }

export function getSwingHandHint(holeCards: SimpleCard[]): string {
  const visible = holeCards.filter(c => !c.isHidden);
  if (visible.length === 0) return "Read the board — choose your path";

  const suitGroups: Record<string, number> = {};
  for (const c of visible) suitGroups[c.suit] = (suitGroups[c.suit] || 0) + 1;
  const maxSuit = Math.max(...Object.values(suitGroups));

  const rankVal = (r: string) =>
    r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : parseInt(r, 10);
  const sorted = visible.map(c => rankVal(c.rank)).sort((a, b) => b - a);
  const isPair = sorted.some((v, i) => sorted[i + 1] === v);
  const highAvg = sorted.slice(0, 3).reduce((s, v) => s + v, 0) / Math.min(3, sorted.length);

  if (maxSuit >= 5) return "Flush dealt. Go LOW.";
  if (maxSuit >= 4 && highAvg >= 11) return "Suited and heavy. SWING's live.";
  if (maxSuit >= 4) return "4 of a suit. LOW.";
  if (isPair && highAvg >= 12) return "High pair. HIGH.";
  if (highAvg >= 12) return "Running high. HIGH.";
  if (maxSuit >= 3) return "3 suited. LOW.";
  return "Read it yourself.";
}

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
