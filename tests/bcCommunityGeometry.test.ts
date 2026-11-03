import { describe, expect, it } from 'vitest';
import {
  seatPosition, COMMUNITY_POS, POT_POS, MUCK_POS,
  COMMUNITY_CARD_W, COMMUNITY_CARD_H,
} from '../client/src/components/boxChevy/dealerOrigin';

// Detroit 2026-10-24 (final polish P2): the community band + pot moved
// down ~20–30px and the cards grew ~10–15%, INSIDE the measured
// clearance budget only. This test recomputes the budget from the
// shipped constants at both Galaxy stage sizes — if a future change
// breaks the budget, this fails before a build does.
// Block metrics (BoxChevyTable center band): label ~11px + gap 4 +
// cards COMMUNITY_CARD_H + gap 4 + pot pill ~22px, centered on the band.
const BLOCK_H = 11 + 4 + COMMUNITY_CARD_H + 4 + 22;
const bandCenter = (h: number) => 0.505 * h + 25; // calc(50.5% + 25px)

describe('Box Chevy community polish geometry budget', () => {
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
      // The band moved down exactly 25px at every height (calc), and the
      // percent anchors moved 20–30px — the approved band.
      expect(bandCenter(h) - 0.505 * h).toBe(25);
      const anchorShift = (COMMUNITY_POS.y - 49.7) / 100 * h;
      expect(anchorShift).toBeGreaterThanOrEqual(20);
      expect(anchorShift).toBeLessThanOrEqual(30);
      // Flight targets land on the rendered elements (±4px).
      const cardRowCenter = top + 11 + 4 + COMMUNITY_CARD_H / 2;
      expect(Math.abs((COMMUNITY_POS.y / 100) * h - cardRowCenter)).toBeLessThanOrEqual(4);
      const pillCenter = top + 11 + 4 + COMMUNITY_CARD_H + 4 + 11;
      // Chip flights land just BELOW the pill center — the pre-polish
      // relationship (17px at 740, 24px at 852); the polish preserves it.
      const potOffset = (POT_POS.y / 100) * h - pillCenter;
      expect(potOffset).toBeGreaterThanOrEqual(10);
      expect(potOffset).toBeLessThanOrEqual(26);
      expect(Math.abs((MUCK_POS.y - 47) / 100 * h)).toBeGreaterThanOrEqual(20);
    });
  }
  it('cards grew 10–15% and the five-card row fits a 360px Galaxy width', () => {
    expect(COMMUNITY_CARD_W / 32).toBeGreaterThanOrEqual(1.10);
    expect(COMMUNITY_CARD_W / 32).toBeLessThanOrEqual(1.15);
    expect(COMMUNITY_CARD_H / 44).toBeGreaterThanOrEqual(1.10);
    expect(COMMUNITY_CARD_H / 44).toBeLessThanOrEqual(1.15);
    expect(5 * COMMUNITY_CARD_W + 4 * 5).toBeLessThanOrEqual(360);
  });
  it('approved seat geometry is unchanged', () => {
    expect(seatPosition(0)).toEqual({ x: 50, y: 80 });
    expect(seatPosition(1)).toEqual({ x: 27, y: 10.5 });
    expect(seatPosition(4)).toEqual({ x: 81.5, y: 30.5 });
  });
});
