import { describe, expect, it } from 'vitest';
import type { GameState, Player, CardType } from '../shared/gameTypes';
import { applyBonecrusherDiscardAction } from '../server/genericEngine';

const cards: CardType[] = ['A', '2', '3', '4', '5', '6'].map(rank => ({
  rank: rank as CardType['rank'], suit: 'spades',
}));

function table(phase: 'DISCARD_2' | 'SELECT_5') {
  const player: Player = {
    id: 'p1', name: 'One', presence: 'human', chips: 1000, bet: 0,
    cards: [...cards], status: 'active', hasActed: false, isDealer: true, declaration: null,
  };
  const state: GameState = {
    tableId: 'bonecrusher-discard-test', phase, players: [player],
    pot: 0, currentBet: 0, minBet: 25, activePlayerId: 'p1',
    deck: [], discardPile: [], communityCards: [], messages: [], chatMessages: [],
  };
  return { state, actionLock: true, publicCardIndicesPerPlayer: { p1: [0, 3, 5] } };
}

describe.each(['DISCARD_2', 'SELECT_5'] as const)('Bonecrusher %s discard', phase => {
  it('rejects duplicate indices without changing cards or locking the next action', () => {
    const t = table(phase);
    const original = structuredClone(t.state);
    expect(applyBonecrusherDiscardAction(t, 'p1', [2, 2])).toBe('Discard indices must be unique.');
    expect(t.state).toEqual(original);
    expect(t.publicCardIndicesPerPlayer.p1).toEqual([0, 3, 5]);
    expect(t.actionLock).toBe(false);

    t.actionLock = true;
    expect(applyBonecrusherDiscardAction(t, 'p1', [4, 1])).toBeUndefined();
    expect(t.actionLock).toBe(false);
    expect(t.state.players[0].cards).toEqual([cards[0], cards[2], cards[3], cards[5]]);
  });

  it('discards distinct original slots and remaps public indices', () => {
    const t = table(phase);
    expect(applyBonecrusherDiscardAction(t, 'p1', [1, 4])).toBeUndefined();
    expect(t.state.players[0].cards).toEqual([cards[0], cards[2], cards[3], cards[5]]);
    expect(t.state.discardPile).toEqual([cards[4], cards[1]]);
    expect(t.state.players[0].hasActed).toBe(true);
    expect(t.publicCardIndicesPerPlayer.p1).toEqual([0, 2, 3]);
    expect(t.actionLock).toBe(false);
  });
});