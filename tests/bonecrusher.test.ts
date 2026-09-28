// ─── Bonecrusher evaluator & showdown tests ───────────────────────────────────
// Covers: bestHighHand / bestLowHand via evaluateBonecrusher, SWING all-or-
// nothing rule, partial SWING fallback to non-SWING contestants, pot carryover
// when no declarers qualify.

import { describe, it, expect } from 'vitest';
import {
  evaluateBonecrusher,
  BonecrusherMode,
} from '../shared/modes/bonecrusher';
import type { CardType, Player } from '../shared/gameTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function card(rank: string, suit: string): CardType {
  return { rank: rank as CardType['rank'], suit: suit as CardType['suit'], isHidden: false };
}

function player(
  id: string,
  cards: CardType[],
  opts: {
    chips?: number;
    declaration?: Player['declaration'];
    status?: Player['status'];
    totalBet?: number;
  } = {},
): Player {
  return {
    id,
    name: id,
    presence: 'bot',
    chips: opts.chips ?? 1000,
    bet: 0,
    totalBet: opts.totalBet ?? 0,
    cards,
    status: opts.status ?? 'active',
    hasActed: true,
    isDealer: false,
    declaration: opts.declaration ?? null,
  } as Player;
}

// ─── Card sets for controlled evaluation ──────────────────────────────────────

// Royal Flush spades — strongest possible HIGH hand
const royalFlushCards = [
  card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'),
  card('J', 'spades'), card('10', 'spades'), card('9', 'spades'),
];

// A-2-3-4-5 (wheel) — strongest LOW hand (ace-to-five low)
const wheelCards = [
  card('A', 'clubs'), card('2', 'clubs'), card('3', 'diamonds'),
  card('4', 'hearts'), card('5', 'spades'), card('6', 'clubs'),
];

// Pair of aces + junk — mediocre high, bad low
const pairAceCards = [
  card('A', 'hearts'), card('A', 'spades'), card('2', 'clubs'),
  card('3', 'diamonds'), card('4', 'hearts'), card('5', 'clubs'),
];

// All high cards — terrible low hand (K Q J 10 9 8)
const highOnlyCards = [
  card('K', 'spades'), card('Q', 'hearts'), card('J', 'clubs'),
  card('10', 'diamonds'), card('9', 'spades'), card('8', 'hearts'),
];

// Straight flush + wheel: A-2-3-4-5 clubs + extra (K♦) — wins both HIGH and LOW
const straightFlushWheelCards = [
  card('A', 'clubs'), card('2', 'clubs'), card('3', 'clubs'),
  card('4', 'clubs'), card('5', 'clubs'), card('K', 'diamonds'),
];

// ─── evaluateBonecrusher ──────────────────────────────────────────────────────

describe('evaluateBonecrusher — hand evaluation', () => {
  it('returns Incomplete for fewer than 5 cards', () => {
    const ev = evaluateBonecrusher([card('A', 'hearts'), card('K', 'hearts')]);
    expect(ev.highName).toBe('Incomplete');
    expect(ev.lowDesc).toBe('Incomplete');
  });

  it('identifies Royal Flush as the high hand', () => {
    const ev = evaluateBonecrusher(royalFlushCards);
    expect(ev.highName).toBe('Royal Flush');
    expect(ev.highValue).toBeGreaterThan(0);
  });

  it('wheel (A-2-3-4-5) has much lower lowValue than all-high-card hand', () => {
    const evWheel = evaluateBonecrusher(wheelCards);
    const evHigh  = evaluateBonecrusher(highOnlyCards); // K Q J 10 9 8 — no Ace, no low cards
    // Wheel (A-2-3-4-5) = best possible ace-to-five low
    // K-Q-J-10-9-8 = weakest possible low (all high ranks)
    expect(evWheel.lowValue).toBeLessThan(evHigh.lowValue);
  });

  it('royalFlush highValue > pairAce highValue', () => {
    const evRoyal = evaluateBonecrusher(royalFlushCards);
    const evPair  = evaluateBonecrusher(pairAceCards);
    expect(evRoyal.highValue).toBeGreaterThan(evPair.highValue);
  });
});

function low(...ranks: string[]): number {
  const suits = ['spades', 'hearts', 'diamonds', 'clubs', 'spades'];
  return evaluateBonecrusher(ranks.map((rank, i) => card(rank, suits[i]))).lowValue;
}

