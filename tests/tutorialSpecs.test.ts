import { describe, expect, it } from 'vitest';
import { TUTORIAL_SPECS } from '../client/src/components/tutorial/specs';
import type { TutCard } from '../client/src/components/tutorial/tutorialTypes';
import { evaluateBadugi } from '../shared/modes/badugi';
import { evaluateFlushedUpHand, compareFlushedUpHands } from '../shared/modes/flushedUp';
import { evaluateBoxChevy10, compareBoxChevyLow } from '../shared/modes/boxchevy';

/**
 * Detroit 2026-10-21 (Phase 2): the interactive tutorials teach the
 * REAL games. Every example hand in the specs is pinned here against
 * the actual evaluators, so a lesson can never drift from the engine
 * it teaches. If a rule changes, these tests fail and the tutorial
 * copy must be fixed with it.
 */

const asCards = (cards: TutCard[]) => cards.map(x => ({ rank: x.rank, suit: x.suit, isHidden: false })) as any;
const step = (mode: keyof typeof TUTORIAL_SPECS, id: string) => {
  const s = TUTORIAL_SPECS[mode].steps.find(x => x.id === id);
  if (!s) throw new Error(`missing step ${mode}/${id}`);
  return s;
};

/** Badugi showdown rule, mirrored from BadugiMode.resolveShowdown:
 *  rank values sorted high→low; HIGH = higher first difference wins,
 *  LOW = lower first difference wins. Returns >0 when a beats b. */
function badugiCompare(aVals: number[], bVals: number[], side: 'HIGH' | 'LOW'): number {
  for (let i = 0; i < 4; i++) {
    if (aVals[i] !== bVals[i]) return side === 'HIGH' ? aVals[i] - bVals[i] : bVals[i] - aVals[i];
  }
  return 0;
}

describe('tutorial specs — shape', () => {
  for (const spec of Object.values(TUTORIAL_SPECS)) {
    it(`${spec.name}: complete step set with controls, a win and a lose example`, () => {
      expect(spec.steps.length).toBeGreaterThanOrEqual(7);
      for (const s of spec.steps) {
        expect(s.id && s.phase && s.title && s.body.length > 30, `step ${s.id} incomplete`).toBeTruthy();
      }
      expect(spec.steps.some(s => s.verdictKind === 'win'), 'needs a win example').toBe(true);
      expect(spec.steps.some(s => s.verdictKind === 'lose'), 'needs a lose example').toBe(true);
      expect(spec.steps.some(s => s.actions?.length), 'needs simulated buttons').toBe(true);
    });
    it(`${spec.name}: draw games have an interactive draw step`, () => {
      if (spec.modeId === 'ladyluck') return;
      const draw = spec.steps.find(s => s.draw);
      expect(draw, 'missing interactive draw').toBeTruthy();
      expect(draw!.draw!.max).toBe(3);
      expect(draw!.draw!.replacements.length).toBeGreaterThanOrEqual(1);
    });
    it(`${spec.name}: no duplicated physical card within a hand or board`, () => {
      for (const s of spec.steps) {
        const key = (x: TutCard) => `${x.rank}:${x.suit}`;
        const check = (cards: TutCard[] | undefined, label: string) => {
          if (!cards) return;
          expect(new Set(cards.map(key)).size, `${s.id} ${label} has a duplicate card`).toBe(cards.length);
        };
        check(s.heroCards, 'hero');
        check(s.rivalCards, 'rival');
        check(s.boardCards, 'board');
        // Hero and rival never hold the same physical card (Box Chevy
        // shares only the board, which is a single list).
        if (s.heroCards && s.rivalCards) {
          const heroKeys = new Set(s.heroCards.map(key));
          for (const rc of s.rivalCards) expect(heroKeys.has(key(rc)), `${s.id}: hero and rival share ${key(rc)}`).toBe(false);
        }
      }
    });
  }
});

describe('tutorial specs — Badugi truth', () => {
  it('goal hand is a valid Badugi; the paired rival is NOT (all or nothing)', () => {
    expect(evaluateBadugi(asCards(step('badugi', 'goal').heroCards!))!.isValidBadugi).toBe(true);
    expect(evaluateBadugi(asCards(step('badugi', 'valid-invalid').heroCards!))!.isValidBadugi).toBe(true);
    expect(evaluateBadugi(asCards(step('badugi', 'valid-invalid').rivalCards!))!.isValidBadugi).toBe(false);
  });
  it('the dealt problem hand is invalid, and each sensible swap fixes it', () => {
    const deal = step('badugi', 'deal').heroCards!;
    expect(evaluateBadugi(asCards(deal))!.isValidBadugi).toBe(false);
    const draw = step('badugi', 'draw1').draw!;
    const swap = (idx: number[]) => {
      const next = [...deal];
      [...idx].sort((a, b) => a - b).forEach((ci, k) => { next[ci] = draw.replacements[k]; });
      return evaluateBadugi(asCards(next))!.isValidBadugi;
    };
    expect(swap([3])).toBe(true);   // K♦ out
    expect(swap([2])).toBe(true);   // 9♦ out
    expect(swap([2, 3])).toBe(true); // both diamonds out
    expect(swap([])).toBe(false);  // standing pat keeps the broken hand
  });
  it('showdown examples resolve the way the copy claims', () => {
    const win = step('badugi', 'showdown-win');
    const hero = evaluateBadugi(asCards(win.heroCards!))!;
    const rival = evaluateBadugi(asCards(win.rivalCards!))!;
    expect(hero.isValidBadugi && rival.isValidBadugi).toBe(true);
    expect(badugiCompare(hero.badugiRankValues, rival.badugiRankValues, 'LOW')).toBeGreaterThan(0);
    const lose = step('badugi', 'showdown-lose');
    const h2 = evaluateBadugi(asCards(lose.heroCards!))!;
    const r2 = evaluateBadugi(asCards(lose.rivalCards!))!;
    expect(badugiCompare(h2.badugiRankValues, r2.badugiRankValues, 'HIGH')).toBeLessThan(0);
  });
});

