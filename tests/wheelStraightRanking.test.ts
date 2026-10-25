import { describe, expect, it } from 'vitest';
import type { CardType } from '../shared/gameTypes';
import { evaluateBoxChevy } from '../shared/modes/boxchevy';

// Detroit 2026-10-21 (ruling 3): rewritten under the permanent house
// rules. The original file fed FIVE-card hands into a ten-card
// evaluator, so every hand hit the not-made sentinel and the ordering
// assertions encoded standard poker besides. A Box Chevy hand is
// always 10 cards (5 hole + 5 community, all ranks unique or the hand
// is not made), HIGH compares smallest-card-first, and suits mean
// nothing — there are no flushes in Box Chevy.

function hand(holeRanks: string[], commRanks: string[], suited = false): CardType[] {
  const holeSuits: CardType['suit'][] = ['spades', 'hearts', 'diamonds', 'clubs', 'spades'];
  const commSuits: CardType['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades', 'hearts'];
  return [
    ...holeRanks.map((rank, i) => ({ rank: rank as CardType['rank'], suit: suited ? 'spades' as const : holeSuits[i], isHidden: false })),
    ...commRanks.map((rank, i) => ({ rank: rank as CardType['rank'], suit: suited ? 'spades' as const : commSuits[i], isHidden: false })),
  ];
}
const ev = (cards: CardType[]) => evaluateBoxChevy(cards.slice(0, 5), cards.slice(5));

// The "wheel" rank set A-2-3-4-5 extended to a legal 10-card hand.
const wheel = hand(['A', '2', '3', '4', '5'], ['7', '8', '9', '10', 'J']);
// A duplicated rank is not a made hand at all in Box Chevy.
const pair = hand(['A', 'A', '9', '7', '2'], ['3', '4', '5', '6', '8']);
const sixRun = hand(['2', '3', '4', '5', '6'], ['8', '9', '10', 'J', 'Q']);
const kingRun = hand(['9', '10', 'J', 'Q', 'K'], ['2', '3', '4', '5', '6']);

describe('Box Chevy sequence ranking (smallest-card-first)', () => {
  it('ranks a made wheel sequence above any unmade hand, below 2-bottomed runs', () => {
    const wheelResult = ev(wheel);
    expect(wheelResult.isMade).toBe(true);
    // Hands are named by their full 10-card rank sequence.
    expect(wheelResult.highName).toBe('A-2-3-4-5-7-8-9-10-J');
    // Unmade hands score highValue 0 — a pair can never beat a made hand.
    expect(ev(pair).isMade).toBe(false);
    expect(ev(pair).highValue).toBe(0);
    expect(ev(pair).highValue).toBeLessThan(wheelResult.highValue);
    // Smallest-card-first: the wheel bottoms at A(1); both runs bottom
    // at 2, so both outrank the wheel on HIGH. Between the runs, the
    // sequences tie through 2-3-4-5-6 and the king run's 9 beats the
    // six run's 8 at the first difference.
    expect(wheelResult.highValue).toBeLessThan(ev(sixRun).highValue);
    expect(ev(sixRun).highValue).toBeLessThan(ev(kingRun).highValue);
  });

  it('suits change nothing — there are no flushes in Box Chevy', () => {
    const suitedWheel = hand(['A', '2', '3', '4', '5'], ['7', '8', '9', '10', 'J'], true);
    const suitedSix = hand(['2', '3', '4', '5', '6'], ['8', '9', '10', 'J', 'Q'], true);
    const suitedKing = hand(['9', '10', 'J', 'Q', 'K'], ['2', '3', '4', '5', '6'], true);
    expect(ev(suitedWheel).highName).toBe('A-2-3-4-5-7-8-9-10-J');
    expect(ev(suitedSix).highName).toBe('2-3-4-5-6-8-9-10-J-Q');
    // Identical values to the unsuited twins, identical ordering.
    expect(ev(suitedWheel).highValue).toBe(ev(wheel).highValue);
    expect(ev(suitedWheel).lowValue).toBe(ev(wheel).lowValue);
    expect(ev(suitedWheel).highValue).toBeLessThan(ev(suitedSix).highValue);
    expect(ev(suitedSix).highValue).toBeLessThan(ev(suitedKing).highValue);
  });
});
