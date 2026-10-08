// Shared initial-state plumbing only. Retained games use their own engines.
import type { GameState, Player } from '../types';
import { createDeck } from './core';
import { ensurePlayerIdentity } from '../../persistence';
import { generateTableCode } from '../../tableSession';

export const createMockPlayers = (heroChips: number): Player[] => {
  const identity = ensurePlayerIdentity();
  return [
    { id: 'p1', name: identity.name || 'You', presence: 'human', chips: heroChips, bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
    { id: 'p2', name: 'Alice',   presence: 'open', chips: 1000, bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: true,  declaration: null, hasActed: false },
    { id: 'p3', name: 'Bob',     presence: 'open', chips: 1000, bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
    { id: 'p4', name: 'Charlie', presence: 'open', chips: 1000, bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
    { id: 'p5', name: 'Daisy',   presence: 'open', chips: 1000, bet: 0, totalBet: 0, cards: [], status: 'active', isDealer: false, declaration: null, hasActed: false },
  ];
};

export const createInitialState = (heroChips: number = 1000): GameState => ({
  tableId: generateTableCode(),
  phase: 'WAITING',
  pot: 0,
  currentBet: 0,
  minBet: 2,
  activePlayerId: 'p1',
  players: createMockPlayers(heroChips),
  communityCards: Array.from({ length: 15 }, () => ({ suit: 'hearts', rank: '2', isHidden: true })),
  messages: [{ id: 'm1', text: 'Game ready. Waiting for start...', time: Date.now() }],
  chatMessages: [],
  deck: [],
  discardPile: []
});
