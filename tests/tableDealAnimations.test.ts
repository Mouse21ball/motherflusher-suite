import { describe, expect, it } from 'vitest';
import {
  advanceTableDealTracker,
  deriveTableDealEvents,
  getDealStagger,
  type TableDealTracker,
} from '../client/src/components/flushedUp/useCardAnimations';
import type { Player } from '../shared/gameTypes';

const card = (rank: 'A' | 'K', isHidden = false) => ({
  rank,
  suit: 'spades' as const,
  isHidden,
});

function player(id: string, cards: Player['cards'], presence: Player['presence'] = 'human'): Player {
  return {
    id,
    name: id,
    presence,
    chips: 1000,
    bet: 0,
    cards,
    status: 'active',
    isDealer: false,
    declaration: null,
  };
}

describe('table deal snapshot animation', () => {
  it('deals in stable round-robin order and never carries opponent card data', () => {
    const events = deriveTableDealEvents(
      [{ id: 'hero', count: 0 }, { id: 'villain', count: 0 }],
      [player('hero', [card('A'), card('K')]), player('villain', [card('A', true), card('K', true)])],
      'BET_1',
      'ANTE',
      'hero',
    );

    expect(events.map(event => `${event.playerId}:${event.slot}`)).toEqual([
      'hero:0', 'villain:0', 'hero:1', 'villain:1',
    ]);
    expect(events[0].card?.rank).toBe('A');
    expect(events[1]).not.toHaveProperty('card');
    expect(events[3]).not.toHaveProperty('card');
    expect(events.filter(event => event.playerId !== 'hero').every(event => event.faceDown)).toBe(true);
  });

  it('skips the first snapshot so reconnects and refreshes do not replay a deal', () => {
    const nextPlayers = [player('hero', [card('A')]), player('villain', [card('K', true)])];
    const first = advanceTableDealTracker(null, nextPlayers, 'BET_1', 'hero');
    expect(first.events).toEqual([]);

    const second = advanceTableDealTracker(first.tracker, nextPlayers, 'BET_1', 'hero');
    expect(second.events).toEqual([]);
  });

  it('resets when a player leaves and does not create a phantom flight', () => {
    const previous: TableDealTracker = {
      ids: ['hero', 'villain'],
      counts: [{ id: 'hero', count: 0 }, { id: 'villain', count: 0 }],
      phase: 'ANTE',
    };
    const result = advanceTableDealTracker(previous, [player('hero', [card('A')])], 'BET_1', 'hero');
    expect(result.reset).toBe(true);
    expect(result.events).toEqual([]);
  });

  it('resets when authoritative seat order changes', () => {
    const previous: TableDealTracker = {
      ids: ['hero', 'villain'],
      counts: [{ id: 'hero', count: 1 }, { id: 'villain', count: 1 }],
      phase: 'BET_1',
    };
    const result = advanceTableDealTracker(
      previous,
      [player('villain', [card('K', true)]), player('hero', [card('A')])],
      'BET_1',
      'hero',
    );
    expect(result.reset).toBe(true);
    expect(result.events).toEqual([]);
  });

  it('resets when an authoritative player joins between existing seats during a deal', () => {
    const previous: TableDealTracker = {
      ids: ['hero', 'villain', 'other'],
      counts: [
        { id: 'hero', count: 1 },
        { id: 'villain', count: 1 },
        { id: 'other', count: 1 },
      ],
      phase: 'BET_1',
    };
    const result = advanceTableDealTracker(
      previous,
      [
        player('hero', [card('A')]),
        player('joined', [card('K', true)]),
        player('villain', [card('K', true)]),
        player('other', [card('K', true)]),
      ],
      'BET_1',
      'hero',
    );
    expect(result.reset).toBe(true);
    expect(result.events).toEqual([]);
    expect(result.tracker.ids).toEqual(['hero', 'joined', 'villain', 'other']);
  });

  it('allows a deal to land quickly even with a full table', () => {
    expect(getDealStagger(2)).toBe(82);
    expect(getDealStagger(40)).toBe(28);
    expect(340 + 39 * getDealStagger(40)).toBeLessThanOrEqual(1432);
  });
});