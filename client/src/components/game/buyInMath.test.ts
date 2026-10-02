import { describe, expect, it } from "vitest";
import { formatBuyInBigBlinds, getBuyInBigBlinds, reconcileBuyInAmount } from "./buyInMath";

describe("buy-in slider blind math and updates", () => {
  it("shows 2,000 chips as 40 big blinds at a 50-chip blind", () => {
    expect(getBuyInBigBlinds(2000, 50)).toBe(40);
  });

  it("formats bankroll-limited endpoints using their true blind count", () => {
    expect(formatBuyInBigBlinds(2000, 50)).toBe("40");
    expect(formatBuyInBigBlinds(200, 10)).toBe("20");
    expect(formatBuyInBigBlinds(1000, 50)).toBe("20");
  });

  it("preserves fractional big blinds for an off-step bankroll cap", () => {
    expect(formatBuyInBigBlinds(2001, 50)).toBe("40.02");
  });

  it("resets the selected amount when table stakes change while open", () => {
    expect(reconcileBuyInAmount(2000, 50, 250, 5000, 50000, 20000)).toBe(20000);
  });

  it("clamps the selected amount to a reduced bankroll on a blind increment", () => {
    expect(reconcileBuyInAmount(15000, 50, 50, 1000, 2000, 1000)).toBe(2000);
  });

  it("keeps buy-ins inside the normal 20–200 big blind range", () => {
    expect(reconcileBuyInAmount(100, 50, 50, 1000, 10000, 5000)).toBe(1000);
    expect(reconcileBuyInAmount(15000, 50, 50, 1000, 10000, 5000)).toBe(10000);
  });
});