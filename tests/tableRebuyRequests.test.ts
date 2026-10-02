import { describe, expect, it } from 'vitest';
import {
  getTableRebuyBustEvent,
  markTableRebuyEventClaimed,
  markTableRebuyEventFunded,
  type TableRebuyBustEvent,
} from '../server/tableRebuyRequests';

describe('server-owned table rebuy bust events', () => {
  it('keeps an unclaimed bust event stable through waiting-hand changes and request retries', () => {
    const events = new Map<string, TableRebuyBustEvent>();
    const first = getTableRebuyBustEvent(events, 'p1', 'player-1');

    // Hand IDs and client request UUIDs intentionally are not inputs to event identity.
    expect(getTableRebuyBustEvent(events, 'p1', 'player-1')).toBe(first);
    expect(getTableRebuyBustEvent(events, 'p1', 'player-1').eventId).toBe(first.eventId);
  });

  it('rejects a second independent request until the seat was re-funded and busted again', () => {
    const events = new Map<string, TableRebuyBustEvent>();
    const first = getTableRebuyBustEvent(events, 'p1', 'player-1');
    markTableRebuyEventClaimed(first);

    expect(() => getTableRebuyBustEvent(events, 'p1', 'player-1'))
      .toThrow('A rebuy has already been used for this bust event.');

    markTableRebuyEventFunded(first);
    const second = getTableRebuyBustEvent(events, 'p1', 'player-1');
    expect(second.eventId).not.toBe(first.eventId);
    expect(second.claimed).toBe(false);
    expect(second.fundedSinceBust).toBe(false);
  });

  it('does not carry a seat event from its old owner into a new player seat', () => {
    const events = new Map<string, TableRebuyBustEvent>();
    const previous = getTableRebuyBustEvent(events, 'p1', 'player-1');
    markTableRebuyEventFunded(previous);

    const replacement = getTableRebuyBustEvent(events, 'p1', 'player-2');
    expect(replacement.identityId).toBe('player-2');
    expect(replacement.eventId).not.toBe(previous.eventId);
  });
});