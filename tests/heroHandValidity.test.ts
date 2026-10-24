import { describe, expect, it } from 'vitest';
import type { CardType } from '../shared/gameTypes';


import { evaluateBoxChevy } from '../shared/modes/boxchevy';
import { getHeroHandValidity } from '../shared/modes/heroHandValidity';

const card = (rank: string, suit: string, isHidden = false): CardType => ({
  rank: rank as CardType['rank'],
  suit: suit as CardType['suit'],
  isHidden,
});



const boxHole = [
  card('A', 'hearts'), card('3', 'clubs'), card('5', 'diamonds'), card('7', 'spades'), card('9', 'hearts'),
];
const boxCommunity = [
  card('2', 'clubs'), card('4', 'diamonds'), card('6', 'spades'), card('8', 'hearts'), card('10', 'clubs'),
];

describe('hero live validity indicators', () => {




  it('keeps Box Chevy pending until five visible hole and five visible community cards', () => {
    const incomplete = getHeroHandValidity('boxchevy', 'BET_1', boxHole, boxCommunity.slice(0, 3))!;
    expect(incomplete.status).toBe('pending');
    expect(incomplete.isValid).toBeNull();
    expect(incomplete.label).toContain('3/5 COMMUNITY');

    const hiddenCommunity = [...boxCommunity.slice(0, 4), card('10', 'clubs', true)];
    expect(getHeroHandValidity('boxchevy', 'DECLARE', boxHole, hiddenCommunity)?.status).toBe('pending');
    expect(getHeroHandValidity('boxchevy', 'DECLARE', boxHole.slice(0, 4), boxCommunity)?.status).toBe('pending');
  });

  it('matches Box Chevy evaluator for valid and duplicate-rank final hands', () => {
    const valid = getHeroHandValidity('boxchevy', 'BET_3', boxHole, boxCommunity)!;
    expect(valid.status).toBe('valid');
    expect(valid.isValid).toBe(evaluateBoxChevy(boxHole, boxCommunity).isMade);

    const duplicateCommunity = [card('2', 'clubs'), card('4', 'diamonds'), card('6', 'spades'), card('8', 'hearts'), card('A', 'clubs')];
    const invalid = getHeroHandValidity('boxchevy', 'DECLARE', boxHole, duplicateCommunity)!;
    expect(invalid.status).toBe('invalid');
    expect(invalid.isValid).toBe(evaluateBoxChevy(boxHole, duplicateCommunity).isMade);
    // Compact label contract (Detroit 2026-10-22): at DECLARE no
    // draws remain, so a fixable-on-paper duplicate reads OUT OF
    // DRAWS; the evaluation assertions above are unchanged.
    expect(invalid.label).toContain('NO MADE HAND');
  });

  it('reports remaining capacity + round cap per the real DRAW→BET phase order (Detroit 2026-10-24)', () => {
    // Board 2-5-8-J-K (unique); hand A duplicates four board ranks.
    const board = [card('2', 'hearts'), card('5', 'diamonds'), card('8', 'clubs'), card('J', 'hearts'), card('K', 'diamonds')];
    const handA = [card('2', 'spades'), card('5', 'spades'), card('8', 'spades'), card('J', 'spades'), card('3', 'spades')];
    const expected: Record<string, [number, number]> = {
      DRAW_1: [6, 3], BET_1: [3, 2], DRAW_2: [3, 2],
      BET_2: [1, 1], DRAW_3: [1, 1], BET_3: [0, 0], DECLARE: [0, 0],
    };
    for (const [phase, [capLeft, roundCap]] of Object.entries(expected)) {
      const v = getHeroHandValidity('boxchevy', phase, handA, board)!;
      expect([phase, v.drawCapacityLeft, v.currentDrawCap]).toEqual([phase, capLeft, roundCap]);
    }
  });

  it('never instructs a discard when no draw remains — the phantom fourth draw (BET_3/DECLARE)', () => {
    const board = [card('2', 'hearts'), card('5', 'diamonds'), card('8', 'clubs'), card('J', 'hearts'), card('K', 'diamonds')];
    const handB = [card('3', 'spades'), card('4', 'spades'), card('6', 'spades'), card('9', 'spades'), card('K', 'spades')]; // needs exactly 1
    for (const phase of ['BET_3', 'DECLARE']) {
      const v = getHeroHandValidity('boxchevy', phase, handB, board)!;
      expect(v.canStillFix).toBe(false);
      expect(v.label).toBe('NO MADE HAND — OUT OF DRAWS');
    }
  });

  it('caps the discard instruction at the current round limit and splits multi-round fixes honestly', () => {
    const board = [card('2', 'hearts'), card('5', 'diamonds'), card('8', 'clubs'), card('J', 'hearts'), card('K', 'diamonds')];
    const handA = [card('2', 'spades'), card('5', 'spades'), card('8', 'spades'), card('J', 'spades'), card('3', 'spades')]; // needs 4
    const atDraw1 = getHeroHandValidity('boxchevy', 'DRAW_1', handA, board)!;
    expect(atDraw1.label).toBe('NO MADE HAND — DISCARD 2 + 5 + 8'); // cap 3, not 4
    expect(atDraw1.detail).toContain('NEEDS 4 DISCARDS TOTAL');
    expect(atDraw1.detail).toContain('LATER DRAW');
    expect(atDraw1.canStillFix).toBe(true);

    const handC = [card('2', 'spades'), card('5', 'spades'), card('8', 'spades'), card('3', 'spades'), card('6', 'spades')]; // needs 3
    const atDraw2 = getHeroHandValidity('boxchevy', 'DRAW_2', handC, board)!;
    expect(atDraw2.label).toBe('NO MADE HAND — DISCARD 2 + 5'); // cap 2
    expect(atDraw2.detail).toContain('NEEDS 3 DISCARDS TOTAL');

    // A fix that fits this round whole stays an immediate instruction.
    const handB = [card('3', 'spades'), card('4', 'spades'), card('6', 'spades'), card('9', 'spades'), card('K', 'spades')]; // needs 1
    const immediate = getHeroHandValidity('boxchevy', 'DRAW_1', handB, board)!;
    expect(immediate.label).toBe('NO MADE HAND — DISCARD K');
    expect(immediate.detail).toContain('THAT FIXES IT');

    // 4 needed at BET_1: only 3 discards remain in the whole hand.
    const atBet1 = getHeroHandValidity('boxchevy', 'BET_1', handA, board)!;
    expect(atBet1.canStillFix).toBe(false);
    expect(atBet1.label).toBe('NO MADE HAND — OUT OF DRAWS');
  });

  it('gates all three indicators to live bet/draw/declaration phases only', () => {
    for (const phase of ['WAITING', 'ANTE', 'DEAL', 'SHOWDOWN']) {


      expect(getHeroHandValidity('boxchevy', phase, boxHole, boxCommunity)).toBeNull();
    }
    for (const phase of ['BET_1', 'DRAW_1', 'DECLARE']) {


      expect(getHeroHandValidity('boxchevy', phase, boxHole, boxCommunity)).not.toBeNull();
    }
  });
});
