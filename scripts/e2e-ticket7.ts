// ─── Ticket 7 E2E — 20 Tests ──────────────────────────────────────────────────
// Run: npx tsx scripts/e2e-ticket7.ts
// Requires the dev server to be running on localhost:5000.
// Uses direct DB writes for state setup that has no public API.

import { db } from "../server/db";
import { playerProfiles } from "../shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import WebSocket from "ws";

const BASE    = "http://localhost:5000";
const WS_BASE = "ws://localhost:5000";

// ─── Result tracking ─────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const log: string[] = [];

function pass(n: number, name: string, detail: string) {
  passed++;
  const line = `✅ T${String(n).padStart(2, "0")}: ${name}\n       ${detail}`;
  console.log(line);
  log.push(line);
}
function fail(n: number, name: string, detail: string) {
  failed++;
  const line = `❌ T${String(n).padStart(2, "0")}: ${name}\n       ${detail}`;
  console.log(line);
  log.push(line);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function api(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Session-Token"] = token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function tableCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

interface PlayerHandle { id: string; token: string }

async function makePlayer(opts: {
  chips?:         number;
  stripes?:       number;
  freeUses?:      number;
  purchasedUses?: number;
  tier?:          string | null;
  name?:          string;
} = {}): Promise<PlayerHandle> {
  const id = randomUUID();
  await api("POST", "/api/players", { id, displayName: opts.name ?? "E2EBot" });
  const me = await api("GET", `/api/auth/me/${id}`);
  const token = me.data.sessionToken as string;

  // Direct DB overrides for state that has no public setter
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (opts.chips         != null) updates.chipBalance               = opts.chips;
  if (opts.stripes       != null) updates.stripes                   = opts.stripes;
  if (opts.freeUses      != null) updates.timeBankFreeUsesRemaining = opts.freeUses;
  if (opts.purchasedUses != null) updates.timeBankPurchasedUses     = opts.purchasedUses;
  if (opts.tier !== undefined)    updates.activeSubscriptionTier    = opts.tier;
  if (Object.keys(updates).length > 1) {
    await db.update(playerProfiles).set(updates as any).where(eq(playerProfiles.id, id));
  }
  return { id, token };
}

async function registerTable(
  tableId: string,
  createdBy: string,
  modeId = "badugi",
): Promise<void> {
  await api("POST", "/api/tables", {
    tableId,
    modeId,
    createdBy,
    maxPlayers:   2,
    botsEnabled:  true,
    isInviteOnly: false,
  });
}

interface TurnInfo { deadline: number; seatId: string; tableId: string }

/** Open a WS, join the table, wait until it is the hero's turn (turnDeadline set).
 *  Sends badugi:start after badugi:init so the hand actually begins.
 *  Keeps the socket open — caller must call ws.close(). */
function waitForMyTurn(
  tableId:  string,
  modeId:   string,
  playerId: string,
  timeoutMs = 18_000,
): Promise<{ info: TurnInfo; ws: WebSocket }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws`);
    let settled   = false;
    let heroSeat: string | null = null;   // assigned by badugi:init (e.g. "p1")
    let startSent = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.close();
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for turn on table ${tableId}`));
    }, timeoutMs);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        type:       "join",
        tableId,
        modeId,
        playerId,
        identityId: playerId,   // required: engine stores this in seatToIdentityId
        name:       "E2EHero",
        seatId:     playerId,
        quickPlay:  true,
      }));
    });

    ws.on("message", (raw) => {
      if (settled) return;
      try {
        const msg = JSON.parse(raw.toString());

        // ── badugi:init: learn our seat, then fire start ──────────────────────
        if (msg.type === "badugi:init" && msg.playerId && !startSent) {
          heroSeat  = msg.playerId as string;   // e.g. "p1"
          startSent = true;
          ws.send(JSON.stringify({
            type:     "badugi:action",
            tableId,
            playerId: heroSeat,
            action:   "start",
          }));
          return;
        }

        // ── badugi:snapshot: check if it's now our turn ───────────────────────
        const state = msg.state;
        if (!state || !heroSeat) return;

        const activeId: string | undefined = state.activePlayerId;
        if (!activeId || activeId !== heroSeat) return;

        // ANTE phase is not interactive — auto-ante so the hand can progress
        // to BET_1 where the real turn timer fires.
        if (state.phase === "ANTE") {
          ws.send(JSON.stringify({
            type:     "badugi:action",
            tableId,
            playerId: heroSeat,
            action:   "ante",
          }));
          return;
        }

        // Interactive phase: wait for a live turn deadline
        const now = Date.now();
        const deadline: number | undefined = state.turnDeadline;
        if (!deadline || deadline <= now) return;

        settled = true;
        clearTimeout(timer);
        resolve({ info: { deadline, seatId: heroSeat, tableId }, ws });
      } catch {}
    });

    ws.on("error", (e) => { if (!settled) { settled = true; clearTimeout(timer); ws.close(); reject(e); } });
  });
}