describe('Bonecrusher ace-to-five low ranking', () => {
  it('orders all six duplicate shapes without overlapping tiers', () => {
    const tiers = [
      low('A', '2', '3', '4', '5'),      // no pair
      low('A', 'A', '2', '3', '4'),      // one pair
      low('A', 'A', '2', '2', '3'),      // two pair
      low('A', 'A', 'A', '2', '3'),      // trips
      low('A', 'A', 'A', '2', '2'),      // full house
      low('A', 'A', 'A', 'A', '2'),      // quads
    ];
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i - 1]).toBeLessThan(tiers[i]);
    }
    // Even the worst ranks in a tier must beat the best ranks in the next tier.
    expect(low('9', '10', 'J', 'Q', 'K')).toBeLessThan(low('A', 'A', '2', '3', '4'));
    expect(low('K', 'K', 'J', 'Q', '10')).toBeLessThan(low('A', 'A', '2', '2', '3'));
    expect(low('K', 'K', 'Q', 'Q', 'J')).toBeLessThan(low('A', 'A', 'A', '2', '3'));
    expect(low('K', 'K', 'K', 'Q', 'J')).toBeLessThan(low('A', 'A', 'A', '2', '2'));
    expect(low('K', 'K', 'K', 'Q', 'Q')).toBeLessThan(low('A', 'A', 'A', 'A', '2'));
  });

  it.each([
    [['A', '2', '3', '4', '5'], ['A', '2', '3', '4', '6']], // highest card
    [['A', 'A', '9', '10', 'J'], ['2', '2', '3', '4', '5']], // pair rank before kickers
    [['A', 'A', '2', '3', '4'], ['A', 'A', '2', '3', '5']], // one-pair kicker
    [['A', 'A', '2', '2', 'K'], ['A', 'A', '3', '3', '4']], // higher pair
    [['A', 'A', '2', '2', '3'], ['A', 'A', '2', '2', '4']], // two-pair kicker
    [['A', 'A', 'A', '9', '10'], ['2', '2', '2', '3', '4']], // trip rank
    [['A', 'A', 'A', '2', '3'], ['A', 'A', 'A', '2', '4']], // trip kicker
    [['A', 'A', 'A', '2', '2'], ['A', 'A', 'A', '3', '3']], // full-house pair
    [['A', 'A', 'A', 'A', '2'], ['2', '2', '2', '2', 'A']], // quad rank
    [['A', 'A', 'A', 'A', '2'], ['A', 'A', 'A', 'A', '3']], // quad kicker
  ])('ranks %j ahead of %j within its low tier', (better, worse) => {
    expect(low(...better)).toBeLessThan(low(...worse));
  });
});

// ─── BonecrusherMode.resolveShowdown ─────────────────────────────────────────

describe('BonecrusherMode.resolveShowdown — no declarers (pot carryover)', () => {
  it('rolls over the full pot when no active declarers', () => {
    const players = [
      player('A', royalFlushCards, { status: 'folded', declaration: null }),
      player('B', wheelCards,      { status: 'folded', declaration: null }),
    ];
    const { pot } = BonecrusherMode.resolveShowdown!(players, 400, 'A');
    expect(pot).toBe(400);
  });

  it('rolls over when all present players have no declaration set', () => {
    const players = [
      player('A', royalFlushCards, { declaration: null }),
      player('B', wheelCards,      { declaration: null }),
    ];
    const { pot, messages } = BonecrusherMode.resolveShowdown!(players, 300, 'A');
    expect(pot).toBe(300);
    expect(messages.some(m => /roll/i.test(m))).toBe(true);
  });
});

describe('BonecrusherMode.resolveShowdown — sole survivor', () => {
  it('sole active declarer wins full pot regardless of hand strength', () => {
    const players = [
      player('A', pairAceCards,   { declaration: 'HIGH' }),
      player('B', royalFlushCards, { status: 'folded', declaration: null }),
    ];
    const { players: out, pot } = BonecrusherMode.resolveShowdown!(players, 500, 'A');
    expect(pot).toBe(0);
    expect(out.find(p => p.id === 'A')!.chips).toBe(1500);
    expect(out.find(p => p.id === 'A')!.isWinner).toBe(true);
  });
});

