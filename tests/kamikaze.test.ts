// ─── Kamikaze evaluator & showdown tests ─────────────────────────────────────
// Covers: 3-2-1 suit distribution, no-pairs constraint, HIGH/LOW/SWING
// declare split, auto-fold-with-pot-carryover when no made hand, tie-breaking.

import { describe, it, expect } from 'vitest';
import {
  evaluateKamikaze,
  compareKamikazeHigh,
  compareKamikazeLow,
  chooseKamikazeDeclaration,
  KamikazeMode,
} from '../shared/modes/kamikaze';
import type { CardType, GameState, Player } from '../shared/gameTypes';

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

// Valid 3-2-1 hand: 3 hearts, 2 diamonds, 1 club — all unique ranks
const valid321 = [
  card('A', 'hearts'), card('K', 'hearts'), card('Q', 'hearts'),
  card('2', 'diamonds'), card('3', 'diamonds'),
  card('5', 'clubs'),
];

// Another valid hand with lower 3-card group
const valid321Low = [
  card('2', 'hearts'), card('3', 'hearts'), card('4', 'hearts'),
  card('5', 'diamonds'), card('6', 'diamonds'),
  card('7', 'clubs'),
];

describe('Kamikaze bot declaration', () => {
  it('chooses the more competitive showdown side rather than flipping a coin', () => {
    const premiumHigh = evaluateKamikaze(valid321);       // A-K-Q high, weak low
    const premiumLow = evaluateKamikaze(valid321Low);     // 2-3-4 low, weak high
    const aceLow = evaluateKamikaze([
      card('A', 'hearts'), card('2', 'hearts'), card('3', 'hearts'),
      card('7', 'diamonds'), card('8', 'diamonds'), card('9', 'clubs'),
    ]);
    expect(chooseKamikazeDeclaration(premiumHigh)).toBe('HIGH');
    expect(chooseKamikazeDeclaration(premiumLow)).toBe('LOW');
    expect(chooseKamikazeDeclaration(aceLow)).toBe('LOW');
    expect(chooseKamikazeDeclaration(premiumHigh)).toBe('HIGH');
  });

  it('uses that decision in botAction and folds non-qualifying hands', () => {
    const declare = (cards: CardType[]) => {
      const state = {
        phase: 'DECLARE', players: [{ ...player('bot', cards), hasActed: false },
          { ...player('human', valid321Low), presence: 'human', hasActed: true }],
        pot: 200, currentBet: 0, deck: [], discardPile: [],
      } as GameState;
      return KamikazeMode.botAction(state, 'bot').stateUpdates.players![0];
    };
    expect(declare(valid321).declaration).toBe('HIGH');
    expect(declare(valid321Low).declaration).toBe('LOW');
    expect(declare([card('A', 'hearts')]).status).toBe('folded');
  });
});

// Invalid: 4-1-1 distribution
const invalid411 = [
  card('A', 'hearts'), card('K', 'hearts'), card('Q', 'hearts'), card('J', 'hearts'),
  card('2', 'diamonds'),
  card('3', 'clubs'),
];

// Invalid: 3-2-1 but paired ranks
const invalidPaired = [
  card('A', 'hearts'), card('A', 'hearts'), card('Q', 'hearts'),
  card('2', 'diamonds'), card('3', 'diamonds'),
  card('5', 'clubs'),
];

// ─── evaluateKamikaze ─────────────────────────────────────────────────────────

describe('evaluateKamikaze — basic validity', () => {
  it('marks a clean 3-2-1 hand as valid', () => {
    const ev = evaluateKamikaze(valid321);
    expect(ev.isValid).toBe(true);
    expect(ev.suitCounts).toEqual([3, 2, 1]);
  });

  it('invalid: 4-1-1 suit distribution', () => {
    const ev = evaluateKamikaze(invalid411);
    expect(ev.isValid).toBe(false);
    expect(ev.description).toMatch(/suits/i);
  });

  it('invalid: paired ranks in otherwise valid 3-2-1', () => {
    const ev = evaluateKamikaze(invalidPaired);
    expect(ev.isValid).toBe(false);
    expect(ev.description).toMatch(/paired/i);
  });

  it('returns empty/invalid for zero cards', () => {
    const ev = evaluateKamikaze([]);
    expect(ev.isValid).toBe(false);
  });
});

