import { describe, expect, it, vi } from 'vitest';
import type { CardType, GameMode, GameState, Player, Rank, Suit } from '../shared/gameTypes';
import { BadugiMode } from '../shared/modes/badugi';
import { Dead7Mode } from '../shared/modes/dead7';
import { FlushedUpMode } from '../shared/modes/flushedUp';
import { KamikazeMode } from '../shared/modes/kamikaze';

const cards = (...values: Array<[Rank, Suit]>): CardType[] =>
  values.map(([rank, suit]) => ({ rank, suit, isHidden: true }));

const cases: Array<{
  name: string;
  mode: GameMode;
  botCards: CardType[];
  strongHumanCards: CardType[];
  weakHumanCards: CardType[];
}> = [
  {
    name: 'Dead 7',
    mode: Dead7Mode,
    botCards: cards(['8', 'spades'], ['9', 'hearts'], ['10', 'clubs'], ['J', 'diamonds']),
    strongHumanCards: cards(['8', 'spades'], ['9', 'hearts'], ['10', 'clubs'], ['J', 'diamonds']),
    weakHumanCards: cards(['7', 'spades'], ['2', 'hearts'], ['3', 'clubs'], ['4', 'diamonds']),
  },
  {
    name: 'Flushed Up',
    mode: FlushedUpMode,
    botCards: cards(['2', 'spades'], ['3', 'spades'], ['4', 'spades'], ['5', 'hearts'], ['6', 'clubs']),
    strongHumanCards: cards(['2', 'spades'], ['3', 'spades'], ['4', 'spades'], ['5', 'spades'], ['6', 'spades']),
    weakHumanCards: cards(['2', 'spades'], ['3', 'spades'], ['4', 'hearts'], ['5', 'clubs'], ['6', 'diamonds']),
  },
  {
    name: 'Kamikaze',
    mode: KamikazeMode,
    botCards: cards(['2', 'spades'], ['3', 'spades'], ['4', 'spades'], ['5', 'hearts'], ['6', 'hearts'], ['8', 'clubs']),
    strongHumanCards: cards(['2', 'spades'], ['3', 'spades'], ['4', 'spades'], ['5', 'hearts'], ['6', 'hearts'], ['8', 'clubs']),
    weakHumanCards: cards(['2', 'spades'], ['3', 'spades'], ['4', 'spades'], ['5', 'spades'], ['6', 'spades'], ['8', 'spades']),
  },
  {
    name: 'Badugi',
    mode: BadugiMode,
    botCards: cards(['A', 'spades'], ['2', 'hearts'], ['3', 'clubs'], ['4', 'diamonds']),
    strongHumanCards: cards(['A', 'spades'], ['2', 'hearts'], ['3', 'clubs'], ['4', 'diamonds']),
    weakHumanCards: cards(['A', 'hearts'], ['2', 'hearts'], ['3', 'hearts'], ['4', 'hearts']),
  },
];

function bettingState(botCards: CardType[], humanCards: CardType[], currentBet: number): GameState {
  const bot: Player = {
    id: 'bot', name: 'Bot', presence: 'bot', chips: 1000, bet: 0,
    cards: botCards, status: 'active', isDealer: false, declaration: null, hasActed: false,
  };
  const human: Player = {
    id: 'human', name: 'Human', presence: 'human', chips: 1000, bet: currentBet,
    cards: humanCards, status: 'active', isDealer: true, declaration: null, hasActed: false,
  };
  return {
    tableId: 'fairness', phase: 'BET_3', pot: 200, currentBet, minBet: 2,
    activePlayerId: bot.id, players: [bot, human],
    communityCards: [], deck: [], discardPile: [], messages: [], chatMessages: [],
    raisesThisRound: 0,
  };
}

function botDecision(mode: GameMode, state: GameState) {
  const result = mode.botAction(state, 'bot');
  expect(result).not.toBeNull();
  return {
    bot: result!.stateUpdates.players?.find(p => p.id === 'bot'),
    pot: result!.stateUpdates.pot,
    currentBet: result!.stateUpdates.currentBet,
    raisesThisRound: result!.stateUpdates.raisesThisRound,
    message: result!.message,
    roundOver: result!.roundOver,
    nextPlayerId: result!.nextPlayerId,
  };
}

describe('bot betting never uses opponents’ private cards', () => {
  for (const { name, mode, botCards, strongHumanCards, weakHumanCards } of cases) {
    it(`${name} makes the same decision for strong and weak hidden human cards`, () => {
      const random = vi.spyOn(Math, 'random');
      try {
        for (const currentBet of [0, 30]) {
          for (const roll of [0.02, 0.25, 0.5, 0.75, 0.98]) {
            random.mockReturnValue(roll);
            const strong = botDecision(mode, bettingState(botCards, strongHumanCards, currentBet));
            const weak = botDecision(mode, bettingState(botCards, weakHumanCards, currentBet));
            expect(weak).toEqual(strong);
          }
        }
      } finally {
        random.mockRestore();
      }
    });

    it(`${name} does not read the human's cards during a betting decision`, () => {
      const state = bettingState(botCards, strongHumanCards, 30);
      Object.defineProperty(state.players[1], 'cards', {
        get() { throw new Error('Bot accessed opponent hole cards'); },
      });
      const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      try {
        expect(() => botDecision(mode, state)).not.toThrow();
      } finally {
        random.mockRestore();
      }
    });
  }
});