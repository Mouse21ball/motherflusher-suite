// Box Chevy qualification analysis (Detroit 2026-10-22, correction plan
// P0-2 / condition 5): qualification messages must be mathematically
// accurate — duplicates inside the five community cards can NEVER be
// repaired (community cards are fixed); duplicates involving hole
// cards can, by discarding the right hole cards, and only while
// enough draw discards remain. The helper must never recommend an
// impossible repair and must always agree with the authoritative
// evaluator (evaluateBoxChevy10.isMade via getHeroHandValidity).
import { describe, it, expect } from 'vitest';
import type { CardType, Rank, Suit } from '../shared/gameTypes';
import { analyzeDuplicates, getHeroHandValidity } from '../shared/modes/heroHandValidity';
import { evaluateBoxChevy } from '../shared/modes/boxchevy';

const C = (rank: Rank, suit: Suit): CardType => ({ rank, suit });
const hand = (spec: string): CardType[] =>
  spec.split(' ').map(tok => C(tok.slice(0, -1) as Rank, ({ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const)[tok.slice(-1) as 's' | 'h' | 'd' | 'c']));

describe('analyzeDuplicates — fixable vs unfixable', () => {
  it('community pair is unfixable no matter what the hole cards are', () => {
    const comm = hand('7s 7h 2d 9c Ks');
    const hole = hand('As 3d 4c 5h 6s');
    const { duplicates, discardsToFix } = analyzeDuplicates(hole, comm);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].rank).toBe('7');
    expect(duplicates[0].communityCount).toBe(2);
    expect(duplicates[0].unfixable).toBe(true);
    expect(discardsToFix).toBe(Infinity);
  });

  it('hole card matching a community rank: discard every hole copy', () => {
    const comm = hand('7s 2h 3d 9c Ks');
    const hole = hand('7d As 4c 5h 6s');
    const { duplicates, discardsToFix } = analyzeDuplicates(hole, comm);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].unfixable).toBe(false);
    expect(duplicates[0].discardsNeeded).toBe(1);
    expect(duplicates[0].holeIndices).toEqual([0]);
    expect(discardsToFix).toBe(1);
  });

  it('hole pair with a clean board: discard all but one copy', () => {
    const comm = hand('2s 3h 4d 9c Ks');
    const hole = hand('Qd Qs Ac 5h 6s');
    const { duplicates, discardsToFix } = analyzeDuplicates(hole, comm);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].discardsNeeded).toBe(1);
    expect(discardsToFix).toBe(1);
  });

  it('two independent fixable conflicts add up', () => {
    const comm = hand('7s 2h 3d 9c Ks');
    const hole = hand('7d Qc Qh 5s 6d');
    const { discardsToFix } = analyzeDuplicates(hole, comm);
    expect(discardsToFix).toBe(2);
  });

  it('three of a kind in the hole needs two discards', () => {
    const comm = hand('2s 3h 4d 9c Ks');
    const hole = hand('8d 8c 8h 5s 6d');
    const { discardsToFix } = analyzeDuplicates(hole, comm);
    expect(discardsToFix).toBe(2);
  });

  it('a made hand has no duplicates', () => {
    const comm = hand('2s 3h 4d 9c Ks');
    const hole = hand('Ad Qc Jh 10s 8d');
    const { duplicates, discardsToFix } = analyzeDuplicates(hole, comm);
    expect(duplicates).toHaveLength(0);
    expect(discardsToFix).toBe(0);
  });
});

describe('getHeroHandValidity — honest labels + evaluator agreement', () => {
  it('community pair: invalid, unfixable, board named in the detail', () => {
    const v = getHeroHandValidity('boxchevy', 'BET_2', hand('As 3d 4c 5h 6s'), hand('7s 7h 2d 9c Ks'));
    expect(v?.isValid).toBe(false);
    expect(v?.hasUnfixableDuplicate).toBe(true);
    expect(v?.canStillFix).toBe(false);
    expect(v?.detail).toContain('BOARD HAS TWO 7s');
    expect(v?.detail).toContain('NO DRAW CAN FIX');
  });

  it('fixable early: detail names the exact discard', () => {
    const v = getHeroHandValidity('boxchevy', 'BET_1', hand('7d As 4c 5h 6s'), hand('7s 2h 3d 9c Ks'));
    expect(v?.isValid).toBe(false);
    expect(v?.canStillFix).toBe(true);
    expect(v?.detail).toBe('DISCARD YOUR 7 — THAT FIXES IT');
  });

  it('fixable in principle but out of draws: never recommends it', () => {
    // BET_4 — no draws remain.
    const v = getHeroHandValidity('boxchevy', 'BET_4', hand('7d As 4c 5h 6s'), hand('7s 2h 3d 9c Ks'));
    expect(v?.canStillFix).toBe(false);
    expect(v?.detail).toContain('ONLY 0 LEFT');
    // DRAW_3 has exactly 1 discard left; two conflicts cannot be fixed.
    const v2 = getHeroHandValidity('boxchevy', 'DRAW_3', hand('7d Qc Qh 5s 6d'), hand('7s 2h 3d 9c Ks'));
    expect(v2?.canStillFix).toBe(false);
    expect(v2?.detail).toContain('NEEDS 2 DISCARDS');
  });

  it('agrees with evaluateBoxChevy across randomized deals', () => {
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
    const deck: CardType[] = ranks.flatMap(r => suits.map(s => C(r, s)));
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let n = 0; n < 3000; n++) {
      const d = [...deck];
      for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
      const hole = d.slice(0, 5); const comm = d.slice(5, 10);
      const v = getHeroHandValidity('boxchevy', 'BET_2', hole, comm);
      const ev = evaluateBoxChevy(hole, comm);
      expect(v?.isValid).toBe(ev.isMade);
      if (ev.isMade) expect(v?.duplicates).toHaveLength(0);
      if (!ev.isMade) {
        expect((v?.duplicates.length ?? 0)).toBeGreaterThan(0);
        // Infinity exactly when some duplicate is community-internal.
        const anyCommPair = comm.some((c, i) => comm.findIndex(x => x.rank === c.rank) !== i);
        expect(v?.discardsToFix === Infinity).toBe(anyCommPair);
      }
    }
  });
});
