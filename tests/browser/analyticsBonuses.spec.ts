import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });
for (const [modal, button, type, chips, streak] of [
  ["daily", "button-claim-daily-bonus", "daily_calendar", 547, 4],
  ["hourly", "button-claim-hourly", "hourly", 333, 0],
  ["starter", "button-claim-starter", "starter_pack", 2678, 0],
] as const) {
  for (const success of [true, false]) {
    test(`${modal} claim ${success ? "logs actual server grant" : "does not log a rejected grant"}`, async ({ page }) => {
      const events: any[] = [];
      let claims = 0;
      await page.route("**/api/**", async route => {
        const path = new URL(route.request().url()).pathname;
        let body: unknown = {};
        let status = 200;
        if (path === "/api/analytics/track") {
          events.push(route.request().postDataJSON());
        } else if (path.endsWith("/daily-bonus/status")) {
          body = { canClaim: true, currentStreakDay: 3, nextClaimAvailableAt: new Date().toISOString(), todaysReward: { chips: 1500, stripes: 0 } };
        } else if (path.endsWith("/rewards/status")) {
          body = { hourly: { available: true, chips: 250, nextAt: null } };
        } else if (path.endsWith("/claim") || path.endsWith("/claim-welcome-kit")) {
          claims++;
          status = success ? 200 : 409;
          body = path.endsWith("/daily-bonus/claim")
            ? { chipsGranted: chips, stripesGranted: 0, newStreakDay: streak, newChipBalance: 25547, newStripesBalance: 0, nextClaimAvailableAt: new Date(Date.now() + 86400000).toISOString() }
            : { chips, chipBalance: 28000, stripes: 250 };
        } else {
          const input = route.request().method() === "POST" ? route.request().postDataJSON() : null;
          body = { profileId: input?.identityId ?? "reward-fixture", displayName: "Reward Fixture", chipBalance: 25000, xp: 0, stripes: 0, welcomeKitClaimed: false, hasAuth: false };
        }
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      });
      await page.goto("/analytics-test.html?bonus=1", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: `Open ${modal}`, exact: true }).click();
      await page.getByTestId(button).click();
      await expect.poll(() => claims).toBe(1);
      if (success) {
        await expect.poll(() => events.filter(e => e.eventType === "bonus_claimed").length).toBe(1);
        const bonus = events.find(e => e.eventType === "bonus_claimed");
        expect(bonus.properties).toMatchObject({ type, chips, streak_day: streak });
        if (modal === "starter") expect(bonus.properties.reward_type).toBe("welcome_kit");
      } else {
        await page.waitForTimeout(300);
        expect(events.filter(e => e.eventType === "bonus_claimed")).toEqual([]);
      }
    });
  }
}
