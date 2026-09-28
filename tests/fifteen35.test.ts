import { describe, expect, it } from 'vitest';
import type { CardType, GameState, Player } from '../shared/gameTypes';
import { Fifteen35Mode } from '../shared/modes/fifteen35';
import { Fifteen35Mode as ClientFifteen35Mode } from '../client/src/lib/poker/modes/fifteen35';

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

describe('Fifteen-35 bot heads-up auto-stay', () => {
  it('uses the opponent public STAY action, not their hidden first card', () => {
    const actWithHiddenRank = (rank: CardType['rank'], mode: typeof Fifteen35Mode | typeof ClientFifteen35Mode) => {
      const bot = { ...player('bot', [
        { rank: '10', suit: 'spades' }, { rank: '10', suit: 'hearts' }, { rank: '10', suit: 'diamonds' },
      ]), presence: 'bot' as const, hasActed: false };
      const opponent = { ...player('human', [
        { rank, suit: 'clubs', isHidden: true },
        { rank: '5' as const, suit: 'diamonds' as const, isHidden: false },
      ]), presence: 'human' as const, declaration: 'STAY' as const, hasActed: true };
      const state = {
        phase: 'HIT_1', players: [bot, opponent], pot: 100, currentBet: 0,
        deck: [{ rank: '3', suit: 'hearts' }], discardPile: [],
      } as GameState;
      const result = mode.botAction(state as never, 'bot');
      return { declaration: result.stateUpdates.players![0].declaration,
        cards: result.stateUpdates.players![0].cards, message: result.message,
        roundOver: result.roundOver };
    };
    for (const mode of [Fifteen35Mode, ClientFifteen35Mode]) {
      const lowOpponent = actWithHiddenRank('8', mode); // hidden 8 + visible 5 qualifies low
      const weakOpponent = actWithHiddenRank('K', mode); // hidden K + visible 5 does not
      expect(lowOpponent).toEqual(weakOpponent);
      expect(lowOpponent.declaration).toBe('STAY');
      expect(lowOpponent.cards).toHaveLength(4);
    }
  });

  it('uses no hidden opponent card in the shared or client auto-stay hooks', () => {
    const check = (mode: typeof Fifteen35Mode | typeof ClientFifteen35Mode,
      hiddenRank: CardType['rank'], ownRank: CardType['rank'] = '3',
      otherDeclaration: Player['declaration'] = 'STAY') => {
      const state = {
        phase: 'HIT_1', players: [
          { ...player('me', [
            { rank: '10', suit: 'spades' }, { rank: '10', suit: 'hearts' },
            { rank: '10', suit: 'diamonds' }, { rank: ownRank, suit: 'clubs' },
          ]), declaration: null },
          { ...player('other', [
            { rank: hiddenRank, suit: 'spades', isHidden: true },
            { rank: '5', suit: 'hearts', isHidden: false },
          ]), declaration: otherDeclaration },
        ],
      } as GameState;
      return mode.checkAutoStay!(state as never, 'me');
    };
    for (const mode of [Fifteen35Mode, ClientFifteen35Mode]) {
      expect(check(mode, '8')).toBe(true);
      expect(check(mode, 'K')).toBe(true);
      expect(check(mode, '8', '2')).toBe(false); // 32 is not a qualifying total
      expect(check(mode, '8', '3', null)).toBe(false); // opponent has not publicly stayed
    }
  });
});

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