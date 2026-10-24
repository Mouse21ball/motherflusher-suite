/**
 * Box Chevy seat geometry + deal-flight origin (Detroit 2026-10-24).
 *
 * Pure functions, extracted from BoxChevyTable so the dealer-origin
 * math is unit-testable. Coordinates are percentages of the table
 * root — the SAME space seat pods render in and the same space
 * FlightView animates in (absolute left/top % inside the table root),
 * so an origin computed here is directly comparable to a destination.
 */

export interface SeatPoint { x: number; y: number }

/** Rendered seat position by RELATIVE seat index (0 = hero). */
export function seatPosition(index: number): SeatPoint {
  if (index === 0) return { x: 50, y: 80 }; // hero — below the center band
  // Detroit 2026-10-22 (correction plan): center-aware ring variant.
  // Opponents take a top pair + mid pair ABOVE the reserved community
  // band (50.5%); the hero sits below it. Geometry budget verified at
  // 360x740 and 393x852 stage equivalents. DO NOT move these — approved
  // seat geometry.
  const spots: SeatPoint[] = [
    { x: 27, y: 10.5 },   // Opp 1: top-left
    { x: 73, y: 10.5 },   // Opp 2: top-right
    { x: 18.5, y: 30.5 }, // Opp 3: mid-left
    { x: 81.5, y: 30.5 }, // Opp 4: mid-right
  ];
  return spots[(index - 1) % spots.length];
}

interface SeatPlayer { id: string; isDealer?: boolean }

/** The proto-table seat order: hero first, then the other players in
 *  state order (max 4 opponents). Matches the ordering BoxChevyTable
 *  uses for pods and for the deal-flight loop. */
export function relativeSeatOrder<T extends SeatPlayer>(players: T[], myId: string): T[] {
  const me = players.find(p => p.id === myId);
  const others = players.filter(p => p.id !== myId).slice(0, 4);
  return me ? [me, ...others] : others;
}

/** Relative seat index of the current dealer (0 when unmarked). */
export function dealerSeatIndex(players: SeatPlayer[], myId: string): number {
  const ordered = relativeSeatOrder(players, myId);
  const idx = ordered.findIndex(p => p.isDealer);
  return idx >= 0 ? idx : 0;
}

/**
 * Flight origin for cards dealt BY the current dealer: the dealer's
 * own rendered seat position, lifted by the same -6 y-offset the
 * flight destinations use for a seat's card area. Recompute from the
 * live state at every scheduling moment (each new hand, each draw) so
 * button rotation between hands is honored. Falls back to the hero
 * seat when no dealer is marked.
 */
export function dealerFlightOrigin(players: SeatPlayer[], myId: string): SeatPoint {
  const seat = seatPosition(dealerSeatIndex(players, myId));
  return { x: seat.x, y: seat.y - 6 };
}