describe('evaluateKamikaze — high/low values', () => {
  it('highValue is the top rank of the 3-card suit', () => {
    // Hearts A-K-Q: highRanks sorted desc = [14, 13, 12]
    const ev = evaluateKamikaze(valid321);
    expect(ev.isValid).toBe(true);
    expect(ev.highValue).toBe(14); // Ace high
  });

  it('lowValue is the lowest rank of the 3-card suit (Ace counts as 1)', () => {
    // Hearts A-K-Q: lowRv(A)=1, lowRv(K)=13, lowRv(Q)=12
    // lowRanks sorted ascending = [1, 12, 13] → lowValue = 1 (Ace = 1 for low)
    const ev = evaluateKamikaze(valid321);
    expect(ev.lowValue).toBe(1); // Ace = 1 for low evaluation
  });

  it('ace counts as 1 for low evaluation', () => {
    // Hand: A-2-3 hearts, low → Ace = 1
    const aceHand = [
      card('A', 'hearts'), card('2', 'hearts'), card('3', 'hearts'),
      card('5', 'diamonds'), card('6', 'diamonds'),
      card('7', 'clubs'),
    ];
    const ev = evaluateKamikaze(aceHand);
    expect(ev.isValid).toBe(true);
    expect(ev.lowValue).toBe(1); // Ace = 1 for low
  });

  it('valid321Low has lower highValue than valid321', () => {
    const evHigh = evaluateKamikaze(valid321);     // hearts A-K-Q
    const evLow  = evaluateKamikaze(valid321Low);  // hearts 2-3-4
    expect(evHigh.highValue).toBeGreaterThan(evLow.highValue);
  });
});

// ─── compareKamikazeHigh / compareKamikazeLow ────────────────────────────────

describe('compareKamikazeHigh', () => {
  it('returns positive when first hand wins HIGH', () => {
    const evA = evaluateKamikaze(valid321);     // A-K-Q
    const evB = evaluateKamikaze(valid321Low);  // 2-3-4
    expect(compareKamikazeHigh(evA, evB)).toBeGreaterThan(0);
  });

  it('returns negative when first hand loses HIGH', () => {
    const evA = evaluateKamikaze(valid321Low);  // 2-3-4
    const evB = evaluateKamikaze(valid321);     // A-K-Q
    expect(compareKamikazeHigh(evA, evB)).toBeLessThan(0);
  });

  it('returns 0 for identical high ranks', () => {
    const ev = evaluateKamikaze(valid321);
    expect(compareKamikazeHigh(ev, ev)).toBe(0);
  });
});

describe('compareKamikazeLow', () => {
  it('Ace-low hand wins LOW over 2-3-4 hand (Ace=1 is lowest rank)', () => {
    // valid321 has A-K-Q hearts: lowRanks=[1,12,13], lowValue=1
    // valid321Low has 2-3-4 hearts: lowRanks=[2,3,4], lowValue=2
    // compareKamikazeLow returns b[0]-a[0] = 2-1 = +1 → valid321 wins LOW
    const evA = evaluateKamikaze(valid321);     // A-K-Q → lowValue=1
    const evB = evaluateKamikaze(valid321Low);  // 2-3-4 → lowValue=2
    expect(compareKamikazeLow(evA, evB)).toBeGreaterThan(0); // A wins (1 < 2)
  });

  it('returns negative when first hand loses LOW', () => {
    const evA = evaluateKamikaze(valid321Low); // 2-3-4 → lowValue=2
    const evB = evaluateKamikaze(valid321);    // A-K-Q → lowValue=1
    expect(compareKamikazeLow(evA, evB)).toBeLessThan(0); // B wins (1 < 2)
  });
});

