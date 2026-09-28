import type { CardType } from '../gameTypes';
import { evaluateDead7 } from './dead7';
import { evaluateKamikaze } from './kamikaze';
import { evaluateBoxChevy } from './boxchevy';

export type HeroValidityMode = 'dead7' | 'kamikaze' | 'boxchevy';
export type HeroValidityStatus = 'valid' | 'invalid' | 'pending';

export interface HeroHandValidity {
  status: HeroValidityStatus;
  label: string;
  isValid: boolean | null;
}

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

  if (mode === 'dead7') {
    if (holeCards.length !== 4 || holeCards.some(card => card.isHidden)) {
      return { status: 'pending', label: 'PENDING · NEED 4 VISIBLE CARDS', isValid: null };
    }
    const evaluation = evaluateDead7(holeCards);
    if (evaluation?.isValidBadugi) {
      return { status: 'valid', label: `✓ VALID · ${evaluation.description}`, isValid: true };
    }
    if (evaluation?.isDead) {
      return { status: 'invalid', label: '✗ INVALID · HAS A 7', isValid: false };
    }
    if (evaluation?.handType === 'INVALID') {
      return { status: 'invalid', label: '✗ INVALID · DUPLICATE RANK', isValid: false };
    }
    return { status: 'invalid', label: '✗ INVALID · NO HIGH/LOW QUALIFIER', isValid: false };
  }

  if (mode === 'kamikaze') {
    if (holeCards.some(card => card.isHidden)) {
      return { status: 'pending', label: 'PENDING · HAND HIDDEN', isValid: null };
    }
    const evaluation = evaluateKamikaze(holeCards);
    if (evaluation.isValid) {
      return { status: 'valid', label: '✓ VALID · 3+2+1 SUITS, UNPAIRED', isValid: true };
    }
    return {
      status: 'invalid',
      label: `✗ INVALID · ${evaluation.description.replace(/^Not Kamikaze\\s*/i, '')}`,
      isValid: false,
    };
  }

  const hasHiddenCards = holeCards.some(card => card.isHidden) || communityCards.some(card => card.isHidden);
  if (hasHiddenCards || holeCards.length !== 5 || communityCards.length !== 5) {
    const visibleCommunityCount = communityCards.filter(card => !card.isHidden).length;
    return {
      status: 'pending',
      label: `PENDING · ${holeCards.filter(card => !card.isHidden).length}/5 HOLE · ${visibleCommunityCount}/5 COMMUNITY`,
      isValid: null,
    };
  }

  const evaluation = evaluateBoxChevy(holeCards, communityCards);
  return evaluation.isMade
    ? { status: 'valid', label: '✓ MADE HAND · 10 UNIQUE RANKS', isValid: true }
    : { status: 'invalid', label: '✗ NO MADE HAND · DUPLICATE RANK', isValid: false };
}