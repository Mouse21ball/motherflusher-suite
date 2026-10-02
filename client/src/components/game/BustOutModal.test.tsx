import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BustOutModal } from "./BustOutModal";

function renderBustModal(tier: 1 | 2 | 3 | 4, bankrollAvailable: number) {
  const markup = renderToStaticMarkup(createElement(BustOutModal, {
    open: true,
    lifetimeBusts: tier === 1 ? 1 : 0,
    sessionBusts: tier === 2 || tier === 3 ? 2 : 0,
    hasNeverPurchased: tier === 1 || tier === 3,
    onRebuy: () => {},
    onLeaveTable: () => {},
    onSpectate: () => {},
    onStarterPack: () => {},
    tableId: "QA",
    modeId: "badugi",
    bankrollAvailable,
    bigBlind: 50,
  }));
  return markup;
}

describe("bust-out free and reserve recovery actions", () => {
  it("uses the same fixed 1,000-chip grant in each free-grant tier", () => {
    for (const tier of [1, 2, 3] as const) {
      expect(renderBustModal(tier, 0)).toContain("GET 1,000 FREE CHIPS");
    }
  });

  it("offers the fixed free grant for tier four at zero but keeps positive balances reserve-only", () => {
    const broke = renderBustModal(4, 0);
    expect(broke).toContain("GET 1,000 FREE CHIPS");
    expect(broke).not.toContain("REBUY (CHOOSE AMOUNT)");

    const funded = renderBustModal(4, 8000);
    expect(funded).toContain("REBUY (CHOOSE AMOUNT)");
    expect(funded).not.toContain("GET 1,000 FREE CHIPS");
  });

  it("does not expose a reserve slider action when a free-grant tier has no wallet", () => {
    const broke = renderBustModal(1, 0);
    expect(broke).toContain("GET 1,000 FREE CHIPS");
    expect(broke).not.toContain("REBUY (CHOOSE AMOUNT)");
  });
});