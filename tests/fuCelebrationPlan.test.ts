// Flushed Up celebration plan (Detroit 2026-10-25) — settlement gating.
// Detroit's Galaxy report: FU showdowns revealed hands but never showed
// who won or what flush they had. Root cause: the table gated the
// celebration on winner flags read from the winnerless showdown ENTRY
// snapshot, and its summary branch read a ref that never carried the
// summary. These tests pin the repaired contract.
import { describe, it, expect } from 'vitest';
import {
  fuSettlementReady, summaryForHand, firstWinnerId, seatIndexOf,
  celebrationFromSummary, celebrationFromWinners,
} from '../client/src/components/flushedUp/celebrationPlan';
import type { ShowdownSummary } from '../shared/modes/showdownSummary';

const aliceCards = [
  { rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'hearts' },
  { rank: '9', suit: 'hearts' }, { rank: '5', suit: 'hearts' },
  { rank: '2', suit: 'hearts' },
];
const bobCards = [
  { rank: 'K', suit: 'spades' }, { rank: 'Q', suit: 'spades' },
  { rank: 'J', suit: 'spades' }, { rank: '9', suit: 'spades' },
  { rank: '3', suit: 'clubs' },
];
const players = [
  { id: 'me', name: 'Detroit', cards: bobCards },
  { id: 'a', name: 'Alice', cards: aliceCards },
  { id: 'b', name: 'Bob', cards: bobCards },
];

const summary = (over: Partial<ShowdownSummary> = {}): ShowdownSummary => ({
  handId: 7,
  modeId: 'flushed_up',
  headline: 'Alice wins',
  awards: [{ playerId: 'a', amount: 450, part: 'SOLE', reason: 'Flush ♥A-K-9-5-2' }],
  entries: [
    { playerId: 'a', description: 'Flush ♥A-K-9-5-2' },
    { playerId: 'b', description: '4-card ♠ K-Q-J-9' },
  ],
  comparisons: ['Flush ♥A-K-9-5-2 beats 4-card ♠ K-Q-J-9'],
  rollover: 0,
  ...over,
});

describe('fuSettlementReady — the entry snapshot is NOT readiness', () => {
  it('winnerless entry (no summary, no winner flags) is not ready', () => {
    expect(fuSettlementReady({ showdownSummary: null, players }, 7)).toBe(false);
  });
  it('handId-matching FU summary is ready', () => {
    expect(fuSettlementReady({ showdownSummary: summary(), players }, 7)).toBe(true);
  });
  it('a summary for a DIFFERENT hand is not readiness', () => {
    expect(fuSettlementReady({ showdownSummary: summary({ handId: 8 }), players }, 7)).toBe(false);
  });
  it('a Box Chevy summary never readies an FU celebration', () => {
    expect(fuSettlementReady({ showdownSummary: summary({ modeId: 'box_chevy' }), players }, 7)).toBe(false);
  });
  it('settled winner flags ready the fold-win path (no summary)', () => {
    const settled = players.map(p => (p.id === 'b' ? { ...p, isWinner: true } : p));
    expect(fuSettlementReady({ showdownSummary: null, players: settled }, 7)).toBe(true);
  });
});

describe('celebrationFromSummary', () => {
  it('sole winner: name, exact payout, flush label, comparison, others', () => {
    const c = celebrationFromSummary(summary(), players)!;
    expect(c.winnerName).toBe('Alice');
    expect(c.amount).toBe(450);
    expect(c.handLabel).toBe('Flush ♥A-K-9-5-2');
    expect(c.comparison).toBe('Flush ♥A-K-9-5-2 beats 4-card ♠ K-Q-J-9');
    expect(c.cards).toEqual(aliceCards);
    expect(c.others).toHaveLength(1);
    expect(c.others[0].name).toBe('Bob');
    expect(c.others[0].description).toBe('4-card ♠ K-Q-J-9');
  });
  it('split: all winners named, amounts summed, label from comparison', () => {
    const s = summary({
      awards: [
        { playerId: 'a', amount: 200, part: 'SPLIT', reason: 'Flush ♥A-K-9-5-2' },
        { playerId: 'b', amount: 200, part: 'SPLIT', reason: 'Flush ♠K-Q-J-9-3' },
      ],
    });
    const c = celebrationFromSummary(s, players)!;
    expect(c.winnerName).toBe('SPLIT — Alice & Bob');
    expect(c.amount).toBe(400);
    expect(c.handLabel).toBe('Flush ♥A-K-9-5-2 beats 4-card ♠ K-Q-J-9');
    expect(c.comparison).toBe('');
  });
  it('no awards → no celebration', () => {
    expect(celebrationFromSummary(summary({ awards: [] }), players)).toBeNull();
  });
});

describe('celebrationFromWinners — fold-win fallback from SETTLED state', () => {
  it('builds from winner flags with the evaluator flush label', () => {
    const settled = players.map(p => (p.id === 'a' ? { ...p, isWinner: true } : p));
    const c = celebrationFromWinners(settled, 300)!;
    expect(c.winnerName).toBe('Alice');
    expect(c.amount).toBe(300);
    expect(c.handLabel).toContain('Flush');
    expect(c.cards).toEqual(aliceCards);
  });
  it('no settled winners → null (never invent a winner)', () => {
    expect(celebrationFromWinners(players, 300)).toBeNull();
  });
});

describe('firstWinnerId + seatIndexOf', () => {
  it('summary award wins over flags', () => {
    expect(firstWinnerId({ showdownSummary: summary(), players }, 7)).toBe('a');
  });
  it('falls back to the settled winner flag', () => {
    const settled = players.map(p => (p.id === 'b' ? { ...p, isWinner: true } : p));
    expect(firstWinnerId({ showdownSummary: null, players: settled }, 7)).toBe('b');
  });
  it('unsettled → null', () => {
    expect(firstWinnerId({ showdownSummary: null, players }, 7)).toBeNull();
  });
  it('seat indices: hero 0, opponents in state order', () => {
    expect(seatIndexOf(players, 'me', 'me')).toBe(0);
    expect(seatIndexOf(players, 'me', 'a')).toBe(1);
    expect(seatIndexOf(players, 'me', 'b')).toBe(2);
  });
});
