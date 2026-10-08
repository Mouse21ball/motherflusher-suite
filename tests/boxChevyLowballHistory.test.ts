import { describe, expect, it } from 'vitest';
import { evaluateBoxChevy } from '../shared/modes/boxchevy';
import type { CardType } from '../shared/gameTypes';

function cards(ranks: string[]): CardType[] {
  const suits: CardType['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  return ranks.map((rank, i) => ({ rank: rank as CardType['rank'], suit: suits[i % 4], isHidden: false }));
}

describe('Box Chevy ace-to-five lowball hand-history evaluation', () => {
  it('orders historical snapshots by category, including pair versus two pair', () => {
    const history = [
      ['K', 'Q', 'J', '10', '8'],
      ['K', 'K', 'Q', 'J', '10'],
      ['A', 'A', '2', '2', '3'],
      ['A', 'A', 'A', '2', '3'],
      ['A', 'A', 'A', '2', '2'],
      ['A', 'A', 'A', 'A', '2'],
    ].map(ranks => evaluateBoxChevy(cards(ranks), []));
    for (let i = 1; i < history.length; i++) {
      expect(history[i - 1].lowValue).toBeLessThan(history[i].lowValue);
    }
    expect(history[1].isMade).toBe(false);
    expect(history[2].isMade).toBe(false);
    expect(history[2].lowDesc).toBe('A-A-2-2-3');
  });

  it('compares the paired rank before kickers in recorded hands', () => {
    const lowerPair = evaluateBoxChevy(cards(['2', '2', 'K', 'Q', 'J']), []);
    const higherPair = evaluateBoxChevy(cards(['3', '3', 'A', '4', '5']), []);
    expect(lowerPair.lowValue).toBeLessThan(higherPair.lowValue);
  });

  it('ignores straights and flushes and selects the best five-card low', () => {
    const wheel = cards(['A', '2', '3', '4', '5']).map(card => ({ ...card, suit: 'hearts' as const }));
    expect(evaluateBoxChevy(wheel, []).lowValue)
      .toBeLessThan(evaluateBoxChevy(cards(['A', '2', '3', '4', '6']), []).lowValue);
    const history = [cards(['A', 'A', '2', '2', '3']), cards(['A', '2', '3', '4', '5'])];
    expect(evaluateBoxChevy(history[1], cards(['6', '7', '8', '9', '10'])).isMade).toBe(true);
    expect(evaluateBoxChevy(history[1], []).lowValue).toBeLessThan(evaluateBoxChevy(history[0], []).lowValue);
  });
});
