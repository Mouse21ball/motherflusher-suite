import { describe, expect, it } from 'vitest';
import type { CardType } from '../shared/gameTypes';
import { evaluateDead7 } from '../shared/modes/dead7';
import { evaluateKamikaze } from '../shared/modes/kamikaze';
import { evaluateBoxChevy } from '../shared/modes/boxchevy';
import { getHeroHandValidity } from '../shared/modes/heroHandValidity';

const card = (rank: string, suit: string, isHidden = false): CardType => ({
  rank: rank as CardType['rank'],
  suit: suit as CardType['suit'],
  isHidden,
});

const dead7Valid = [
  card('2', 'hearts'), card('3', 'diamonds'), card('4', 'clubs'), card('5', 'spades'),
];
const kamikazeValid = [
  card('A', 'hearts'), card('K', 'hearts'), card('Q', 'hearts'),
  card('2', 'diamonds'), card('3', 'diamonds'), card('5', 'clubs'),
];
const boxHole = [
  card('A', 'hearts'), card('3', 'clubs'), card('5', 'diamonds'), card('7', 'spades'), card('9', 'hearts'),
];
const boxCommunity = [
  card('2', 'clubs'), card('4', 'diamonds'), card('6', 'spades'), card('8', 'hearts'), card('10', 'clubs'),
];

describe('hero live validity indicators', () => {
  it('uses Dead7 evaluator validity and surfaces the invalid causes', () => {
    const valid = getHeroHandValidity('dead7', 'BET_1', dead7Valid)!;
    expect(valid.status).toBe('valid');
    expect(valid.isValid).toBe(evaluateDead7(dead7Valid)?.isValidBadugi);

    const dead = [card('7', 'hearts'), ...dead7Valid.slice(1)];
    const duplicate = [card('2', 'hearts'), card('2', 'diamonds'), ...dead7Valid.slice(2)];
    const mixed = [card('8', 'hearts'), card('6', 'diamonds'), card('2', 'clubs'), card('4', 'spades')];
    for (const [cards, reason] of [
      [dead, 'HAS A 7'],
      [duplicate, 'DUPLICATE RANK'],
      [mixed, 'NO HIGH/LOW QUALIFIER'],
    ] as const) {
      const result = getHeroHandValidity('dead7', 'DECLARE', cards)!;
      expect(result.status).toBe('invalid');
      expect(result.isValid).toBe(evaluateDead7(cards)?.isValidBadugi);
      expect(result.label).toContain(reason);
    }
  });

  it('uses Kamikaze 3+2+1-unpaired predicate and explains each invalid cause', () => {
    const valid = getHeroHandValidity('kamikaze', 'DRAW_2', kamikazeValid)!;
    expect(valid.status).toBe('valid');
    expect(valid.isValid).toBe(evaluateKamikaze(kamikazeValid).isValid);

    const wrongSuits = [
      card('A', 'hearts'), card('K', 'hearts'), card('Q', 'hearts'), card('J', 'hearts'),
      card('2', 'diamonds'), card('5', 'clubs'),
    ];
    const paired = [
      card('A', 'hearts'), card('A', 'hearts'), card('Q', 'hearts'),
      card('2', 'diamonds'), card('3', 'diamonds'), card('5', 'clubs'),
    ];
    for (const cards of [wrongSuits, paired]) {
      const result = getHeroHandValidity('kamikaze', 'BET_2', cards)!;
      expect(result.status).toBe('invalid');
      expect(result.isValid).toBe(evaluateKamikaze(cards).isValid);
      expect(result.label).toContain(evaluateKamikaze(cards).description.replace(/^Not Kamikaze\s*/i, ''));
    }
  });

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
      expect(getHeroHandValidity('dead7', phase, dead7Valid)).toBeNull();
      expect(getHeroHandValidity('kamikaze', phase, kamikazeValid)).toBeNull();
      expect(getHeroHandValidity('boxchevy', phase, boxHole, boxCommunity)).toBeNull();
    }
    for (const phase of ['BET_1', 'DRAW_1', 'DECLARE']) {
      expect(getHeroHandValidity('dead7', phase, dead7Valid)).not.toBeNull();
      expect(getHeroHandValidity('kamikaze', phase, kamikazeValid)).not.toBeNull();
      expect(getHeroHandValidity('boxchevy', phase, boxHole, boxCommunity)).not.toBeNull();
    }
  });
});