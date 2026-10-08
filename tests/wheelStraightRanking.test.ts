import { describe, expect, it } from 'vitest';
import type { CardType, Player } from '../shared/gameTypes';


import { evaluateBoxChevy } from '../shared/modes/boxchevy';

function cards(ranks: CardType['rank'][], flush = false): CardType[] {
  const suits: CardType['suit'][] = ['spades', 'hearts', 'diamonds', 'clubs', 'spades'];
  return ranks.map((rank, i) => ({ rank, suit: flush ? 'spades' : suits[i] }));
}

const wheel = cards(['A', '2', '3', '4', '5']);
const pair = cards(['A', 'A', '9', '7', '2']);
const sixHigh = cards(['2', '3', '4', '5', '6']);
const kingHigh = cards(['9', '10', 'J', 'Q', 'K']);
const wheelFlush = cards(['A', '2', '3', '4', '5'], true);
const sixHighFlush = cards(['2', '3', '4', '5', '6'], true);
const kingHighFlush = cards(['9', '10', 'J', 'Q', 'K'], true);

const evaluators = [


  {
    name: 'Box Chevy',
    evaluate: (hand: CardType[]) => {
      const result = evaluateBoxChevy(hand, []);
      return { value: result.highValue, name: result.highName };
    },
  },
];

describe.each(evaluators)('$name wheel ranking', ({ evaluate }) => {
  it('ranks the wheel above a pair but below 6-high and K-high straights', () => {
    const wheelResult = evaluate(wheel);
    expect(wheelResult.name).toBe('Straight');
    expect(evaluate(pair).value).toBeLessThan(wheelResult.value);
    expect(wheelResult.value).toBeLessThan(evaluate(sixHigh).value);
    expect(evaluate(sixHigh).value).toBeLessThan(evaluate(kingHigh).value);
  });

  it('ranks the wheel straight flush below 6-high and K-high straight flushes', () => {
    const wheelResult = evaluate(wheelFlush);
    expect(wheelResult.name).toBe('Straight Flush');
    expect(evaluate(sixHighFlush).name).toBe('Straight Flush');
    expect(wheelResult.value).toBeLessThan(evaluate(sixHighFlush).value);
    expect(evaluate(sixHighFlush).value).toBeLessThan(evaluate(kingHighFlush).value);
  });
});
