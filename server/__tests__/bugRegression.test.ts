// ─── Bug regression tests ─────────────────────────────────────────────────────
// Automated verification for the four instrumented bugs.
// No manual gameplay required — all tests use pure functions.
//
// Run with:  npx tsx server/__tests__/bugRegression.test.ts
//
// Bug 1  — 15/35 false rollover message
// Bug 3  — Negative payout overlay for winning player (classifyResult)
// Bug 4  — Side pot chip conservation and award correctness
// Bug 9  — Badugi deal duplicate-card detection

import type { Player, CardType, GamePhase } from '../../shared/gameTypes';
import { Fifteen35Mode } from '../../shared/modes/fifteen35';
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

// ─── Bug 1: 15/35 false rollover ─────────────────────────────────────────────
// Verifies that when players hold valid qualifying hands,
// resolveShowdown never emits a "rolls over" message.
section('Bug 1 — 15/35: no false rollover when all players qualify');
{
  // 15/35 card values: A=11, J/Q/K=0.5, numbers=face.
  // qualifiesLow:  total between 13 and 15 inclusive.
  // qualifiesHigh: total between 33 and 35 inclusive.

  // LOW hand:  A(11) + 4 = 15  → qualifiesLow
  const lowCards  = [makeCard('A', 'spades'), makeCard('4', 'hearts')];
  // HIGH hand: 9 + 9 + 9 + 8 = 35  → qualifiesHigh
  const highCards = [makeCard('9', 'spades'), makeCard('9', 'hearts'),
                     makeCard('9', 'diamonds'), makeCard('8', 'clubs')];

  const pLow  = makePlayer('p1', { chips: 0, totalBet: 100, cards: lowCards  });
  const pHigh = makePlayer('p2', { chips: 0, totalBet: 100, cards: highCards });

  const pot = 200;
  const result = Fifteen35Mode.resolveShowdown!([pLow, pHigh], pot);

  const rolloverMsg = result.messages.find(m => /rolls over/i.test(m));
  assert(!rolloverMsg, `no "rolls over" message when both players qualify (got: ${rolloverMsg ?? 'none'})`);

  const winner = result.players.find(p => p.isWinner);
  assert(winner !== undefined, 'at least one player is marked isWinner');

  const totalOut = result.players.reduce((s, p) => s + p.chips, 0) + result.pot;
  const totalIn  = pLow.chips + pHigh.chips + pot;
  assert(totalOut === totalIn, `chip conservation: in=${totalIn} out=${totalOut}`);

  // Extra: sole-qualifier scenario — only LOW player has qualifying hand.
  const bustCards  = [makeCard('9', 'clubs'), makeCard('9', 'spades'),
                      makeCard('8', 'hearts'), makeCard('8', 'diamonds')]; // 34 → qualifiesHigh
  const pBust = makePlayer('p3', { chips: 0, totalBet: 100, cards: bustCards });
  // Override — mark as folded so only pLow qualifies
  const pFolded = { ...pBust, status: 'folded' as const };

  const soloResult = Fifteen35Mode.resolveShowdown!([pLow, pFolded], 100);
  const soloRollover = soloResult.messages.find(m => /rolls over/i.test(m));
  assert(!soloRollover, 'no rollover when one qualifying player and one folded opponent');
  const soloWinner = soloResult.players.find(p => p.isWinner);
  assert(!!soloWinner, 'sole qualifier wins with one folded opponent');
}

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
section('Bug 4 — side pot: chip conservation and correct awards');
{
  const mc = makeCard;

  // P1: LOW hand — A(11)+4=15 qualifies LOW
  const p1 = makePlayer('p1', {
    chips: 0, totalBet: 500, status: 'active',
    cards: [mc('A','spades'), mc('4','hearts')],
  });
  // P2: HIGH hand — 9+9+9+8=35 qualifies HIGH
  const p2 = makePlayer('p2', {
    chips: 0, totalBet: 1000, status: 'active',
    cards: [mc('9','spades'), mc('9','hearts'), mc('9','diamonds'), mc('8','clubs')],
  });
  // P3: HIGH hand — 8+8+9+10=35 qualifies HIGH
  const p3 = makePlayer('p3', {
    chips: 1000, totalBet: 2000, status: 'active',
    cards: [mc('8','spades'), mc('8','hearts'), mc('9','clubs'), mc('10','diamonds')],
  });

  const sidePots = computeSidePots([p1, p2, p3]);
  assert(sidePots.length === 3, `3 side pots computed (got ${sidePots.length})`);
  assert(sidePots[0].amount === 1500, `main pot = $1500 (got $${sidePots[0].amount})`);
  assert(sidePots[1].amount === 1000, `side pot 1 = $1000 (got $${sidePots[1].amount})`);
  assert(sidePots[2].amount === 1000, `side pot 2 = $1000 (got $${sidePots[2].amount})`);

  // P1 eligible for main pot only (totalBet 500)
  assert(sidePots[0].eligibleIds.includes('p1'), 'P1 eligible for main pot');
  assert(!sidePots[1].eligibleIds.includes('p1'), 'P1 NOT eligible for side pot 1');
  assert(!sidePots[2].eligibleIds.includes('p1'), 'P1 NOT eligible for side pot 2');

  // Use fifteen35's logic to determine findHigh / findLow
  const totalPot = sidePots[0].amount + sidePots[1].amount + sidePots[2].amount;
  assert(totalPot === 3500, `total side pot = $3500 (got $${totalPot})`);
  assert(totalPot === p1.totalBet + p2.totalBet + p3.totalBet, 'total side pot equals sum of totalBets');

  // Resolve using fifteen35's actual award logic
  const result = Fifteen35Mode.resolveShowdown!([p1, p2, p3], totalPot);

  const rp1 = result.players.find(p => p.id === 'p1')!;
  const rp2 = result.players.find(p => p.id === 'p2')!;
  const rp3 = result.players.find(p => p.id === 'p3')!;

  // Conservation: chips in + pot = chips out
  const chipsIn  = p1.chips + p2.chips + p3.chips + totalPot;
  const chipsOut = rp1.chips + rp2.chips + rp3.chips + result.pot;
  assert(chipsOut === chipsIn, `chip conservation: in=${chipsIn} out=${chipsOut}`);

  // P1 should win ONLY the main pot (1500) — they cannot win more than 500×3
  assert(rp1.chips <= 1500, `P1 wins at most $1500 (main pot cap) — got $${rp1.chips}`);
  assert(rp1.chips > 0, 'P1 receives chips (won main pot)');

  // P2 should win their side pot (1000) plus nothing from main (P1 had LOW)
  assert(rp2.chips > 0, 'P2 receives chips (won side pot 1)');

  // No chips should be negative
  assert(rp1.chips >= 0 && rp2.chips >= 0 && rp3.chips >= 0, 'all players have non-negative chips');

  // Verify no chips created from thin air: total must balance
  const totalChipsAfter = rp1.chips + rp2.chips + rp3.chips + result.pot;
  const totalChipsBefore = p1.chips + p2.chips + p3.chips + totalPot;
  assert(totalChipsAfter === totalChipsBefore, `no chips duplicated or lost: before=${totalChipsBefore} after=${totalChipsAfter}`);
}

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
