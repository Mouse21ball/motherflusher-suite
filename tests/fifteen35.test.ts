import { describe, expect, it } from 'vitest';
import type { CardType, Player } from '../shared/gameTypes';
import { Fifteen35Mode } from '../shared/modes/fifteen35';

function player(id: string, cards: CardType[]): Player {
  return {
    id,
    name: id,
    chips: 100,
    bet: 0,
    totalBet: 50,
    cards,
    status: 'active',
    isDealer: false,
    declaration: null,
  };
}

describe('Fifteen35Mode.resolveShowdown', () => {
  it('awards the low half to the qualifying hand closest to 15', () => {
    const players = [
      player('low-13', [{ rank: '9', suit: 'spades' }, { rank: '4', suit: 'hearts' }]),
      player('low-14', [{ rank: '9', suit: 'hearts' }, { rank: '5', suit: 'spades' }]),
      player('low-15', [{ rank: '8', suit: 'clubs' }, { rank: '7', suit: 'diamonds' }]),
      player('high-35', [
        { rank: '10', suit: 'spades' },
        { rank: '10', suit: 'diamonds' },
        { rank: '10', suit: 'clubs' },
        { rank: '5', suit: 'hearts' },
      ]),
    ];

    const { players: settled, pot } = Fifteen35Mode.resolveShowdown!(players, 200);
    const chips = Object.fromEntries(settled.map(p => [p.id, p.chips]));

    expect(chips).toEqual({
      'low-13': 100,
      'low-14': 100,
      'low-15': 200,
      'high-35': 200,
    });
    expect(pot).toBe(0);
  });
});