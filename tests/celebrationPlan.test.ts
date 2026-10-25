import { describe, expect, it } from 'vitest';
import { celebrationFromSummary, settlementReady, orderedTen } from '../client/src/components/boxChevy/celebrationPlan';
import type { ShowdownSummary } from '../shared/modes/showdownSummary';

// Detroit 2026-10-24 (final polish, Safeguard A): the celebration is
// built ONLY from authoritative settled data. These tests pin the
// split/tie/SWING/rollover rules — above all: a settled winning hand
// can never produce a NO WINNER display.
const C = (rank: string, suit = 'spades') => ({ rank, suit });
const comm = [C('5', 'hearts'), C('J', 'diamonds'), C('4', 'clubs'), C('Q', 'hearts'), C('6', 'diamonds')];
const players = [
  { id: 'hi', name: 'HighHarry', cards: [C('K'), C('3'), C('7'), C('2'), C('9')] },
  { id: 'lo', name: 'LowLucy', cards: [C('A'), C('8'), C('10'), C('3', 'hearts'), C('9', 'clubs')] },
  { id: 'fold', name: 'FoldedFred', cards: [C('A', 'hearts'), C('K', 'hearts'), C('Q', 'clubs'), C('J', 'spades'), C('10', 'hearts')] },
];
const sum = (over: Partial<ShowdownSummary>): ShowdownSummary => ({
  handId: 42, modeId: 'box_chevy', headline: '', awards: [], entries: [], comparisons: [], rollover: 0, ...over,
});

