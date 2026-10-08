import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });
for (const mode of ["badugi", "flushed_up", "box_chevy"]) {
  test(`${mode} records dealt hands, early folds and wins without snapshot duplicates`, async ({ page }) => {
    const events: any[] = [];
    await page.route("**/api/analytics/track", async route => {
      events.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.goto("/analytics-test.html", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Poker mode").selectOption(mode);
    await page.getByRole("button", { name: "Deal", exact: true }).click();
    await page.getByRole("button", { name: "Repeat snapshot" }).click();
    const hands = () => events.filter(e => e.mode === mode && ["hand_started", "hand_completed"].includes(e.eventType));
    await expect.poll(() => hands().length).toBe(1);
    await page.getByRole("button", { name: "Fold", exact: true }).click();
    await expect.poll(() => hands().length).toBe(2);
    expect(hands()[1].properties.outcome).toBe("fold");
    await page.getByRole("button", { name: "Showdown" }).click();
    await page.getByRole("button", { name: "Next hand" }).click();
    await page.getByRole("button", { name: "Showdown" }).click();
    await expect.poll(() => hands().length).toBe(4);
    expect(hands()[3]).toMatchObject({ properties: { hand_id: "2", outcome: "win" }, platform: "web" });
    expect(hands().map(e => e.eventType)).toEqual(["hand_started", "hand_completed", "hand_started", "hand_completed"]);
    expect(new Set(hands().map(e => e.properties.event_key)).size).toBe(4);
    expect(hands().every(e => !("cards" in e.properties))).toBe(true);
  });
}
test("Lady Luck records one paid race and completion even when settled wagers reset", async ({ page }) => {
  const events: any[] = [];
  await page.route("**/api/analytics/track", async route => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, body: "{}" });
  });
  await page.goto("/analytics-test.html", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Race start" }).click();
  await page.getByRole("button", { name: "Repeat race" }).click();
  await page.getByRole("button", { name: "Race result" }).click();
  await page.getByRole("button", { name: "Repeat race" }).click();
  const hands = () => events.filter(e => e.mode === "lady_luck" && e.eventType.startsWith("hand_"));
  await expect.poll(() => hands().length).toBe(2);
  expect(hands()[1].properties).toMatchObject({ hand_id: "fixture-race", outcome: "win" });
  expect(events.filter(e => e.eventType === "table_joined" && e.mode === "lady_luck")).toHaveLength(1);
  expect(events.filter(e => e.eventType === "mode_play" && e.mode === "lady_luck")).toHaveLength(1);
});
test("viewers do not count as dealt players or paid race entrants", async ({ page }) => {
  const events: any[] = [];
  await page.route("**/api/analytics/track", async route => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, body: "{}" });
  });
  await page.goto("/analytics-test.html", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Spectate" }).click();
  await page.getByRole("button", { name: "Deal", exact: true }).click();
  await page.getByRole("button", { name: "Race start" }).click();
  await page.getByRole("button", { name: "Showdown" }).click();
  await page.getByRole("button", { name: "Race result" }).click();
  await page.waitForTimeout(200);
  expect(events.filter(e => e.eventType.startsWith("hand_"))).toEqual([]);
});
