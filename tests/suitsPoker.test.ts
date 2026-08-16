// ─── Suits Poker evaluator & showdown tests ───────────────────────────────────
// Covers: evaluateSuitsScore, qualifiesForSuits, path-based suits evaluation,
// dual-pot POKER/SUITS/SWING resolution, SWING all-or-nothing rule, uncontested
// pots, failed SWING fallback, tie-breaking, Side A+Center vs Side B+Center.

import { describe, it, expect } from 'vitest';
import {
  evaluateSuitsScore,
  qualifiesForSuits,
  evaluateBestSuitsOnPath,
  SuitsPokerMode,
  PATH_A_INDICES,
  PATH_B_INDICES,
} from '../shared/modes/suitspoker';
import type { CardType, Player } from '../shared/gameTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function card(rank: string, suit: string, hidden = false): CardType {
  return { rank: rank as CardType['rank'], suit: suit as CardType['suit'], isHidden: hidden };
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

// Build a 15-card community array with a placeholder for unused indices
function comm15(overrides: Record<number, CardType>): CardType[] {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  let ri = 0;
  return Array.from({ length: 15 }, (_, i) => {
    if (overrides[i]) return overrides[i];
    // Fill with a guaranteed-unique low-value card
    const c = card(ranks[ri % ranks.length], suits[Math.floor(ri / ranks.length) % 4]);
    ri++;
    return c;
  });
}

// ─── evaluateSuitsScore ───────────────────────────────────────────────────────

describe('evaluateSuitsScore', () => {
  it('returns 0 for empty card array', () => {
    expect(evaluateSuitsScore([])).toBe(0);
  });

  it('sums the best single suit', () => {
    // 2 hearts = 2 pts, A hearts = 11 pts → best suit = hearts = 13
    const cards = [card('2', 'hearts'), card('A', 'hearts'), card('K', 'diamonds')];
    expect(evaluateSuitsScore(cards)).toBe(13);
  });

  it('J/Q/K all count as 10 pts', () => {
    const cards = [card('J', 'hearts'), card('Q', 'hearts'), card('K', 'hearts')];
    expect(evaluateSuitsScore(cards)).toBe(30);
  });

  it('picks the suit with the highest total, not the most cards', () => {
    // 1 ace of hearts (11 pts) vs 3 twos of spades (6 pts)
    const cards = [
      card('A', 'hearts'),
      card('2', 'spades'), card('2', 'spades'), card('2', 'spades'),
    ];
    expect(evaluateSuitsScore(cards)).toBe(11); // hearts wins
  });
});

// ─── qualifiesForSuits ────────────────────────────────────────────────────────

describe('qualifiesForSuits', () => {
  it('qualifies with exactly 5 visible same-suit cards', () => {
    const cards = [
      card('A', 'hearts'), card('K', 'hearts'), card('Q', 'hearts'),
      card('J', 'hearts'), card('10', 'hearts'),
    ];
    expect(qualifiesForSuits(cards)).toBe(true);
  });

  it('qualifies with 6 same-suit visible cards', () => {
    const cards = Array.from({ length: 6 }, (_, i) =>
      card(String(i + 2), 'hearts'),
    );
    expect(qualifiesForSuits(cards)).toBe(true);
  });

  it('does not qualify with only 4 same-suit visible cards', () => {
    const cards = [
      card('A', 'hearts'), card('K', 'hearts'), card('Q', 'hearts'), card('J', 'hearts'),
      card('10', 'spades'),
    ];
    expect(qualifiesForSuits(cards)).toBe(false);
  });

  it('hidden cards do not count toward qualification', () => {
    const cards = [
      card('A', 'hearts', true), card('K', 'hearts', true),  // hidden
      card('Q', 'hearts'), card('J', 'hearts'), card('10', 'hearts'), card('9', 'hearts'),
    ];
    // Only 4 visible hearts → does not qualify
    expect(qualifiesForSuits(cards)).toBe(false);
  });
});

// ─── evaluateBestSuitsOnPath ──────────────────────────────────────────────────

