import type { CardType } from '../gameTypes';
import { evaluateBoxChevy } from './boxchevy';

export type HeroValidityMode = 'boxchevy';
export type HeroValidityStatus = 'valid' | 'invalid' | 'pending';

export interface DuplicateRankInfo {
  rank: string;
  /** Copies among the five community cards (never discardable). */
  communityCount: number;
  /** Hole-card indices carrying this rank. */
  holeIndices: number[];
  /** True when the duplicate can never be repaired: 2+ copies sit in
   *  the community, which the player cannot change. */
  unfixable: boolean;
  /** Hole cards that must be discarded to clear this rank's conflict
   *  (0 when unfixable or when the rank is not duplicated). */
  discardsNeeded: number;
}

export interface HeroHandValidity {
  status: HeroValidityStatus;
  label: string;
  /** Actionable second line: exactly what to discard, or why the hand
   *  cannot be fixed. Empty when made or pending. */
  detail: string;
  isValid: boolean | null;
  /** Every duplicated rank with its fixability analysis (empty when made). */
  duplicates: DuplicateRankInfo[];
  /** True when at least one duplicate is community-internal. */
  hasUnfixableDuplicate: boolean;
  /** Total hole discards required to reach a made hand (Infinity when
   *  any duplicate is unfixable). */
  discardsToFix: number;
  /** Draw discards still available from this phase onward (caps 3/2/1). */
  drawCapacityLeft: number;
  /** Discard limit of the current draw round — during a BET phase, of
   *  the NEXT draw round (0 when no draw remains). A label instruction
   *  must never exceed this, however many discards the full fix needs. */
  currentDrawCap: number;
  /** Fixable in principle AND within the draws that remain. */
  canStillFix: boolean;
}

/** Draw discards remaining from a phase onward, per Box Chevy's
 *  AUTHORITATIVE phase order (shared/modes/boxchevy.ts):
 *  WAITING → ANTE → DEAL → DRAW_1 (cap 3) → BET_1 → DRAW_2 (cap 2) →
 *  BET_2 → DRAW_3 (cap 1) → BET_3 → DECLARE → SHOWDOWN.
 *  There is no BET_4 and no fourth draw. (Detroit 2026-10-24: the
 *  previous table was written for a BET→DRAW order and overstated the
 *  remaining capacity at every BET phase — at BET_3 it promised a
 *  discard when zero draws remained: the phantom "fourth draw".) */
function drawCapacityLeftFor(phase: string): number {
  switch (phase) {
    case 'ANTE': case 'DEAL': case 'DRAW_1': return 6;
    case 'BET_1': case 'DRAW_2': return 3;
    case 'BET_2': case 'DRAW_3': return 1;
    default: return 0; // BET_3, DECLARE, SHOWDOWN, WAITING
  }
}

/** Discard cap of the draw round in progress — or, during a BET phase,
 *  of the draw round that comes next (0 when none remains). */
function currentDrawCapFor(phase: string): number {
  switch (phase) {
    case 'ANTE': case 'DEAL': case 'DRAW_1': return 3;
    case 'BET_1': case 'DRAW_2': return 2;
    case 'BET_2': case 'DRAW_3': return 1;
    default: return 0; // BET_3, DECLARE, SHOWDOWN, WAITING
  }
}

export function analyzeDuplicates(
  holeCards: CardType[],
  communityCards: CardType[],
): { duplicates: DuplicateRankInfo[]; discardsToFix: number } {
  const commCount = new Map<string, number>();
  for (const c of communityCards) commCount.set(c.rank, (commCount.get(c.rank) ?? 0) + 1);
  const holeByRank = new Map<string, number[]>();
  holeCards.forEach((c, i) => {
    const arr = holeByRank.get(c.rank) ?? [];
    arr.push(i);
    holeByRank.set(c.rank, arr);
  });
  const ranks = new Set<string>([...commCount.keys(), ...holeByRank.keys()]);
  const duplicates: DuplicateRankInfo[] = [];
  let discardsToFix = 0;
  for (const rank of ranks) {
    const cc = commCount.get(rank) ?? 0;
    const holeIdx = holeByRank.get(rank) ?? [];
    const total = cc + holeIdx.length;
    if (total < 2) continue;
    const unfixable = cc >= 2;
    // Fixable paths: community holds 1 copy → discard EVERY hole copy;
    // community holds 0 → keep one hole copy, discard the rest.
    const needed = unfixable ? 0 : cc === 1 ? holeIdx.length : holeIdx.length - 1;
    duplicates.push({ rank, communityCount: cc, holeIndices: holeIdx, unfixable, discardsNeeded: needed });
    discardsToFix = unfixable ? Infinity : discardsToFix + needed;
  }
  duplicates.sort((a, b) => a.rank.localeCompare(b.rank));
  return { duplicates, discardsToFix };
}

