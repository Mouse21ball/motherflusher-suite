// Showdown summary tests (Detroit 2026-10-22): the structured summary
// must be built from the settlement itself — awards equal the chips
// actually paid, reasons follow the approved comparators, and folded
// players never appear in entries.
import { describe, it, expect } from 'vitest';
import { FlushedUpMode } from '../shared/modes/flushedUp';
import { BoxChevyMode } from '../shared/modes/boxchevy';
import type { CardType, Player } from '../shared/gameTypes';

function card(rank: string, suit: string): CardType {
  return { rank: rank as CardType['rank'], suit: suit as CardType['suit'], isHidden: false };
}
function player(id: string, cards: CardType[], opts: Partial<Player> = {}): Player {
  return {
    id, name: id, presence: 'bot', chips: 1000, bet: 0, totalBet: 100,
    cards, status: 'active', hasActed: true, isDealer: false, declaration: null,
    ...opts,
  } as Player;
}

describe('Flushed Up showdown summary', () => {
  it('suit-count decision: award equals chips paid, comparison explains', () => {
    const a = player('A', [card('A', 'hearts'), card('K', 'hearts'), card('9', 'hearts'), card('4', 'hearts'), card('2', 'hearts')]);
    const b = player('B', [card('K', 'spades'), card('Q', 'spades'), card('9', 'spades'), card('4', 'spades'), card('3', 'clubs')]);
    const r = FlushedUpMode.resolveShowdown!([a, b], 1000, '__server__');
    expect(r.summary).toBeDefined();
    expect(r.summary!.awards).toEqual([
      { playerId: 'A', amount: 1000, part: 'POT', reason: expect.stringContaining('Flush') },
    ]);
    expect(r.players.find(p => p.id === 'A')!.chips).toBe(2000);
    expect(r.summary!.comparisons[0]).toContain('decided by suit count');
    expect(r.summary!.entries.map(e => e.playerId)).toEqual(['A', 'B']);
    expect(r.summary!.rollover).toBe(0);
  });

  it('same category: decisive card is named in approved order', () => {
    const a = player('A', [card('A', 'hearts'), card('9', 'hearts'), card('7', 'hearts'), card('4', 'hearts'), card('2', 'hearts')]);
    const b = player('B', [card('K', 'spades'), card('Q', 'spades'), card('7', 'spades'), card('4', 'spades'), card('2', 'spades')]);
    const r = FlushedUpMode.resolveShowdown!([a, b], 800, '__server__');
    expect(r.summary!.awards[0].playerId).toBe('A');
    expect(r.summary!.comparisons[0]).toContain('decided at card 1');
    expect(r.summary!.comparisons[0]).toContain('A over K');
  });

  it('exact tie splits, and folded players never appear in entries', () => {
    const a = player('A', [card('A', 'hearts'), card('K', 'hearts'), card('9', 'hearts'), card('4', 'hearts'), card('2', 'hearts')]);
    const b = player('B', [card('A', 'spades'), card('K', 'spades'), card('9', 'spades'), card('4', 'spades'), card('2', 'spades')]);
    const c = player('C', [card('A', 'clubs'), card('A', 'diamonds'), card('3', 'clubs'), card('5', 'clubs'), card('7', 'clubs')], { status: 'folded' });
    const r = FlushedUpMode.resolveShowdown!([a, b, c], 1000, '__server__');
    expect(r.summary!.awards.map(x => x.part)).toEqual(['SPLIT', 'SPLIT']);
    expect(r.summary!.awards.reduce((s, x) => s + x.amount, 0)).toBe(1000);
    expect(r.summary!.comparisons[0]).toContain('Identical best hands');
    expect(r.summary!.entries.map(e => e.playerId)).toEqual(['A', 'B']);
  });

  it('sole survivor summary carries the SOLE part', () => {
    const a = player('A', [card('A', 'hearts'), card('K', 'hearts'), card('9', 'hearts'), card('4', 'hearts'), card('2', 'hearts')]);
    const b = player('B', [card('K', 'spades'), card('Q', 'spades'), card('9', 'spades'), card('4', 'spades'), card('3', 'clubs')], { status: 'folded' });
    const r = FlushedUpMode.resolveShowdown!([a, b], 700, '__server__');
    expect(r.summary!.awards).toEqual([
      { playerId: 'A', amount: 700, part: 'SOLE', reason: expect.stringContaining('Last player standing') },
    ]);
  });
});