// ─── KamikazeMode.resolveShowdown ────────────────────────────────────────────

describe('KamikazeMode.resolveShowdown — no made hand (pot carryover)', () => {
  it('rolls over the full pot when no players have valid hands', () => {
    const players = [
      player('A', invalid411, { declaration: 'HIGH' }),
      player('B', invalidPaired, { declaration: 'LOW' }),
    ];
    const { players: out, pot } = KamikazeMode.resolveShowdown!(players, 200, 'A');
    expect(pot).toBe(200); // nothing awarded
    const chipTotal = out.reduce((s, p) => s + p.chips, 0);
    expect(chipTotal).toBe(2000); // no chips moved
  });

  it('rolls over when all active players fold (no declarers)', () => {
    const players = [
      player('A', valid321, { status: 'folded', declaration: null }),
      player('B', valid321Low, { status: 'folded', declaration: null }),
    ];
    const { pot } = KamikazeMode.resolveShowdown!(players, 150, 'A');
    expect(pot).toBe(150);
  });
});

describe('KamikazeMode.resolveShowdown — sole survivor', () => {
  it('sole active declarer wins full pot', () => {
    const players = [
      player('A', valid321, { declaration: 'HIGH' }),
      player('B', invalid411, { status: 'folded', declaration: null }),
    ];
    const { players: out, pot } = KamikazeMode.resolveShowdown!(players, 300, 'A');
    expect(pot).toBe(0);
    expect(out.find(p => p.id === 'A')!.chips).toBe(1300);
    expect(out.find(p => p.id === 'A')!.isWinner).toBe(true);
  });

  it('pays the net pot to the sole survivor even when folded players contributed more', () => {
    const players = [
      player('A', valid321, { declaration: 'LOW', chips: 0, totalBet: 50 }),
      player('B', invalid411, { status: 'folded', chips: 0, totalBet: 150 }),
      player('C', valid321Low, { status: 'folded', chips: 0, totalBet: 150 }),
    ];
    const { players: out, pot, messages } = KamikazeMode.resolveShowdown!(players, 333, 'A');
    expect(out.map(p => p.chips)).toEqual([333, 0, 0]);
    expect(out[0].isWinner).toBe(true);
    expect(pot).toBe(0);
    expect(messages).toContain('A wins $333 (last standing)');
  });
});

describe('KamikazeMode.resolveShowdown — HIGH vs LOW split', () => {
  it('splits pot 50/50 between HIGH and LOW winners with valid hands', () => {
    const players = [
      player('A', valid321, { declaration: 'HIGH', chips: 1000 }),     // A-K-Q hearts
      player('B', valid321Low, { declaration: 'LOW', chips: 1000 }),   // 2-3-4 hearts
    ];
    const { players: out, pot: remaining } = KamikazeMode.resolveShowdown!(players, 200, 'A');
    expect(remaining).toBe(0);
    const chipsA = out.find(p => p.id === 'A')!.chips;
    const chipsB = out.find(p => p.id === 'B')!.chips;
    expect(chipsA).toBe(1100); // 1000 + 100
    expect(chipsB).toBe(1100);
  });

  it('awards the entire pot to LOW when HIGH has no valid hand', () => {
    const players = [
      player('A', invalid411, { declaration: 'HIGH', chips: 1000 }),   // invalid — no made hand
      player('B', valid321Low, { declaration: 'LOW', chips: 1000 }),   // valid
    ];
    const { players: out, pot: remaining } = KamikazeMode.resolveShowdown!(players, 200, 'A');
    const chipsA = out.find(p => p.id === 'A')!.chips;
    const chipsB = out.find(p => p.id === 'B')!.chips;
    expect(chipsB).toBe(1200);
    expect(chipsA).toBe(1000);
    expect(remaining).toBe(0);
  });

  it('tie in HIGH pool is split equally', () => {
    // Two identical high-rank hands
    const hand1 = [
      card('A', 'hearts'), card('K', 'hearts'), card('Q', 'hearts'),
      card('2', 'diamonds'), card('3', 'diamonds'),
      card('4', 'clubs'),
    ];
    const hand2 = [
      card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'),
      card('5', 'diamonds'), card('6', 'diamonds'),
      card('7', 'clubs'),
    ];
    const players = [
      player('A', hand1, { declaration: 'HIGH', chips: 1000 }),
      player('B', hand2, { declaration: 'HIGH', chips: 1000 }),
    ];
    const { players: out, pot: remaining } = KamikazeMode.resolveShowdown!(players, 200, 'A');
    const chipsA = out.find(p => p.id === 'A')!.chips;
    const chipsB = out.find(p => p.id === 'B')!.chips;
    expect(chipsA).toBe(1100);
    expect(chipsB).toBe(1100);
    expect(remaining).toBe(0);
  });
});