describe('celebrationFromSummary', () => {
  it('HIGH/LOW split displays BOTH winners with exact payouts and ordered ten-card rows', () => {
    const b = celebrationFromSummary(sum({
      awards: [
        { playerId: 'hi', amount: 600, part: 'HIGH', reason: 'HIGH: best' },
        { playerId: 'lo', amount: 400, part: 'LOW', reason: 'LOW: best' },
      ],
      entries: [
        { playerId: 'hi', description: 'Made hand', made: true },
        { playerId: 'lo', description: 'Made hand', made: true },
      ],
    }), players, comm);
    expect(b.highWinner?.name).toBe('HighHarry');
    expect(b.highWinner?.exactAmount).toBe(600);
    expect(b.lowWinner?.name).toBe('LowLucy');
    expect(b.lowWinner?.exactAmount).toBe(400);
    expect(b.soleWinner).toBeNull();
    expect(b.audit).toBeNull(); // a winning hand NEVER yields NO WINNER
    // HIGH row ascending (A=1..K=13), LOW row descending; 5 community flagged in each.
    const hiRanks = b.highWinner!.tenRows![0].cards.map(c => c.rank);
    expect(hiRanks).toEqual(['2', '3', '4', '5', '6', '7', '9', 'J', 'Q', 'K']);
    const loRanks = b.lowWinner!.tenRows![0].cards.map(c => c.rank);
    expect(loRanks).toEqual(['Q', 'J', '10', '9', '8', '6', '5', '4', '3', 'A']);
    expect(b.highWinner!.tenRows![0].cards.filter(c => c.community)).toHaveLength(5);
    expect(b.lowWinner!.tenRows![0].cards.filter(c => c.community)).toHaveLength(5);
  });

  it('genuine no-winner settlement renders the rollover — and only then', () => {
    const b = celebrationFromSummary(sum({ awards: [], rollover: 758 }), players, comm);
    expect(b).toEqual({ highWinner: null, lowWinner: null, soleWinner: null, audit: { rollover: 758 } });
  });

  it('$0 guard: no awards and no rollover renders NOTHING (never "NO WINNER — $0")', () => {
    const b = celebrationFromSummary(sum({ awards: [], rollover: 0 }), players, comm);
    expect(b.audit).toBeNull();
    expect(b.highWinner).toBeNull();
    expect(b.lowWinner).toBeNull();
    expect(b.soleWinner).toBeNull();
  });

  it('partial rollover beside a real award never produces NO WINNER', () => {
    const b = celebrationFromSummary(sum({
      awards: [{ playerId: 'hi', amount: 500, part: 'HIGH', reason: 'r' }], rollover: 300,
    }), players, comm);
    expect(b.highWinner?.exactAmount).toBe(500);
    expect(b.audit).toBeNull();
  });

  it('tied winners for the same part are preserved — equal split shows the shared amount', () => {
    const b = celebrationFromSummary(sum({
      awards: [
        { playerId: 'hi', amount: 300, part: 'HIGH', reason: 'tied' },
        { playerId: 'lo', amount: 300, part: 'HIGH', reason: 'tied' },
      ],
    }), players, comm);
    expect(b.highWinner?.name).toBe('HighHarry & LowLucy');
    expect(b.highWinner?.exactAmount).toBe(300);
    expect(b.highWinner?.amountText).toBeUndefined();
  });

  it('tied winners with unequal amounts spell out each exact payout', () => {
    const b = celebrationFromSummary(sum({
      awards: [
        { playerId: 'hi', amount: 301, part: 'HIGH', reason: 'tied' },
        { playerId: 'lo', amount: 300, part: 'HIGH', reason: 'tied' },
      ],
    }), players, comm);
    expect(b.highWinner?.exactAmount).toBeUndefined();
    expect(b.highWinner?.amountText).toContain('HighHarry $301');
    expect(b.highWinner?.amountText).toContain('LowLucy $300');
  });

  it('SWING and HIGH+LOW scoops render as the sole block with both rows', () => {
    const swing = celebrationFromSummary(sum({
      awards: [{ playerId: 'hi', amount: 1000, part: 'SWING', reason: 'scoop' }],
    }), players, comm);
    expect(swing.soleWinner?.side).toBe('SWING');
    expect(swing.soleWinner?.tenRows?.map(r => r.label)).toEqual(['HIGH', 'LOW']);
    expect(swing.highWinner).toBeNull();
    expect(swing.lowWinner).toBeNull();

    const both = celebrationFromSummary(sum({
      awards: [{ playerId: 'hi', amount: 1000, part: 'HIGH + LOW', reason: 'both' }],
    }), players, comm);
    expect(both.soleWinner?.side).toBe('BOTH');
    expect(both.soleWinner?.exactAmount).toBe(1000);
  });

  it('folded players never appear in the build (privacy)', () => {
    const b = celebrationFromSummary(sum({
      awards: [{ playerId: 'hi', amount: 700, part: 'SOLE', reason: 'last standing' }],
    }), players, comm);
    expect(JSON.stringify(b)).not.toContain('FoldedFred');
    expect(b.soleWinner?.name).toBe('HighHarry');
  });
});

describe('settlementReady (Safeguard A)', () => {
  const entrySnapshot = { showdownSummary: null, players: players.map(p => ({ ...p, isWinner: undefined })) };
  it('a winnerless SHOWDOWN entry snapshot is NOT a completed settlement', () => {
    expect(settlementReady(entrySnapshot, 42)).toBe(false);
  });
  it('the handId-matching summary is readiness', () => {
    expect(settlementReady({ showdownSummary: sum({}), players: entrySnapshot.players }, 42)).toBe(true);
  });
  it('a summary for a DIFFERENT hand is not readiness', () => {
    expect(settlementReady({ showdownSummary: sum({ handId: 41 }), players: entrySnapshot.players }, 42)).toBe(false);
  });
  it('settled winner flags (fold-win path, no summary) are readiness', () => {
    const settled = { showdownSummary: null, players: [{ ...players[0], isWinner: true }, players[1]] };
    expect(settlementReady(settled, 42)).toBe(true);
  });
  it('orderedTen sorts by the approved values (A=1, K=13)', () => {
    const rows = orderedTen([C('K'), C('A')], [C('10')], 'asc');
    expect(rows.map(r => r.rank)).toEqual(['A', '10', 'K']);
  });
});
