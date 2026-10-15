/**
 * Badugi 10,000-hand simulation (Detroit 2026-10-15).
 *
 * Replicates the real game flow:
 *  - 52-card deck, crypto-secure Fisher-Yates shuffle (same as server)
 *  - Deal 4 cards to each of 4 players
 *  - 3 draw rounds per player: DRAW_1 (up to 3), DRAW_2 (up to 2), DRAW_3 (up to 1)
 *    using the EXACT bot discard logic from shared/modes/badugi.ts
 *  - Final evaluation with the real evaluateBadugi
 *
 * Questions:
 *  - Do hands complete without errors?
 *  - What % end as valid Badugis?
 *  - Is the deck/shuffle behaving (no duplicate cards, correct counts)?
 */
import { randomInt } from 'node:crypto';
import { evaluateBadugi } from '../shared/modes/badugi';
import type { CardType } from '../shared/gameTypes';

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_VALUES: Record<string, number> = {
  'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,
};
const rv = (r: string) => RANK_VALUES[r] ?? 0;

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

// ── Copied VERBATIM from shared/modes/badugi.ts (bot draw logic) ──
function botDraw(cards: CardType[], maxDraws: number, deck: CardType[]): { kept: CardType[], drawn: number } {
  const evaluation = evaluateBadugi(cards);
  if (evaluation?.isValidBadugi) {
    return { kept: cards, drawn: 0 }; // stand pat
  }

  const toKeep: number[] = [];
  const usedRanks = new Set<string>();
  const usedSuits = new Set<string>();

  const sortedIndices = cards
    .map((_, i) => i)
    .sort((a, b) => rv(cards[a].rank) - rv(cards[b].rank));

  for (const i of sortedIndices) {
    const card = cards[i];
    if (!usedRanks.has(card.rank) && !usedSuits.has(card.suit)) {
      toKeep.push(i);
      usedRanks.add(card.rank);
      usedSuits.add(card.suit);
    }
  }

  let toDiscard = cards.map((_, i) => i).filter(i => !toKeep.includes(i));
  toDiscard = toDiscard.slice(0, maxDraws);

  const newCards = [...cards];
  for (const idx of toDiscard) {
    const fresh = deck.pop();
    if (fresh) newCards[idx] = fresh;
  }
  return { kept: newCards, drawn: toDiscard.length };
}

// ── Run simulation ──
const HANDS = 10000;
let errors = 0;
let validBadugis = 0;
let totalDrawn = 0;
const highCardDist: Record<string, number> = {};
const drawDist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
let duplicateCardErrors = 0;

for (let h = 0; h < HANDS; h++) {
  try {
    const deck = makeDeck();

    // Deal 4 cards to 4 players
    const hands: CardType[][] = [[], [], [], []];
    for (let c = 0; c < 4; c++) {
      for (let p = 0; p < 4; p++) {
        const card = deck.pop();
        if (!card) throw new Error('Deck exhausted during deal');
        hands[p].push(card);
      }
    }

    // Verify no duplicates in the deal
    const dealtKeys = new Set(hands.flat().map(c => `${c.rank}-${c.suit}`));
    if (dealtKeys.size !== 16) {
      duplicateCardErrors++;
      continue;
    }

    // 3 draw rounds
    const maxDraws = [3, 2, 1];
    for (let round = 0; round < 3; round++) {
      for (let p = 0; p < 4; p++) {
        const result = botDraw(hands[p], maxDraws[round], deck);
        hands[p] = result.kept;
        totalDrawn += result.drawn;
        if (round === 0) drawDist[Math.min(3, result.drawn)]++;
      }
    }

    // Evaluate final hands
    for (let p = 0; p < 4; p++) {
      if (hands[p].length !== 4) {
        errors++;
        continue;
      }
      const ev = evaluateBadugi(hands[p]);
      if (!ev) {
        errors++;
        continue;
      }
      if (ev.isValidBadugi) {
        validBadugis++;
        const high = ev.description.split('-')[0];
        highCardDist[high] = (highCardDist[high] || 0) + 1;
      }
    }
  } catch (e) {
    errors++;
  }
}

const totalHandsEvaluated = HANDS * 4;
console.log(`\n=== Badugi ${HANDS.toLocaleString()}-hand simulation ===`);
console.log(`Total player-hands evaluated: ${totalHandsEvaluated.toLocaleString()}`);
console.log(`Errors: ${errors}`);
console.log(`Duplicate card errors: ${duplicateCardErrors}`);
console.log(`Valid Badugis: ${validBadugis.toLocaleString()} (${(validBadugis / totalHandsEvaluated * 100).toFixed(2)}%)`);
console.log(`Avg cards drawn per player per hand: ${(totalDrawn / totalHandsEvaluated).toFixed(2)}`);
console.log(`\nDraw distribution (round 1):`);
for (const [n, count] of Object.entries(drawDist)) {
  console.log(`  Drew ${n}: ${count.toLocaleString()} (${(count / totalHandsEvaluated * 100).toFixed(1)}%)`);
}
console.log(`\nBadugi high-card distribution:`);
const sorted = Object.entries(highCardDist).sort((a, b) => b[1] - a[1]);
for (const [high, count] of sorted.slice(0, 10)) {
  console.log(`  ${high}-high: ${count.toLocaleString()} (${(count / validBadugis * 100).toFixed(1)}%)`);
}
console.log(`\n${errors === 0 && duplicateCardErrors === 0 ? '✅ ALL HANDS COMPLETED CLEANLY' : '❌ ERRORS DETECTED'}`);