describe('evaluateBestSuitsOnPath — Side A vs Side B isolation', () => {
  // Community layout:
  //   Side A  (0,1,2):       all hearts
  //   Side B  (3,4,5):       all spades
  //   Center  (6..14):       mixed

  it('PATH_A sees Side A hearts, PATH_B does not', () => {
    // Center cards intentionally spread across suits (≤3 of any one suit)
    // so PATH_B [3,4,5,6..14] never reaches 5 of any single suit.
    //
    // PATH_A hearts: Side A (0,1,2) = A♥ K♥ Q♥ +  Center (6,7,10) = J♥ 10♥ 7♥ → 6 ✓
    // PATH_B:  max per suit = 3 (no suit reaches 5) → does NOT qualify.
    const holeCards: CardType[] = [];
    const community: CardType[] = [
      card('A', 'hearts'),   // [0]  Side A
      card('K', 'hearts'),   // [1]  Side A
      card('Q', 'hearts'),   // [2]  Side A
      card('J', 'spades'),   // [3]  Side B
      card('10', 'spades'),  // [4]  Side B
      card('9', 'spades'),   // [5]  Side B
      card('J', 'hearts'),   // [6]  Center ♥
      card('10', 'hearts'),  // [7]  Center ♥
      card('5', 'diamonds'), // [8]  Center ♦
      card('6', 'clubs'),    // [9]  Center ♣
      card('7', 'hearts'),   // [10] Center ♥  (PATH_A has 6 hearts total; PATH_B only 3)
      card('8', 'diamonds'), // [11] Center ♦
      card('9', 'clubs'),    // [12] Center ♣
      card('2', 'diamonds'), // [13] Center ♦
      card('3', 'clubs'),    // [14] Center ♣
    ];

    const pathA = evaluateBestSuitsOnPath(holeCards, community, PATH_A_INDICES);
    const pathB = evaluateBestSuitsOnPath(holeCards, community, PATH_B_INDICES);

    expect(pathA.valid).toBe(true);
    expect(pathA.suit).toBe('hearts');
    // PATH_B max: spades(3,4,5)=3  hearts(6,7,10)=3  diamonds(8,11,13)=3  clubs(9,12,14)=3 → none qualify
    expect(pathB.valid).toBe(false);
  });

  it('PATH_B sees Side B spades, PATH_A does not', () => {
    // PATH_B spades: Side B (3,4,5) = A♠ K♠ Q♠ + Center (6,7) = J♠ 10♠ → 5 ✓
    // PATH_A: spades only at center (6,7) = 2; other suits spread ≤4 → does NOT qualify.
    const holeCards: CardType[] = [];
    const community: CardType[] = [
      card('2', 'diamonds'), // [0]  Side A ♦
      card('3', 'clubs'),    // [1]  Side A ♣
      card('4', 'hearts'),   // [2]  Side A ♥
      card('A', 'spades'),   // [3]  Side B ♠
      card('K', 'spades'),   // [4]  Side B ♠
      card('Q', 'spades'),   // [5]  Side B ♠
      card('J', 'spades'),   // [6]  Center ♠
      card('10', 'spades'),  // [7]  Center ♠  (PATH_B has 5 spades; PATH_A has only 2)
      card('5', 'diamonds'), // [8]  Center ♦
      card('6', 'clubs'),    // [9]  Center ♣
      card('7', 'diamonds'), // [10] Center ♦
      card('8', 'clubs'),    // [11] Center ♣
      card('9', 'diamonds'), // [12] Center ♦
      card('2', 'clubs'),    // [13] Center ♣
      card('3', 'hearts'),   // [14] Center ♥
    ];

    const pathA = evaluateBestSuitsOnPath(holeCards, community, PATH_A_INDICES);
    const pathB = evaluateBestSuitsOnPath(holeCards, community, PATH_B_INDICES);

    expect(pathB.valid).toBe(true);
    expect(pathB.suit).toBe('spades');
    // PATH_A: spades(6,7)=2  diamonds(0,8,10,12)=4  clubs(1,9,11,13)=4  hearts(2,14)=2 → none qualify
    expect(pathA.valid).toBe(false);
  });
});

// ─── SuitsPokerMode.resolveShowdown ──────────────────────────────────────────
//
// We construct community cards such that:
//   - Player A (POKER):  gets a strong 5-card poker hand via PATH_A
//   - Player B (SUITS):  gets 5+ same-suit cards via PATH_A
//   - Player C (SWING):  competes on both sides
//
// Community layout (15 cards) — designed so:
//   PATH_A (indices 0,1,2,6..14): has exactly 5 low hearts → qualifies for SUITS
//   PATH_B (indices 3,4,5,6..14): no suit reaches 5 → does NOT auto-qualify
//   Community hearts are 2♥-6♥ (LOW values) so no royal flush is possible via community.
//
//   [0]=2♥  [1]=3♥  [2]=4♥    // Side A — low hearts
//   [3]=2♠  [4]=3♦  [5]=4♣    // Side B — mixed
//   [6]=5♥  [7]=6♥             // Center — 2 more hearts → PATH_A total = 5 ♥
//   [8]=7♠  [9]=8♦  [10]=9♣  [11]=10♦  [12]=J♦  [13]=Q♣  [14]=3♣
//
// PATH_A ♥: 0,1,2,6,7 = 5 (score = 2+3+4+5+6 = 20)
// PATH_B ♠: 3,8 = 2 | ♦: 4,9,11,12 = 4 | ♣: 5,10,13,14 = 4 | ♥: 6,7 = 2 → none qualify

