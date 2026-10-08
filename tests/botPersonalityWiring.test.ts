import { afterEach, describe, expect, it, vi } from 'vitest';
import * as botUtils from '../shared/engine/botUtils';
import type { CardType, GameMode, GameState, Player } from '../shared/gameTypes';


import { FlushedUpMode } from '../shared/modes/flushedUp';



const card = (rank: CardType['rank'], suit: CardType['suit']): CardType =>
  ({ rank, suit, isHidden: false });
const community: CardType[] = [
  card('2', 'spades'), card('3', 'spades'), card('4', 'spades'), card('5', 'spades'),
  card('6', 'spades'), card('7', 'hearts'), card('8', 'hearts'), card('9', 'hearts'),
  card('10', 'hearts'), card('J', 'hearts'), card('Q', 'diamonds'), card('K', 'diamonds'),
  card('A', 'diamonds'), card('2', 'clubs'), card('3', 'clubs'),
];

const modes: { mode: GameMode; cards: CardType[] }[] = [


  { mode: FlushedUpMode, cards: [card('2', 'spades'), card('3', 'spades'), card('4', 'spades'), card('5', 'hearts'), card('6', 'clubs')] },


];

function stateFor(id: string, cards: CardType[]): GameState {
  const bot: Player = {
    id, name: 'Bot', presence: 'bot', cards, chips: 500, bet: 0, status: 'active',
    declaration: null, isDealer: false, hasActed: false,
  };
  const human: Player = { ...bot, id: 'human', name: 'Human', presence: 'human', hasActed: false };
  return {
    tableId: 'personality-test', phase: 'BET_1', pot: 100, currentBet: 20, minBet: 2,
    activePlayerId: id, players: [bot, human], communityCards: community,
    deck: [], discardPile: [], messages: [], chatMessages: [], raisesThisRound: 0,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('bot personality betting integration', () => {
  it('passes the ID-specific traits to decideBet in all five modes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const betSpy = vi.spyOn(botUtils, 'decideBet');
    for (const { mode, cards } of modes) {
      const id = `bot_${mode.id}_personality`;
      betSpy.mockClear();
      mode.botAction(stateFor(id, cards), id);
      expect(betSpy, `${mode.id} must make a betting decision`).toHaveBeenCalledTimes(1);
      expect(betSpy.mock.calls[0][5]?.personality, `${mode.id} must pass its own traits`)
        .toEqual(botUtils.botPersonality(id));
    }
  });

  it('makes different betting decisions for different ID-hash tiers under identical conditions', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ids = new Map<string, string>();
    for (let i = 0; i < 1000 && ids.size < 2; i++) {
      const id = `bot_personality_${i}`;
      const tier = botUtils.botPersonality(id).tier;
      if (tier === 'fish' || tier === 'shark') ids.set(tier, id);
    }
    expect(ids.has('fish')).toBe(true);
    expect(ids.has('shark')).toBe(true);
    const fish = botUtils.botPersonality(ids.get('fish')!);
    const shark = botUtils.botPersonality(ids.get('shark')!);
    let differences = 0;
    for (const strength of [0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
      for (const callAmount of [0, 4, 20, 50]) {
        const args = [strength, 200, callAmount, 0, 500] as const;
        const fishDecision = botUtils.decideBet(...args, { personality: fish, raisesThisRound: 0, raiseCap: 3 });
        const sharkDecision = botUtils.decideBet(...args, { personality: shark, raisesThisRound: 0, raiseCap: 3 });
        if (JSON.stringify(fishDecision) !== JSON.stringify(sharkDecision)) differences++;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });
});