describe('BonecrusherMode.resolveShowdown — HIGH vs LOW split', () => {
  it('splits pot 50/50 between best HIGH and best LOW', () => {
    const players = [
      player('A', royalFlushCards, { declaration: 'HIGH', chips: 1000 }),
      player('B', wheelCards,      { declaration: 'LOW',  chips: 1000 }),
    ];
    const { players: out, pot: remaining } = BonecrusherMode.resolveShowdown!(players, 200, 'A');
    expect(remaining).toBe(0);
    expect(out.find(p => p.id === 'A')!.chips).toBe(1100);
    expect(out.find(p => p.id === 'B')!.chips).toBe(1100);
  });

  it('sole LOW declarer wins the full pot when no HIGH is contested', () => {
    // With only one active declarer, the code hits the "last one standing"
    // path → that player wins the ENTIRE pot (not just the LOW half).
    const players = [
      player('A', wheelCards, { declaration: 'LOW', chips: 1000 }),
      player('B', royalFlushCards, { status: 'folded', declaration: null, chips: 1000 }),
    ];
    const { players: out, pot: remaining } = BonecrusherMode.resolveShowdown!(players, 200, 'A');
    // A is the sole active declarer → wins full $200
    expect(out.find(p => p.id === 'A')!.chips).toBe(1200);
    expect(remaining).toBe(0);
  });

  it('only LOW declarers (no HIGH pool) → LOW winner takes full pot', () => {
    // hasHigh=false → code awards full pot to LOW winner (not just half)
    const players = [
      player('A', wheelCards,    { declaration: 'LOW', chips: 1000 }),
      player('B', highOnlyCards, { declaration: 'LOW', chips: 1000 }),
    ];
    const { players: out, pot: remaining } = BonecrusherMode.resolveShowdown!(players, 200, 'A');
    // Wheel (A 2 3 4 5) beats K Q J 10 9 on LOW
    expect(out.find(p => p.id === 'A')!.chips).toBe(1200);
    expect(out.find(p => p.id === 'B')!.chips).toBe(1000);
    expect(remaining).toBe(0);
  });

  it('tie in HIGH pool is split evenly', () => {
    // Two identical royal flush hands — highValue should be the same
    const rf2 = [
      card('A', 'hearts'), card('K', 'hearts'), card('Q', 'hearts'),
      card('J', 'hearts'), card('10', 'hearts'), card('9', 'hearts'),
    ];
    const players = [
      player('A', royalFlushCards, { declaration: 'HIGH', chips: 1000 }),
      player('B', rf2,             { declaration: 'HIGH', chips: 1000 }),
    ];
    const { players: out, pot: remaining } = BonecrusherMode.resolveShowdown!(players, 200, 'A');
    expect(remaining).toBe(0);
    expect(out.find(p => p.id === 'A')!.chips).toBe(1100);
    expect(out.find(p => p.id === 'B')!.chips).toBe(1100);
  });
});