describe('KamikazeMode.resolveShowdown — side pots', () => {
  it('keeps the LOW-side odd chip and pays only the net pot after rake', () => {
    const players = [
      player('A', valid321, { declaration: 'HIGH', chips: 0, totalBet: 51 }),
      player('B', valid321Low, { declaration: 'LOW', chips: 0, totalBet: 51 }),
    ];
    const { players: out, pot } = KamikazeMode.resolveShowdown!(players, 101, 'A');
    expect(out.map(p => p.chips)).toEqual([50, 51]);
    expect(pot).toBe(0);
  });

  it('limits a short all-in to the main pot and awards the overbet side pot independently', () => {
    const players = [
      player('A', valid321, { declaration: 'HIGH', chips: 0, totalBet: 50 }),
      player('B', valid321Low, { declaration: 'LOW', chips: 0, totalBet: 150 }),
      player('C', invalid411, { declaration: 'HIGH', chips: 0, totalBet: 150 }),
    ];
    const { players: out, pot } = KamikazeMode.resolveShowdown!(players, 350, 'A');
    expect(out.map(p => p.chips)).toEqual([75, 275, 0]);
    expect(pot).toBe(0);
  });

  it('conserves chips with mixed valid hands, a folded contributor, and a short stack', () => {
    const players = [
      player('A', valid321, { declaration: 'HIGH', chips: 25, totalBet: 50 }),
      player('B', valid321Low, { declaration: 'LOW', chips: 75, totalBet: 150 }),
      player('C', invalid411, { declaration: 'HIGH', chips: 75, totalBet: 150 }),
      player('D', invalid411, { status: 'folded', chips: 30, totalBet: 100 }),
    ];
    const before = players.reduce((sum, p) => sum + p.chips, 450);
    const { players: out, pot } = KamikazeMode.resolveShowdown!(players, 450, 'A');
    expect(out.map(p => p.chips)).toEqual([125, 425, 75, 30]);
    expect(out.reduce((sum, p) => sum + p.chips, pot)).toBe(before);
    expect(pot).toBe(0);
  });
});

describe('KamikazeMode.resolveShowdown — chip conservation', () => {
  it('total chips never change across any showdown', () => {
    const players = [
      player('A', valid321, { declaration: 'HIGH', chips: 800 }),
      player('B', valid321Low, { declaration: 'LOW', chips: 600 }),
      player('C', invalid411, { declaration: 'HIGH', chips: 400 }),
    ];
    const pot = 200;
    const totalBefore = players.reduce((s, p) => s + p.chips, 0) + pot;
    const { players: out, pot: remaining } = KamikazeMode.resolveShowdown!(players, pot, 'A');
    const totalAfter = out.reduce((s, p) => s + p.chips, 0) + remaining;
    expect(totalAfter).toBe(totalBefore);
  });
});
