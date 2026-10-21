import { describe, expect, it } from 'vitest';
import { evaluateBoxChevy, evaluateBoxChevy10, compareBoxChevyHigh, compareBoxChevyLow } from '../shared/modes/boxchevy';
import type { CardType } from '../shared/gameTypes';

// Detroit 2026-10-21 (ruling 3): rewritten under the permanent house
// rules. The original file evaluated FIVE-card "historical snapshots"
// with pair / two-pair categories — concepts Box Chevy does not have.
// A Box Chevy hand is 10 cards; any duplicated rank makes the hand
// NOT MADE (lowValue = the 999,999,999 sentinel, worse than every made
// hand on the LOW side too). LOW compares the full 10-card sequence
// from the highest card down; the first difference decides.

function hand(holeRanks: string[], commRanks: string[], suited = false): { hole: CardType[]; comm: CardType[] } {
  const holeSuits: CardType['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades', 'hearts'];
  const commSuits: CardType['suit'][] = ['clubs', 'spades', 'hearts', 'diamonds', 'clubs'];
  return {
    hole: holeRanks.map((rank, i) => ({ rank: rank as CardType['rank'], suit: suited ? 'hearts' as const : holeSuits[i], isHidden: false })),
    comm: commRanks.map((rank, i) => ({ rank: rank as CardType['rank'], suit: suited ? 'hearts' as const : commSuits[i], isHidden: false })),
  };
}
const ev = (h: { hole: CardType[]; comm: CardType[] }) => evaluateBoxChevy(h.hole, h.comm);
const ev10 = (h: { hole: CardType[]; comm: CardType[] }) => evaluateBoxChevy10(h.hole, h.comm);

describe('Box Chevy LOW evaluation (full 10-card sequence, top-down)', () => {
  it('orders made hands by their top card, then the next — a strict ladder', () => {
    const ladder = [
      hand(['A', '2', '3', '4', '5'], ['6', '7', '8', '9', '10']),  // top 10 — best possible low
      hand(['A', '2', '3', '4', '5'], ['6', '7', '8', '9', 'J']),   // top J
      hand(['A', '2', '3', '4', '6'], ['5', '7', '8', '9', 'Q']),   // top Q
    ].map(ev);
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i - 1].lowValue).toBeLessThan(ladder[i].lowValue);
    }
    expect(ladder[0].lowDesc).toBe('A-2-3-4-5-6-7-8-9-10');
  });

  it('every duplicated-rank hand is unmade and ties at the sentinel', () => {
    const dupes = [
      hand(['K', 'K', 'Q', 'J', '10'], ['2', '3', '4', '5', '6']),  // pair
      hand(['A', 'A', '2', '2', '3'], ['5', '6', '7', '8', '9']),   // two pair
      hand(['A', 'A', 'A', '2', '3'], ['5', '6', '7', '8', '9']),   // trips
      hand(['A', '2', '3', '4', '5'], ['5', '6', '7', '8', '9']),   // pairs the board
    ].map(ev);
    for (const result of dupes) {
      expect(result.isMade).toBe(false);
      expect(result.lowValue).toBe(999_999_999);
      expect(result.highValue).toBe(0);
    }
    // The sentinel only ties unmade hands among themselves — packed
    // made-hand values run far above it. What actually keeps an unmade
    // hand from winning is the comparator's made-hand gate:
    const made = ev10(hand(['A', '2', '3', '4', '6'], ['5', '7', '8', '9', 'Q']));
    const unmade = ev10(hand(['K', 'K', 'Q', 'J', '10'], ['2', '3', '4', '5', '6']));
    expect(compareBoxChevyLow(made, unmade)).toBeGreaterThan(0);
    expect(compareBoxChevyHigh(made, unmade)).toBeGreaterThan(0);
  });

  it('decides tied top cards at the first difference from the top down', () => {
    // Both sequences top at J-10-9-8-7-6; X continues 4, Y continues 5.
    const x = ev(hand(['A', '2', '3', '4', '6'], ['7', '8', '9', '10', 'J']));
    const y = ev(hand(['A', '2', '3', '5', '6'], ['7', '8', '9', '10', 'J']));
    expect(x.lowValue).toBeLessThan(y.lowValue);
  });

  it('ignores suits entirely and reads LOW from all ten cards', () => {
    const wheelSuited = ev(hand(['A', '2', '3', '4', '5'], ['6', '7', '8', '9', '10'], true));
    const wheelMixed = ev(hand(['A', '2', '3', '4', '5'], ['6', '7', '8', '9', '10']));
    expect(wheelSuited.isMade).toBe(true);
    expect(wheelSuited.lowValue).toBe(wheelMixed.lowValue);
    // The wheel sequence (top card 10) beats any K-topped low.
    const kTop = ev(hand(['A', 'K', 'Q', 'J', '10'], ['2', '3', '4', '5', '6']));
    expect(wheelMixed.lowValue).toBeLessThan(kTop.lowValue);
  });
});
