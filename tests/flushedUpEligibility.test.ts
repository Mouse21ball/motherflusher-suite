import { describe, expect, it } from 'vitest';
import type { CardType, Player } from '../shared/gameTypes';
import { FlushedUpMode } from '../shared/modes/flushedUp';

function card(rank: string, suit: string): CardType {
  return { rank: rank as CardType['rank'], suit: suit as CardType['suit'], isHidden: false };
}

function player(
  id: string,
  cards: CardType[],
  opts: { chips: number; totalBet: number; status?: Player['status'] },
): Player {
  return {
    id,
    name: id,
    presence: 'bot',
    chips: opts.chips,
    bet: 0,
    totalBet: opts.totalBet,
    cards,
    status: opts.status ?? 'active',
    hasActed: true,
    isDealer: false,
    declaration: null,
  } as Player;
}

function chipsAndPot(players: Player[], pot: number): number {
  return players.reduce((total, p) => total + p.chips, 0) + pot;
}

describe('Flushed Up showdown flush qualification', () => {
  it('rolls over when contested 2- and 4-card hands have no flush', () => {
    const short = player('short', [card('A', 'hearts'), card('K', 'hearts')], { chips: 975, totalBet: 25 });
    const four = player('four', [
      card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'), card('J', 'spades'),
    ], { chips: 975, totalBet: 25 });
    const pot = 50;

    const result = FlushedUpMode.resolveShowdown([short, four], pot);

    expect(result.pot).toBe(pot);
    expect(result.players.some(p => p.isWinner)).toBe(false);
    expect(chipsAndPot(result.players, result.pot)).toBe(chipsAndPot([short, four], pot));
  });

  it('awards contested pots only to a qualifying five-card flush', () => {
    const flush = player('flush', [
      card('2', 'hearts'), card('4', 'hearts'), card('6', 'hearts'), card('8', 'hearts'), card('10', 'hearts'),
    ], { chips: 975, totalBet: 25 });
    const highNonFlush = player('high-nonflush', [
      card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'), card('J', 'spades'),
    ], { chips: 975, totalBet: 25 });
    const pot = 50;

    const result = FlushedUpMode.resolveShowdown([flush, highNonFlush], pot);

    expect(result.players.find(p => p.isWinner)?.id).toBe('flush');
    expect(chipsAndPot(result.players, result.pot)).toBe(chipsAndPot([flush, highNonFlush], pot));
  });

  it('rolls over the pot when the sole survivor has no flush', () => {
    const sole = player('sole', [
      card('A', 'clubs'), card('K', 'clubs'), card('Q', 'clubs'), card('J', 'clubs'),
    ], { chips: 975, totalBet: 25 });
    const folded = player('folded', [], { chips: 975, totalBet: 25, status: 'folded' });
    const pot = 50;

    const result = FlushedUpMode.resolveShowdown([sole, folded], pot);

    expect(result.pot).toBe(pot);
    expect(result.players.find(p => p.id === 'sole')?.isWinner).toBeFalsy();
    expect(chipsAndPot(result.players, result.pot)).toBe(chipsAndPot([sole, folded], pot));
  });

  it('rolls over only side-pot tiers with no qualifying flush', () => {
    const tierFlush = player('tier-flush', [
      card('2', 'hearts'), card('4', 'hearts'), card('6', 'hearts'), card('8', 'hearts'), card('10', 'hearts'),
    ], { chips: 950, totalBet: 50 });
    const tierNoFlush1 = player('tier-no-flush-1', [
      card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'), card('J', 'spades'),
    ], { chips: 900, totalBet: 100 });
    const tierNoFlush2 = player('tier-no-flush-2', [
      card('A', 'clubs'), card('K', 'clubs'), card('Q', 'clubs'), card('J', 'clubs'),
    ], { chips: 900, totalBet: 100 });
    const pot = 250;
    const players = [tierFlush, tierNoFlush1, tierNoFlush2];

    const result = FlushedUpMode.resolveShowdown(players, pot);

    expect(result.players.find(p => p.isWinner)?.id).toBe('tier-flush');
    expect(result.pot).toBe(100);
    expect(chipsAndPot(result.players, result.pot)).toBe(chipsAndPot(players, pot));
  });
});