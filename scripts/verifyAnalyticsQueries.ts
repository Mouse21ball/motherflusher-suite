import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db } from "../server/db";

// Read-only integration verification. The CTE shadows analytics_events with
// synthetic rows, so no real player data is queried, inserted or deleted.
async function main() {
  const fixture = JSON.parse(readFileSync("tests/fixtures/analyticsEvents.json", "utf8"));
  const today = new Date().toISOString().slice(0, 10);
  fixture.push({
    id: "fresh-cohort", player_id: "fresh-player", event_type: "app_open",
    event_date: today, created_at: `${today}T10:00:00Z`, mode: null,
    properties: { first_open: true, session_id: "fresh-session" },
    platform: "web", app_version: "1.4",
  });
  const reports: Record<string, any[]> = {};
  for (const name of ["retention", "funnel", "bust-loop", "bonus-loop"]) {
    const source = readFileSync(`docs/analytics/${name}.sql`, "utf8");
    assert(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(source.replace(/--[^\n]*/g, "")), "Report must be read-only");
    const query = source.replace(/;\s*$/, "");
    const result = await db.$client.query(`
      WITH analytics_events AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS fixture(
          id TEXT, player_id TEXT, event_type TEXT, event_date TEXT,
          created_at TIMESTAMP, mode TEXT, properties JSONB, platform TEXT, app_version TEXT
        )
      ), report AS (${query})
      SELECT COALESCE(json_agg(report), '[]'::json) AS reports FROM report
    `, [JSON.stringify(fixture)]);
    reports[name] = result.rows[0].reports;
  }
  const january1 = reports.retention.find(r => r.install_day === "2000-01-01");
  assert.equal(january1.installs, 2);
  for (const day of [1, 7, 30]) {
    assert.equal(january1[`d${day}_returns`], 1);
    assert.equal(january1[`d${day}_pct`], 50);
  }
  const fresh = reports.retention.find(r => r.install_day === today);
  assert.equal(fresh.d1_eligible, 0);
  for (const day of [1, 7, 30]) assert.equal(fresh[`d${day}_pct`], null);
  const funnel = reports.funnel[0];
  assert.equal(funnel.installs, 4);
  assert.equal(funnel.age_accepted, 3);
  assert.equal(funnel.signup_completed, 2);
  assert.equal(funnel.home_viewed, 2);
  assert.equal(funnel.table_joined, 2); // Not doubled by legacy mode_play.
  assert.equal(funnel.first_hand, 2);
  assert.equal(funnel.first_game_complete, 2); // Includes pre-showdown fold.
  assert.equal(funnel.session1_activated, 2);
  assert.equal(funnel.session1_activation_pct, 50);
  assert.equal(funnel.median_hands_to_completion, 1); // Duplicate hand ignored.
  assert.equal(reports["bust-loop"][0].sessions, 7);
  assert.equal(reports["bust-loop"][0].busts, 1);
  assert.equal(reports["bust-loop"][0].busts_followed_by_end_within_2m, 1);
  const bonuses = reports["bonus-loop"];
  assert.equal(bonuses.find(r => r.type === "any" && r.claimed).d1_pct, 100);
  assert.equal(bonuses.find(r => r.type === "any" && !r.claimed).d1_pct, 0);
  assert.equal(bonuses.find(r => r.type === "welcome_kit" && r.claimed).installs, 1);
  assert.equal(bonuses.find(r => r.type === "starter_pack" && r.claimed).installs, 1);
  console.log("PASS: retention, funnel/activation, bust loop, bonus loop (read-only synthetic SQL fixtures)");
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => db.$client.end());
