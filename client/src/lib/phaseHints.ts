import { GamePhase } from './poker/types';

// ── Per-mode, per-phase hint copy ─────────────────────────────────────────────
// Keys match exact GamePhase strings. BET_* wildcards handled in getPhaseHint.

const hints: Record<string, Record<string, string>> = {
  badugi: {
    DEAL:    "Four cards dealt face-down — look for duplicates",
    DRAW_1:  "Discard duplicate suits or ranks. Goal: 4 unique, A-4 ideal",
    DRAW_2:  "Fix remaining duplicates. Max 2 cards this round",
    DRAW_3:  "Last swap — 1 card only. Stand pat if you have a valid Badugi",
    BET_1:   "Valid Badugi? Bet it. Partial hand? Call cheap or fold to raises",
    BET_2:   "Raised into? You need a real Badugi to continue profitably",
    BET_3:   "Final bet before declare. Strong Badugi = push hard",
    DECLARE: "HIGH = strongest Badugi wins. LOW = weakest wins. No Badugi = fold",
    SHOWDOWN:"Cards up — best valid 4-card Badugi takes the pot",
  },
  dead7: {
    DEAL:    "Four cards dealt — any 7 is already dead weight",
    DRAW_1:  "7s are DEAD — dump them first. Then aim High (8+) or Low (A–6)",
    DRAW_2:  "Same-suit pairs build flushes — a flush scoops the whole pot",
    DRAW_3:  "One card left. All different suits or a flush = full scoop",
    BET_1:   "Can you declare a side? If not, fold cheap now",
    BET_2:   "Flush or four-qualifier? Raise hard. Marginal hand? Fold to pressure",
    BET_3:   "Last bet before declare. Know your hand strength before committing",
    DECLARE: "High = all cards 8+. Low = all A–6. Dead hand (has a 7) = must fold",
    SHOWDOWN:"Flush or all-different-suits scoops the whole pot",
  },
  fifteen35: {
    DEAL:    "Two cards — one face-up, one hidden. Your starting total is set",
    HIT_1:   "Low target: 13–15. High target: 33–35. J/Q/K = ½ pt each",
    HIT_2:   "In range? Stay and lock it in. Too low for High? Keep hitting",
    HIT_3:   "Approaching 15 or 35? Stay to protect your range",
    HIT_4:   "In range? Staying now is often the right play",
    HIT_5:   "Over 35 = bust. In the 13–15 zone? Stay",
    HIT_6:   "Late hits are risky. Only hit if you need exactly 1–2 more",
    HIT_7:   "Almost certain bust territory — only hit if you're already out",
    HIT_8:   "Final card. In range wins — over 35 loses",
    BET_1:   "Bet strength relative to your visible total",
    BET_2:   "Mid-hand bet — qualified range = confidence",
    BET_3:   "Deeper in the hand. Qualified and raising = power",
    BET_4:   "Late-round bet. In 13–15 or 33–35? Play it strong",
    BET_5:   "Bet your position — bust or bust-adjacent should fold",
    SHOWDOWN:"Qualifying hands (13–15 Low, 33–35 High) split the pot",
  },
  suitspoker: {
    DEAL:       "Five hole cards dealt — look for a poker hand or flush foundation",
    DRAW:       "Keep your best suit run or poker hand. Swap up to 2 cards",
    REVEAL_TOP_ROW:      "Side A and B appear — which path fits your cards?",
    REVEAL_SECOND_ROW:   "Center row links both paths — deeper connection forms",
    REVEAL_LOWER_CENTER: "Lower center card deepens the connector",
    REVEAL_FACTOR_CARD:  "Final factor card — board is complete",
    BET_1:      "Paths visible. Poker foundation or flush run — pick your line",
    BET_2:      "Center connects paths. Which declaration are you targeting?",
    BET_3:      "Board almost complete. Start committing to Poker, Suits, or Swing",
    DECLARE_AND_BET: "Poker = best 5-card hand. Suits = highest flush total. Swing = win both (or lose all)",
    DECLARE:    "Poker, Suits, or Swing. Swing wins both or loses everything",
    SHOWDOWN:   "Best poker hand wins Poker pot. Highest suit total wins Suits",
  },
  swing: {
    DEAL:           "Five hole cards — scan for high ranks or flush potential",
    DRAW:           "Discard up to 2. Shape your poker hand or suit run",
    BET_1:          "Top row out. Bet what you see on the board",
    BET_2:          "Paths taking shape. Adjust based on your hole cards",
    BET_3:          "Board nearly set. Know your target before declaring",
    BET_4:          "Final board bet before the declaration moment",
    DECLARE_AND_BET:"High = best poker. Low = suit total. Swing = win both halves or lose all",
    DECLARE:        "High = best poker. Low = suit total. Swing wins both or nothing",
    SHOWDOWN:       "Highest poker hand takes High. Best suit total takes Low",
  },
};

// ── Context-sensitive dynamic hints ──────────────────────────────────────────

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

// ── 15/35 dynamic hand hint ───────────────────────────────────────────────────

export function getFifteen35HandHint(cards: SimpleCard[]): string {
  const visible = cards.filter(c => !c.isHidden);
  if (!visible.length) return "";
  const tot = visible.reduce((sum, c) => {
    if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') return sum + 0.5;
    if (c.rank === 'A') return sum + 11;
    return sum + parseInt(c.rank, 10);
  }, 0);
  if (tot > 35) return "Busted — over 35";
  if (tot >= 33) return `${tot} — qualified High! Stay`;
  if (tot >= 28) return `${tot} — one more hit may finish High`;
  if (tot >= 13 && tot <= 15) return `${tot} — qualified Low! Stay`;
  if (tot >= 10 && tot < 13) return `${tot} — close to Low range. Hit carefully`;
  return `${tot} — keep hitting toward 13–15 or 33–35`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function getPhaseHint(modeId: string, phase: GamePhase): string | undefined {
  const modeHints = hints[modeId];
  if (!modeHints) return undefined;

  if (modeHints[phase]) return modeHints[phase];

  // BET_* wildcard
  if (phase.startsWith('BET_')) {
    const n = parseInt(phase.replace('BET_', ''), 10);
    for (let i = n; i >= 1; i--) {
      const key = `BET_${i}`;
      if (modeHints[key]) return modeHints[key];
    }
    return undefined;
  }

  // HIT_* wildcard — use numbered key if available, else fall back
  if (phase.startsWith('HIT_')) {
    const hitNum = parseInt(phase.replace('HIT_', ''), 10);
    const key = `HIT_${hitNum}`;
    if (modeHints[key]) return modeHints[key];
    if (modeHints['HIT_4']) return modeHints['HIT_4']; // generic late hit
    return modeHints['HIT_1'];
  }

  return undefined;
}