const sharedComm: CardType[] = (() => {
  const c = Array.from({ length: 15 }, () => card('2', 'clubs'));
  c[0]  = card('2', 'hearts');   // Side A ♥
  c[1]  = card('3', 'hearts');   // Side A ♥
  c[2]  = card('4', 'hearts');   // Side A ♥
  c[3]  = card('2', 'spades');   // Side B
  c[4]  = card('3', 'diamonds'); // Side B
  c[5]  = card('4', 'clubs');    // Side B
  c[6]  = card('5', 'hearts');   // Center ♥
  c[7]  = card('6', 'hearts');   // Center ♥  → PATH_A now has 5 hearts
  c[8]  = card('7', 'spades');
  c[9]  = card('8', 'diamonds');
  c[10] = card('9', 'clubs');
  c[11] = card('10', 'diamonds');
  c[12] = card('J', 'diamonds');
  c[13] = card('Q', 'clubs');
  c[14] = card('3', 'clubs');
  return c;
})();

// Strong POKER hole: Royal Flush spades from hole cards alone (no community card conflicts)
// Comm ♠: only 2♠ at [3] and 7♠ at [8] — neither overlaps A/K/Q/J/10 spades.
const pokerHole: CardType[] = [
  card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'),
  card('J', 'spades'), card('10', 'spades'),
];

// SUITS hole: adds two HIGH hearts (7♥ 8♥) not in community, so PATH_A has 7 hearts total
// (2♥–8♥ unique) and best-5 score = 8+7+6+5+4 = 30 > community-only 20.
// Also carries diamond cards for its poker hand (diamond flush ≈ 5M — loses to RF).
const suitsHole: CardType[] = [
  card('7', 'hearts'), card('8', 'hearts'),
  card('2', 'diamonds'), card('4', 'diamonds'), card('5', 'diamonds'),
];

// Weak hole: no hearts at all → community-only suits score (20), weak poker hand.
// No card matches any community card (rank+suit unique).
const weakHole: CardType[] = [
  card('A', 'diamonds'), card('5', 'spades'), card('6', 'diamonds'),
  card('8', 'spades'), card('J', 'clubs'),
];

describe('SuitsPokerMode.resolveShowdown — basic POKER vs SUITS split', () => {
  it('POKER declarer wins POKER pot; SUITS declarer wins SUITS pot', () => {
    const players = [
      player('A', pokerHole, { declaration: 'POKER', chips: 1000 }),
      player('B', suitsHole, { declaration: 'SUITS', chips: 1000 }),
    ];
    const { players: out, pot: rem, messages } = SuitsPokerMode.resolveShowdown!(
      players, 200, 'A', sharedComm,
    );
    expect(rem).toBe(0);
    // Each player wins their respective half
    const chipsA = out.find(p => p.id === 'A')!.chips;
    const chipsB = out.find(p => p.id === 'B')!.chips;
    expect(chipsA).toBe(1100);
    expect(chipsB).toBe(1100);
    expect(messages.some(m => m.startsWith('SP_POKER'))).toBe(true);
    expect(messages.some(m => m.startsWith('SP_SUITS'))).toBe(true);
  });
});

describe('SuitsPokerMode.resolveShowdown — uncontested pots', () => {
  it('sole POKER declarer takes both halves when no SUITS contestant', () => {
    // Both declare POKER — no SUITS pool. A (Royal Flush 9M) beats B (flush ~5M).
    // Uncontested SUITS pot goes to the POKER winner (A) as well.
    const players = [
      player('A', pokerHole, { declaration: 'POKER', chips: 1000 }),
      player('B', weakHole,  { declaration: 'POKER', chips: 1000 }), // weaker hole — no RF
    ];
    const { players: out, pot: rem } = SuitsPokerMode.resolveShowdown!(
      players, 200, 'A', sharedComm,
    );
    expect(rem).toBe(0);
    const chipsA = out.find(p => p.id === 'A')!.chips;
    expect(chipsA).toBe(1200); // wins both $100 halves
  });

  it('SUITS declarer takes both halves when no POKER contestant', () => {
    const players = [
      player('A', suitsHole, { declaration: 'SUITS', chips: 1000 }),
      player('B', suitsHole, { declaration: 'SUITS', chips: 1000 }), // everyone SUITS
    ];
    const { players: out, pot: rem } = SuitsPokerMode.resolveShowdown!(
      players, 200, 'A', sharedComm,
    );
    expect(rem).toBe(0);
    // Winner of SUITS pot also takes POKER pot
    const totalChips = out.reduce((s, p) => s + p.chips, 0);
    expect(totalChips).toBe(2200);
  });
});

