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

describe('Flushed Up showdown resolution (no flush gate — Detroit 2026-10-13)', () => {
  it('awards a contested pot to the highest suit count when no flush exists', () => {
    const short = player('short', [card('A', 'hearts'), card('K', 'hearts')], { chips: 975, totalBet: 25 });
    const four = player('four', [
      card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'), card('J', 'spades'),
    ], { chips: 975, totalBet: 25 });
    const pot = 50;

    const result = FlushedUpMode.resolveShowdown([short, four], pot);

    // No flush gate: compareFlushedUpHands ranks by suit count first, so
    // the 4-spade hand (suitCount 4) beats the 2-heart hand (suitCount 2)
    // and takes the whole pot. Nothing rolls over.
    expect(result.pot).toBe(0);
    expect(result.players.find(p => p.isWinner)?.id).toBe('four');
    expect(result.players.find(p => p.id === 'four')?.chips).toBe(1025);
    expect(chipsAndPot(result.players, result.pot)).toBe(chipsAndPot([short, four], pot));
  });

  it('awards a contested pot to a five-card flush over a 4-card suit hand', () => {
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

  it('awards the full pot to the sole survivor with no flush', () => {
    const sole = player('sole', [
      card('A', 'clubs'), card('K', 'clubs'), card('Q', 'clubs'), card('J', 'clubs'),
    ], { chips: 975, totalBet: 25 });
    const folded = player('folded', [], { chips: 975, totalBet: 25, status: 'folded' });
    const pot = 50;

    const result = FlushedUpMode.resolveShowdown([sole, folded], pot);

    // Detroit 2026-10-13/16: last player standing takes the FULL pot —
    // no flush requirement, no rollover.
    expect(result.pot).toBe(0);
    expect(result.players.find(p => p.id === 'sole')?.isWinner).toBe(true);
    expect(result.players.find(p => p.id === 'sole')?.chips).toBe(1025);
    expect(chipsAndPot(result.players, result.pot)).toBe(chipsAndPot([sole, folded], pot));
  });

  it('awards each side-pot tier to its best hand when no flush exists', () => {
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

    // Tier 1 (150, all three eligible): the 5-heart flush wins on suit
    // count. Tier 2 (100, the two 100-bettors): AKQJ spades vs AKQJ clubs
    // is an exact tie (suitCount 4, identical ranks) and splits 50/50.
    // Nothing rolls over (Detroit 2026-10-13: no flush gate).
    expect(result.pot).toBe(0);
    expect(result.players.find(p => p.id === 'tier-flush')?.chips).toBe(1100);
    expect(result.players.find(p => p.id === 'tier-no-flush-1')?.chips).toBe(950);
    expect(result.players.find(p => p.id === 'tier-no-flush-2')?.chips).toBe(950);
    expect(chipsAndPot(result.players, result.pot)).toBe(chipsAndPot(players, pot));
  });
});