describe('BonecrusherMode.resolveShowdown — SWING all-or-nothing', () => {
  it('SWING player who wins both sides scoops the entire pot', () => {
    // A = [A♣ 2♣ 3♣ 4♣ 5♣ K♦]:
    //   HIGH: best 5-card high = A-2-3-4-5 clubs = Straight Flush (~8M) > opponent flush
    //   LOW:  best 5-card low  = A-2-3-4-5 (wheel) << opponent's low
    // B/C = [K♠ Q♠ J♠ 9♠ 7♠ 6♠]:
    //   HIGH: best 5-card is a Flush (~5M) < A's straight flush
    //   LOW:  best 5-card = 6-7-9-J-Q >> A's wheel
    const highLowCombo = [
      card('K', 'spades'), card('Q', 'spades'), card('J', 'spades'),
      card('9', 'spades'), card('7', 'spades'), card('6', 'spades'),
    ];
    const players = [
      player('A', straightFlushWheelCards, { declaration: 'SWING', chips: 1000 }),
      player('B', highLowCombo,            { declaration: 'HIGH',  chips: 1000 }),
      player('C', highLowCombo,            { declaration: 'LOW',   chips: 1000 }),
    ];
    const { players: out, pot: remaining } = BonecrusherMode.resolveShowdown!(players, 300, 'A');
    const chipsA = out.find(p => p.id === 'A')!.chips;
    expect(remaining).toBe(0);
    expect(chipsA).toBe(1300); // A scoops all $300
    expect(out.find(p => p.id === 'A')!.isWinner).toBe(true);
  });

  it('SWING who loses HIGH forfeits — HIGH goes to non-SWING HIGH declarer', () => {
    // A declares SWING with a mediocre hand; B declares HIGH with royal flush
    const players = [
      player('A', pairAceCards,    { declaration: 'SWING', chips: 1000 }),
      player('B', royalFlushCards, { declaration: 'HIGH',  chips: 1000 }),
      player('C', wheelCards,      { declaration: 'LOW',   chips: 1000 }),
    ];
    const { players: out, pot: remaining } = BonecrusherMode.resolveShowdown!(players, 200, 'A');
    expect(remaining).toBe(0);
    const chipsA = out.find(p => p.id === 'A')!.chips;
    const chipsB = out.find(p => p.id === 'B')!.chips;
    const chipsC = out.find(p => p.id === 'C')!.chips;
    // A wins neither side (SWING fails)
    expect(chipsA).toBe(1000);
    // B wins HIGH half ($100), C wins LOW half ($100)
    expect(chipsB).toBe(1100);
    expect(chipsC).toBe(1100);
  });

  it('SWING who loses LOW forfeits — LOW goes to non-SWING LOW declarer', () => {
    // A is best HIGH but worst LOW — SWING fails
    const highOnlyCards = [
      card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'),
      card('J', 'spades'), card('10', 'spades'), card('9', 'spades'),
    ];
    const players = [
      player('A', highOnlyCards, { declaration: 'SWING', chips: 1000 }),
      player('B', pairAceCards,  { declaration: 'HIGH',  chips: 1000 }),
      player('C', wheelCards,    { declaration: 'LOW',   chips: 1000 }),
    ];
    const { players: out } = BonecrusherMode.resolveShowdown!(players, 200, 'A');
    // A beats B on HIGH, but loses on LOW vs C → SWING fails → A gets nothing
    expect(out.find(p => p.id === 'A')!.chips).toBe(1000);
    // C wins LOW half; HIGH falls to non-SWING: only B → B wins
    expect(out.find(p => p.id === 'C')!.chips).toBe(1100);
    expect(out.find(p => p.id === 'B')!.chips).toBe(1100);
  });

  it('fails SWING when it wins HIGH outright but ties for best LOW', () => {
    const players = [
      player('A', straightFlushWheelCards, { declaration: 'SWING', chips: 1000 }),
      player('B', wheelCards,               { declaration: 'LOW',   chips: 1000 }),
      player('C', pairAceCards,              { declaration: 'HIGH',  chips: 1000 }),
    ];
    const { players: out, pot } = BonecrusherMode.resolveShowdown!(players, 200, 'A');

    expect(pot).toBe(0);
    expect(out.find(p => p.id === 'A')!.chips).toBe(1000);
    expect(out.find(p => p.id === 'B')!.chips).toBe(1100);
    expect(out.find(p => p.id === 'C')!.chips).toBe(1100);
  });

  it('fails SWING when it ties for best HIGH but wins LOW outright', () => {
    const highOnlyCards = [
      card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'),
      card('J', 'spades'), card('10', 'spades'), card('9', 'spades'),
    ];
    const players = [
      player('A', straightFlushWheelCards, { declaration: 'SWING', chips: 1000 }),
      player('B', straightFlushWheelCards, { declaration: 'HIGH',  chips: 1000 }),
      player('C', highOnlyCards,           { declaration: 'LOW',   chips: 1000 }),
    ];
    const { players: out, pot } = BonecrusherMode.resolveShowdown!(players, 200, 'A');

    expect(pot).toBe(0);
    expect(out.find(p => p.id === 'A')!.chips).toBe(1000);
    expect(out.find(p => p.id === 'B')!.chips).toBe(1100);
    expect(out.find(p => p.id === 'C')!.chips).toBe(1100);
  });

  it('falls back to non-SWING declarers when SWING players tie on both sides', () => {
    const players = [
      player('A', straightFlushWheelCards, { declaration: 'SWING', chips: 1000 }),
      player('B', straightFlushWheelCards, { declaration: 'SWING', chips: 1000 }),
      player('C', pairAceCards,              { declaration: 'HIGH',  chips: 1000 }),
      player('D', highOnlyCards,              { declaration: 'LOW',   chips: 1000 }),
    ];
    const { players: out, pot } = BonecrusherMode.resolveShowdown!(players, 200, 'A');

    expect(pot).toBe(0);
    expect(out.find(p => p.id === 'A')!.chips).toBe(1000);
    expect(out.find(p => p.id === 'B')!.chips).toBe(1000);
    expect(out.find(p => p.id === 'C')!.chips).toBe(1100);
    expect(out.find(p => p.id === 'D')!.chips).toBe(1100);
  });

  it('resolves normally among all declarers when every declarer is SWING', () => {
    const players = [
      player('A', royalFlushCards, { declaration: 'SWING', chips: 1000 }),
      player('B', wheelCards,      { declaration: 'SWING', chips: 1000 }),
    ];
    const { players: out, pot } = BonecrusherMode.resolveShowdown!(players, 200, 'A');

    expect(pot).toBe(0);
    expect(out.find(p => p.id === 'A')!.chips).toBe(1100);
    expect(out.find(p => p.id === 'B')!.chips).toBe(1100);
  });

  it('splits normally when all SWING declarers tie on both sides', () => {
    const players = [
      player('A', straightFlushWheelCards, { declaration: 'SWING', chips: 1000 }),
      player('B', straightFlushWheelCards, { declaration: 'SWING', chips: 1000 }),
    ];
    const { players: out, pot } = BonecrusherMode.resolveShowdown!(players, 200, 'A');

    expect(pot).toBe(0);
    expect(out.find(p => p.id === 'A')!.chips).toBe(1100);
    expect(out.find(p => p.id === 'B')!.chips).toBe(1100);
  });
});