describe('tutorial specs — Flushed Up truth', () => {
  it('goal/deal hands score the claimed suit counts', () => {
    expect(evaluateFlushedUpHand(asCards(step('flushedup', 'goal').heroCards!)).suitCount).toBe(4);
    expect(evaluateFlushedUpHand(asCards(step('flushedup', 'deal').heroCards!)).suitCount).toBe(3);
    const vi = step('flushedup', 'valid-invalid');
    expect(evaluateFlushedUpHand(asCards(vi.heroCards!)).isFlush).toBe(true);
    expect(evaluateFlushedUpHand(asCards(vi.rivalCards!)).suitCount).toBe(2);
  });
  it('swapping both off-suit cards makes the flush', () => {
    const deal = step('flushedup', 'deal').heroCards!;
    const draw = step('flushedup', 'draw1').draw!;
    const next = [...deal];
    [2, 3].forEach((ci, k) => { next[ci] = draw.replacements[k]; });
    expect(evaluateFlushedUpHand(asCards(next)).isFlush).toBe(true);
  });
  it('showdown examples resolve the way the copy claims', () => {
    const win = step('flushedup', 'showdown-win');
    expect(compareFlushedUpHands(
      evaluateFlushedUpHand(asCards(win.heroCards!)),
      evaluateFlushedUpHand(asCards(win.rivalCards!)),
    )).toBeGreaterThan(0);
    const lose = step('flushedup', 'showdown-lose');
    expect(compareFlushedUpHands(
      evaluateFlushedUpHand(asCards(lose.heroCards!)),
      evaluateFlushedUpHand(asCards(lose.rivalCards!)),
    )).toBeLessThan(0);
  });
});

describe('tutorial specs — Box Chevy truth (rules as-is; HIGH rule untouched)', () => {
  it('goal hand is made; the board-paired rival is not; the dealt 9 collides', () => {
    const goal = step('box_chevy', 'goal');
    expect(evaluateBoxChevy10(asCards(goal.heroCards!), asCards(goal.boardCards!)).isMade).toBe(true);
    const broken = step('box_chevy', 'broken');
    expect(evaluateBoxChevy10(asCards(broken.rivalCards!), asCards(broken.boardCards!)).isMade).toBe(false);
    const deal = step('box_chevy', 'deal');
    expect(evaluateBoxChevy10(asCards(deal.heroCards!), asCards(deal.boardCards!)).isMade).toBe(false);
    const draw = step('box_chevy', 'draw1');
    const fixed = [...deal.heroCards!];
    fixed[4] = draw.draw!.replacements[0]; // swap the colliding 9
    expect(evaluateBoxChevy10(asCards(fixed), asCards(deal.boardCards!)).isMade).toBe(true);
  });
  it('the LOW showdown example resolves for the hero under the live comparator', () => {
    const win = step('box_chevy', 'showdown-win');
    const hero = evaluateBoxChevy10(asCards(win.heroCards!), asCards(win.boardCards!));
    const rival = evaluateBoxChevy10(asCards(win.rivalCards!), asCards(win.boardCards!));
    expect(hero.isMade && rival.isMade).toBe(true);
    expect(compareBoxChevyLow(hero, rival)).toBeGreaterThan(0);
  });
});

describe('tutorial specs — Lady Luck truth', () => {
  const count = (cards: TutCard[], suit: string) => cards.filter(x => x.suit === suit).length;
  it('the flip counts printed in the labels are the real counts', () => {
    expect(count(step('ladyluck', 'race').boardCards!, 'hearts')).toBe(3);
    expect(count(step('ladyluck', 'flips').boardCards!, 'hearts')).toBe(6);
    const win = step('ladyluck', 'win').boardCards!;
    expect(count(win, 'hearts')).toBe(9);
    const lose = step('ladyluck', 'lose').boardCards!;
    expect(count(lose, 'clubs')).toBe(9);
    expect(count(lose, 'hearts')).toBe(7);
  });
});
