import { describe, expect, it } from 'vitest';
import { seatPosition, dealerSeatIndex, dealerFlightOrigin } from '../client/src/components/boxChevy/dealerOrigin';

// Detroit 2026-10-24: card flights must originate at the CURRENT
// dealer's rendered seat — the old constant origin was top-center
// (50, 4) regardless of who dealt. These pins cover all five dealer
// positions and rotation between hands.
const seats = (dealerId: string | null) => ['me', 'a', 'b', 'c', 'd'].map(id => ({ id, isDealer: id === dealerId }));

describe('Box Chevy dealer flight origin', () => {
  it('seat geometry is the approved ring, unchanged', () => {
    expect(seatPosition(0)).toEqual({ x: 50, y: 80 });
    expect(seatPosition(1)).toEqual({ x: 27, y: 10.5 });
    expect(seatPosition(2)).toEqual({ x: 73, y: 10.5 });
    expect(seatPosition(3)).toEqual({ x: 18.5, y: 30.5 });
    expect(seatPosition(4)).toEqual({ x: 81.5, y: 30.5 });
  });

  it('origin = dealer seat (with the -6 card-area offset) for all five dealer positions', () => {
    expect(dealerFlightOrigin(seats('me'), 'me')).toEqual({ x: 50, y: 74 });
    expect(dealerFlightOrigin(seats('a'), 'me')).toEqual({ x: 27, y: 4.5 });
    expect(dealerFlightOrigin(seats('b'), 'me')).toEqual({ x: 73, y: 4.5 });
    expect(dealerFlightOrigin(seats('c'), 'me')).toEqual({ x: 18.5, y: 24.5 });
    expect(dealerFlightOrigin(seats('d'), 'me')).toEqual({ x: 81.5, y: 24.5 });
  });

  it('follows dealer rotation between hands', () => {
    const hand1 = dealerFlightOrigin(seats('a'), 'me');
    const hand2 = dealerFlightOrigin(seats('b'), 'me');
    const hand3 = dealerFlightOrigin(seats('me'), 'me');
    expect(hand1).not.toEqual(hand2);
    expect(hand2).not.toEqual(hand3);
    expect(hand3).toEqual({ x: 50, y: 74 });
  });

  it('resolves the dealer relative to the hero wherever the hero sits in state order', () => {
    const players = [
      { id: 'a', isDealer: false },
      { id: 'b', isDealer: true },
      { id: 'me', isDealer: false },
      { id: 'c', isDealer: false },
      { id: 'd', isDealer: false },
    ];
    // Relative order is [me, a, b, c, d] → dealer b is relative seat 2.
    expect(dealerSeatIndex(players, 'me')).toBe(2);
    expect(dealerFlightOrigin(players, 'me')).toEqual({ x: 73, y: 4.5 });
  });

  it('falls back to the hero seat when no dealer is marked', () => {
    expect(dealerFlightOrigin(seats(null), 'me')).toEqual({ x: 50, y: 74 });
  });
});