describe('SuitsPokerMode.resolveShowdown — SWING all-or-nothing', () => {
  it('SWING who wins both sides scoops the full pot', () => {
    // A has the strongest poker hand AND the strongest suits hand
    const players = [
      player('A', pokerHole, { declaration: 'SWING', chips: 1000 }),
      player('B', suitsHole, { declaration: 'SUITS', chips: 1000 }),
      player('C', [card('2', 'spades'), card('3', 'spades'), card('4', 'spades'), card('5', 'spades'), card('6', 'spades')],
        { declaration: 'POKER', chips: 1000 }),
    ];
    // A has royal flush (best poker) AND strong suits through community hearts (hole spades ≥5 same suit?)
    // Actually A's hole is all spades (5 cards) → PATH_A: 5 hole spades + comm hearts; best suits = 5 spades hole ✓
    const { players: out, pot: rem } = SuitsPokerMode.resolveShowdown!(
      players, 300, 'A', sharedComm,
    );
    const chipsA = out.find(p => p.id === 'A')!.chips;
    expect(rem).toBe(0);
    expect(chipsA).toBe(1300); // A scoops all $300
    expect(out.find(p => p.id === 'A')!.isWinner).toBe(true);
  });

  it('SWING who loses one side wins nothing; pot falls to non-SWING contestants', () => {
    // A (SWING, weakHole): no heart hole cards → suits score = 20 (community-only)
    // B (POKER, pokerHole): Royal Flush → wins poker (A can't beat RF)
    // C (SUITS, suitsHole): hearts score = 30 → beats A's 20 on suits side
    // Result: A fails SWING (loses BOTH sides) → wins nothing; B +$100, C +$100
    const players = [
      player('A', weakHole,  { declaration: 'SWING', chips: 1000 }),
      player('B', pokerHole, { declaration: 'POKER', chips: 1000 }),
      player('C', suitsHole, { declaration: 'SUITS', chips: 1000 }),
    ];
    const { players: out, messages } = SuitsPokerMode.resolveShowdown!(
      players, 200, 'A', sharedComm,
    );
    expect(out.find(p => p.id === 'A')!.chips).toBe(1000); // fails SWING → nothing
    expect(messages.some(m => /fail.*swing/i.test(m))).toBe(true);
    expect(out.find(p => p.id === 'B')!.chips).toBe(1100);
    expect(out.find(p => p.id === 'C')!.chips).toBe(1100);
  });
});

describe('SuitsPokerMode.resolveShowdown — sole survivor', () => {
  it('sole active player wins the full pot', () => {
    const players = [
      player('A', pokerHole, { declaration: 'POKER', chips: 1000 }),
      player('B', suitsHole, { status: 'folded', declaration: null, chips: 1000 }),
    ];
    const { players: out, pot: rem } = SuitsPokerMode.resolveShowdown!(
      players, 400, 'A', sharedComm,
    );
    expect(rem).toBe(0);
    expect(out.find(p => p.id === 'A')!.chips).toBe(1400);
  });
});

describe('SuitsPokerMode.resolveShowdown — chip conservation', () => {
  it('total chips + remaining pot never change across any showdown', () => {
    const players = [
      player('A', pokerHole, { declaration: 'SWING', chips: 700 }),
      player('B', suitsHole, { declaration: 'SUITS', chips: 500 }),
      player('C', [card('2', 'spades'), card('3', 'spades'), card('4', 'spades'), card('5', 'spades'), card('6', 'spades')],
        { declaration: 'POKER', chips: 300 }),
    ];
    const pot = 300;
    const totalBefore = players.reduce((s, p) => s + p.chips, 0) + pot;
    const { players: out, pot: rem } = SuitsPokerMode.resolveShowdown!(
      players, pot, 'A', sharedComm,
    );
    const totalAfter = out.reduce((s, p) => s + p.chips, 0) + rem;
    expect(totalAfter).toBe(totalBefore);
  });
});

describe('SuitsPokerMode.resolveShowdown — no active declarers', () => {
  it('full pot rolls over when no player has an active declaration', () => {
    // Nobody declared a side before showdown (e.g. everyone timed out / folded).
    // The resolveShowdown early-return path: active.length === 0 → full rollover.
    const players = [
      player('A', pokerHole, { declaration: null, chips: 1000 }),
      player('B', suitsHole, { declaration: null, chips: 1000 }),
    ];
    const { players: out, pot: rem } = SuitsPokerMode.resolveShowdown!(players, 200, 'A', sharedComm);
    expect(rem).toBe(200); // full pot unawarded
    expect(out.find(p => p.id === 'A')!.chips).toBe(1000);
    expect(out.find(p => p.id === 'B')!.chips).toBe(1000);
  });
});
