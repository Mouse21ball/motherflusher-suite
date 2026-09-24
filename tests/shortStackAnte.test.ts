import { describe, expect, it } from 'vitest';
import type { GameMode, GameState, Player } from '../shared/gameTypes';
import { takeAnte } from '../shared/engine/botUtils';
import { BadugiMode } from '../shared/modes/badugi';
import { Dead7Mode } from '../shared/modes/dead7';
import { Fifteen35Mode } from '../shared/modes/fifteen35';
import { SuitsPokerMode } from '../shared/modes/suitspoker';
import { BonecrusherMode } from '../shared/modes/bonecrusher';
import { BoxChevyMode } from '../shared/modes/boxchevy';
import { KamikazeMode } from '../shared/modes/kamikaze';
import { FlushedUpMode } from '../shared/modes/flushedUp';
import { SwingPokerMode } from '../shared/modes/swing';

function makeAnteState(chips: number, pot = 40): GameState {
  const player: Player = {
    id: 'p1',
    name: 'Short Stack',
    presence: 'bot',
    chips,
    bet: 0,
    totalBet: 0,
    cards: [],
    status: 'active',
    isDealer: true,
    declaration: null,
    hasActed: false,
  };

  return {
    tableId: 'ante-test',
    phase: 'ANTE',
    pot,
    currentBet: 0,
    minBet: 2,
    activePlayerId: player.id,
    players: [player],
    communityCards: [],
    messages: [],
    chatMessages: [],
    deck: [],
    discardPile: [],
    raisesThisRound: 0,
  };
}

describe('short-stack ante accounting', () => {
  it.each([
    ['Badugi', BadugiMode],
    ['Dead 7', Dead7Mode],
    ['Fifteen 35', Fifteen35Mode],
    ['Suits Poker', SuitsPokerMode],
    ['Bonecrusher', BonecrusherMode],
    ['Box Chevy', BoxChevyMode],
    ['Kamikaze', KamikazeMode],
    ['Flushed Up', FlushedUpMode],
  ] as Array<[string, GameMode]>)(
    '%s only moves the chips actually available into the pot',
    (_name, mode) => {
      const before = makeAnteState(10);
      const result = mode.botAction(before, 'p1');
      expect(result).not.toBeNull();

      const after = { ...before, ...result!.stateUpdates };
      expect(after.players[0].chips).toBe(0);
      expect(after.pot).toBe(50);
      expect(after.players[0].chips + after.pot).toBe(
        before.players[0].chips + before.pot,
      );
    },
  );

  it('Swing Poker only moves its $1 ante when a player has chips', () => {
    const before = makeAnteState(0);
    const result = SwingPokerMode.botAction(before, 'p1');
    expect(result).not.toBeNull();

    const after = { ...before, ...result!.stateUpdates };
    expect(after.players[0].chips).toBe(0);
    expect(after.pot).toBe(40);
  });

  it('returns a bounded debit for the human ante handlers', () => {
    expect(takeAnte(10, 25)).toEqual({ chips: 0, contribution: 10 });
    expect(takeAnte(25, 25)).toEqual({ chips: 0, contribution: 25 });
    expect(takeAnte(100, 25)).toEqual({ chips: 75, contribution: 25 });
    expect(takeAnte(0, 25)).toEqual({ chips: 0, contribution: 0 });
  });
});