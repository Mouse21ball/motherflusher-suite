import { expect, test } from "@playwright/test";

test.describe("buy-in slider range labels", () => {
  test("shows 2,000 chips as 40 BB at a 50-chip blind", async ({ page }) => {
    await page.goto("/bust-out-rebuy-test.html?slider=1&balance=2000&blind=50");
    await expect(page.getByTestId("buyin-min-range")).toHaveText("1.0K (20 BB)");
    await expect(page.getByTestId("buyin-max-range")).toHaveText("2.0K (40 BB)");
  });

  test("shows a 200-chip cap as 20 BB at a 10-chip blind", async ({ page }) => {
    await page.goto("/bust-out-rebuy-test.html?slider=1&balance=200&blind=10");
    await expect(page.getByTestId("buyin-min-range")).toHaveText("200 (20 BB)");
    await expect(page.getByTestId("buyin-max-range")).toHaveText("200 (20 BB)");
  });

  test("uses the reserve cap after subtracting an existing 9,000-chip stack", async ({ page }) => {
    await page.goto("/bust-out-rebuy-test.html?slider=1&balance=2500&blind=50&stack=9000");
    await expect(page.getByTestId("buyin-max-range")).toHaveText("1.0K (20 BB)");
  });

  test("reconciles stakes and a reduced bankroll while the slider stays open", async ({ page }) => {
    await page.goto("/bust-out-rebuy-test.html?slider=1&balance=30000&blind=50");
    await expect(page.getByTestId("buyin-amount-display")).toHaveText("5.0K");
    await page.getByTestId("harness-stakes-change").click();
    await expect(page.getByTestId("buyin-min-range")).toHaveText("5.0K (20 BB)");
    await expect(page.getByTestId("buyin-amount-display")).toHaveText("15.0K");

    await page.goto("/bust-out-rebuy-test.html?slider=1&balance=30000&blind=50");
    await page.getByTestId("harness-bankroll-decrease").click();
    await expect(page.getByTestId("buyin-max-range")).toHaveText("2.0K (40 BB)");
    await expect(page.getByTestId("buyin-amount-display")).toHaveText("2.0K");
  });
});