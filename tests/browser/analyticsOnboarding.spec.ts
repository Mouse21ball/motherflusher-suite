import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });
async function freshApp(page: Page) {
  const events: any[] = [];
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/analytics/track") {
        events.push(route.request().postDataJSON());
        await route.fulfill({ status: 200, body: '{"ok":true}' }); return;
      }
      const input = route.request().method() === "POST" ? route.request().postDataJSON() ?? {} : {};
      const profile = {
        profileId: input.identityId ?? "analytics-profile-fixture", displayName: "Analytics Test",
        chipBalance: 25000, stripes: 0, handsPlayed: 0, lifetimeProfit: 0,
        hasAuth: false, level: 1, xp: 0, welcomeKitClaimed: true,
        activeSubscriptionTier: null, sessionToken: "synthetic-analytics-fixture-session",
      };
      let body: unknown = {};
      if (url.pathname.startsWith("/api/auth/") || /^\/api\/players\/[^/]+$/.test(url.pathname)) body = profile;
      else if (url.pathname.includes("/quests")) body = { quests: [], claimed: [] };
      else if (["/cosmetics", "/friends", "/crews"].some(p => url.pathname.includes(p)) || url.pathname === "/api/tables") body = [];
      else if (url.pathname.includes("/notifications")) body = { count: 0, notifications: [], preferences: {} };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    } else if (["localhost", "127.0.0.1"].includes(url.hostname)) await route.continue();
    else await route.fulfill({ status: 204, body: "" });
  });
  await page.routeWebSocket(url => url.pathname === "/ws", socket => socket.close());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Skip Chain Gang Poker introduction" }).click();
  await page.getByTestId("button-age-confirm").click();
  return events;
}
for (const method of ["guest", "login", "create_account"]) {
  test(`fresh ${method} onboarding emits a connected, name-free funnel`, async ({ page }) => {
    const events = await freshApp(page);
    if (method === "guest") {
      await page.getByTestId("button-goto-guest").click();
      await page.getByTestId("input-display-name").fill("Analytics Test");
      await page.getByTestId("button-enter").click();
    } else if (method === "login") {
      await page.getByTestId("button-goto-login").click();
      await page.getByTestId("input-login-email").fill("analytics@example.invalid");
      await page.getByTestId("input-login-password").fill("SyntheticFixture1!");
      await page.getByTestId("button-login-submit").click();
    } else {
      await page.getByTestId("button-goto-register").click();
      await page.getByTestId("input-register-name").fill("Analytics Test");
      await page.getByTestId("input-register-email").fill("analytics@example.invalid");
      await page.getByTestId("input-register-password").fill("SyntheticFixture1!");
      await page.getByTestId("input-register-confirm").fill("SyntheticFixture1!");
      await page.getByTestId("button-register-submit").click();
    }
    await expect(page.getByTestId("text-bankroll")).toHaveText("$25,000");
    await expect.poll(() => events.filter(e => e.eventType === "home_viewed").length).toBe(1);
    const open = events.find(e => e.eventType === "app_open");
    const signup = events.find(e => e.eventType === "signup_completed");
    expect(open.properties.first_open).toBe(true);
    expect(events.filter(e => e.eventType === "age_gate_accepted")).toHaveLength(1);
    expect(signup.properties).toMatchObject({ method, name_length: 14, session_id: open.properties.session_id });
    expect(signup.properties).not.toHaveProperty("name");
    expect(signup.properties).not.toHaveProperty("email");
    expect(events.find(e => e.eventType === "home_viewed").properties.is_first_home).toBe(true);
    const card = method === "guest" ? "badugi" : method === "login" ? "flushedup" : "ladyluck";
    const mode = method === "guest" ? "badugi" : method === "login" ? "flushed_up" : "lady_luck";
    await page.getByTestId(`button-play-${card}`).click();
    await expect.poll(() => events.filter(e => e.eventType === "mode_selected").length).toBe(1);
    expect(events.find(e => e.eventType === "mode_selected").properties.mode).toBe(mode);
  });
}
