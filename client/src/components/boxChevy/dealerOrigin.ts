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

// ─── Community band anchors ──────────────────────────────────────────
// Band position: Detroit 2026-10-24 (final polish P2) — the band
// (COMMUNITY label + five cards + pot pill) sits centered at
// calc(50.5% + 25px). That position ruling is UNCHANGED by P7.
//
// Card size: RE-DERIVED 2026-11-08 (P7; Detroit authorized re-ruling the
// Oct 24 growth cap for legibility — spade pips were hard to read at
// 36×50). New size 44×62 (was 36×50; original 32×44):
//   - Width: row = 5×44 + 4×5 gap = 240px ≤ 360px narrow Galaxy stage
//     (60px margins per side; 76.5px at 393px).
//   - Height: block = 11 label + 4 + 62 + 4 + 22 pot = 103px, still
//     centered on the same band center, so growth is symmetric: worst
//     clearances at 740px stage are 76.5px above (≥25 required) and
//     46.8px below (≥30 required). Vertical space was never the binding
//     constraint — the old cap was a growth band, not a fit limit.
//   - Hierarchy: hero hole cards are 52×74, winner-reveal cards already
//     render at 44×62 on this screen; community now matches the reveal
//     size and stays subordinate to the hero's hand. Aspect 44/62 ≈
//     0.71, the standard card ratio.
// Dependents re-derived FROM the new size (they were the blockers when
// a 44×62 trial was reverted in P3 — the trial changed the cards alone
// and desynced them):
//   - COMMUNITY_POS.y: card-row center is invariant under symmetric
//     growth (row center = bandCenter − 20.5px + 15px, independent of
//     card height) → stays 53.1 (≤2.6px off at both Galaxy heights).
//   - POT_POS.y: pill center moved down with the taller cards
//     (59.35% at 740, 58.19% at 852). 61.0 keeps the chip-flight landing
//     offset inside the historical 10–26px window at both heights
//     (12.2px at 740, 24.0px at 852). At the old 60.4 the offset fell to
//     7.8px at 740 — below the floor; that was the P3 trial's break.
//   - COMMUNITY_SPREAD: rendered pitch is now 44+5 = 49px. 13.0% is the
//     minimax % across 360/393px widths (worst outer-card landing error
//     ≈4.3px on a 44px-wide card, vs ≈3.7px before the resize).
//   - MUCK_LABEL_TOP: block bottom edge moved to band + 76.5px; the
//     label offset went 78 → 84px to restore the ~7.5px gap under the
//     pot pill. MUCK_POS (flight target) does not depend on card size
//     and is unchanged.
// Budget pinned by tests/bcCommunityGeometry.test.ts (rewritten P7).
export const COMMUNITY_BAND_TOP = 'calc(50.5% + 25px)';
export const COMMUNITY_CARD_W = 44;
export const COMMUNITY_CARD_H = 62;
/** Flight target for community cards: the rendered card-row center. */
export const COMMUNITY_POS: SeatPoint = { x: 50, y: 53.1 };
/** Horizontal pitch (% of table width) between community flight targets. */
export const COMMUNITY_SPREAD = 13.0;
/** Chip-flight target: the pot pill (rides with the band). */
export const POT_POS: SeatPoint = { x: 50, y: 61.0 };
/** Muck flight target / label anchor (rides with the band). */
export const MUCK_POS: SeatPoint = { x: 63, y: 50.4 };
export const MUCK_LABEL_TOP = 'calc(50.5% + 84px)';
