import { describe, expect, it } from 'vitest';
import { maskStateForPlayer as maskGeneric } from '../server/genericEngine';
import { maskStateForPlayer as maskBadugi } from '../server/gameEngine';
import type { CardType, GameState, Player } from '../shared/gameTypes';

const aCards: CardType[] = [
  { rank: 'A', suit: 'hearts', isHidden: false },
  { rank: 'K', suit: 'clubs', isHidden: false },
];
const bCards: CardType[] = [
  { rank: '7', suit: 'diamonds', isHidden: false },
  { rank: '9', suit: 'spades', isHidden: false },
];

function dealtState(phase: GameState['phase'] = 'BET_1'): GameState {
  const players: Player[] = [
    { id: 'p1', name: 'A', presence: 'human', chips: 100, bet: 0, cards: aCards, status: 'active', isDealer: true, hasActed: false, declaration: null },
    { id: 'p2', name: 'B', presence: 'human', chips: 100, bet: 0, cards: bCards, status: 'active', isDealer: false, hasActed: false, declaration: null },
  ];
  return {
    tableId: 'hole-mask-test', phase, players, activePlayerId: 'p1', pot: 0,
    currentBet: 0, minBet: 25, deck: [], discardPile: [],
    communityCards: [], messages: [], chatMessages: [],
  };
}

function onWire(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

const engines = [
  { name: 'generic modes', mask: maskGeneric },
  { name: 'Badugi', mask: maskBadugi },
];

describe.each(engines)('$name hole-card snapshots', ({ mask }) => {
  it.each(['ANTE', 'DEAL', 'BET_1'] as const)('redacts serialized red-suited opponent cards during %s', phase => {
    const state = dealtState(phase);
    state.deck = [{ rank: 'Q', suit: 'hearts', isHidden: false }];
    for (const recipient of ['p1', 'p2', '__spectator__']) {
      const view = onWire(mask(state, recipient));
      expect(view.deck).toEqual([]);
      for (const player of view.players) {
        if (player.id === recipient) continue;
        expect(player.cards).toEqual([{ isHidden: true }, { isHidden: true }]);
        expect(JSON.stringify(player.cards)).not.toMatch(/rank|suit|hearts|diamonds/);
      }
    }
    // Masking must not corrupt the authoritative cards used for evaluation.
    expect(state.players[0].cards).toEqual(aCards);
    expect(state.players[1].cards).toEqual(bCards);
  });

  it('sends no real opponent or spectator hole-card values before showdown, but shows the owner their own cards', () => {
    const state = dealtState();
    const forA = onWire(mask(state, 'p1'));
    const forB = onWire(mask(state, 'p2'));
    const spectator = onWire(mask(state, '__spectator__'));
    const cardBacks = [{ isHidden: true }, { isHidden: true }];

    expect(forA.players[0].cards).toEqual(aCards);
    expect(forA.players[1].cards).toEqual(cardBacks);
    expect(forB.players[0].cards).toEqual(cardBacks);
    expect(forB.players[1].cards).toEqual(bCards);
    expect(spectator.players[0].cards).toEqual(cardBacks);
    expect(spectator.players[1].cards).toEqual(cardBacks);
    expect(state.players[0].cards).toEqual(aCards);
    expect(state.players[1].cards).toEqual(bCards);
  });

  it('includes the real card values for everyone at showdown', () => {
    const state = dealtState('SHOWDOWN');
    for (const recipient of ['p1', 'p2', '__spectator__']) {
      const view = onWire(mask(state, recipient));
      expect(view.players[0].cards).toEqual(aCards);
      expect(view.players[1].cards).toEqual(bCards);
    }
  });
});

it('keeps deliberately public generic-mode cards visible while redacting the same player’s private cards', () => {
  const state = dealtState();
  for (const recipient of ['p2', '__spectator__']) {
    const view = onWire(maskGeneric(state, recipient, { p1: [0] }));
    expect(view.players[0].cards).toEqual([aCards[0], { isHidden: true }]);
  }
});

describe('Badugi discard-pile snapshots', () => {
  it.each(['DRAW_2', 'SHOWDOWN'] as const)(
    'hides discarded card values from players and spectators at %s without changing the server pile',
    phase => {
      const state = dealtState(phase);
      const discarded: CardType = { rank: 'Q', suit: 'hearts', isHidden: false };
      state.discardPile = [discarded];

      for (const recipient of ['p1', 'p2', '__spectator__']) {
        const snapshot = onWire(maskBadugi(state, recipient));
        expect(snapshot.discardPile).toEqual([{ isHidden: true }]);
        expect(JSON.stringify(snapshot)).not.toContain('"rank":"Q"');
      }
      expect(state.discardPile).toEqual([discarded]);
    },
  );
});