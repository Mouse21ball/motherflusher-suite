/**
 * Box Chevy 10,000-hand simulation (Detroit 2026-10-15).
 *
 * Replicates the real game flow:
 *  - 52-card deck, crypto-secure Fisher-Yates shuffle (same as server)
 *  - Deal 5 hole cards to each of 4 players
 *  - Deal 5 shared community cards
 *  - Evaluate each player's 10-card hand with the real evaluateBoxChevy10
 *
 * Rules (Detroit, verified):
 *  - All 10 ranks must be unique — pair = lose, can't win either side
 *  - Ace ALWAYS = 1, King ALWAYS = 13
 *  - HIGH: sort low→high, compare from bottom up
 *  - LOW: sort high→low, compare from top down
 *  - Swing = sole best HIGH + sole best LOW
 *
 * Questions:
 *  - Do hands complete without errors?
 *  - What % are made hands (all 10 unique ranks)?
 *  - Is the deck/shuffle behaving?
 */
import { randomInt } from 'node:crypto';
import { evaluateBoxChevy10, compareBoxChevyHigh, compareBoxChevyLow } from '../shared/modes/boxchevy';
import type { CardType } from '../shared/gameTypes';

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function secureShuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function makeDeck(): CardType[] {
  const deck: CardType[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank } as CardType);
  return secureShuffle(deck);
}

const HANDS = 10000;
let errors = 0;
let madeHands = 0;
let duplicateCardErrors = 0;
let swings = 0;
let highWins = 0;
let lowWins = 0;

for (let h = 0; h < HANDS; h++) {
  try {
    const deck = makeDeck();

    // Deal 5 hole cards to 4 players (20 cards)
    const holes: CardType[][] = [[], [], [], []];
    for (let c = 0; c < 5; c++) {
      for (let p = 0; p < 4; p++) {
        const card = deck.pop();
        if (!card) throw new Error('Deck exhausted during hole deal');
        holes[p].push(card);
      }
    }

    // Deal 5 community cards (shared)
    const community: CardType[] = [];
    for (let c = 0; c < 5; c++) {
      const card = deck.pop();
      if (!card) throw new Error('Deck exhausted during community deal');
      community.push(card);
    }

    // Verify no duplicates across all dealt cards (25 total)
    const allDealt = [...holes.flat(), ...community];
    const keys = new Set(allDealt.map(c => `${c.rank}-${c.suit}`));
    if (keys.size !== 25) {
      duplicateCardErrors++;
      continue;
    }

    // Evaluate each player's 10-card hand
    const evals = holes.map(hole => {
      if (hole.length !== 5) throw new Error('Wrong hole count');
      return evaluateBoxChevy10(hole, community);
    });

    for (const ev of evals) {
      if (ev.isMade) madeHands++;
    }

    // Determine winners (highest high, lowest low among made hands)
    const madeIndices = evals.map((ev, i) => ev.isMade ? i : -1).filter(i => i >= 0);
    if (madeIndices.length === 0) continue; // no one made a hand

    let bestHigh = madeIndices[0];
    let bestLow = madeIndices[0];
    let highTied = false;
    let lowTied = false;

    for (let k = 1; k < madeIndices.length; k++) {
      const i = madeIndices[k];
      const hc = compareBoxChevyHigh(evals[i], evals[bestHigh]);
      if (hc > 0) { bestHigh = i; highTied = false; }
      else if (hc === 0) highTied = true;

      const lc = compareBoxChevyLow(evals[i], evals[bestLow]);
      if (lc > 0) { bestLow = i; lowTied = false; }
      else if (lc === 0) lowTied = true;
    }

    // Count (allow ties — just track sole winners for swing)
    if (!highTied) highWins++;
    if (!lowTied) lowWins++;
    if (!highTied && !lowTied && bestHigh === bestLow) swings++;

  } catch (e) {
    errors++;
  }
}

const totalEvaluated = HANDS * 4;
console.log(`\n=== Box Chevy ${HANDS.toLocaleString()}-hand simulation ===`);
console.log(`Total player-hands evaluated: ${totalEvaluated.toLocaleString()}`);
console.log(`Errors: ${errors}`);
console.log(`Duplicate card errors: ${duplicateCardErrors}`);
console.log(`Made hands (10 unique ranks): ${madeHands.toLocaleString()} (${(madeHands / totalEvaluated * 100).toFixed(2)}%)`);
console.log(`\nPer-hand winners (among ${HANDS.toLocaleString()} hands):`);
console.log(`  Sole high winner: ${highWins.toLocaleString()} (${(highWins / HANDS * 100).toFixed(1)}%)`);
console.log(`  Sole low winner: ${lowWins.toLocaleString()} (${(lowWins / HANDS * 100).toFixed(1)}%)`);
console.log(`  Swings (sole high + sole low): ${swings.toLocaleString()} (${(swings / HANDS * 100).toFixed(1)}%)`);
console.log(`\n${errors === 0 && duplicateCardErrors === 0 ? '✅ ALL HANDS COMPLETED CLEANLY' : '❌ ERRORS DETECTED'}`);
