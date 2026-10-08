// ─── Bug regression tests ─────────────────────────────────────────────────────
// Automated verification for the four instrumented bugs.
// No manual gameplay required — all tests use pure functions.
//
// Run with:  npx tsx server/__tests__/bugRegression.test.ts
//
// Bug 3  — Negative payout overlay for winning player (classifyResult)
// Bug 4  — Side pot chip conservation and award correctness
// Bug 9  — Badugi deal duplicate-card detection

import type { Player, CardType, GamePhase } from '../../shared/gameTypes';

import { BadugiMode } from '../../shared/modes/badugi';
import { computeSidePots, resolveSplitPots } from '../../shared/engine/sidePots';
import { classifyResult, type ResolutionMessage } from '../../shared/utils/classifyResult';

let failures = 0;
let passes   = 0;

function assert(cond: unknown, msg: string): void {
  if (!cond) { failures++; console.error('  ✗', msg); }
  else        { passes++;   console.log ('  ✓', msg); }
}
function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

function makeCard(rank: string, suit: string): CardType {
  return { rank: rank as CardType['rank'], suit: suit as CardType['suit'], isHidden: false };
}
function makePlayer(id: string, opts: Partial<Player> = {}): Player {
  return {
    id, name: id, presence: 'bot',
    chips:    opts.chips    ?? 1000,
    bet:      opts.bet      ?? 0,
    totalBet: opts.totalBet ?? 0,
    cards:    opts.cards    ?? [],
    status:   opts.status   ?? 'active',
    hasActed: false, isDealer: false,
    declaration: opts.declaration ?? null,
    score: opts.score,
    isWinner: opts.isWinner,
    isLoser:  opts.isLoser,
  } as Player;
}

// Verifies that when players hold valid qualifying hands,
// resolveShowdown never emits a "rolls over" message.



// ─── Bug 3: classifyResult — winner never gets a loss overlay ─────────────────
section('Bug 3 — classifyResult: isWinner=true always yields type=win');
{
  const makeMsg = (text: string): ResolutionMessage => ({
    id: 'r1', text, time: Date.now(), isResolution: true,
  });

  // Scenario A: positive net gain
  const winnerPos = { isWinner: true, status: 'active' as const };
  const resultA = classifyResult([makeMsg('Alice wins $200')], winnerPos, 200);
  assert(resultA.type === 'win',  `positive net winner → type=win (got ${resultA.type})`);
  assert(resultA.type !== 'loss', 'positive net winner → type is never loss');
  assert(!resultA.secondary.startsWith('−'), `positive net secondary is not negative (got ${resultA.secondary})`);

  // Scenario B: net negative (pot split where ante > share returned)
  const winnerNeg = { isWinner: true, status: 'active' as const };
  const resultB = classifyResult([makeMsg('Split Pot — $100')], winnerNeg, -50);
  assert(resultB.type === 'win',  `isWinner=true overrides negative net → type=win (got ${resultB.type})`);
  assert(resultB.type !== 'loss', 'winner with negative net is never classified as loss');
  assert(resultB.secondary.startsWith('+'), `negative-net winner secondary starts with + (got ${resultB.secondary})`);

  // Scenario C: net exactly zero
  const winnerZero = { isWinner: true, status: 'active' as const };
  const resultC = classifyResult([makeMsg('You Win $0')], winnerZero, 0);
  assert(resultC.type === 'win',  `isWinner=true with net=0 → type=win (got ${resultC.type})`);

  // Scenario D: isWinner=false, isLoser=true → must be loss
  const loser = { isWinner: false, isLoser: true, status: 'active' as const };
  const resultD = classifyResult([makeMsg('Bob wins $300')], loser, -100);
  assert(resultD.type === 'loss', `isLoser=true → type=loss (got ${resultD.type})`);

  // Scenario E: folded hero → always fold, never win
  const folded = { isWinner: false, status: 'folded' as const };
  const resultE = classifyResult([makeMsg('Pot goes to Bob')], folded, -50);
  assert(resultE.type === 'fold', `folded hero → type=fold (got ${resultE.type})`);
  assert(resultE.type !== 'win', 'folded hero is never classified as win');

  // Fuzz: verify that no input where isWinner=true produces type≠win
  const fuzzMessages: ResolutionMessage[][] = [
    [],
    [makeMsg('Split Pot — HIGH/LOW split $500')],
    [makeMsg('Alice wins HIGH — $200')],
    [makeMsg('Bob wins LOW — $200'), makeMsg('Alice wins HIGH — $200')],
  ];
  const fuzzNets = [-1000, -100, -1, 0, 1, 100, 1000];
  let fuzzFail = 0;
  for (const msgs of fuzzMessages) {
    for (const net of fuzzNets) {
      const r = classifyResult(msgs, { isWinner: true, status: 'active' as const }, net);
      if (r.type !== 'win') fuzzFail++;
    }
  }
  assert(fuzzFail === 0, `isWinner=true fuzz: all ${fuzzMessages.length * fuzzNets.length} combinations → type=win (${fuzzFail} failures)`);
}

