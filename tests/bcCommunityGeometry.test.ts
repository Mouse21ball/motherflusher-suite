import { describe, expect, it } from 'vitest';
import {
  seatPosition, COMMUNITY_POS, POT_POS, MUCK_POS,
  COMMUNITY_CARD_W, COMMUNITY_CARD_H, COMMUNITY_SPREAD,
} from '../client/src/components/boxChevy/dealerOrigin';

// Geometry budget history:
// - Detroit 2026-10-24 (final polish P2): the community band + pot moved
//   down ~20–30px and the cards grew 32×44 → 36×50, capped at 1.10–1.15×
//   growth INSIDE the measured clearance budget.
// - RE-DERIVED 2026-11-08 (P7, defect #14): Detroit authorized re-ruling
//   the growth cap for legibility (spade pips unreadable at 36×50). The
//   binding constraints were never raw fit — the centered band has wide
//   vertical clearance — they were the DEPENDENTS of card size: the
//   pot-flight landing offset (fell to 7.8px at a 740px stage when a P3
//   trial grew the cards alone) and the deal-flight spread. This budget
//   therefore pins the size AND its re-derived dependents together:
//   cards 44×62, POT_POS.y 61.0, COMMUNITY_SPREAD 13.0, muck label
//   offset +84px. Band position (calc(50.5% + 25px)) and seat geometry
//   are unchanged from Oct 24. Full derivation: dealerOrigin.ts.
// Block metrics (BoxChevyTable center band): label ~11px + gap 4 +
// cards COMMUNITY_CARD_H + gap 4 + pot pill ~22px, centered on the band.
const BLOCK_H = 11 + 4 + COMMUNITY_CARD_H + 4 + 22;
const bandCenter = (h: number) => 0.505 * h + 25; // calc(50.5% + 25px)

describe('Box Chevy community geometry budget (P7 re-derived)', () => {
  for (const h of [740, 852]) {
    it(`fits with clearance at height ${h}`, () => {
      const top = bandCenter(h) - BLOCK_H / 2;
      const bottom = bandCenter(h) + BLOCK_H / 2;
      // Above: mid opponent pods (center y=30.5%, ~90px tall) must clear the band top.
      const midPodBottom = (seatPosition(3).y / 100) * h + 45;
      expect(top - midPodBottom).toBeGreaterThanOrEqual(25);
      // Below: the hero pod column (center y=80%, ~190px tall) must clear the band bottom.
      const heroPodTop = (seatPosition(0).y / 100) * h - 95;
      expect(heroPodTop - bottom).toBeGreaterThanOrEqual(30);
      // The band itself did not move in P7: exactly +25px calc at every
      // height, and the percent anchors still sit in the Oct 24 20–30px
      // shift band.
      expect(bandCenter(h) - 0.505 * h).toBe(25);
      const anchorShift = (COMMUNITY_POS.y - 49.7) / 100 * h;
      expect(anchorShift).toBeGreaterThanOrEqual(20);
      expect(anchorShift).toBeLessThanOrEqual(30);
      // Flight targets land on the rendered elements (±4px). The card-row
      // center is invariant under the symmetric card growth, so
      // COMMUNITY_POS.y is unchanged from the 36×50 budget.
      const cardRowCenter = top + 11 + 4 + COMMUNITY_CARD_H / 2;
      expect(Math.abs((COMMUNITY_POS.y / 100) * h - cardRowCenter)).toBeLessThanOrEqual(4);
      const pillCenter = top + 11 + 4 + COMMUNITY_CARD_H + 4 + 11;
      // Chip flights land just BELOW the pill center. POT_POS.y was
      // re-derived to 61.0 for the taller cards: 12.2px at 740, 24.0px
      // at 852. (At the old 60.4 the 740 offset fell to 7.8px — below
      // this floor; that desync is what reverted the P3 trial.)
      const potOffset = (POT_POS.y / 100) * h - pillCenter;
      expect(potOffset).toBeGreaterThanOrEqual(10);
      expect(potOffset).toBeLessThanOrEqual(26);
      expect(Math.abs((MUCK_POS.y - 47) / 100 * h)).toBeGreaterThanOrEqual(20);
    });
  }
  it('cards are the re-derived 44x62 and the five-card row fits a 360px Galaxy width', () => {
    expect(COMMUNITY_CARD_W).toBe(44);
    expect(COMMUNITY_CARD_H).toBe(62);
    // Growth over the ORIGINAL 32×44 — the new authorized budget
    // (supersedes the Oct 24 cap of 1.10–1.15×).
    expect(COMMUNITY_CARD_W / 32).toBeCloseTo(1.375, 3);
    expect(COMMUNITY_CARD_H / 44).toBeCloseTo(1.409, 3);
    expect(5 * COMMUNITY_CARD_W + 4 * 5).toBeLessThanOrEqual(360);
  });
  it('deal-flight spread tracks the new 49px rendered pitch at both Galaxy widths', () => {
    // Rendered pitch = card width + 5px row gap. COMMUNITY_SPREAD is the
    // minimax percent across 360/393px widths; the outermost flight
    // target (2 steps from center) must land within 4.5px of the
    // rendered card center.
    const pitchPx = COMMUNITY_CARD_W + 5;
    for (const w of [360, 393]) {
      const outerError = 2 * Math.abs((COMMUNITY_SPREAD / 100) * w - pitchPx);
      expect(outerError).toBeLessThanOrEqual(4.5);
    }
  });
  it('approved seat geometry is unchanged', () => {
    expect(seatPosition(0)).toEqual({ x: 50, y: 80 });
    expect(seatPosition(1)).toEqual({ x: 27, y: 10.5 });
    expect(seatPosition(4)).toEqual({ x: 81.5, y: 30.5 });
  });
});