describe('Box Chevy showdown summary', () => {
  const comm1 = [card('2', 'clubs'), card('4', 'diamonds'), card('6', 'spades'), card('8', 'hearts'), card('10', 'clubs')];

  it('HIGH/LOW split: parts, amounts, and decisive cards follow the approved order', () => {
    const a = player('A', [card('A', 'hearts'), card('3', 'clubs'), card('5', 'diamonds'), card('7', 'spades'), card('9', 'hearts')], { declaration: 'LOW' });
    const b = player('B', [card('K', 'hearts'), card('Q', 'clubs'), card('J', 'diamonds'), card('9', 'spades'), card('7', 'hearts')], { declaration: 'HIGH' });
    const r = BoxChevyMode.resolveShowdown!([a, b], 1000, '__server__', comm1);
    const awards = Object.fromEntries(r.summary!.awards.map(x => [x.playerId, x]));
    expect(awards['A'].part).toBe('LOW');
    expect(awards['B'].part).toBe('HIGH');
    expect(awards['A'].amount + awards['B'].amount).toBe(1000);
    const high = r.summary!.comparisons.find(c => c.startsWith('HIGH'))!;
    const low = r.summary!.comparisons.find(c => c.startsWith('LOW'))!;
    expect(high).toContain('only made HIGH hand');
    expect(low).toContain('only made LOW hand');
    expect(r.summary!.declarations!.map(d => d.outcome)).toEqual(['declared', 'declared']);
  });

  it('SWING: both sides explained separately, then the swing', () => {
    const comm = [card('A', 'clubs'), card('9', 'diamonds'), card('10', 'spades'), card('J', 'hearts'), card('Q', 'clubs')];
    const a = player('A', [card('4', 'hearts'), card('5', 'clubs'), card('6', 'diamonds'), card('7', 'spades'), card('8', 'hearts')], { declaration: 'SWING' });
    const b = player('B', [card('3', 'hearts'), card('5', 'spades'), card('6', 'hearts'), card('7', 'clubs'), card('K', 'diamonds')], { declaration: 'SWING' });
    const r = BoxChevyMode.resolveShowdown!([a, b], 1000, '__server__', comm);
    expect(r.summary!.awards).toHaveLength(1);
    expect(r.summary!.awards[0].playerId).toBe('A');
    expect(r.summary!.awards[0].part).toBe('SWING');
    expect(r.summary!.awards[0].amount).toBe(1000);
    const high = r.summary!.comparisons.find(c => c.startsWith('HIGH'))!;
    const low = r.summary!.comparisons.find(c => c.startsWith('LOW'))!;
    expect(high).toContain('card 2 from the bottom');
    expect(high).toContain('4 over 3');
    expect(low).toContain('card 1 from the top');
    expect(low).toContain('Q under K');
    expect(r.summary!.comparisons.some(c => c.startsWith('SWING'))).toBe(true);
    expect(r.summary!.headline).toContain('SWINGS');
  });

  it('no declarers: full rollover with auto-fold outcomes, no entries', () => {
    const a = player('A', [card('A', 'hearts'), card('3', 'clubs'), card('5', 'diamonds'), card('7', 'spades'), card('9', 'hearts')],
      { status: 'folded', declaration: null, foldReason: 'declare-auto-invalid' } as Partial<Player>);
    const b = player('B', [card('K', 'hearts'), card('Q', 'clubs'), card('J', 'diamonds'), card('9', 'spades'), card('7', 'hearts')],
      { status: 'folded', declaration: 'FOLD' });
    const r = BoxChevyMode.resolveShowdown!([a, b], 640, '__server__', comm1);
    expect(r.pot).toBe(640);
    expect(r.summary!.rollover).toBe(640);
    expect(r.summary!.awards).toEqual([]);
    expect(r.summary!.entries).toEqual([]);
    expect(r.summary!.declarations!.map(d => d.outcome)).toEqual(['auto-folded (no made hand)', 'timed out — folded']);
  });
});
