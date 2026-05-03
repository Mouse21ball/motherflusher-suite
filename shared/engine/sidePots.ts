// ─── Side-pot computation & resolution ───────────────────────────────────────
// True multi-pot accounting for unequal all-in stacks.
//
// Pot ladder is built from each player's `totalBet` (per-hand contribution).
// Folded players' chips still count toward pot AMOUNTS, but they are NOT
// eligible to win.  Each side pot contains only the chips contributed at or
// above that level by all contributors, and the eligible-winner set is the
// non-folded contributors at that level.
//
// Example: P1=100 (folded), P2=200 all-in, P3=500
//   Levels: 100, 200, 500
//   Pot1: amount = 100*3 = 300, eligible = [P2,P3]
//   Pot2: amount = (200-100)*2 = 200, eligible = [P2,P3]
//   Pot3: amount = (500-200)*1 = 300, eligible = [P3]
//   Total = 800 ✓ (matches sum of contributions: 100+200+500)
//
// Used by every mode's resolveShowdown.  Provides deterministic, conservation-
// safe pot distribution that prevents short stacks from winning more than they
// risked, and prevents long stacks from losing chips to a player who never
// matched their bet.

import type { Player } from '../gameTypes';

export interface SidePot {
  amount: number;
  eligibleIds: string[];
}

export function computeSidePots(players: Player[]): SidePot[] {
  const contribs = players
    .map(p => ({ id: p.id, total: p.totalBet || 0, folded: p.status === 'folded' }))
    .filter(c => c.total > 0);
  if (contribs.length === 0) return [];

  const levels = Array.from(new Set(contribs.map(c => c.total))).sort((a, b) => a - b);
  const pots: SidePot[] = [];
  let prev = 0;
  for (const level of levels) {
    const delta = level - prev;
    const contributors = contribs.filter(c => c.total >= level);
    const amount = delta * contributors.length;
    const eligibleIds = contributors.filter(c => !c.folded).map(c => c.id);
    if (amount > 0) pots.push({ amount, eligibleIds });
    prev = level;
  }
  return pots;
}

export function totalSidePotAmount(pots: SidePot[]): number {
  return pots.reduce((s, p) => s + p.amount, 0);
}

// ─── Generic split-pot resolver ──────────────────────────────────────────────
// Iterates side pots and applies per-pot awarders.  Any pot with no winner
// rolls over.  Caller maps deltas back onto Player.chips and isWinner flags.

export interface SplitAwardOptions {
  findScoop?: (eligible: Player[]) => string[];
  findHigh: (eligible: Player[]) => string[];
  findLow?: (eligible: Player[]) => string[];
}

export interface SplitResolution {
  deltas: Record<string, number>;
  rolledOver: number;
  highWinnerIds: Set<string>;
  lowWinnerIds: Set<string>;
  scoopWinnerIds: Set<string>;
  hadAnyWinner: boolean;
}

export function resolveSplitPots(
  pots: SidePot[],
  allPlayers: Player[],
  opts: SplitAwardOptions,
): SplitResolution {
  const deltas: Record<string, number> = {};
  const highWinnerIds = new Set<string>();
  const lowWinnerIds = new Set<string>();
  const scoopWinnerIds = new Set<string>();
  let rolledOver = 0;
  let hadAnyWinner = false;

  for (const pot of pots) {
    const eligible = allPlayers.filter(p => pot.eligibleIds.includes(p.id));
    if (eligible.length === 0) { rolledOver += pot.amount; continue; }

    const scoopIds = opts.findScoop ? opts.findScoop(eligible) : [];
    if (scoopIds.length > 0) {
      distribute(scoopIds, pot.amount, deltas);
      scoopIds.forEach(id => scoopWinnerIds.add(id));
      hadAnyWinner = true;
      continue;
    }

    const highIds = opts.findHigh(eligible);
    const lowIds = opts.findLow ? opts.findLow(eligible) : [];

    if (highIds.length === 0 && lowIds.length === 0) {
      rolledOver += pot.amount;
      continue;
    }

    let highShare: number;
    let lowShare: number;
    if (!opts.findLow) {
      highShare = pot.amount; lowShare = 0;
    } else {
      const half = Math.floor(pot.amount / 2);
      highShare = half; lowShare = half;
      if (pot.amount % 2 !== 0) highShare += 1;
      if (highIds.length === 0) { lowShare += highShare; highShare = 0; }
      else if (lowIds.length === 0) { highShare += lowShare; lowShare = 0; }
    }

    if (highShare > 0 && highIds.length > 0) {
      distribute(highIds, highShare, deltas);
      highIds.forEach(id => highWinnerIds.add(id));
      hadAnyWinner = true;
    }
    if (lowShare > 0 && lowIds.length > 0) {
      distribute(lowIds, lowShare, deltas);
      lowIds.forEach(id => lowWinnerIds.add(id));
      hadAnyWinner = true;
    }
  }

  return { deltas, rolledOver, highWinnerIds, lowWinnerIds, scoopWinnerIds, hadAnyWinner };
}

function distribute(winnerIds: string[], amount: number, deltas: Record<string, number>): void {
  if (winnerIds.length === 0 || amount === 0) return;
  const share = Math.floor(amount / winnerIds.length);
  let rem = amount - share * winnerIds.length;
  for (const id of winnerIds) {
    const award = share + (rem > 0 ? 1 : 0);
    deltas[id] = (deltas[id] || 0) + award;
    if (rem > 0) rem--;
  }
}
