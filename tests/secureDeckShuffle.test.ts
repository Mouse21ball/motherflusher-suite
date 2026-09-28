import { describe, expect, it, vi } from 'vitest';
import { createDeck } from '../shared/engine/core';
import { buildDeck as buildLadyLuckDeck } from '../server/ladyluckEngine';
import { secureShuffleInPlace } from '../server/utils/secureShuffle';

const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
const expected = suits.flatMap(suit => ranks.map(rank => `${suit}:${rank}`)).sort();

function order(deck: Array<{ rank: string; suit: string }>): string[] {
  return deck.map(card => `${card.suit}:${card.rank}`);
}

function expectIntactDeck(deck: Array<{ rank: string; suit: string }>) {
  expect(deck).toHaveLength(52);
  expect(order(deck).sort()).toEqual(expected);
}

describe('cryptographically secure deck shuffles', () => {
  it('keeps every card exactly once in the shared browser-compatible deck', () => {
    expectIntactDeck(createDeck());
  });

  it('keeps every card exactly once in the server-side poker deck', () => {
    const deck = suits.flatMap(suit => ranks.map(rank => ({ suit, rank })));
    expectIntactDeck(secureShuffleInPlace(deck));
  });

  it('keeps every card exactly once in the shuffled Lady Luck deck without mutating its source', () => {
    const source = buildLadyLuckDeck();
    const before = order(source);
    expectIntactDeck(secureShuffleInPlace([...source]));
    expect(order(source)).toEqual(before);
  });

  it.each([
    ['shared poker deck', () => createDeck()],
    ['server poker deck', () => secureShuffleInPlace(suits.flatMap(suit => ranks.map(rank => ({ suit, rank }))))],
    ['Lady Luck deck', () => secureShuffleInPlace([...buildLadyLuckDeck()])],
  ])('%s varies its order without using Math.random', (_name, makeDeck) => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Deck shuffling must not use Math.random');
    });
    let orders: string[];
    try {
      orders = Array.from({ length: 5 }, () => order(makeDeck()).join(','));
    } finally {
      random.mockRestore();
    }
    expect(new Set(orders).size).toBeGreaterThan(1);
  });
});