describe('BonecrusherMode.resolveShowdown — chip conservation', () => {
  it('total chips + remaining pot never change', () => {
    const players = [
      player('A', royalFlushCards, { declaration: 'SWING', chips: 700 }),
      player('B', wheelCards,      { declaration: 'LOW',   chips: 500 }),
      player('C', pairAceCards,    { declaration: 'HIGH',  chips: 300 }),
    ];
    const pot = 300;
    const totalBefore = players.reduce((s, p) => s + p.chips, 0) + pot;
    const { players: out, pot: remaining } = BonecrusherMode.resolveShowdown!(players, pot, 'A');
    const totalAfter = out.reduce((s, p) => s + p.chips, 0) + remaining;
    expect(totalAfter).toBe(totalBefore);
  });
});

describe('BonecrusherMode.resolveShowdown — side pots', () => {
  it('keeps the LOW-side odd chip and never pays more than the net pot', () => {
    const players = [
      player('A', royalFlushCards, { declaration: 'HIGH', chips: 0, totalBet: 51 }),
      player('B', wheelCards, { declaration: 'LOW', chips: 0, totalBet: 51 }),
    ];
    const { players: out, pot } = BonecrusherMode.resolveShowdown!(players, 101, 'A');
    expect(out.map(p => p.chips)).toEqual([50, 51]);
    expect(pot).toBe(0);
  });

  it('restricts a short all-in to the main pot and splits the overbet pot by eligible hands', () => {
    const players = [
      player('A', royalFlushCards, { declaration: 'HIGH', chips: 0, totalBet: 50 }),
      player('B', wheelCards, { declaration: 'LOW', chips: 0, totalBet: 150 }),
      player('C', highOnlyCards, { declaration: 'HIGH', chips: 0, totalBet: 150 }),
    ];
    const { players: out, pot } = BonecrusherMode.resolveShowdown!(players, 350, 'A');
    expect(out.map(p => p.chips)).toEqual([75, 175, 100]);
    expect(pot).toBe(0);
  });

  it('awards the full side pot to HIGH when its eligible players have no LOW declarer', () => {
    const players = [
      player('A', royalFlushCards, { declaration: 'HIGH', chips: 0, totalBet: 50 }),
      player('B', highOnlyCards, { declaration: 'HIGH', chips: 0, totalBet: 150 }),
      player('C', pairAceCards, { declaration: 'HIGH', chips: 0, totalBet: 150 }),
    ];
    const { players: out, pot } = BonecrusherMode.resolveShowdown!(players, 350, 'A');
    expect(out.map(p => p.chips)).toEqual([150, 200, 0]);
    expect(pot).toBe(0);
  });

  it('judges SWING separately in the main and side pot, conserving all chips', () => {
    const players = [
      player('A', royalFlushCards, { declaration: 'HIGH', chips: 25, totalBet: 50 }),
      player('B', straightFlushWheelCards, { declaration: 'SWING', chips: 75, totalBet: 150 }),
      player('C', highOnlyCards, { declaration: 'LOW', chips: 75, totalBet: 150 }),
      player('D', pairAceCards, { status: 'folded', chips: 30, totalBet: 100 }),
    ];
    const before = players.reduce((sum, p) => sum + p.chips, 450);
    const { players: out, pot } = BonecrusherMode.resolveShowdown!(players, 450, 'A');
    expect(out.map(p => p.chips)).toEqual([125, 325, 175, 30]);
    expect(out.reduce((sum, p) => sum + p.chips, pot)).toBe(before);
    expect(pot).toBe(0);
  });
});