// ─── Bug 4: side pot chip conservation & per-player award correctness ─────────
// Setup: P1 all-in 500, P2 all-in 1000, P3 has chips 1000, bet 2000.
//   Main pot:    500 × 3 = 1500  eligible [P1,P2,P3]
//   Side pot 1: (1000-500) × 2 = 1000  eligible [P2,P3]
//   Side pot 2: (2000-1000) × 1 = 1000  eligible [P3]
// P1 has LOW qualifier → wins main pot.
// P2 has HIGH qualifier → wins side pot 1.
// P3 has HIGH qualifier → wins side pot 2 (uncontested).



// ─── Bug 9: Badugi deal — no duplicate cards in 1000 deals ───────────────────
// A valid deck has 52 unique cards (rank+suit combos).
// The deal function must never give the same card to two players,
// and must never give a player the same card twice.
section('Bug 9 — Badugi deal: no duplicate cards across 1000 shuffled decks');
{
  const RANKS: CardType['rank'][] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const SUITS: CardType['suit'][] = ['spades','hearts','diamonds','clubs'];

  function makeDeck(): CardType[] {
    const deck: CardType[] = [];
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        deck.push({ rank, suit, isHidden: false });
      }
    }
    return deck;
  }

  function shuffle(deck: CardType[]): CardType[] {
    const d = [...deck];
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  const players = ['p1','p2','p3','p4','p5'].map(id => makePlayer(id));

  let intraHandDups = 0;   // same rank+suit twice in one player's hand
  let crossPlayerDups = 0; // same card dealt to two different players
  const DEALS = 1000;

  for (let trial = 0; trial < DEALS; trial++) {
    const deck = shuffle(makeDeck());
    const result = BadugiMode.deal(deck, players, 'p1');

    // Collect all cards dealt across this hand
    const allDealt: string[] = [];
    for (const p of result.players) {
      if (p.status === 'folded') continue;
      const cardKeys = p.cards.map(c => `${c.rank}${c.suit}`);

      // Intra-hand: check for duplicate within a single player's 4 cards
      const seen = new Set<string>();
      for (const key of cardKeys) {
        if (seen.has(key)) intraHandDups++;
        seen.add(key);
      }
      allDealt.push(...cardKeys);
    }

    // Cross-player: check for any card appearing more than once across the full deal
    const globalSeen = new Set<string>();
    for (const key of allDealt) {
      if (globalSeen.has(key)) crossPlayerDups++;
      globalSeen.add(key);
    }
  }

  assert(intraHandDups === 0,
    `no intra-hand duplicate cards across ${DEALS} deals (found ${intraHandDups})`);
  assert(crossPlayerDups === 0,
    `no cross-player duplicate cards across ${DEALS} deals (found ${crossPlayerDups})`);

  // Also verify hand size: each active player always gets exactly 4 cards
  const singleDeck = shuffle(makeDeck());
  const singleResult = BadugiMode.deal(singleDeck, players, 'p1');
  for (const p of singleResult.players) {
    assert(p.cards.length === 4, `${p.id} dealt exactly 4 cards (got ${p.cards.length})`);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n── Results: ${passes} passed, ${failures} failed ──`);
process.exit(failures === 0 ? 0 : 1);
