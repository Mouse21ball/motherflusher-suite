import { describe, expect, it } from 'vitest';
import { maskStateForPlayer } from '../server/genericEngine';
import { SuitsPokerMode } from '../shared/modes/suitspoker';
import type { CardType, GamePhase, GameState, Player } from '../shared/gameTypes';

const ranks: CardType['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const suits: CardType['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];

function freshlyDealtState(): GameState {
  const deck = suits.flatMap(suit => ranks.map(rank => ({ suit, rank, isHidden: false })));
  const players: Player[] = ['p1', 'p2'].map(id => ({
    id, name: id, presence: 'human', chips: 100, bet: 0, totalBet: 0,
    cards: [], status: 'active', hasActed: false, isDealer: id === 'p1', declaration: null,
  }));
  const dealt = SuitsPokerMode.deal(deck, players, '__server__');
  return {
    tableId: 'suits-mask-test', phase: 'DEAL', players: dealt.players, activePlayerId: 'p1',
    pot: 0, currentBet: 0, minBet: 25, deck: dealt.deck, discardPile: [],
    communityCards: dealt.communityCards, messages: [], chatMessages: [],
  };
}

function wireState(state: GameState, recipient: string): GameState {
  return JSON.parse(JSON.stringify(maskStateForPlayer(state, recipient))) as GameState;
}

describe('Suits Poker community card snapshot masking', () => {
  it('hides every real board value after the 15 cards are dealt, without hiding the recipient’s hole cards', () => {
    const state = freshlyDealtState();
    expect(state.communityCards).toHaveLength(15);
    const heroView = wireState(state, 'p1');
    const spectatorView = wireState(state, '__spectator__');

    expect(heroView.communityCards).toEqual(Array.from({ length: 15 }, () => ({ isHidden: true })));
    expect(spectatorView.communityCards).toEqual(heroView.communityCards);
    expect(heroView.deck).toEqual([]);
    expect(heroView.players[0].cards).toEqual(state.players[0].cards.map(c => ({ ...c, isHidden: false })));
    expect(heroView.players[1].cards.every(c => c.isHidden)).toBe(true);
    expect(state.communityCards.every(c => c.rank && c.suit && c.isHidden)).toBe(true);
  });

  it('reveals actual values only as each board row becomes visible', () => {
    let state = freshlyDealtState();
    const reveals: [GamePhase, number][] = [
      ['REVEAL_TOP_ROW', 9],
      ['REVEAL_SECOND_ROW', 11],
      ['REVEAL_LOWER_CENTER', 13],
      ['REVEAL_FACTOR_CARD', 15],
    ];

    for (const [phase, visible] of reveals) {
      const transition = SuitsPokerMode.getAutoTransition(phase);
      if (!transition) throw new Error(`Missing ${phase} transition`);
      state = { ...state, ...transition.action(state).stateUpdates, phase };
      for (const recipient of ['p1', 'p2', '__spectator__']) {
        const board = wireState(state, recipient).communityCards;
        expect(board).toHaveLength(15);
        for (let i = 0; i < 15; i++) {
          expect(board[i]).toEqual(i < visible ? state.communityCards[i] : { isHidden: true });
        }
      }
    }
  });
});