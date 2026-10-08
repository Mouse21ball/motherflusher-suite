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
    expect(invalid.label).toContain('DUPLICATE RANK');
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
