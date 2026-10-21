import { describe, expect, it } from 'vitest';
import { baselineSeqs, detectDrawTransactions, replacedIndices } from '../client/src/components/badugi/flightPlan';

/**
 * Detroit 2026-10-20 (Bug 1): the animation dedup contract. A draw
 * animation is planned exactly once per confirmed server draw transaction
 * (a drawSeq increment) — and never for timer updates, betting updates,
 * phase changes, duplicate snapshots, or reconnect baselines.
 */

const P = (id: string, drawSeq: number, lastDrawCount = 0) => ({ id, drawSeq, lastDrawCount });

describe('flightPlan draw-transaction detection', () => {
  it('a fresh snapshot against its own baseline plans nothing (reconnect)', () => {
    const players = [P('p1', 2, 1), P('p2', 3, 2)];
    const { transactions } = detectDrawTransactions(baselineSeqs(players), players);
    expect(transactions).toEqual([]);
  });

  it('timer/betting/phase updates with unchanged seqs plan nothing', () => {
    const animated = baselineSeqs([P('p1', 1, 2), P('p2', 1, 3)]);
    // Same seqs — everything else about the snapshot may differ.
    const { transactions } = detectDrawTransactions(animated, [P('p1', 1, 2), P('p2', 1, 3)]);
    expect(transactions).toEqual([]);
  });

  it('one seq increment plans exactly one transaction, then dedupes', () => {
    const animated = baselineSeqs([P('p1', 1, 0), P('p2', 1, 0)]);
    const snap = [P('p1', 2, 2), P('p2', 1, 0)];
    const first = detectDrawTransactions(animated, snap);
    expect(first.transactions).toEqual([{ playerId: 'p1', count: 2, seq: 2 }]);
    // The identical snapshot replayed (duplicate broadcast) plans nothing.
    const replay = detectDrawTransactions(first.seqs, snap);
    expect(replay.transactions).toEqual([]);
  });

  it('stand-pat increments the seq with count 0 (recorded, flies nothing)', () => {
    const animated = baselineSeqs([P('p1', 0, 0)]);
    const { transactions } = detectDrawTransactions(animated, [P('p1', 1, 0)]);
    expect(transactions).toEqual([{ playerId: 'p1', count: 0, seq: 1 }]);
  });

  it('two players drawing in one snapshot plan two transactions', () => {
    const animated = baselineSeqs([P('p1', 1, 0), P('p2', 1, 0)]);
    const { transactions } = detectDrawTransactions(animated, [P('p1', 2, 1), P('p2', 2, 3)]);
    expect(transactions).toHaveLength(2);
    expect(transactions.map(t => t.playerId).sort()).toEqual(['p1', 'p2']);
  });

  it('a seat first observed mid-hand is baselined, never replayed', () => {
    const animated = baselineSeqs([P('p1', 1, 0)]);
    const { transactions, seqs } = detectDrawTransactions(animated, [P('p1', 1, 0), P('p9', 3, 2)]);
    expect(transactions).toEqual([]);
    expect(seqs.get('p9')).toBe(3);
  });

  it('consecutive draw rounds each plan once (seq 1 → 2 → 3)', () => {
    let seqs = baselineSeqs([P('p1', 0, 0)]);
    for (const [seq, count] of [[1, 3], [2, 2], [3, 1]] as const) {
      const r = detectDrawTransactions(seqs, [P('p1', seq, count)]);
      expect(r.transactions).toEqual([{ playerId: 'p1', count, seq }]);
      seqs = r.seqs;
    }
  });
});

describe('flightPlan replacedIndices (hero slot staging)', () => {
  const C = (rank: string, suit: string) => ({ rank, suit });
  const before = [C('A', 'hearts'), C('2', 'diamonds'), C('3', 'clubs'), C('4', 'spades')];

  it('identical hands replace nothing', () => {
    expect(replacedIndices(before, structuredClone(before))).toEqual([]);
  });

  it('a two-card swap diffs to exactly the two replaced slots', () => {
    const after = [C('9', 'hearts'), C('2', 'diamonds'), C('3', 'clubs'), C('K', 'spades')];
    expect(replacedIndices(before, after)).toEqual([0, 3]);
  });

  it('a one-card swap diffs to exactly that slot', () => {
    const after = [C('A', 'hearts'), C('2', 'diamonds'), C('Q', 'clubs'), C('4', 'spades')];
    expect(replacedIndices(before, after)).toEqual([2]);
  });
});