const RANK_WORD: Record<string, string> = {
  A: 'ACES', '2': '2s', '3': '3s', '4': '4s', '5': '5s', '6': '6s', '7': '7s',
  '8': '8s', '9': '9s', '10': '10s', J: 'JACKS', Q: 'QUEENS', K: 'KINGS',
};

const visibleHandPhases = new Set([
  'BET_1', 'BET_2', 'BET_3', 'BET_4',
  'DRAW_1', 'DRAW_2', 'DRAW_3',
  'DECLARE',
]);

/**
 * Computes the hero's live made-hand status using the same mode evaluators
 * used by the game engine. Null means the indicator should not be shown.
 */
export function getHeroHandValidity(
  mode: HeroValidityMode,
  phase: string,
  holeCards: CardType[],
  communityCards: CardType[] = [],
): HeroHandValidity | null {
  if (!visibleHandPhases.has(phase)) return null;
  if (holeCards.length === 0) return null;

  const base = {
    duplicates: [] as DuplicateRankInfo[],
    hasUnfixableDuplicate: false,
    discardsToFix: 0,
    drawCapacityLeft: drawCapacityLeftFor(phase),
    currentDrawCap: currentDrawCapFor(phase),
    canStillFix: false,
  };

  const hasHiddenCards = holeCards.some(card => card.isHidden) || communityCards.some(card => card.isHidden);
  if (hasHiddenCards || holeCards.length !== 5 || communityCards.length !== 5) {
    const visibleCommunityCount = communityCards.filter(card => !card.isHidden).length;
    return {
      status: 'pending',
      label: `PENDING · ${holeCards.filter(card => !card.isHidden).length}/5 HOLE · ${visibleCommunityCount}/5 COMMUNITY`,
      detail: '',
      isValid: null,
      ...base,
    };
  }

  const evaluation = evaluateBoxChevy(holeCards, communityCards);
  if (evaluation.isMade) {
    return { status: 'valid', label: '✓ MADE HAND', detail: '', isValid: true, ...base };
  }

  // Not made: classify every duplicate honestly. Community-internal
  // duplicates can never be repaired; hole-involved duplicates can —
  // but only while enough draw discards remain.
  const { duplicates, discardsToFix } = analyzeDuplicates(holeCards, communityCards);
  const unfixable = duplicates.filter(d => d.unfixable);
  const capLeft = drawCapacityLeftFor(phase);
  const roundCap = currentDrawCapFor(phase);
  const canStillFix = unfixable.length === 0 && discardsToFix <= capLeft && capLeft > 0;
  // The exact hole cards to throw away: for a rank the board holds,
  // every hole copy goes; for a hole-only pair, all but one go.
  const throwRanks: string[] = [];
  for (const d of duplicates) {
    for (let i = 0; i < d.discardsNeeded; i++) throwRanks.push(d.rank);
  }
  // Live badge label: ONE compact instruction (Detroit 2026-10-22).
  // The full explanation stays in `detail` for the tutorial and the
  // declare-auto-fold notice — the evaluation itself is unchanged.
  let detail: string;
  let label: string;
  if (unfixable.length > 0) {
    const names = unfixable.map(d => RANK_WORD[d.rank] ?? d.rank).join(' + ');
    detail = `BOARD HAS TWO ${names} — NO DRAW CAN FIX THIS HAND`;
    label = 'NO MADE HAND — BOARD PAIR';
  } else if (!canStillFix) {
    detail = `NEEDS ${discardsToFix} DISCARD${discardsToFix === 1 ? '' : 'S'} — ONLY ${capLeft} LEFT`;
    label = 'NO MADE HAND — OUT OF DRAWS';
  } else if (discardsToFix <= roundCap) {
    // The whole fix fits THIS draw round — an immediate-repair
    // instruction, stated whole.
    detail = `DISCARD YOUR ${throwRanks.join(' + ')} — ${discardsToFix === 1 ? 'THAT FIXES IT' : 'THOSE FIX IT'}`;
    label = `NO MADE HAND — DISCARD ${throwRanks.join(' + ')}`;
  } else {
    // A repair is possible only across the remaining rounds: instruct
    // at most this round's cap and say plainly that more discards are
    // still required later. Never present a partial set as a fix.
    const thisRound = throwRanks.slice(0, roundCap);
    detail = `NEEDS ${discardsToFix} DISCARDS TOTAL — ${discardsToFix - roundCap} MORE IN A LATER DRAW`;
    label = `NO MADE HAND — DISCARD ${thisRound.join(' + ')}`;
  }
  return {
    status: 'invalid',
    label,
    detail,
    isValid: false,
    duplicates,
    hasUnfixableDuplicate: unfixable.length > 0,
    discardsToFix,
    drawCapacityLeft: capLeft,
    currentDrawCap: roundCap,
    canStillFix,
  };
}