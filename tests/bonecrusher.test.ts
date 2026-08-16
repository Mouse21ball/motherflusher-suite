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
  } = {},
): Player {
  return {
    id,
    name: id,
    presence: 'bot',
    chips: opts.chips ?? 1000,
    bet: 0,
    totalBet: 0,
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
    //   LOW:  best 5-card low  = A-2-3-4-5 (wheel) << opponent's K-Q-J-10-9 low
    // B/C = [K♠ Q♠ J♠ 10♠ 9♠ 8♠]:
    //   HIGH: best 5-card = K-Q-J-10-9 spades = Flush (~5M) < A's straight flush
    //   LOW:  best 5-card = 8-9-10-J-Q (all high ranks) >> A's wheel
    const highLowCombo = [
      card('K', 'spades'), card('Q', 'spades'), card('J', 'spades'),
      card('10', 'spades'), card('9', 'spades'), card('8', 'spades'),
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