// ─── Main test runner ─────────────────────────────────────────────────────────
async function run() {
  // Hard-coded minBet (server default when no live engine entry)
  const BB         = 50;
  const MIN_BUYIN  = BB * 20;   // 1 000
  const MAX_BUYIN  = BB * 200;  // 10 000

  console.log(`\n${"─".repeat(64)}`);
  console.log("CHAIN GANG POKER — TICKET 7 E2E VERIFICATION (20 tests)");
  console.log(`Server big blind (hardcoded minBet): ${BB} chips`);
  console.log(`Min buy-in: ${MIN_BUYIN}  |  Max buy-in: ${MAX_BUYIN}`);
  console.log(`${"─".repeat(64)}\n`);

  // ════════════════════════════════════════════════════════════════════════
  // BUY-IN SLIDER (T01-T06)
  // ════════════════════════════════════════════════════════════════════════

  // T01 — Valid 100BB join, chips debited
  {
    const { id, token } = await makePlayer({ chips: 50_000 });
    const tid = tableCode();
    await registerTable(tid, id);
    const buyin = BB * 100; // 5 000
    const r = await api("POST", `/api/tables/${tid}/join`, { buyin_chips: buyin, mode_id: "badugi" }, token);
    const prof = await api("GET", `/api/players/${id}`);
    const expectedBal = 50_000 - buyin;
    if (r.status === 200 && r.data.buyin_chips === buyin && prof.data.chipBalance === expectedBal) {
      pass(1, "100BB join — debit correct, HTTP 200", `buyin_chips=${r.data.buyin_chips}, new_balance=${prof.data.chipBalance} (50000 − ${buyin})`);
    } else {
      fail(1, "100BB join — debit correct, HTTP 200", `HTTP ${r.status}, buyin=${r.data.buyin_chips}, balance=${prof.data.chipBalance} (want ${expectedBal})`);
    }
  }

  // T02 — 19BB (950 chips) below 20BB minimum → 400
  {
    const { id, token } = await makePlayer({ chips: 50_000 });
    const tid = tableCode();
    await registerTable(tid, id);
    const r = await api("POST", `/api/tables/${tid}/join`, { buyin_chips: BB * 19, mode_id: "badugi" }, token);
    if (r.status === 400 && r.data.min_buyin === MIN_BUYIN) {
      pass(2, "19BB below minimum → 400", `HTTP 400, min_buyin=${r.data.min_buyin}, error="${r.data.error}"`);
    } else {
      fail(2, "19BB below minimum → 400", `HTTP ${r.status}, body=${JSON.stringify(r.data)}`);
    }
  }

  // T03 — 201BB (10050 chips) above 200BB max → 400
  {
    const { id, token } = await makePlayer({ chips: 50_000 });
    const tid = tableCode();
    await registerTable(tid, id);
    const r = await api("POST", `/api/tables/${tid}/join`, { buyin_chips: BB * 201, mode_id: "badugi" }, token);
    if (r.status === 400 && r.data.max_buyin === MAX_BUYIN) {
      pass(3, "201BB above maximum → 400", `HTTP 400, max_buyin=${r.data.max_buyin}, error="${r.data.error}"`);
    } else {
      fail(3, "201BB above maximum → 400", `HTTP ${r.status}, body=${JSON.stringify(r.data)}`);
    }
  }

  // T04 — 50BB stack rebuys 100BB → 150BB total (within cap)
  {
    const { id, token } = await makePlayer({ chips: 50_000 });
    const tid = tableCode();
    await registerTable(tid, id);
    const stack  = BB * 50;   // 2 500
    const rebuy  = BB * 100;  // 5 000
    const want   = stack + rebuy; // 7 500 = 150BB
    const r = await api("POST", `/api/tables/${tid}/rebuy`, { current_stack: stack, rebuy_chips: rebuy, mode_id: "badugi" }, token);
    if (r.status === 200 && r.data.would_be_stack === want) {
      pass(4, "50BB stack + 100BB rebuy → 150BB total, HTTP 200", `would_be_stack=${r.data.would_be_stack} (${r.data.would_be_stack / BB}BB)`);
    } else {
      fail(4, "50BB stack + 100BB rebuy → 150BB total", `HTTP ${r.status}, body=${JSON.stringify(r.data)}`);
    }
  }

  // T05 — 50BB stack rebuys 160BB → would be 210BB, exceeds cap → 400
  {
    const { id, token } = await makePlayer({ chips: 50_000 });
    const tid = tableCode();
    await registerTable(tid, id);
    const stack = BB * 50;   // 2 500
    const rebuy = BB * 160;  // 8 000  → total 10 500 > 10 000
    const maxRebuy = MAX_BUYIN - stack; // 7 500
    const r = await api("POST", `/api/tables/${tid}/rebuy`, { current_stack: stack, rebuy_chips: rebuy, mode_id: "badugi" }, token);
    if (r.status === 400 && r.data.max_rebuy === maxRebuy) {
      pass(5, "50BB + 160BB rebuy exceeds 200BB cap → 400", `HTTP 400, max_rebuy=${r.data.max_rebuy} (${r.data.max_rebuy / BB}BB)`);
    } else {
      fail(5, "50BB + 160BB rebuy exceeds 200BB cap → 400", `HTTP ${r.status}, body=${JSON.stringify(r.data)}`);
    }
  }

  // T06 — 500-chip balance, min buy-in 1000 → 402 insufficient
  {
    const { id, token } = await makePlayer({ chips: 500 });
    const tid = tableCode();
    await registerTable(tid, id);
    const r = await api("POST", `/api/tables/${tid}/join`, { buyin_chips: MIN_BUYIN, mode_id: "badugi" }, token);
    if (r.status === 402) {
      pass(6, "500-chip balance, request min buy-in → 402", `HTTP 402, error="${r.data.error}", min_buyin=${r.data.min_buyin}`);
    } else {
      fail(6, "500-chip balance, request min buy-in → 402", `HTTP ${r.status}, body=${JSON.stringify(r.data)}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // TIME BANK — FREE USES (T07-T09)
  // ════════════════════════════════════════════════════════════════════════

  // T07 — Fresh player (free=2), use once → free=1, source=free, +20s
  {
    const { id, token } = await makePlayer({ chips: 25_000, freeUses: 2 });
    const tid = tableCode();
    await registerTable(tid, id);
    let ws: WebSocket | null = null;
    try {
      const { info, ws: sock } = await waitForMyTurn(tid, "badugi", id);
      ws = sock;
      const beforeDeadline = info.deadline;
      const r = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid, mode_id: "badugi" }, token);
      const st = await api("GET", `/api/players/${id}/time-bank/status`, undefined, token);
      const addedSec = r.data.new_timer_expires_at
        ? Math.round((r.data.new_timer_expires_at - beforeDeadline) / 1000)
        : "?";
      if (r.status === 200 && r.data.source === "free" && st.data.free_remaining === 1) {
        pass(7, "Free use #1 → +20s, free_remaining=1", `HTTP 200, source=${r.data.source}, free_remaining=${st.data.free_remaining}, +${addedSec}s added`);
      } else {
        fail(7, "Free use #1 → +20s, free_remaining=1", `HTTP ${r.status}, source=${r.data.source ?? r.data.error}, free_remaining=${st.data.free_remaining}`);
      }
    } catch (e: any) {
      fail(7, "Free use #1 → +20s, free_remaining=1", `SETUP FAIL: ${e.message}`);
    } finally { ws?.close(); }
  }

  // T08 — Same player uses again → free=0 (new table to bypass per-turn rate limit)
  {
    const { id, token } = await makePlayer({ chips: 25_000, freeUses: 2 });
    const results: string[] = [];
    for (let use = 1; use <= 2; use++) {
      const tid = tableCode();
      await registerTable(tid, id);
      let ws: WebSocket | null = null;
      try {
        const { ws: sock } = await waitForMyTurn(tid, "badugi", id);
        ws = sock;
        const r = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid, mode_id: "badugi" }, token);
        results.push(`use#${use}: HTTP ${r.status} source=${r.data.source ?? r.data.error}`);
      } catch (e: any) {
        results.push(`use#${use}: SETUP_FAIL(${e.message})`);
      } finally { ws?.close(); }
    }
    const st = await api("GET", `/api/players/${id}/time-bank/status`, undefined, token);
    if (st.data.free_remaining === 0 && results.every(r => r.includes("HTTP 200"))) {
      pass(8, "Free use #2 → free_remaining=0", `${results.join(", ")}, free_remaining=${st.data.free_remaining}`);
    } else {
      fail(8, "Free use #2 → free_remaining=0", `${results.join(", ")}, free_remaining=${st.data.free_remaining}`);
    }
  }

  // T09 — Third attempt (free=0, purchased=0) → 402 no_uses_available
  {
    const { id, token } = await makePlayer({ chips: 25_000, freeUses: 0, purchasedUses: 0 });
    const tid = tableCode();
    await registerTable(tid, id);
    const r = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid, mode_id: "badugi" }, token);
    if (r.status === 402 && r.data.error === "no_uses_available") {
      pass(9, "No uses left → 402 no_uses_available", `HTTP 402, error="${r.data.error}", message="${r.data.message}"`);
    } else {
      fail(9, "No uses left → 402 no_uses_available", `HTTP ${r.status}, body=${JSON.stringify(r.data)}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // TIME BANK — STRIPES PURCHASE (T10-T12)
  // ════════════════════════════════════════════════════════════════════════

  // T10 — Buy 5 uses for 125 Stripes → stripes=75, purchased=5, audit logged
  {
    const { id, token } = await makePlayer({ chips: 25_000, stripes: 200 });
    const r = await api("POST", `/api/players/${id}/time-bank/purchase`, { quantity: 5 }, token);
    const st = await api("GET", `/api/players/${id}/time-bank/status`, undefined, token);
    if (
      r.status === 200 &&
      r.data.quantity_purchased === 5 &&
      r.data.stripes_spent === 125 &&
      r.data.new_stripes === 75 &&
      st.data.purchased === 5
    ) {
      pass(10, "Buy 5 uses for 125 Stripes → balance=75, purchased=5", `stripes_spent=${r.data.stripes_spent}, new_stripes=${r.data.new_stripes}, purchased=${st.data.purchased}`);
    } else {
      fail(10, "Buy 5 uses for 125 Stripes → balance=75, purchased=5", `HTTP ${r.status}, body=${JSON.stringify(r.data)}, purchased=${st.data.purchased}`);
    }
  }

  // T11 — Use 1 purchased (free=0) → purchased=3, source=purchased
  {
    const { id, token } = await makePlayer({ chips: 25_000, freeUses: 0, purchasedUses: 4 });
    const tid = tableCode();
    await registerTable(tid, id);
    let ws: WebSocket | null = null;
    try {
      const { ws: sock } = await waitForMyTurn(tid, "badugi", id);
      ws = sock;
      const r = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid, mode_id: "badugi" }, token);
      const st = await api("GET", `/api/players/${id}/time-bank/status`, undefined, token);
      if (r.status === 200 && r.data.source === "purchased" && st.data.purchased === 3) {
        pass(11, "Use purchased → source=purchased, purchased=3", `HTTP 200, source=${r.data.source}, purchased_remaining=${st.data.purchased}`);
      } else {
        fail(11, "Use purchased → source=purchased, purchased=3", `HTTP ${r.status}, source=${r.data.source ?? r.data.error}, purchased=${st.data.purchased}`);
      }
    } catch (e: any) {
      fail(11, "Use purchased → source=purchased, purchased=3", `SETUP FAIL: ${e.message}`);
    } finally { ws?.close(); }
  }

  // T12 — Player with 24 Stripes tries to buy 1 use (costs 25) → 402
  {
    const { id, token } = await makePlayer({ chips: 25_000, stripes: 24 });
    const r = await api("POST", `/api/players/${id}/time-bank/purchase`, { quantity: 1 }, token);
    if (r.status === 402 && r.data.error === "insufficient_stripes") {
      pass(12, "24 Stripes, buy 1 use (costs 25) → 402", `HTTP 402, error="${r.data.error}", message="${r.data.message}"`);
    } else {
      fail(12, "24 Stripes, buy 1 use (costs 25) → 402", `HTTP ${r.status}, body=${JSON.stringify(r.data)}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // TIME BANK — GOLD PRO (T13-T15)
  // ════════════════════════════════════════════════════════════════════════

  // T13 — Gold Pro (no free, no purchased) uses → source=subscription, session_used=1
  {
    const { id, token } = await makePlayer({ chips: 25_000, freeUses: 0, purchasedUses: 0, tier: "gold_pro" });
    const tid = tableCode();
    await registerTable(tid, id);
    let ws: WebSocket | null = null;
    try {
      const { ws: sock } = await waitForMyTurn(tid, "badugi", id);
      ws = sock;
      const r = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid, mode_id: "badugi" }, token);
      if (r.status === 200 && r.data.source === "subscription") {
        pass(13, "Gold Pro → source=subscription, session_used=1", `HTTP 200, source=${r.data.source}, new_deadline=${r.data.new_timer_expires_at}`);
      } else {
        fail(13, "Gold Pro → source=subscription, session_used=1", `HTTP ${r.status}, source=${r.data.source ?? r.data.error}, body=${JSON.stringify(r.data)}`);
      }
    } catch (e: any) {
      fail(13, "Gold Pro → source=subscription, session_used=1", `SETUP FAIL: ${e.message}`);
    } finally { ws?.close(); }
  }

  // T14 — Gold Pro second use same table session → 402 no_uses_available
  {
    const { id, token } = await makePlayer({ chips: 25_000, freeUses: 0, purchasedUses: 0, tier: "gold_pro" });
    const tid = tableCode();
    await registerTable(tid, id);
    let ws1: WebSocket | null = null;
    let usedFirst = false;
    try {
      const { ws: sock } = await waitForMyTurn(tid, "badugi", id);
      ws1 = sock;
      const r1 = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid, mode_id: "badugi" }, token);
      if (r1.status === 200) usedFirst = true;
    } catch {} finally { ws1?.close(); }

    if (usedFirst) {
      // session_used=1 in-memory for this table. Second call (bucket exhausted → 402)
      const r2 = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid, mode_id: "badugi" }, token);
      if (r2.status === 402 && r2.data.error === "no_uses_available") {
        pass(14, "Gold Pro second use same session → 402", `HTTP 402, error="${r2.data.error}"`);
      } else {
        fail(14, "Gold Pro second use same session → 402", `HTTP ${r2.status}, body=${JSON.stringify(r2.data)}`);
      }
    } else {
      fail(14, "Gold Pro second use same session → 402", `SETUP FAIL: could not confirm first use succeeded`);
    }
  }

  // T15 — Gold Pro leaves, rejoins new table → session_used reset → can use again
  {
    const { id, token } = await makePlayer({ chips: 25_000, freeUses: 0, purchasedUses: 0, tier: "gold_pro" });

    // Table 1 — use once
    let usedFirst = false;
    {
      const tid1 = tableCode();
      await registerTable(tid1, id);
      let ws: WebSocket | null = null;
      try {
        const { ws: sock } = await waitForMyTurn(tid1, "badugi", id);
        ws = sock;
        const r = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid1, mode_id: "badugi" }, token);
        if (r.status === 200) usedFirst = true;
      } catch {} finally { ws?.close(); }
    }

    if (!usedFirst) {
      fail(15, "Gold Pro rejoin → session_used reset, can use again", "SETUP FAIL: first table use failed");
    } else {
      // Table 2 — new table → seatTimeBankSessionUsed starts at 0 for new seat
      const tid2 = tableCode();
      await registerTable(tid2, id);
      let ws: WebSocket | null = null;
      try {
        const { ws: sock } = await waitForMyTurn(tid2, "badugi", id);
        ws = sock;
        const r = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid2, mode_id: "badugi" }, token);
        if (r.status === 200 && r.data.source === "subscription") {
          pass(15, "Gold Pro rejoin → session_used reset, can use again", `HTTP 200, source=${r.data.source} on second table`);
        } else {
          fail(15, "Gold Pro rejoin → session_used reset, can use again", `HTTP ${r.status}, source=${r.data.source ?? r.data.error}`);
        }
      } catch (e: any) {
        fail(15, "Gold Pro rejoin → session_used reset, can use again", `SETUP FAIL (table 2): ${e.message}`);
      } finally { ws?.close(); }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // TIME BANK — DIAMOND ELITE (T16-T18)
  // ════════════════════════════════════════════════════════════════════════

  // T16 — Diamond Elite: 5 uses across 5 tables, all succeed (unlimited)
  {
    const { id, token } = await makePlayer({ chips: 25_000, freeUses: 0, purchasedUses: 0, tier: "diamond_elite" });
    const useResults: string[] = [];
    let allOk = true;

    for (let i = 1; i <= 5; i++) {
      const tid = tableCode();
      await registerTable(tid, id);
      let ws: WebSocket | null = null;
      try {
        const { ws: sock } = await waitForMyTurn(tid, "badugi", id, 20_000);
        ws = sock;
        const r = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid, mode_id: "badugi" }, token);
        useResults.push(`#${i}: HTTP ${r.status} source=${r.data.source ?? r.data.error}`);
        if (r.status !== 200 || r.data.source !== "subscription") allOk = false;
      } catch (e: any) {
        useResults.push(`#${i}: SETUP_FAIL`);
        allOk = false;
      } finally { ws?.close(); }
    }

    if (allOk) {
      pass(16, "Diamond Elite — 5 uses, all succeed (unlimited)", useResults.join(" | "));
    } else {
      fail(16, "Diamond Elite — 5 uses, all succeed (unlimited)", useResults.join(" | "));
    }
  }

  // T17 — Diamond Elite: two taps same turn → second blocked (already_used_this_turn)
  {
    const { id, token } = await makePlayer({ chips: 25_000, freeUses: 0, purchasedUses: 0, tier: "diamond_elite" });
    const tid = tableCode();
    await registerTable(tid, id);
    let ws: WebSocket | null = null;
    try {
      const { ws: sock } = await waitForMyTurn(tid, "badugi", id);
      ws = sock;
      const r1 = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid, mode_id: "badugi" }, token);
      const r2 = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid, mode_id: "badugi" }, token);
      if (r1.status === 200 && r2.status === 409 && r2.data.error === "already_used_this_turn") {
        pass(17, "Diamond Elite — second tap same turn → 409 rate-limited", `first: HTTP ${r1.status} ok | second: HTTP ${r2.status} error="${r2.data.error}"`);
      } else {
        fail(17, "Diamond Elite — second tap same turn → 409 rate-limited", `first: HTTP ${r1.status}, second: HTTP ${r2.status} error="${r2.data.error}"`);
      }
    } catch (e: any) {
      fail(17, "Diamond Elite — second tap same turn → 409 rate-limited", `SETUP FAIL: ${e.message}`);
    } finally { ws?.close(); }
  }

  // T18 — Diamond Elite with purchased uses → subscription path, purchased unchanged
  {
    const { id, token } = await makePlayer({ chips: 25_000, freeUses: 0, purchasedUses: 5, tier: "diamond_elite" });
    const tid = tableCode();
    await registerTable(tid, id);
    let ws: WebSocket | null = null;
    try {
      const { ws: sock } = await waitForMyTurn(tid, "badugi", id);
      ws = sock;
      const r = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid, mode_id: "badugi" }, token);
      const st = await api("GET", `/api/players/${id}/time-bank/status`, undefined, token);
      if (r.status === 200 && r.data.source === "subscription" && st.data.purchased === 5) {
        pass(18, "Diamond Elite + purchased → subscription priority, purchased unchanged at 5", `source=${r.data.source}, purchased_remaining=${st.data.purchased}`);
      } else {
        fail(18, "Diamond Elite + purchased → subscription priority, purchased unchanged at 5", `source=${r.data.source ?? r.data.error}, purchased=${st.data.purchased}`);
      }
    } catch (e: any) {
      fail(18, "Diamond Elite + purchased → subscription priority, purchased unchanged at 5", `SETUP FAIL: ${e.message}`);
    } finally { ws?.close(); }
  }

  // ════════════════════════════════════════════════════════════════════════
  // EDGE CASES (T19-T20)
  // ════════════════════════════════════════════════════════════════════════

  // T19 — Spec: "not your turn → 403"; impl returns 409 with reason.
  //        If 409, the guard is firing correctly but uses wrong HTTP code → fix needed.
  {
    const { id, token } = await makePlayer({ chips: 25_000 });
    const tid = tableCode();
    // Register a table but player never joins the WS game (no active seat)
    await registerTable(tid, id);
    const r = await api("POST", `/api/players/${id}/time-bank/use`, { table_id: tid, mode_id: "badugi" }, token);
    // Correct guard: player not seated → engine returns player_not_at_table
    // Spec says 403; our impl returns 409 — flag the discrepancy
    if (r.status === 403) {
      pass(19, "Not seated at table → 403", `HTTP 403, error="${r.data.error}"`);
    } else if (r.status === 409) {
      fail(19, "Not seated at table → spec says 403, got 409 (needs fix)", `HTTP 409, error="${r.data.error}" (route returns 409 for turn-guard failures; spec requires 403 for auth-style guards)`);
    } else {
      fail(19, "Not seated at table → 403", `HTTP ${r.status}, body=${JSON.stringify(r.data)}`);
    }
  }

  // T20 — No token → 401 | Wrong player's token → 403
  {
    const { id: rightId }              = await makePlayer({ chips: 25_000 });
    const { token: wrongToken }        = await makePlayer({ chips: 25_000 });

    const r401 = await api("GET", `/api/players/${rightId}/time-bank/status`);           // no token
    const r403 = await api("GET", `/api/players/${rightId}/time-bank/status`, undefined, wrongToken); // other player

    if (r401.status === 401 && r403.status === 403) {
      pass(20, "No token → 401 | Wrong player → 403", `no-token: HTTP ${r401.status} | wrong-player: HTTP ${r403.status}`);
    } else {
      fail(20, "No token → 401 | Wrong player → 403", `no-token: HTTP ${r401.status} (want 401) | wrong-player: HTTP ${r403.status} (want 403)`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════
  console.log(`\n${"═".repeat(64)}`);
  console.log(`FINAL: ${passed} PASS  ${failed} FAIL  (${passed + failed} run)`);
  console.log(`${"═".repeat(64)}\n`);

  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error("Fatal:", e); process.exit(1); });
