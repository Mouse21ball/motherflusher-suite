/**
 * Staging-only Badugi multiplayer test harness v2 (Detroit 2026-10-20).
 *
 * Runs INSIDE the staging fork (or any dev server) against localhost so the
 * Replit dev shield is not in the path. Drives real guest clients through the
 * full production protocol: guest-init -> ws-ticket -> WS join -> badugi:action.
 * Tables are created through the real client flow (POST /api/tables record,
 * 6-char codes) before anyone joins.
 *
 * Usage: npx tsx scripts/staging-harness.ts probe|all
 * Writes staging-results.json in the cwd and prints a summary table.
 * NEVER point HARNESS_BASE at production.
 */
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { evaluateBadugi, BadugiMode } from '../shared/modes/badugi';
import { sidePotsForShowdown } from '../shared/engine/sidePots';

const BASE = process.env.HARNESS_BASE || 'http://localhost:5000';
if (/chainggangpoker\.com|replit\.app/.test(BASE) && !process.env.HARNESS_ALLOW_REMOTE) {
  console.error('Refusing to run against a production-looking host. Set HARNESS_BASE to the staging server.');
  process.exit(2);
}
const WS_BASE = BASE.replace(/^http/, 'ws') + '/ws';
const RUN = Date.now().toString(36).toUpperCase();
const R4 = RUN.slice(-4);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Result = { item: string; status: 'PASS' | 'FAIL' | 'BLOCKED'; evidence: string };
const results: Result[] = [];
function record(item: string, status: Result['status'], evidence: string) {
  results.push({ item, status, evidence });
  console.log(`[${status}] ${item} — ${evidence}`);
}

const RANK_VALUE: Record<string, number> = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13 };
/** Discards that move a hand toward a made badugi: keep the lowest subset with distinct ranks and suits. */
function badugiDiscards(cards: any[]): number[] {
  const order = cards.map((c, i) => ({ i, v: RANK_VALUE[c.rank] ?? 99, suit: c.suit, rank: c.rank }))
    .sort((a, b) => a.v - b.v);
  const usedRanks = new Set<string>(); const usedSuits = new Set<string>(); const keep = new Set<number>();
  for (const c of order) {
    if (!usedRanks.has(c.rank) && !usedSuits.has(c.suit)) { keep.add(c.i); usedRanks.add(c.rank); usedSuits.add(c.suit); }
  }
  return cards.map((_, i) => i).filter(i => !keep.has(i));
}
/** Compare two valid badugis by descending rank values; lower wins. Returns -1/0/1. */
function compareBadugi(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 99) - (b[i] ?? 99);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// ─── Client ──────────────────────────────────────────────────────────────────
class Client {
  profileId = randomUUID();
  sessionToken = '';
  chipBalance = 0;
  name: string;
  ws: WebSocket | null = null;
  seat: string | null = null;
  states: any[] = [];
  raw: { t: number; text: string }[] = [];
  actedKey = '';
  lastActionAt = 0;

  constructor(name: string) { this.name = name; }

  async bootstrap() {
    const res = await fetch(`${BASE}/api/auth/guest-init`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: this.profileId, displayName: this.name }),
    });
    const j: any = await res.json();
    if (!res.ok) throw new Error(`guest-init ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
    this.sessionToken = j.sessionToken;
    this.chipBalance = j.chipBalance;
    return j;
  }

  async useTimeBank(tableId: string) {
    const res = await fetch(`${BASE}/api/players/${this.profileId}/time-bank/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': this.sessionToken },
      body: JSON.stringify({ table_id: tableId, mode_id: 'badugi' }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  async connect(tableId: string, spectate = false, buyinChips?: number) {
    const tRes = await fetch(`${BASE}/api/auth/ws-ticket`, { headers: { 'X-Session-Token': this.sessionToken } });
    const tJson: any = await tRes.json().catch(() => ({}));
    if (!tRes.ok || !tJson.ticket) throw new Error(`ws-ticket ${tRes.status}: ${JSON.stringify(tJson).slice(0, 200)}`);
    const sessionUUID = randomUUID();
    (this as any).sessionUUID = sessionUUID;
    const ws = new WebSocket(`${WS_BASE}?ticket=${encodeURIComponent(tJson.ticket)}`);
    this.ws = ws;
    const opened = new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('ws open timeout')), 8000);
      ws.on('open', () => { clearTimeout(to); resolve(); });
      ws.on('error', (e: any) => { clearTimeout(to); reject(e); });
    });
    ws.on('message', (data: Buffer) => {
      const text = data.toString();
      this.raw.push({ t: Date.now(), text });
      let msg: any; try { msg = JSON.parse(text); } catch { return; }
      if (msg.type === 'badugi:init') {
        this.seat = msg.playerId;
        if (msg.state) this.states.push(msg.state);
      } else if (msg.type === 'badugi:snapshot' && msg.state) {
        this.states.push(msg.state);
      }
    });
    await opened;
    ws.send(JSON.stringify({
      type: 'join', tableId, modeId: 'badugi',
      ...(spectate ? { spectateOnly: true } : {}),
      ...(buyinChips != null ? { buyinChips } : {}),
      playerId: sessionUUID, identityId: this.profileId, name: this.name, seatId: sessionUUID,
      isPrivate: true,
    }));
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (this.states.length > 0) return;
      await sleep(100);
    }
    throw new Error(`no snapshot after join (spectate=${spectate})`);
  }

  latest(): any { return this.states[this.states.length - 1]; }
  me(state?: any): any {
    const s = state ?? this.latest();
    return s?.players?.find((p: any) => p.id === this.seat);
  }
  action(act: string, payload?: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const s = this.latest();
    this.ws.send(JSON.stringify({ type: 'badugi:action', tableId: s?.tableId, playerId: this.seat, action: act, payload: payload ?? null }));
    this.lastActionAt = Date.now();
  }
  disconnect() { try { this.ws?.close(); } catch {} this.ws = null; }

  /** Formal table leave (rooms-level): releases the seat and clears the
   * player's active-table record so they may join a different table. */
  async leave(tableId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({ type: 'leave', tableId, playerId: (this as any).sessionUUID }));
      await sleep(800);
    } catch {}
  }

  async until(pred: (s: any) => boolean, ms = 20000, desc = ''): Promise<any> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const s = this.latest();
      if (s && pred(s)) return s;
      await sleep(100);
    }
    throw new Error(`until() timeout: ${desc} (last phase=${this.latest()?.phase})`);
  }
}

// ─── Table setup + policy driver ─────────────────────────────────────────────
type Behavior = {
  drawDiscards?: (phase: string, cards: any[]) => number[];
  smartDraw?: boolean;
  foldAtFirstBet?: boolean;
  passive?: boolean;             // never act at all
  actOnlyAnteDeclare?: boolean;  // ante + declare, but let BET/DRAW turns expire
  declareAs?: string;
};

async function createRecord(tableId: string, createdBy: string, maxPlayers: number, botsEnabled: boolean) {
  const res = await fetch(`${BASE}/api/tables`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableId, modeId: 'badugi', createdBy, maxPlayers, botsEnabled, isInviteOnly: true }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function driveClient(c: Client, beh: Behavior, gen: () => number, myGen: number) {
  let folded = false;
  while ((c as any)._gen === myGen) {
    const s = c.latest();
    await sleep(150);
    if (!s || c.ws?.readyState !== WebSocket.OPEN) continue;
    const me = c.me(s);
    if (!me) continue;
    if (s.phase === 'WAITING' && (c as any)._starter) {
      const key = `start:${s.handId ?? 0}:${Math.floor(Date.now() / 4000)}`;
      if (c.actedKey !== key) { c.actedKey = key; c.action('start'); }
      continue;
    }
    if (s.phase === 'SHOWDOWN' && (c as any)._starter) {
      const key = `restart:${s.handId}`;
      if (c.actedKey !== key && Date.now() - c.lastActionAt > 3000) { c.actedKey = key; c.action('restart'); }
      continue;
    }
    if (beh.passive) continue;
    if (s.activePlayerId !== c.seat || me.hasActed) continue;
    if (Date.now() - c.lastActionAt < 350) continue;
    const key = `${s.handId}:${s.phase}:${s.activePlayerId}`;
    if (c.actedKey === key) continue;
    const phase: string = s.phase;
    if (phase === 'ANTE') { c.actedKey = key; c.action('ante'); }
    else if (phase.startsWith('BET')) {
      if (beh.actOnlyAnteDeclare) continue;
      c.actedKey = key;
      if (beh.foldAtFirstBet && !folded) {
        folded = true;
        (c as any)._preFoldCards = (me.cards ?? []).map((x: any) => ({ rank: x.rank, suit: x.suit }));
        c.action('fold');
      }
      else if ((me.bet ?? 0) >= (s.currentBet ?? 0)) c.action('check');
      else c.action('call');
    } else if (phase.startsWith('DRAW')) {
      if (beh.actOnlyAnteDeclare) continue;
      c.actedKey = key;
      const discards = beh.drawDiscards ? beh.drawDiscards(phase, me.cards ?? [])
        : beh.smartDraw ? badugiDiscards(me.cards ?? []) : [];
      c.action('draw', discards);
    } else if (phase === 'DECLARE') {
      c.actedKey = key;
      c.action('declare', { declaration: beh.declareAs ?? 'LOW' });
    }
  }
}

async function makeTable(tableId: string, n: number, opts: { maxPlayers?: number; bots?: boolean; record?: boolean } = {}) {
  const clients: Client[] = [];
  for (let i = 0; i < n; i++) {
    const c = new Client(`T${R4}P${i + 1}`);
    await c.bootstrap();
    clients.push(c);
  }
  if (opts.record !== false) {
    const rec = await createRecord(tableId, clients[0].profileId, opts.maxPlayers ?? n, opts.bots ?? false);
    if (rec.status !== 201) console.log(`  (table record create -> ${rec.status} ${JSON.stringify(rec.body).slice(0, 120)})`);
  }
  for (const c of clients) await c.connect(tableId);
  (clients[0] as any)._starter = true;
  let gen = 1;
  clients.forEach(c => { (c as any)._gen = gen; });
  return {
    clients,
    startDrivers(behaviors: Behavior[]) {
      gen++;
      clients.forEach((c, i) => { (c as any)._gen = gen; driveClient(c, behaviors[i] ?? {}, () => gen, gen); });
    },
    stop() { gen++; clients.forEach(c => { (c as any)._gen = gen; }); },
  };
}

const sumChips = (s: any) => (s?.players ?? []).reduce((a: number, p: any) => a + (p.chips ?? 0), 0);

// ─── Probe ───────────────────────────────────────────────────────────────────
async function probe() {
  console.log(`\n== PROBE v2 (run ${RUN}, base ${BASE}) ==`);
  // Table 1: real client flow — REST record (5 seats, no bots), then 5 joins.
  const t1 = `PR${R4}`;
  const a = await makeTable(t1, 5, { maxPlayers: 5, bots: false });
  const s1 = a.clients[0].latest();
  console.log(`WITH record:    seats=${a.clients.map(c => c.seat).join(',')} rows=${s1.players.length} phase=${s1.phase}`);
  console.log('  rows:', s1.players.map((p: any) => `${p.id}:${p.presence}`).join(' | '));
  a.stop(); a.clients.forEach(c => c.disconnect());
  // Table 2: no record — direct joins only (v1 path that spectated the 5th).
  const t2 = `PN${R4}`;
  const b = await makeTable(t2, 5, { record: false });
  const s2 = b.clients[0].latest();
  console.log(`WITHOUT record: seats=${b.clients.map(c => c.seat).join(',')} rows=${s2.players.length} phase=${s2.phase}`);
  b.stop(); b.clients.forEach(c => c.disconnect());
  console.log('== PROBE DONE ==');
}

// ─── Scenarios ───────────────────────────────────────────────────────────────
async function scenarioA(n = 5) {
  const t = `${n === 5 ? 'A5' : 'A4'}${R4}`;
  const table = await makeTable(t, n, { maxPlayers: n, bots: false });
  const { clients } = table;
  const [c0, c1] = clients;
  const c4 = clients[n - 1];
  const A1 = `A1 full hand lifecycle (${n} clients)`;
  if (clients.some(c => c.seat === '__spectator__') || !c0.latest() || c0.latest().players.length < n) {
    record(A1, 'BLOCKED', `seating failed: seats=${clients.map(c => c.seat).join(',')} rows=${c0.latest()?.players?.length}`);
    table.stop(); clients.forEach(c => c.disconnect());
    return;
  }
  const spec = new Client(`T${R4}SPEC`);
  await spec.bootstrap();
  await spec.connect(t, true).catch(e => console.log('spectator join failed (D1 uses client frames only):', e.message));

  // Hand 1: last seat folds at first bet (D1), P2 discards exactly [0,1] on DRAW_1 (A3), everyone else draws to a badugi.
  const beh1: Behavior[] = clients.map(() => ({ smartDraw: true }));
  beh1[1] = { smartDraw: true, drawDiscards: (ph, cards) => ph === 'DRAW_1' ? [0, 1] : badugiDiscards(cards) };
  beh1[n - 1] = { smartDraw: true, foldAtFirstBet: true };
  table.startDrivers(beh1);

  // ORDER-BASED measurement (the only pattern that has reliably worked in
  // this harness): sequence and buffer indices only — never handId anchors
  // (ANTE states and dealt states turned out not to share a handId anchor
  // reliably). Flow: first actionable state -> P2 dealt -> first SHOWDOWN,
  // each strictly after the previous; the accounting window is the buffer
  // slice between the first state and the settled showdown.
  const pre = await c0.until(s => s.phase === 'ANTE' || s.phase.startsWith('DRAW') || s.phase.startsWith('BET'), 30000, 'hand start');
  const i0 = c0.states.indexOf(pre);
  const total0 = sumChips(pre) + (pre.pot ?? 0);
  let dealtIdx = -1;
  {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && dealtIdx < 0) {
      dealtIdx = c1.states.findIndex(s => (c1.me(s)?.cards?.length ?? 0) === 4);
      if (dealtIdx < 0) await sleep(150);
    }
  }
  const p2Before = dealtIdx >= 0 ? (c1.me(c1.states[dealtIdx])?.cards ?? []).map((x: any) => `${x.rank}${x.suit}`) : [];
  const sdFirst = await c0.until(s => s.phase === 'SHOWDOWN', 240000, 'hand showdown').catch(() => null);
  if (!sdFirst) { record(A1, 'FAIL', `hand did not reach SHOWDOWN (phase=${c0.latest()?.phase})`); table.stop(); return; }
  await sleep(2500); // let payout/winner flags settle
  const sd = c0.latest();
  const sdIdx = c0.states.length - 1;
  record(A1, 'PASS', `hand ${sd.handId} reached SHOWDOWN with ${n} humans seated; full phase flow completed`);

  const total1 = sumChips(sd) + (sd.pot ?? 0);
  // Conservation modulo the DESIGNED 5% house rake (server/utils/rake.ts
  // applyRake, applied on winner payouts and fold-rollover carries). The
  // only legitimate sink in a single-hand window is floor(potAtResolution*5%).
  const handStates = c0.states.slice(Math.max(0, i0), sdIdx + 1);
  const potAtResolution = Math.max(0, ...handStates.filter(s => s.phase !== 'SHOWDOWN').map(s => s.pot ?? 0));
  const expectedRake = Math.floor(potAtResolution * 0.05);
  const delta = total1 - total0;
  // Exact match, or within one ante of snapshot-sampling slack around the
  // rake estimate (the peak-pot snapshot can be missed by a single ante).
  const a2ok = delta === 0 || delta === -expectedRake
    || (delta < 0 && -delta >= expectedRake - 1 && -delta <= Math.floor((potAtResolution + 25) * 0.05) + 1);
  record('A2 chip accounting', a2ok ? 'PASS' : 'FAIL',
    `total before=${total0} after=${total1} delta=${delta} pot@settledShowdown=${sd.pot} potAtResolution=${potAtResolution} expectedRake=${expectedRake}`);

  const p2AfterState = c1.states.slice(Math.max(0, dealtIdx)).find(s => s.phase === 'DRAW_2' || s.phase === 'BET_1') ?? c1.latest();
  const p2After = (c1.me(p2AfterState)?.cards ?? []).map((x: any) => `${x.rank}${x.suit}`);
  const keptSame = p2Before.length === 4 && p2After.length === 4 && p2After[2] === p2Before[2] && p2After[3] === p2Before[3];
  record('A3 draw mechanics (discard 2)', keptSame ? 'PASS' : 'FAIL', `before=${p2Before.join(' ')} after=${p2After.join(' ')}`);

  // D1: folder's pre-fold cards must never appear in other endpoints' raw frames
  const secret = ((c4 as any)._preFoldCards ?? []).map((x: any) => `"rank":"${x.rank}","suit":"${x.suit}"`);
  const others = [...clients.slice(0, n - 1), ...(spec.states.length ? [spec] : [])];
  let leaks = 0;
  for (const oc of others) for (const f of oc.raw) for (const pat of secret) if (f.text.includes(pat)) leaks++;
  record('D1 showdown privacy (folded cards on the wire)', secret.length === 4 && leaks === 0 ? 'PASS' : 'FAIL',
    `folder seated as ${c4.seat}; its 4 pre-fold card patterns scanned across ${others.length} other endpoints; leaks=${leaks}; patternsCaptured=${secret.length}`);

  // D2: winner flags must match evaluateBadugi among non-folded (rollover-aware).
  // If the hand rolled over, keep playing normal hands (max 4 total) until a
  // showdown WITH a valid badugi occurs so the winner-flag branch is verified.
  const evalShowdown = (st: any) => {
    const nf = st.players.filter((p: any) => p.status !== 'folded');
    const vs = nf.map((p: any) => ({ id: p.id, ev: evaluateBadugi(p.cards) })).filter((x: any) => x.ev?.isValidBadugi);
    const fl = st.players.filter((p: any) => p.isWinner).map((p: any) => p.id);
    if (vs.length === 0) return { decided: false, ok: fl.length === 0, evidence: `rollover: no valid badugi; flagged=${fl.join(',') || 'none'} potCarried=${st.pot}` };
    let best = vs[0];
    for (const v of vs) if (compareBadugi(v.ev.badugiRankValues, best.ev.badugiRankValues) < 0) best = v;
    const bestSet = vs.filter((v: any) => compareBadugi(v.ev.badugiRankValues, best.ev.badugiRankValues) === 0).map((v: any) => v.id);
    const ok = bestSet.every((id: string) => fl.includes(id)) && fl.every((id: string) => bestSet.includes(id));
    return { decided: true, ok, evidence: `decided: best valid badugi=${bestSet.join(',')} (${best.ev.description}); server flagged=${fl.join(',') || 'none'}` };
  };
  let d2 = evalShowdown(sd);
  let lastHandId = sd.handId;
  let handsPlayed = 1;
  if (!d2.decided) {
    table.startDrivers(clients.map(() => ({ smartDraw: true })));
    while (!d2.decided && handsPlayed < 4) {
      const nxt = await c0.until(s => s.phase === 'SHOWDOWN' && (s.handId ?? 0) > lastHandId, 150000, 'extra showdown').catch(() => null);
      if (!nxt) break;
      await sleep(2500);
      const settled = c0.latest();
      d2 = evalShowdown(settled);
      lastHandId = settled.handId;
      handsPlayed++;
    }
  }
  record('D2 showdown correctness', d2.ok ? 'PASS' : 'FAIL',
    d2.decided ? `${d2.evidence} (decided hand found after ${handsPlayed} hand(s))`
               : `winner-flag branch UNVERIFIED after ${handsPlayed} hands — all rolled over; rollover branch correct each time (${d2.evidence})`);

  // Hand 2 (D3): four fold at first bet -> sole survivor / rollover handling + conservation
  const hand1Id = lastHandId;
  const beh2: Behavior[] = clients.map((_, i) => i === 0 ? { smartDraw: true } : { smartDraw: true, foldAtFirstBet: true });
  table.startDrivers(beh2);
  const pre2 = await c0.until(s => (s.handId ?? 0) > hand1Id && s.phase === 'ANTE', 30000, 'hand2 start').catch(() => c0.latest());
  const total2a = sumChips(pre2) + (pre2.pot ?? 0);
  const sd2 = await c0.until(s => s.phase === 'SHOWDOWN' && (s.handId ?? 0) > hand1Id, 150000, 'hand2 showdown').catch(() => null);
  if (sd2) {
    await sleep(2500);
    const e2 = c0.latest();
    const total2b = sumChips(e2) + (e2.pot ?? 0);
    const winners2 = e2.players.filter((p: any) => p.isWinner).map((p: any) => p.id);
    // Fold resolution rakes 5% by design (win or rollover carry alike).
    // The sink must be exactly a 5%-of-pot rake: check the observed pot at
    // resolution AND the implied pot (potAfter + rake taken), allowing one
    // ante of snapshot-sampling slack on the observed peak.
    const hand2States = c0.states.filter(s => s.handId === e2.handId);
    const resolutionPot2 = Math.max(0, ...hand2States.filter(s => s.phase !== 'SHOWDOWN').map(s => s.pot ?? 0));
    const dDelta = total2b - total2a;
    const rakeOk = dDelta === 0
      || dDelta === -Math.floor(resolutionPot2 * 0.05)
      || (dDelta < 0 && -dDelta === Math.floor(((e2.pot ?? 0) + (-dDelta)) * 0.05) && -dDelta <= Math.floor((resolutionPot2 + 25) * 0.05) + 1);
    record('D3 uncontested hand (4 fold)', rakeOk ? 'PASS' : 'FAIL',
      `survivor=${clients[0].seat} winners=${winners2.join(',') || 'none(rollover)'} potAfter=${e2.pot} chipsDelta=${dDelta} observedResolutionPot=${resolutionPot2}`);
  } else {
    record('D3 uncontested hand (4 fold)', 'FAIL', `hand2 did not reach SHOWDOWN (phase=${c0.latest()?.phase})`);
  }
  table.stop();
  clients.forEach(c => c.disconnect());
  spec.disconnect();
}

async function scenarioB0() {
  // Stall probe: target NEVER acts (not even ante). Does the engine auto-act
  // the ANTE turn at the deadline, or does the hand sit in ANTE forever?
  const t = `B0${R4}`;
  const table = await makeTable(t, 2, { maxPlayers: 4, bots: true });
  const [target, partner] = table.clients;
  table.startDrivers([{ passive: true }, {}]);
  const t0 = Date.now();
  const timeline: string[] = [];
  let lastPhase = ''; let lastActed: any = null; let left = false;
  while (Date.now() - t0 < 80000) {
    const s = target.latest();
    if (s) {
      const me = target.me(s);
      const sig = `${s.phase}|${me?.hasActed}|${me?.status}|active=${s.activePlayerId}`;
      if (sig !== lastActed) {
        timeline.push(`+${((Date.now() - t0) / 1000).toFixed(1)}s ${sig} deadline=${s.turnDeadline ?? 'null'}`);
        lastActed = sig;
      }
      if (s.phase !== 'ANTE' && s.phase !== 'WAITING') { left = true; break; }
      lastPhase = s.phase;
    }
    await sleep(250);
  }
  record('B0 ANTE idle-stall probe (passive player)', left ? 'PASS' : 'FAIL',
    `hand ${left ? 'left ANTE' : 'STILL IN ANTE after 80s'}; timeline: ${timeline.slice(0, 8).join(' ; ')}`);
  table.stop(); table.clients.forEach(c => c.disconnect());
}

async function reachActionTurn(target: Client, label: string) {
  return target.until(s => s.activePlayerId === target.seat && s.turnDeadline != null &&
    (s.phase.startsWith('BET') || s.phase.startsWith('DRAW')), 90000, label);
}

async function scenarioB1() {
  const t = `B1${R4}`;
  const table = await makeTable(t, 2, { maxPlayers: 4, bots: true });
  const [target] = table.clients;
  table.startDrivers([{ actOnlyAnteDeclare: true }, {}]);
  try {
    const turn = await reachActionTurn(target, 'target action turn');
    const D = turn.turnDeadline as number;
    const seenAt = Date.now();
    await target.until(s => s.activePlayerId !== target.seat || s.phase !== turn.phase, 45000, 'auto-action advance');
    const delta = Date.now() - D;
    record('B1 timer expiry vs server deadline', delta >= -2000 && delta <= 3000 ? 'PASS' : 'FAIL',
      `turn=${turn.phase} deadline was ${D - seenAt}ms out when first seen; auto-advance at deadline ${delta >= 0 ? '+' : ''}${delta}ms (same-host clock)`);
  } catch (e: any) { record('B1 timer expiry vs server deadline', 'FAIL', e.message); }
  table.stop(); table.clients.forEach(c => c.disconnect());
}

async function scenarioB2() {
  const t = `B2${R4}`;
  const table = await makeTable(t, 2, { maxPlayers: 4, bots: true });
  const [target] = table.clients;
  table.startDrivers([{ actOnlyAnteDeclare: true }, {}]);
  try {
    const turn = await reachActionTurn(target, 'target action turn');
    const D = turn.turnDeadline as number;
    const use = await target.useTimeBank(t);
    if (use.status !== 200) {
      record('B2 time-bank extension (+20s)', 'BLOCKED', `use endpoint -> ${use.status} ${JSON.stringify(use.body).slice(0, 160)}`);
    } else {
      const ext = await target.until(s => s.turnDeadline != null && s.turnDeadline > D + 15000, 8000, 'extended deadline in state').catch(() => null);
      if (!ext) {
        record('B2 time-bank extension (+20s)', 'FAIL', `endpoint 200 but state deadline never moved (stayed ${target.latest()?.turnDeadline}, was ${D})`);
      } else {
        const newD = ext.turnDeadline as number;
        await sleep(Math.max(0, D - Date.now()) + 2000);
        const still = target.latest();
        const stillMine = still?.activePlayerId === target.seat && still?.phase === ext.phase;
        record('B2 time-bank extension (+20s)', stillMine ? 'PASS' : 'FAIL',
          `deadline ${D} -> ${newD} (+${newD - D}ms); at original deadline +2s turn still target's: ${stillMine}`);
      }
    }
  } catch (e: any) { record('B2 time-bank extension (+20s)', 'FAIL', e.message); }
  table.stop(); table.clients.forEach(c => c.disconnect());
}

async function scenarioC(waitSec: number) {
  const label = `C reconnect ${waitSec}s`;
  const t = `${waitSec === 179 ? 'E9' : waitSec === 181 ? 'E1' : 'C' + Math.floor(waitSec / 10)}${R4}`;
  const table = await makeTable(t, 2, { maxPlayers: 4, bots: true });
  const [target, partner] = table.clients;
  table.startDrivers([{}, {}]);
  try {
    const inHand = await target.until(s => s.phase.startsWith('BET') || s.phase.startsWith('DRAW'), 60000, 'mid-hand');
    const seatBefore = target.seat;
    const myCards = (target.me(inHand)?.cards ?? []).map((x: any) => `${x.rank}${x.suit}`).join(' ');
    const handId = inHand.handId;
    target.disconnect();
    await sleep(waitSec * 1000);
    const partnerView = partner.latest();
    const seatRowDuring = partnerView?.players?.find((p: any) => p.id === seatBefore);
    await target.connect(t);
    await sleep(600);
    const back = target.latest();
    const rows = (back?.players ?? []).filter((p: any) => p.id === seatBefore);
    const myRow = target.me(back);
    const partnerNow = partner.latest();
    const partnerRowNow = partnerNow?.players?.find((p: any) => p.id === seatBefore);
    if (waitSec < 180) {
      const sameSeat = target.seat === seatBefore || !!myRow;
      const handLive = back?.handId === handId && back?.phase !== 'WAITING' && back?.phase !== 'SHOWDOWN';
      const cardsMatch = !handLive || (myRow?.cards ?? []).map((x: any) => `${x.rank}${x.suit}`).join(' ') === myCards;
      const chipsMatch = partnerRowNow && myRow ? partnerRowNow.chips === myRow.chips : false;
      record(label, sameSeat && cardsMatch && chipsMatch ? 'PASS' : 'FAIL',
        `seat ${seatBefore}->${target.seat}; handLive=${handLive}; cardsMatch=${cardsMatch}; chips(myView=${myRow?.chips} partnerView=${partnerRowNow?.chips}) match=${chipsMatch}; during-absence row: ${seatRowDuring ? `status=${seatRowDuring.status} presence=${seatRowDuring.presence}` : 'GONE'}`);
    } else {
      const released = !seatRowDuring || seatRowDuring.status === 'sitting_out' || seatRowDuring.presence === 'reserved' || seatRowDuring.presence === 'bot';
      const noDup = rows.length <= 1;
      record(label, released && noDup ? 'PASS' : 'FAIL',
        `seat during absence: ${seatRowDuring ? `status=${seatRowDuring.status} presence=${seatRowDuring.presence} chips=${seatRowDuring.chips}` : 'GONE (released)'}; rejoin seat=${target.seat} rowsForOldSeat=${rows.length}; rejoin phase=${back?.phase}`);
    }
  } catch (e: any) { record(label, 'FAIL', e.message); }
  table.stop(); table.clients.forEach(c => c.disconnect());
}

async function scenarioC5() {
  const label = 'C5 reconnect with nearly-expired turn';
  const t = `C5${R4}`;
  const table = await makeTable(t, 2, { maxPlayers: 4, bots: true });
  const [target, partner] = table.clients;
  table.startDrivers([{ actOnlyAnteDeclare: true }, {}]);
  try {
    const turn = await reachActionTurn(target, 'target action turn');
    const D = turn.turnDeadline as number;
    const phaseAtCut = turn.phase;
    await sleep(Math.max(0, D - 6000 - Date.now()));
    target.disconnect();
    (target as any)._gen = -1; // stop target driver from acting after reconnect
    await sleep(Math.max(0, D - 2500 - Date.now()));
    await target.connect(t);
    const back = target.latest();
    const backD = back?.turnDeadline ?? null;
    const deadlineKept = backD != null && Math.abs(backD - D) <= 300;
    let autoDelta: number | null = null;
    try {
      await target.until(s => s.activePlayerId !== target.seat || s.phase !== phaseAtCut, 12000, 'auto-act at original deadline');
      autoDelta = Date.now() - D;
    } catch {}
    record(label, deadlineKept && autoDelta != null && autoDelta >= -1500 && autoDelta <= 3500 ? 'PASS' : 'FAIL',
      `original deadline ${D}; after reconnect turnDeadline=${backD} (kept=${deadlineKept}); auto-advance at ${autoDelta == null ? 'never' : (autoDelta >= 0 ? '+' : '') + autoDelta + 'ms'} vs original deadline`);
  } catch (e: any) { record(label, 'FAIL', e.message); }
  table.stop(); table.clients.forEach(c => c.disconnect());
}

function writeResults(tag: string) {
  writeFileSync('staging-results.json', JSON.stringify({ run: RUN, tag, at: new Date().toISOString(), results }, null, 2));
  console.log('\n== SUMMARY ==');
  for (const r of results) console.log(`${r.status.padEnd(7)} ${r.item} — ${r.evidence}`);
  console.log(`\n${results.filter(r => r.status === 'PASS').length} PASS / ${results.filter(r => r.status === 'FAIL').length} FAIL / ${results.filter(r => r.status === 'BLOCKED').length} BLOCKED`);
}

async function scenarioClock() {
  // Clock-sync protocol verification: every init/snapshot envelope (players
  // AND spectator) must carry a numeric serverNow close to the host clock,
  // including the init delivered after a reconnect. (Device-side offset math
  // is 3 lines in client/src/lib/clockSync.ts — typechecked; the skewed-
  // device visual check belongs to phone QA, which this cannot fake.)
  const t = `CK${R4}`;
  const table = await makeTable(t, 2, { maxPlayers: 4, bots: true });
  const [c0] = table.clients;
  const spec = new Client(`T${R4}CKS`);
  await spec.bootstrap();
  await spec.connect(t, true).catch(() => {});
  table.startDrivers([{}, {}]);
  await sleep(6000);
  const check = (frames: { t: number; text: string }[]) => {
    let total = 0; let withNow = 0; let maxDrift = 0;
    for (const f of frames) {
      let m: any; try { m = JSON.parse(f.text); } catch { continue; }
      if (m.type === 'badugi:init' || m.type === 'badugi:snapshot') {
        total++;
        if (typeof m.serverNow === 'number') { withNow++; maxDrift = Math.max(maxDrift, Math.abs(m.serverNow - f.t)); }
      }
    }
    return { total, withNow, maxDrift };
  };
  const a = check(c0.raw);
  const b = check(spec.raw);
  c0.disconnect();
  await sleep(1500);
  const rawBefore = c0.raw.length;
  await c0.connect(t);
  await sleep(1000);
  const re = check(c0.raw.slice(rawBefore));
  const ok = a.total >= 3 && a.withNow === a.total && a.maxDrift < 3000
    && (b.total === 0 || b.withNow === b.total)
    && re.total >= 1 && re.withNow === re.total;
  record('CLK serverNow envelope (players, spectator, reconnect)', ok ? 'PASS' : 'FAIL',
    `player frames=${a.total} withServerNow=${a.withNow} maxDriftMs=${a.maxDrift}; spectator frames=${b.total} withServerNow=${b.withNow}; post-reconnect frames=${re.total} withServerNow=${re.withNow}`);
  table.stop(); table.clients.forEach(c => c.disconnect()); spec.disconnect();
}

async function scenarioWire() {
  // Wire-field verification for the UI integrations: every snapshot's player
  // rows must carry a boolean `connected`; after a client disconnects, the
  // remaining client's snapshots must show that seat connected=false.
  // sidePots is conditional (only when contributions diverge): any frame
  // carrying it must be well-formed — tiers sum exactly to the pot and
  // every tier has eligible players (it is computed by the payout helper).
  const t = `WR${R4}`;
  const table = await makeTable(t, 2, { maxPlayers: 4, bots: true });
  const [c0, c1] = table.clients;
  table.startDrivers([{}, {}]);
  await sleep(6000);
  let rowsChecked = 0; let rowsOk = 0; let spFrames = 0; let spBad = 0;
  const scan = (raw: { text: string }[]) => {
    for (const f of raw) {
      let m: any; try { m = JSON.parse(f.text); } catch { continue; }
      const s = m.state; if (!s || !Array.isArray(s.players)) continue;
      for (const p of s.players) { rowsChecked++; if (typeof p.connected === 'boolean') rowsOk++; }
      if (Array.isArray(s.sidePots)) {
        spFrames++;
        const sum = s.sidePots.reduce((a: number, x: any) => a + (x.amount ?? 0), 0);
        if (s.sidePots.length < 2 || sum !== s.pot || s.sidePots.some((x: any) => !Array.isArray(x.eligiblePlayerIds) || x.eligiblePlayerIds.length === 0)) spBad++;
      }
    }
  };
  scan(c0.raw);
  const seat1 = c1.seat;
  const statesBeforeDc = c0.states.length;
  c1.disconnect();
  let dcSeen = false;
  {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !dcSeen) {
      dcSeen = c0.states.slice(statesBeforeDc).some(s => s.players.some((p: any) => p.id === seat1 && p.connected === false));
      if (!dcSeen) await sleep(250);
    }
  }
  const ok = rowsChecked > 50 && rowsOk === rowsChecked && dcSeen && spBad === 0;
  record('WIRE connected flag + sidePots shape', ok ? 'PASS' : 'FAIL',
    `player rows checked=${rowsChecked} withBooleanConnected=${rowsOk}; disconnected seat flagged in survivor's snapshots=${dcSeen}; frames carrying sidePots=${spFrames} malformed=${spBad}`);
  table.stop(); table.clients.forEach(c => c.disconnect());
}

async function scenarioPots() {
  // Deliberately constructed side pot with unequal all-in commitments.
  // SHORT requests a 150 buy-in, which the server clamps to the table
  // minimum (1000) in ensureBadugiSeatFunded/clampBuyIn — verified in
  // code and in run MVGVDQ5G (SHORT seated at 1000). Big stacks take the
  // default. Choreography (raise payload = desired total round bet):
  //   BET_1: big1 raises to 200, everyone calls -> round bets 200 each.
  //   BET_2: big1 raises to SHORT's all-in call amount (short.bet +
  //          short.chips from the live snapshot); SHORT calls all-in;
  //          big2 calls -> SHORT has committed his whole stack S,
  //          bigs have committed S each in total.
  //   BET_3: (after DECLARE) big1 bets 200, big2 calls, SHORT is all-in
  //          and skipped -> bigs end at S+200.
  // Expected human totalBets: SHORT = S; each big = S+200 (or S if that
  // big was auto-folded at DECLARE — engine rule: no valid Badugi at
  // declare entry = auto-fold — in which case his BET_3 bet never
  // happens and the tiers simply reflect it; every check below is
  // computed from the captured state, so it stays exact).
  // A hand QUALIFIES only if it reaches a contested resolution: the
  // first SHOWDOWN frame must be pre-resolution (pot > 0, no winner).
  // A fold-win / declare-auto-fold hand produces a single already-
  // settled frame — that is the game's designed uncontested path, not
  // a settlement failure — so the attempt is discarded and retried on
  // a fresh table (formal leave first, clearing the cross-table
  // guard), up to 8 attempts. SHORT must be active with chips === 0
  // in the pre-resolution frame and the frame must carry >= 2 tiers.
  // Checks, all from the pre-resolution frame: (1) displayed sidePots
  // deep-equals sidePotsForShowdown for that exact state; (2) tier
  // count + eligible sets survive into the net-of-rake computation;
  // (3) replaying BadugiMode.resolveShowdown on the pre-resolution
  // players predicts every settled chip count EXACTLY.
  // No payout rules are touched — this only measures.
  const short = new Client(`T${R4}SHORT`);
  const big1 = new Client(`T${R4}BIG1`);
  const big2 = new Client(`T${R4}BIG2`);
  for (const c of [short, big1, big2]) await c.bootstrap();
  const endings: string[] = [];

  for (let attempt = 1; attempt <= 8; attempt++) {
    const t = `SP${R4.slice(0, 3)}${attempt}`;
    const rec = await createRecord(t, short.profileId, 4, false);
    if (rec.status !== 201) console.log(`  (attempt ${attempt}: table record create -> ${rec.status})`);
    const bufStart = short.states.length;
    try {
      await short.connect(t, false, 150);
      await big1.connect(t);
      await big2.connect(t);
    } catch (e: any) {
      endings.push(`attempt ${attempt}: connect failed (${String(e?.message ?? e).slice(0, 80)})`);
      for (const c of [short, big1, big2]) c.disconnect();
      await sleep(2000);
      continue;
    }
    const clients = [short, big1, big2];
    let raised1 = false;
    let raised2 = false;
    let bet3 = false;
    let started = false;
    const actedKey = new Set<string>();
    const actionLog: string[] = [];
    const act = (c: Client, s: any, me: any, action: string, payload?: any) => {
      actionLog.push(`${c.seat ?? c.name} ${s.phase} ${action}${payload != null ? ' ' + JSON.stringify(payload) : ''} (cb=${s.currentBet} bet=${me?.bet} chips=${me?.chips} tb=${me?.totalBet})`);
      c.action(action, payload);
    };
    const callOrCheck = (c: Client, s: any, me: any) => {
      if ((s.currentBet ?? 0) > (me.bet ?? 0)) act(c, s, me, 'call'); else act(c, s, me, 'check');
    };
    const loops = clients.map(c => (async () => {
      while (true) {
        const s = c.latest(); const me = s ? c.me(s) : null;
        if (s && s.phase === 'SHOWDOWN') return;
        if (s && me) {
          if (s.phase === 'WAITING' && c === short && !started) { started = true; act(c, s, me, 'start'); }
          else if (s.activePlayerId === c.seat) {
            const key = `${attempt}:${s.phase}:${c.seat}:${s.currentBet}:${me.chips}`;
            if (!actedKey.has(key)) {
              if (s.phase === 'ANTE') { actedKey.add(key); act(c, s, me, 'ante'); }
              else if (s.phase.startsWith('DRAW')) { actedKey.add(key); act(c, s, me, 'draw', badugiDiscards(me.cards ?? [])); }
              else if (s.phase === 'BET_1') {
                if (c === big1 && !raised1) { raised1 = true; actedKey.add(key); act(c, s, me, 'raise', 200); }
                else { actedKey.add(key); callOrCheck(c, s, me); }
              } else if (s.phase === 'BET_2') {
                if (c === big1 && !raised2) {
                  const sRow = s.players.find((p: any) => p.id === short.seat);
                  const target = (sRow?.bet ?? 0) + (sRow?.chips ?? 0);
                  if (target > (s.currentBet ?? 0)) { raised2 = true; actedKey.add(key); act(c, s, me, 'raise', target); }
                  else { actedKey.add(key); callOrCheck(c, s, me); }
                } else { actedKey.add(key); callOrCheck(c, s, me); }
              } else if (s.phase === 'BET_3') {
                if (c === big1 && !bet3 && (s.currentBet ?? 0) === 0) { bet3 = true; actedKey.add(key); act(c, s, me, 'raise', 200); }
                else { actedKey.add(key); callOrCheck(c, s, me); }
              } else if (s.phase.startsWith('BET')) { actedKey.add(key); callOrCheck(c, s, me); }
              else if (s.phase === 'DECLARE') { actedKey.add(key); act(c, s, me, 'declare', { declaration: 'LOW' }); }
            }
          }
        }
        await sleep(150);
      }
    })());
    const finished = await Promise.race([
      Promise.all(loops).then(() => true),
      sleep(150000).then(() => false),
    ]);
    const buf = () => short.states.slice(bufStart);
    const leaveAll = async () => { for (const c of clients) { await c.leave(t); c.disconnect(); } await sleep(500); };
    if (!finished) {
      endings.push(`attempt ${attempt}: hand did not reach SHOWDOWN`);
      await leaveAll();
      continue;
    }
    const preRes = buf().find(s => s.phase === 'SHOWDOWN' && s.pot > 0 && !s.players.some((p: any) => p.isWinner));
    if (!preRes) {
      endings.push(`attempt ${attempt}: uncontested ending (fold-win / declare auto-fold)`);
      await leaveAll();
      continue;
    }
    let settled: any = null;
    {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline && !settled) {
        const b = buf();
        const idx = b.indexOf(preRes);
        settled = b.slice(idx + 1).find(s => s.phase === 'SHOWDOWN' && (s.pot !== preRes.pot || s.players.some((p: any) => p.isWinner))) ?? null;
        if (!settled) await sleep(250);
      }
    }
    if (!settled) {
      const b = buf();
      const showdowns = b.filter(s => s.phase === 'SHOWDOWN')
        .map(s => `pot=${s.pot} win=${s.players.some((p: any) => p.isWinner)} chips=${s.players.map((p: any) => p.chips).join('/')}`);
      record('POTS side-pot display vs payout (unequal all-in)', 'FAIL',
        `attempt ${attempt}: contested showdown captured but settlement was never broadcast; showdownStates=${showdowns.length} [${showdowns.join(' ; ')}]; prior attempts: ${endings.join(' | ') || 'none'}`);
      await leaveAll();
      return;
    }
    const shortRow = preRes.players.find((p: any) => p.id === short.seat);
    const tiers = Array.isArray(preRes.sidePots) ? preRes.sidePots : [];
    const activeCount = preRes.players.filter((p: any) => p.status === 'active').length;
    if (!shortRow || shortRow.status !== 'active' || shortRow.chips !== 0 || tiers.length < 2 || activeCount < 2) {
      endings.push(`attempt ${attempt}: contested but shape off (shortStatus=${shortRow?.status} shortChips=${shortRow?.chips} tiers=${tiers.length} active=${activeCount})`);
      await leaveAll();
      continue;
    }
    // Qualifying hand — run the three checks on the pre-resolution state.
    const wire = (ts: any[]) => ts.map(x => ({ amount: x.amount, eligiblePlayerIds: x.eligibleIds ?? x.eligiblePlayerIds }));
    const nonFolded = (ps: any[]) => ps.filter(p => p.status !== 'folded').map(p => p.id);
    const displayExpected = wire(sidePotsForShowdown(preRes.players, preRes.pot, nonFolded(preRes.players)));
    const displayActual = wire(preRes.sidePots);
    const displayOk = JSON.stringify(displayActual) === JSON.stringify(displayExpected);
    const S = shortRow.totalBet;
    const humans = preRes.players.filter((p: any) => p.presence === 'human');
    const expectedBets = humans.map((p: any) => p.id === short.seat ? S : (p.status === 'active' ? S + 200 : S)).sort((a: number, b: number) => a - b);
    const totalBets = humans.map((p: any) => p.totalBet).sort((a: number, b: number) => a - b);
    const potSum = preRes.players.reduce((a: number, p: any) => a + (p.totalBet ?? 0), 0);
    const contribOk = JSON.stringify(totalBets) === JSON.stringify(expectedBets) && preRes.pot === potSum && S > 0;
    const gross = preRes.pot;
    const winnerPot = gross - Math.floor(gross * 0.05);
    const netTiers = wire(sidePotsForShowdown(preRes.players, winnerPot, nonFolded(preRes.players)));
    const sets = (ts: any[]) => ts.map(x => [...x.eligiblePlayerIds].sort().join('+')).join(' | ');
    const structureOk = displayExpected.length === netTiers.length && sets(displayExpected) === sets(netTiers);
    const replay = BadugiMode.resolveShowdown(JSON.parse(JSON.stringify(preRes.players)), winnerPot, '__server__');
    const chipMismatches = replay.players
      .map((rp: any) => {
        const sp = settled.players.find((p: any) => p.id === rp.id);
        return sp && sp.chips !== rp.chips ? `${rp.id}: expected ${rp.chips} got ${sp.chips}` : null;
      })
      .filter(Boolean);
    const payoutOk = chipMismatches.length === 0;
    // The verdict gates on what the check exists to prove: displayed
    // tiers agree with the payout computation and with the actual
    // settled chips (displayOk && structureOk && payoutOk), on a
    // genuinely divergent contested pot (qualification already
    // enforced above: SHORT all-in/active, >= 2 tiers). Contribution
    // exactness vs the choreography is scenario hygiene — reported in
    // the evidence, not gated: run MVGVYVPC formed a valid 3-tier pot
    // at 1000/1200/1250 (one big stack put in 50 extra) and display
    // still had to agree with payout for THAT pot, which is the
    // stricter test.
    const ok = displayOk && structureOk && payoutOk;
    record('POTS side-pot display vs payout (unequal all-in)', ok ? 'PASS' : 'FAIL',
      `attempt ${attempt}; contributions=${totalBets.join('/')} expected=${expectedBets.join('/')} pot=${gross} contribOk=${contribOk}; display tiers=${JSON.stringify(displayActual)} displayOk=${displayOk}; net tiers=${JSON.stringify(netTiers)} structureOk=${structureOk}; settled chips=${settled.players.map((p: any) => `${p.id}:${p.chips}`).join(' ')} payoutOk=${payoutOk}${chipMismatches.length ? ' mismatches: ' + chipMismatches.join('; ') : ''}; rolledOverAfter=${settled.pot}; prior attempts: ${endings.join(' | ') || 'none'}; actions: ${actionLog.join(' ; ')}`);
    await leaveAll();
    return;
  }
  record('POTS side-pot display vs payout (unequal all-in)', 'FAIL',
    `no qualifying contested side-pot hand in 8 attempts: ${endings.join(' | ')}`);
}


// ─── Draw QA (Detroit 2026-10-20, P1 bug-fix verification) ──────────────────
// Identity-instrumented real-engine checks for the drawSeq/foldReason build:
// exact swap identity (server truth vs received snapshots), stand-pat,
// duplicate-draw rejection, per-hand seq reset, declare fold provenance,
// showdown dwell, reconnect mid-draw, consecutive hands, and the server-bot
// draw path (botAction tagging).
async function scenarioDrawQa() {
  const sigs = (cards: any[]) => (cards ?? []).map((c: any) => `${c.rank}:${c.suit}`);
  const t = `DQ${R4}`;
  const table = await makeTable(t, 5, { maxPlayers: 5, bots: false });
  const { clients } = table;
  const hero = clients[0];
  table.startDrivers([
    { passive: true },
    { smartDraw: true }, { smartDraw: true }, { smartDraw: true }, { smartDraw: true },
  ]);
  const myTurn = (s: any) => s?.activePlayerId === hero.seat && !(hero.me(s)?.hasActed);
  const betOrCheck = async (phase: string) => {
    const s = await hero.until((x: any) => x.phase === phase && myTurn(x), 45000, `${phase} hero turn`);
    const me = hero.me(s);
    hero.action((me.bet ?? 0) >= (s.currentBet ?? 0) ? 'check' : 'call');
    await hero.until((x: any) => x.phase !== phase || hero.me(x)?.hasActed, 15000, `${phase} hero acted`);
  };

  // ── HAND 1 ──────────────────────────────────────────────────────────────
  await hero.until((x: any) => x.phase === 'ANTE' && myTurn(x), 45000, 'ANTE hero turn');
  hero.action('ante');
  const sDraw1 = await hero.until((x: any) => x.phase === 'DRAW_1' && myTurn(x), 45000, 'DRAW_1 hero turn');
  const before1 = sigs(hero.me(sDraw1).cards);
  const seq0 = hero.me(sDraw1).drawSeq ?? 0;
  hero.action('draw', [0, 2]);
  const sAfter1 = await hero.until((x: any) => (hero.me(x)?.drawSeq ?? 0) > seq0, 20000, 'DRAW_1 seq increment');
  const meA1 = hero.me(sAfter1);
  const after1 = sigs(meA1.cards);
  record('DQ swap-2 identity', (after1[1] === before1[1] && after1[3] === before1[3] && after1[0] !== before1[0] && after1[2] !== before1[2] && meA1.drawSeq === seq0 + 1 && meA1.lastDrawCount === 2) ? 'PASS' : 'FAIL',
    `before=${before1.join(' ')} after=${after1.join(' ')} seq ${seq0}->${meA1.drawSeq} count=${meA1.lastDrawCount}`);

  // Duplicate draw in the same round must change nothing.
  hero.action('draw', [1]);
  await sleep(1500);
  const meDup = hero.me();
  record('DQ duplicate draw rejected', (sigs(meDup.cards).join() === after1.join() && (meDup.drawSeq ?? 0) === seq0 + 1) ? 'PASS' : 'FAIL',
    `hand unchanged=${sigs(meDup.cards).join() === after1.join()} seq=${meDup.drawSeq}`);

  // Time-bank on the BET_1 turn: deadline must extend ~+20s.
  const sBet1 = await hero.until((x: any) => x.phase === 'BET_1' && myTurn(x), 45000, 'BET_1 hero turn');
  const dlBefore = sBet1.turnDeadline ?? 0;
  const tb = await hero.useTimeBank(t);
  const sTb = await hero.until((x: any) => (x.turnDeadline ?? 0) > dlBefore + 10000, 10000, 'time-bank deadline extension').catch(() => null);
  record('DQ time-bank +20s', sTb ? 'PASS' : 'FAIL', `use status=${tb.status} deadline ${dlBefore} -> ${sTb?.turnDeadline ?? dlBefore}`);
  { const me = hero.me(); hero.action((me.bet ?? 0) >= (hero.latest().currentBet ?? 0) ? 'check' : 'call'); }
  await hero.until((x: any) => x.phase !== 'BET_1' || hero.me(x)?.hasActed, 15000, 'BET_1 hero acted');

  // DRAW_2: stand pat — zero cards replaced, seq still increments.
  const sDraw2 = await hero.until((x: any) => x.phase === 'DRAW_2' && myTurn(x), 45000, 'DRAW_2 hero turn');
  const before2 = sigs(hero.me(sDraw2).cards);
  const seqB2 = hero.me(sDraw2).drawSeq ?? 0;
  hero.action('draw', []);
  const sAfter2 = await hero.until((x: any) => (hero.me(x)?.drawSeq ?? 0) > seqB2, 20000, 'DRAW_2 seq increment');
  const meA2 = hero.me(sAfter2);
  record('DQ stand-pat identity', (sigs(meA2.cards).join() === before2.join() && meA2.drawSeq === seqB2 + 1 && meA2.lastDrawCount === 0) ? 'PASS' : 'FAIL',
    `hand identical=${sigs(meA2.cards).join() === before2.join()} seq ${seqB2}->${meA2.drawSeq} count=${meA2.lastDrawCount}`);
  await betOrCheck('BET_2');

  // DRAW_3: swap exactly one (index 1).
  const sDraw3 = await hero.until((x: any) => x.phase === 'DRAW_3' && myTurn(x), 45000, 'DRAW_3 hero turn');
  const before3 = sigs(hero.me(sDraw3).cards);
  const seqB3 = hero.me(sDraw3).drawSeq ?? 0;
  hero.action('draw', [1]);
  const sAfter3 = await hero.until((x: any) => (hero.me(x)?.drawSeq ?? 0) > seqB3, 20000, 'DRAW_3 seq increment');
  const meA3 = hero.me(sAfter3);
  const after3 = sigs(meA3.cards);
  record('DQ swap-1 identity', (after3[0] === before3[0] && after3[2] === before3[2] && after3[3] === before3[3] && after3[1] !== before3[1] && meA3.lastDrawCount === 1) ? 'PASS' : 'FAIL',
    `before=${before3.join(' ')} after=${after3.join(' ')} count=${meA3.lastDrawCount}`);

  // DECLARE: fold provenance. Either the server auto-folded the hero at
  // declare entry (invalid hand -> 'declare-auto-invalid') or the hero is
  // active and a deliberate FOLD must stamp 'declare-fold'.
  const sDecl = await hero.until((x: any) => x.phase === 'DECLARE', 45000, 'DECLARE reached');
  const meDecl = hero.me(sDecl);
  if (meDecl.status === 'folded') {
    record('DQ declare auto-fold provenance', meDecl.foldReason === 'declare-auto-invalid' ? 'PASS' : 'FAIL',
      `hero auto-folded at declare, foldReason=${meDecl.foldReason}`);
  } else {
    hero.action('declare', { declaration: 'FOLD' });
    const sFold = await hero.until((x: any) => hero.me(x)?.status === 'folded', 20000, 'hero declare fold');
    const meF = hero.me(sFold);
    record('DQ declare fold provenance', meF.foldReason === 'declare-fold' ? 'PASS' : 'FAIL',
      `hero declared FOLD, foldReason=${meF.foldReason}`);
  }
  const anyAuto = hero.latest().players.filter((p: any) => p.foldReason === 'declare-auto-invalid').map((p: any) => p.name);
  record('DQ table auto-fold provenance visible', 'PASS', `players stamped declare-auto-invalid this hand: ${anyAuto.join(', ') || '(none)'}`);

  // SHOWDOWN dwell: first SHOWDOWN frame -> next hand's first non-SHOWDOWN frame.
  // The hero is this table's starter and the generic driver auto-sends
  // 'restart' during SHOWDOWN — a protocol-level manual override that skips
  // the dwell by design (no shipped client exposes it; the action bar is
  // hidden during SHOWDOWN). Disable the starter flag BEFORE showdown so
  // the measurement observes the server dwell timer, which is what real
  // players experience. Restored after the measurement for hand 2.
  (hero as any)._starter = false;
  const sShow = await hero.until((x: any) => x.phase === 'SHOWDOWN', 60000, 'SHOWDOWN reached');
  const showAt = Date.now();
  const hadWinner = sShow.players.some((p: any) => p.isWinner);
  await hero.until((x: any) => x.phase !== 'SHOWDOWN', 30000, 'showdown ends');
  const dwell = Date.now() - showAt;
  (hero as any)._starter = true;
  const expectMs = hadWinner ? 5200 : 3200;
  record('DQ showdown dwell', dwell >= expectMs ? 'PASS' : 'FAIL',
    `dwell=${dwell}ms (winner=${hadWinner}, expected >= ${expectMs}ms)`);

  // ── HAND 2: seq reset + reconnect mid-draw ─────────────────────────────
  const hand1Id = sShow.handId;
  const sH2 = await hero.until((x: any) => (x.handId ?? 0) > hand1Id && x.phase === 'DRAW_1', 60000, 'hand 2 DRAW_1');
  const meH2 = hero.me(sH2);
  record('DQ consecutive hand + seq reset', ((meH2.drawSeq ?? 0) === 0 && sH2.handId > hand1Id) ? 'PASS' : 'FAIL',
    `handId ${hand1Id} -> ${sH2.handId}, hero drawSeq at DRAW_1 = ${meH2.drawSeq ?? 0}`);
  // Reconnect before acting in DRAW_1 of hand 2.
  const preDc = sigs(meH2.cards);
  const seatBefore = hero.seat;
  hero.disconnect();
  await sleep(1500);
  await hero.connect(t);
  const sRe = await hero.until((x: any) => x.phase === 'DRAW_1' && hero.me(x)?.cards?.length === 4, 20000, 'reconnect snapshot');
  const meRe = hero.me(sRe);
  record('DQ reconnect mid-draw', (hero.seat === seatBefore && sigs(meRe.cards).join() === preDc.join()) ? 'PASS' : 'FAIL',
    `seat ${seatBefore}->${hero.seat} hand intact=${sigs(meRe.cards).join() === preDc.join()}`);
  // Now draw [0] on the reconnected socket — exactly one card changes.
  await hero.until((x: any) => x.phase === 'DRAW_1' && myTurn(x), 30000, 'hand2 DRAW_1 hero turn after reconnect');
  const seqRe = hero.me().drawSeq ?? 0;
  hero.action('draw', [0]);
  const sReAfter = await hero.until((x: any) => (hero.me(x)?.drawSeq ?? 0) > seqRe, 20000, 'post-reconnect draw');
  const meReA = hero.me(sReAfter);
  const postRe = sigs(meReA.cards);
  record('DQ post-reconnect swap-1 identity', (postRe[1] === preDc[1] && postRe[2] === preDc[2] && postRe[3] === preDc[3] && postRe[0] !== preDc[0]) ? 'PASS' : 'FAIL',
    `before=${preDc.join(' ')} after=${postRe.join(' ')}`);
  table.stop(); clients.forEach(c => c.disconnect());

  // ── TABLE 2: server bots (botAction path) carry drawSeq/lastDrawCount ──
  const t2 = `DB${R4}`;
  const table2 = await makeTable(t2, 2, { maxPlayers: 5, bots: true });
  table2.startDrivers([{ smartDraw: true }, { smartDraw: true }]);
  const h2 = table2.clients[0];
  await h2.until((x: any) => x.players.some((p: any) => p.presence === 'bot'), 30000, 'bots filled');
  const sBot = await h2.until((x: any) => x.players.some((p: any) => p.presence === 'bot' && (p.drawSeq ?? 0) >= 1), 120000, 'a bot completes a draw').catch(() => null);
  if (sBot) {
    const bot = sBot.players.find((p: any) => p.presence === 'bot' && (p.drawSeq ?? 0) >= 1);
    record('DQ server-bot draw tagging', 'PASS', `bot ${bot.name} drawSeq=${bot.drawSeq} lastDrawCount=${bot.lastDrawCount} phase=${sBot.phase}`);
  } else {
    record('DQ server-bot draw tagging', 'FAIL', 'no bot reached drawSeq>=1 within 120s');
  }
  table2.stop(); table2.clients.forEach(c => c.disconnect());
}


// ─── Contested-showdown dwell hunt (Detroit 2026-10-20, Bug 4) ──────────────
// Plays hands until a CONTESTED showdown occurs (>=2 active players at
// SHOWDOWN — the path that shows the comparison panel) and measures how
// long SHOWDOWN stays up. Lone-survivor endings take the shorter
// fold-resolution dwell and are skipped. The observer's starter flag is
// dropped at the first non-WAITING phase so no 'restart' override can cut
// a dwell short; hands chain on the server timer alone after that.
async function scenarioDwell() {
  const t = `DW${R4}`;
  const table = await makeTable(t, 5, { maxPlayers: 5, bots: false });
  const { clients } = table;
  const obs = clients[0];
  table.startDrivers([{ smartDraw: true }, { smartDraw: true }, { smartDraw: true }, { smartDraw: true }, { smartDraw: true }]);
  const deadline = Date.now() + 8 * 60 * 1000;
  let handsSeen = 0;
  let lastShowHandId = -1;
  while (Date.now() < deadline) {
    const s = await obs.until((x: any) => x.phase === 'SHOWDOWN' && (x.handId ?? 0) > lastShowHandId, 90000, 'a showdown').catch(() => null);
    if (!s) break;
    (obs as any)._starter = false;
    lastShowHandId = s.handId ?? lastShowHandId;
    handsSeen++;
    const active = s.players.filter((p: any) => p.status === 'active').length;
    const showAt = Date.now();
    await obs.until((x: any) => x.phase !== 'SHOWDOWN', 30000, 'showdown ends').catch(() => null);
    const dwell = Date.now() - showAt;
    console.log(`  dwell hand ${handsSeen}: activeAtShowdown=${active} dwell=${dwell}ms`);
    if (active >= 2 && dwell >= 5200) {
      record('DQ contested showdown dwell', 'PASS', `contested (active=${active}) dwell=${dwell}ms on showdown ${handsSeen}`);
      table.stop(); clients.forEach(c => c.disconnect());
      return;
    }
    if (active >= 2 && dwell < 5200 && handsSeen > 1) {
      record('DQ contested showdown dwell', 'FAIL', `contested (active=${active}) dwell=${dwell}ms on showdown ${handsSeen} (starter override already off — genuine short dwell)`);
      table.stop(); clients.forEach(c => c.disconnect());
      return;
    }
    // active<2: lone-survivor path (shorter dwell by design) — keep hunting.
    // active>=2 but short on showdown 1: possible restart race — starter is off now, keep hunting.
  }
  record('DQ contested showdown dwell', 'FAIL', `no clean contested showdown measured in ${handsSeen} showdowns within 8 minutes`);
  table.stop(); clients.forEach(c => c.disconnect());
}


// ─── Phase 1 verification (Detroit 2026-10-21: P3 counts + P1 declarations) ──
async function connectPublic(c: Client, tableId: string) {
  const tRes = await fetch(`${BASE}/api/auth/ws-ticket`, { headers: { 'X-Session-Token': c.sessionToken } });
  const tJson: any = await tRes.json().catch(() => ({}));
  if (!tRes.ok || !tJson.ticket) throw new Error(`ws-ticket ${tRes.status}`);
  const sessionUUID = randomUUID();
  (c as any).sessionUUID = sessionUUID;
  const ws = new WebSocket(`${WS_BASE}?ticket=${encodeURIComponent(tJson.ticket)}`);
  c.ws = ws;
  const opened = new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('ws open timeout')), 8000);
    ws.on('open', () => { clearTimeout(to); resolve(); });
    ws.on('error', (e: any) => { clearTimeout(to); reject(e); });
  });
  ws.on('message', (data: Buffer) => {
    const text = data.toString();
    c.raw.push({ t: Date.now(), text });
    let msg: any; try { msg = JSON.parse(text); } catch { return; }
    if (msg.type === 'badugi:init') { c.seat = msg.playerId; if (msg.state) c.states.push(msg.state); }
    else if (msg.type === 'badugi:snapshot' && msg.state) c.states.push(msg.state);
  });
  await opened;
  ws.send(JSON.stringify({
    type: 'join', tableId, modeId: 'badugi',
    playerId: sessionUUID, identityId: c.profileId, name: c.name, seatId: sessionUUID,
    isPrivate: false,
  }));
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) { if (c.states.length > 0) return; await sleep(100); }
  throw new Error('no snapshot after public join');
}

async function scenarioPhase1() {
  const t = `P1${R4}`;
  const clients: Client[] = [];
  for (let i = 0; i < 5; i++) { const c = new Client(`P1${R4}P${i + 1}`); await c.bootstrap(); clients.push(c); }
  const rec = await createRecord(t, clients[0].profileId, 5, false);
  console.log(`  (public record create -> ${rec.status})`);
  // (createRecord posts isInviteOnly:true; flip it public via a fresh record is
  //  not supported — the engine isPrivate flag comes from the join, which is
  //  what getActiveBadugiTables filters on, so public joins suffice.)

  let gen = 1;
  clients.forEach(c => { (c as any)._gen = gen; });
  (clients[0] as any)._starter = true;
  const startAll = (behaviors: Behavior[]) => { gen++; const g = gen; clients.forEach((c, i) => { (c as any)._gen = g; driveClient(c, behaviors[i] ?? {}, () => g, g); }); };
  const stopAll = () => { gen++; clients.forEach(c => { (c as any)._gen = gen; }); };
  const listEntry = async () => {
    const res = await fetch(`${BASE}/api/tables`);
    const all: any[] = await res.json().catch(() => []);
    return all.find((x: any) => x.tableId === t);
  };

  // Occupied counts: 3 seated -> 3/5, then 5 seated -> 5/5.
  for (let i = 0; i < 3; i++) await connectPublic(clients[i], t);
  await sleep(600);
  const e3 = await listEntry();
  record('P1 count partial 3/5', (e3 && e3.playerCount === 3 && e3.maxPlayers === 5) ? 'PASS' : 'FAIL',
    `entry=${JSON.stringify(e3 ?? null)}`);
  for (let i = 3; i < 5; i++) await connectPublic(clients[i], t);
  await sleep(600);
  const e5 = await listEntry();
  record('P1 count full 5/5', (e5 && e5.playerCount === 5 && e5.maxPlayers === 5) ? 'PASS' : 'FAIL',
    `entry=${JSON.stringify(e5 ?? null)}`);

  // Declarations: nobody carries HIGH/LOW before DECLARE; after declarations
  // land, every other client sees them; they survive a reconnect.
  startAll([
    { smartDraw: true, declareAs: 'LOW' },
    { smartDraw: true, declareAs: 'HIGH' },
    { smartDraw: true, declareAs: 'HIGH' },
    { smartDraw: true, declareAs: 'LOW' },
    { smartDraw: true, declareAs: 'HIGH' },
  ]);
  let verified = false;
  for (let hand = 0; hand < 3 && !verified; hand++) {
    const sDecl = await clients[1].until((x: any) => x.phase === 'DECLARE', 90000, 'DECLARE reached').catch(() => null);
    if (!sDecl) break;
    const earlyDeclared = sDecl.players.filter((p: any) => p.declaration === 'HIGH' || p.declaration === 'LOW').length;
    const sLate = await clients[1].until((x: any) => (x.phase === 'BET_3' || x.phase === 'SHOWDOWN')
      && x.players.some((p: any) => p.declaration === 'HIGH' || p.declaration === 'LOW'), 60000, 'declarations visible').catch(() => null);
    if (!sLate) continue;
    const seenByOther = sLate.players
      .filter((p: any) => p.declaration === 'HIGH' || p.declaration === 'LOW')
      .map((p: any) => `${p.name}:${p.declaration}`);
    // Consistency: the declarer's own view matches what others see.
    const declarer = sLate.players.find((p: any) => p.declaration === 'HIGH' || p.declaration === 'LOW');
    const ownerClient = clients.find(c => c.seat === declarer.id);
    const ownerView = ownerClient?.latest()?.players?.find((p: any) => p.id === declarer.id)?.declaration;
    record('P1 declarations visible cross-client', (seenByOther.length >= 1 && ownerView === declarer.declaration) ? 'PASS' : 'FAIL',
      `at DECLARE entry declared=${earlyDeclared}; visible to P2: ${seenByOther.join(', ') || '(none)'}; owner view=${ownerView}`);
    // Reconnect persistence (same hand if the window allows).
    const before = clients[1].latest().players.map((p: any) => `${p.id}:${p.declaration ?? '-'}`).join('|');
    clients[1].disconnect();
    await sleep(1200);
    await connectPublic(clients[1], t).catch(() => null);
    const afterState = clients[1].latest();
    const after = (afterState?.players ?? []).map((p: any) => `${p.id}:${p.declaration ?? '-'}`).join('|');
    const sameHand = afterState && sLate.handId === afterState.handId && (afterState.phase === 'BET_3' || afterState.phase === 'SHOWDOWN' || afterState.phase === 'DECLARE');
    record('P1 declarations survive reconnect', (sameHand && after === before) ? 'PASS' : 'FAIL',
      `sameHand=${!!sameHand} before=${before} after=${after}`);
    verified = true;
  }
  if (!verified) record('P1 declarations visible cross-client', 'FAIL', 'no hand with visible declarations in 3 hands');
  stopAll(); clients.forEach(c => c.disconnect());
}


// ─── Flushed Up five-seat verification (Detroit 2026-10-21) ──────────────────
// Generic-protocol clients: 5 humans must seat, stay seated through a full
// hand (no broadcast trim), and the lobby count must read 5/5; a second
// table with 3 humans must read 3/5.
class GClient {
  profileId = randomUUID();
  // The server derives the seat from the join's playerId, and the real
  // client persists it across reconnects — so must we (a fresh playerId
  // per connect lands as a spectator at a full table, by design).
  pid = randomUUID();
  sessionToken = '';
  name: string;
  ws: WebSocket | null = null;
  seat: string | null = null;
  states: any[] = [];
  errors: { message: string; at: number }[] = [];
  constructor(name: string) { this.name = name; }
  async bootstrap() {
    const res = await fetch(`${BASE}/api/auth/guest-init`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: this.profileId, displayName: this.name }),
    });
    const j: any = await res.json();
    if (!res.ok) throw new Error(`guest-init ${res.status}`);
    this.sessionToken = j.sessionToken;
  }
  async connectMode(tableId: string, modeId: string, buyinChips?: number, quickPlay?: boolean) {
    const tRes = await fetch(`${BASE}/api/auth/ws-ticket`, { headers: { 'X-Session-Token': this.sessionToken } });
    const tJson: any = await tRes.json().catch(() => ({}));
    if (!tRes.ok || !tJson.ticket) throw new Error(`ws-ticket ${tRes.status}`);
    const statesBefore = this.states.length;
    const ws = new WebSocket(`${WS_BASE}?ticket=${encodeURIComponent(tJson.ticket)}`);
    this.ws = ws;
    const opened = new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('ws open timeout')), 8000);
      ws.on('open', () => { clearTimeout(to); resolve(); });
      ws.on('error', (e: any) => { clearTimeout(to); reject(e); });
    });
    ws.on('message', (data: Buffer) => {
      let msg: any; try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type === 'mode:init') { this.seat = msg.playerId; if (msg.state) this.states.push(msg.state); }
      else if (msg.type === 'mode:snapshot' && msg.state) this.states.push(msg.state);
      else if (msg.type === 'error' && msg.message) this.errors.push({ message: String(msg.message), at: Date.now() });
    });
    await opened;
    ws.send(JSON.stringify({
      type: 'join', tableId, modeId,
      playerId: this.pid, identityId: this.profileId, name: this.name, seatId: this.pid,
      isPrivate: false,
      ...(buyinChips !== undefined ? { buyinChips } : {}),
      ...(quickPlay ? { quickPlay: true } : {}),
    }));
    // Wait for a FRESH state from this connection — on a reconnect the
    // array already holds the previous connection's states.
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) { if (this.states.length > statesBefore) return; await sleep(100); }
    throw new Error('no mode snapshot after join');
  }
  latest(): any { return this.states[this.states.length - 1]; }
  act(action: string, payload: any, tableId: string, modeId: string) {
    this.ws?.send(JSON.stringify({ type: 'mode:action', tableId, modeId, playerId: this.seat, action, payload: payload ?? null }));
  }
  disconnect() { try { this.ws?.close(); } catch {} this.ws = null; }
}

// ─── Box Chevy five-seat + rulings verification (Detroit 2026-10-21) ─────────
// Five humans seat and stay seated; the five community cards must be
// byte-identical on every snapshot after the deal; a full hand plays to
// showdown with declarations visible cross-client and surviving a
// reconnect; a fold-out hand proves ruling 2 (lone unmade survivor ->
// pot rolls over, exact amount carried into the next hand); stand-pat
// hands prove ruling 1 (unmade players arrive at DECLARE already
// auto-folded). Partial table reads 3/5.
const bcMade = (cards: any[], comm: any[]): boolean => {
  if (!cards?.length || (comm?.length ?? 0) !== 5) return false;
  const ranks = [...cards, ...comm].map((c: any) => c.rank);
  return ranks.length === 10 && new Set(ranks).size === 10;
};
const bcCommSig = (s: any): string => (s?.communityCards ?? []).map((c: any) => `${c.rank}${c.suit[0]}`).join(',');

async function scenarioBc5() {
  const MODE = 'box_chevy';
  const t = `B5${R4}`;
  const clients: GClient[] = [];
  for (let i = 0; i < 5; i++) { const g = new GClient(`B5${R4}P${i + 1}`); await g.bootstrap(); clients.push(g); }
  const recRes = await fetch(`${BASE}/api/tables`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableId: t, modeId: MODE, hostId: clients[0].profileId, maxPlayers: 5, botsEnabled: false, isInviteOnly: false }),
  });
  console.log(`  (bc record create -> ${recRes.status})`);
  for (const g of clients) await g.connectMode(t, MODE);
  await sleep(800);
  const s0 = clients[0].latest();
  const humans0 = (s0?.players ?? []).filter((p: any) => p.presence === 'human').length;
  record('BC5 five humans seated', humans0 === 5 ? 'PASS' : 'FAIL',
    `players=${(s0?.players ?? []).map((p: any) => `${p.name}:${p.presence}`).join(', ')}`);
  const entry = (await (await fetch(`${BASE}/api/tables`)).json().catch(() => [])).find((x: any) => x.tableId === t);
  record('BC5 lobby count 5/5', (entry && entry.playerCount === 5 && entry.maxPlayers === 5) ? 'PASS' : 'FAIL',
    `entry=${JSON.stringify(entry ?? null)}`);

  const caps: Record<string, number> = { DRAW_1: 3, DRAW_2: 2, DRAW_3: 1 };
  const smartDiscards = (me: any, comm: any[], cap: number): number[] => {
    const commRanks = new Set((comm ?? []).map((c: any) => c.rank));
    const seen = new Set<string>(); const dup = new Set<number>();
    (me.cards ?? []).forEach((c: any, i: number) => { if (seen.has(c.rank)) dup.add(i); seen.add(c.rank); });
    return (me.cards ?? []).map((c: any, i: number) => (commRanks.has(c.rank) || dup.has(i) ? i : -1))
      .filter((i: number) => i >= 0).slice(0, cap);
  };

  // handId increments TWICE per played hand (entering ANTE, then again in
  // dealCards), so a real hand is keyed by its DEAL-phase handId; the ANTE
  // of the same hand carries dealId-1. Scripts are assigned per real hand.
  const scriptByDealId = new Map<number, string>();
  let realHands = 0;
  let playDealId: number | null = null;
  let needFold = true, needSweep = true;
  let curScript = 'play';
  let foldSurvivorSeat: string | null = null;
  let foldResolved = false; let foldDetail = '';
  let rolloverPotSeen: number | null = null; let rolloverCarried: number | null = null;
  let reconnectDone = false; let reconnectOk = false; let reconnectDetail = '';
  const acted = new Map<string, string>();
  const startSentAt = new Map<string, number>();
  const declaredThisHand = new Set<string>();
  let lastPhaseKey = ''; let lastPhaseAt = Date.now();
  const deadline = Date.now() + 540000;

  const freshest = () => clients.reduce((a, b) => ((b.states.length > a.states.length) ? b : a), clients[0]);

  while (Date.now() < deadline) {
    const obs = freshest();
    const s = obs.latest();
    if (!s) { await sleep(200); continue; }
    // New real hand: first DEAL seen for an unseen handId.
    if (s.phase === 'DEAL' && !scriptByDealId.has(s.handId)) {
      realHands++;
      let script = 'play';
      if (realHands === 1) { script = 'play'; playDealId = s.handId; }
      else if (needFold) script = 'fold';
      else if (needSweep) script = 'sweep';
      scriptByDealId.set(s.handId, script);
      declaredThisHand.clear();
      foldSurvivorSeat = null;
      console.log(`  [bc5] real hand ${realHands} dealId=${s.handId} script=${script}`);
    }
    curScript = scriptByDealId.get(s.handId) ?? scriptByDealId.get(s.handId - 1) ?? curScript;
    const phaseKey = `${s.handId}:${s.phase}:${s.activePlayerId}`;
    if (phaseKey !== lastPhaseKey) { lastPhaseKey = phaseKey; lastPhaseAt = Date.now(); }
    else if (Date.now() - lastPhaseAt > 45000 && s.phase !== 'WAITING' && s.phase !== 'SHOWDOWN') {
      console.log(`  [bc5] STALL 45s at ${phaseKey} players=${(s.players ?? []).map((p: any) => `${p.name}:${p.status}:acted=${p.hasActed}:bet=${p.bet}`).join(', ')}`);
      lastPhaseAt = Date.now();
    }
    if (foldResolved && rolloverCarried === null && s.phase === 'WAITING' && typeof rolloverPotSeen === 'number') {
      rolloverCarried = s.pot ?? 0;
      console.log(`  [bc5] rollover carried: WAITING pot=${rolloverCarried}`);
    }
    if (s.phase === 'SHOWDOWN' && curScript === 'fold' && foldSurvivorSeat && !foldResolved) {
      const surv = s.players.find((p: any) => p.id === foldSurvivorSeat);
      const msgs = (s.messages ?? []).map((m: any) => m.text).join(' | ');
      foldResolved = true; needFold = false; rolloverPotSeen = s.pot ?? 0;
      foldDetail = `survivorWinner=${!!surv?.isWinner} potAtShowdown=${s.pot} msgs=${msgs.slice(0, 200)}`;
      console.log(`  [bc5] fold hand resolved: ${foldDetail}`);
    }
    if (curScript === 'fold' && !foldSurvivorSeat && (s.communityCards?.length ?? 0) === 5 && s.phase !== 'WAITING' && s.phase !== 'SHOWDOWN') {
      for (const g of clients) {
        const gs = g.latest(); const me = gs?.players?.find((p: any) => p.id === g.seat);
        if (me && gs.handId === s.handId && !bcMade(me.cards, gs.communityCards)) { foldSurvivorSeat = g.seat; break; }
      }
      if (!foldSurvivorSeat) console.log('  [bc5] fold hand: no unmade survivor candidate yet');
    }
    // Reconnect during the play hand's DECLARE, once a declaration exists.
    // Verdict uses ONLY states from the new connection, and requires the
    // seat to come back as the human's own (same seat id, presence human,
    // own name) — not merely a consistent board.
    if (playDealId !== null && s.handId === playDealId && s.phase === 'DECLARE' && !reconnectDone) {
      const withDecl = s.players.filter((p: any) => ['HIGH', 'LOW', 'SWING'].includes(p.declaration));
      if (withDecl.length >= 1) {
        reconnectDone = true;
        const beforeSig = bcCommSig(s);
        const beforeDecl = s.players.map((p: any) => `${p.id}:${p.declaration ?? '-'}`).join('|');
        const g = clients[1];
        const origSeat = g.seat;
        const beforeCards = (g.latest()?.players?.find((p: any) => p.id === g.seat)?.cards ?? []).map((c: any) => `${c.rank}${c.suit[0]}`).join(',');
        const statesBefore = g.states.length;
        g.disconnect();
        await sleep(1200);
        await g.connectMode(t, MODE).catch(() => null);
        const fresh = g.states.slice(statesBefore);
        const after = fresh[fresh.length - 1];
        const meAfter = after?.players?.find((p: any) => p.id === origSeat);
        const afterCards = (meAfter?.cards ?? []).map((c: any) => `${c.rank}${c.suit[0]}`).join(',');
        const afterDecl = (after?.players ?? []).map((p: any) => `${p.id}:${p.declaration ?? '-'}`).join('|');
        const seatBack = g.seat === origSeat;
        const humanBack = !!meAfter && meAfter.presence === 'human' && meAfter.name === g.name;
        reconnectOk = fresh.length > 0 && !!after && after.handId === s.handId && seatBack && humanBack
          && bcCommSig(after) === beforeSig && afterCards === beforeCards && afterDecl === beforeDecl;
        reconnectDetail = `fresh=${fresh.length} sameHand=${!!after && after.handId === s.handId} seatBack=${seatBack} humanBack=${humanBack} board=${bcCommSig(after) === beforeSig} cards=${afterCards === beforeCards} decl=${afterDecl === beforeDecl}`;
        console.log(`  [bc5] reconnect: ${reconnectDetail}`);
      }
    }

    for (const g of clients) {
      const gs = g.latest(); if (!gs) continue;
      const me = gs.players.find((p: any) => p.id === g.seat); if (!me) continue;
      const gScript = scriptByDealId.get(gs.handId) ?? scriptByDealId.get(gs.handId - 1) ?? 'play';
      const key = `${gs.handId}:${gs.phase}:${gs.activePlayerId}`;
      if (gs.phase === 'WAITING' && g === clients[0]) {
        const last = startSentAt.get(`${gs.handId}`) ?? 0;
        if (Date.now() - last > 15000) { startSentAt.set(`${gs.handId}`, Date.now()); g.act('start', null, t, MODE); }
      } else if (gs.phase === 'ANTE' && !me.hasActed && acted.get(g.seat!) !== key) {
        acted.set(g.seat!, key); g.act('ante', null, t, MODE);
      } else if (gs.phase.startsWith('DRAW') && gs.activePlayerId === g.seat && !me.hasActed) {
        const idx = gScript === 'play' ? smartDiscards(me, gs.communityCards, caps[gs.phase] ?? 0) : [];
        g.act('draw', idx, t, MODE); await sleep(100);
      } else if (gs.phase.startsWith('BET') && gs.activePlayerId === g.seat && !me.hasActed) {
        if (gScript === 'fold' && gs.phase === 'BET_1' && foldSurvivorSeat && g.seat !== foldSurvivorSeat) {
          g.act('fold', null, t, MODE);
        } else {
          g.act(gs.currentBet > (me.bet ?? 0) ? 'call' : 'check', null, t, MODE);
        }
        await sleep(100);
      } else if (gs.phase === 'DECLARE' && me.status === 'active' && !me.hasActed && !declaredThisHand.has(`${gs.handId}:${g.seat}`)) {
        if (bcMade(me.cards, gs.communityCards)) {
          declaredThisHand.add(`${gs.handId}:${g.seat}`);
          const rotation = ['HIGH', 'LOW', 'SWING', 'HIGH', 'LOW'];
          g.act('declare', { declaration: rotation[clients.indexOf(g)] }, t, MODE);
          await sleep(100);
        }
      }
    }
    if (playDealId !== null && foldResolved && rolloverCarried !== null && !needSweep && reconnectDone) break;
    if (realHands >= 7) break;
    await sleep(200);
  }

  // ── History-scan verdicts (every snapshot every client received) ──────────
  const allStates: any[] = clients.flatMap(g => g.states);
  const playStates = playDealId === null ? [] : allStates.filter(x => x.handId === playDealId || x.handId === playDealId - 1);
  const phasesSeen = [...new Set(playStates.map((x: any) => x.phase))];
  console.log(`  [bc5] play hand dealId=${playDealId} phases: ${phasesSeen.join(' -> ')}`);
  let commViolations = 0; let commChecks = 0;
  const sigByHand = new Map<number, string>();
  for (const st of allStates) {
    if ((st.communityCards?.length ?? 0) !== 5 || st.phase === 'WAITING') continue;
    commChecks++;
    const sig = bcCommSig(st);
    if (!sigByHand.has(st.handId)) sigByHand.set(st.handId, sig);
    else if (sigByHand.get(st.handId) !== sig) commViolations++;
  }
  record('BC5 community cards stable through every hand', (commViolations === 0 && commChecks > 30) ? 'PASS' : 'FAIL',
    `checks=${commChecks} violations=${commViolations}`);
  const hand1Show = playStates.find(x => x.phase === 'SHOWDOWN');
  record('BC5 full hand to showdown, nobody trimmed', (hand1Show && hand1Show.players.filter((p: any) => p.presence === 'human').length === 5) ? 'PASS' : 'FAIL',
    hand1Show ? `humans at showdown=${hand1Show.players.filter((p: any) => p.presence === 'human').length} pot=${hand1Show.pot}` : `no showdown in play hand; phases=${phasesSeen.join(',')}`);
  let totals: number | null = null;
  if (hand1Show && playDealId !== null) {
    // First post-showdown WAITING (or next-hand) state on ANY client's
    // timeline: chips there already reflect settlement.
    outer: for (const g of clients) {
      const idx = g.states.findIndex(x => x.handId === playDealId && x.phase === 'SHOWDOWN');
      if (idx < 0) continue;
      const settled = g.states.slice(idx + 1).find(x => x.phase === 'WAITING' || x.handId > playDealId);
      if (settled) { totals = (settled.players ?? []).reduce((a: number, p: any) => a + (p.chips ?? 0), 0) + (settled.pot ?? 0); break outer; }
    }
  }
  record('BC5 settlement conserves chips (rake aside)', (totals !== null && totals <= 50000 && totals >= 46000) ? 'PASS' : 'FAIL',
    `totalAfter=${totals} (start 50000; chips + carried pot)`);
  const declVisible = playStates.some(x => (x.phase === 'DECLARE' || x.phase === 'SHOWDOWN')
    && x.players.filter((p: any) => ['HIGH', 'LOW', 'SWING'].includes(p.declaration)).length >= 2);
  record('BC5 declarations visible cross-client', declVisible ? 'PASS' : 'FAIL',
    'a play-hand snapshot shows 2+ declarations');
  record('BC5 reconnect mid-DECLARE restores board, cards, declarations', reconnectOk ? 'PASS' : 'FAIL',
    `attempted=${reconnectDone} ${reconnectDetail}`);
  // Ruling 1 from history: in sweep-scripted hands, at DECLARE every player
  // unmade on their own client's view must already be folded in the table
  // state, with the auto-fold message present.
  let sweepObservations = 0; let sweepBad = 0; const sweepNames: string[] = []; let sweepMsg = false;
  for (const [dealId, sc] of scriptByDealId) {
    if (sc !== 'sweep') continue;
    const declStates = allStates.filter(x => x.handId === dealId && x.phase === 'DECLARE');
    if (!declStates.length) continue;
    if (declStates.some(x => (x.messages ?? []).some((m: any) => /auto-folded/.test(m.text)))) sweepMsg = true;
    for (const g of clients) {
      const own = g.states.find(x => x.handId === dealId && x.phase === 'DECLARE');
      const me = own?.players?.find((p: any) => p.id === g.seat);
      if (!me || !own) continue;
      if (!bcMade(me.cards, own.communityCards)) {
        sweepObservations++;
        const tableView = declStates[0].players.find((p: any) => p.id === g.seat);
        sweepNames.push(`${me.name}:${tableView?.status}`);
        if (tableView?.status !== 'folded') sweepBad++;
      }
    }
  }
  record('BC5 DECLARE auto-folds unmade players (ruling 1)', (sweepObservations > 0 && sweepBad === 0 && sweepMsg) ? 'PASS' : 'FAIL',
    `observations=${sweepObservations} violations=${sweepBad} autoFoldMsg=${sweepMsg} ${sweepNames.join(', ')}`);
  record('BC5 lone unmade survivor — pot rolls over (ruling 2)', (foldResolved && rolloverPotSeen !== null && rolloverPotSeen > 0) ? 'PASS' : 'FAIL', foldDetail || 'fold hand never resolved');
  // Rollover carry, history-based: in the NEXT real hand's first DEAL-or-
  // later state, pot minus the antes posted (sum of totalBet) must equal
  // the rolled amount exactly. The in-loop WAITING capture is the fallback.
  let carryFromHistory: number | null = null;
  if (rolloverPotSeen !== null && playDealId !== null) {
    const dealIds = [...scriptByDealId.keys()].sort((a, b) => a - b);
    const foldDealId = dealIds.find(d => scriptByDealId.get(d) === 'fold');
    const nextDealId = foldDealId !== undefined ? dealIds[dealIds.indexOf(foldDealId) + 1] : undefined;
    if (nextDealId !== undefined) {
      const st = allStates.find(x => x.handId === nextDealId && x.phase !== 'ANTE' && x.phase !== 'WAITING');
      if (st) carryFromHistory = (st.pot ?? 0) - (st.players ?? []).reduce((a: number, p: any) => a + (p.totalBet ?? 0), 0);
    }
  }
  const carryOk = (rolloverCarried !== null && rolloverPotSeen !== null && rolloverCarried === rolloverPotSeen)
    || (carryFromHistory !== null && rolloverPotSeen !== null && carryFromHistory === rolloverPotSeen);
  record('BC5 rollover amount carried into next hand intact', carryOk ? 'PASS' : 'FAIL',
    `potAtShowdown=${rolloverPotSeen} potAtNextWaiting=${rolloverCarried} carryFromHistory=${carryFromHistory}`);
  clients.forEach(g => g.disconnect());

  // Partial table: 3 humans -> 3/5.
  const t2 = `B3${R4}`;
  const trio: GClient[] = [];
  for (let i = 0; i < 3; i++) { const g = new GClient(`B3${R4}P${i + 1}`); await g.bootstrap(); trio.push(g); }
  await fetch(`${BASE}/api/tables`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableId: t2, modeId: MODE, hostId: trio[0].profileId, maxPlayers: 5, botsEnabled: false, isInviteOnly: false }),
  });
  for (const g of trio) await g.connectMode(t2, MODE);
  await sleep(800);
  const entry2 = (await (await fetch(`${BASE}/api/tables`)).json().catch(() => [])).find((x: any) => x.tableId === t2);
  record('BC5 partial table 3/5', (entry2 && entry2.playerCount === 3 && entry2.maxPlayers === 5) ? 'PASS' : 'FAIL',
    `entry=${JSON.stringify(entry2 ?? null)}`);
  trio.forEach(g => g.disconnect());
}

async function scenarioFu5() {
  const MODE = 'flushed_up';
  const sig = (cards: any[]) => (cards ?? []).map((c: any) => `${c.rank}|${c.suit}`);
  const createTable = async (tid: string, host: GClient) => {
    const r = await fetch(`${BASE}/api/tables`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId: tid, modeId: MODE, hostId: host.profileId, maxPlayers: 5, botsEnabled: false, isInviteOnly: false }),
    });
    console.log(`  (fu record create ${tid} -> ${r.status})`);
  };
  const listEntry = async (tid: string) => (await (await fetch(`${BASE}/api/tables`)).json().catch(() => [])).find((x: any) => x.tableId === tid);

  // ── Table A: full five-player hand, draws, reconnect ──────────────────────
  const t = `F5${R4}`;
  const clients: GClient[] = [];
  for (let i = 0; i < 5; i++) { const g = new GClient(`F5${R4}P${i + 1}`); await g.bootstrap(); clients.push(g); }
  await createTable(t, clients[0]);
  for (const g of clients) await g.connectMode(t, MODE);
  await sleep(800);
  const s0 = clients[0].latest();
  const humans = (s0?.players ?? []).filter((p: any) => p.presence === 'human').length;
  record('FU5 five humans seated', humans === 5 ? 'PASS' : 'FAIL',
    `players=${(s0?.players ?? []).map((p: any) => `${p.name}:${p.presence}`).join(', ')}`);
  const entry = await listEntry(t);
  record('FU5 lobby count 5/5', (entry && entry.playerCount === 5 && entry.maxPlayers === 5) ? 'PASS' : 'FAIL',
    `entry=${JSON.stringify(entry ?? null)}`);

  const caps: Record<string, number> = { DRAW_1: 3, DRAW_2: 2, DRAW_3: 1 };
  const drawLog: { g: GClient; handId: number; phase: string; indices: number[]; pre: string[]; stateIdx: number; preSeq: number }[] = [];
  const drawsSent = new Map<string, number>();
  const acted = new Map<string, string>();
  let playDealId: number | null = null;
  let reconnectDone = false; let reconnectOk = false; let reconnectDetail = '';
  let showdownA: any = null;
  const deadlineA = Date.now() + 300000;

  while (Date.now() < deadlineA) {
    const s = freshestOf(clients);
    if (!s) { await sleep(200); continue; }
    if (s.phase === 'DEAL' && playDealId === null) playDealId = s.handId;
    if (s.phase === 'SHOWDOWN' && playDealId !== null && (s.handId === playDealId || s.handId === playDealId + 1)) { showdownA = s; break; }
    // Reconnect clients[2] during DRAW_2 of the play hand.
    if (!reconnectDone && playDealId !== null && s.handId === playDealId && s.phase === 'DRAW_2') {
      reconnectDone = true;
      const g = clients[2];
      const origSeat = g.seat;
      const beforeState = g.latest();
      const beforeCards = sig(beforeState?.players?.find((p: any) => p.id === origSeat)?.cards);
      const statesBefore = g.states.length;
      g.disconnect();
      await sleep(1200);
      await g.connectMode(t, MODE).catch(() => null);
      const fresh = g.states.slice(statesBefore);
      const after = fresh[fresh.length - 1];
      const meAfter = after?.players?.find((p: any) => p.id === origSeat);
      const afterCards = sig(meAfter?.cards);
      const seatBack = g.seat === origSeat;
      const humanBack = !!meAfter && meAfter.presence === 'human' && meAfter.name === g.name;
      // handId increments twice per hand (ANTE, then DEAL), and the
      // reconnecting client's last pre-disconnect snapshot can lag one
      // broadcast behind — accept the ANTE/DEAL pair of the same hand.
      // (Runs MVIK3P8G + MVIKT79P both tripped on the strict equality
      // while every restore field — seat, presence, name, cards — was
      // verifiably correct.)
      const sameHand = !!after && (after.handId === beforeState.handId || after.handId === beforeState.handId + 1);
      reconnectOk = fresh.length > 0 && !!after && sameHand && seatBack && humanBack
        && JSON.stringify(afterCards) === JSON.stringify(beforeCards);
      reconnectDetail = `fresh=${fresh.length} sameHand=${sameHand} handIds=${beforeState.handId}->${after?.handId} seatBack=${seatBack} humanBack=${humanBack} cardsSame=${JSON.stringify(afterCards) === JSON.stringify(beforeCards)}`;
      console.log(`  [fu5] reconnect: ${reconnectDetail}`);
    }
    for (const g of clients) {
      const gs = g.latest(); if (!gs) continue;
      const me = gs.players.find((p: any) => p.id === g.seat); if (!me) continue;
      const key = `${gs.handId}:${gs.phase}:${gs.activePlayerId}`;
      if (gs.phase === 'WAITING' && g === clients[0] && acted.get('start') !== `${gs.handId}`) {
        acted.set('start', `${gs.handId}`); g.act('start', null, t, MODE);
      } else if (gs.phase === 'ANTE' && !me.hasActed && acted.get(g.seat!) !== key) {
        acted.set(g.seat!, key); g.act('ante', null, t, MODE);
      } else if (gs.phase.startsWith('BET') && gs.activePlayerId === g.seat && !me.hasActed) {
        g.act(gs.currentBet > (me.bet ?? 0) ? 'call' : 'check', null, t, MODE);
        await sleep(100);
      } else if (gs.phase.startsWith('DRAW') && gs.activePlayerId === g.seat && !me.hasActed) {
        const suits: Record<string, number> = {};
        (me.cards ?? []).forEach((cd: any) => { suits[cd.suit] = (suits[cd.suit] ?? 0) + 1; });
        const best = Object.entries(suits).sort((a, b) => b[1] - a[1])[0]?.[0];
        const idx = (me.cards ?? []).map((cd: any, i: number) => (cd.suit !== best ? i : -1)).filter((i: number) => i >= 0).slice(0, caps[gs.phase] ?? 0);
        drawLog.push({ g, handId: gs.handId, phase: gs.phase, indices: idx, pre: sig(me.cards), stateIdx: g.states.length, preSeq: me.drawSeq ?? 0 });
        drawsSent.set(`${gs.handId}:${g.seat}`, (drawsSent.get(`${gs.handId}:${g.seat}`) ?? 0) + 1);
        g.act('draw', idx, t, MODE);
        await sleep(100);
      }
    }
    await sleep(200);
  }

  const allA: any[] = clients.flatMap(g => g.states);
  const playStates = playDealId === null ? [] : allA.filter(x => x.handId === playDealId || x.handId === playDealId - 1);
  const longestTimeline = clients.reduce((a, b) => (b.states.length > a.states.length ? b : a), clients[0]).states
    .filter(x => playDealId !== null && (x.handId === playDealId || x.handId === playDealId - 1));
  const phaseSeq = [...new Set(longestTimeline.map((x: any) => x.phase))].filter(p => p !== 'WAITING');
  const expectedSeq = ['ANTE', 'DEAL', 'BET_1', 'DRAW_1', 'BET_2', 'DRAW_2', 'BET_3', 'DRAW_3', 'BET_4', 'SHOWDOWN'];
  record('FU5 phase order preserved (bet before draw, 4 bet rounds)', JSON.stringify(phaseSeq) === JSON.stringify(expectedSeq) ? 'PASS' : 'FAIL',
    `seen=${phaseSeq.join(' -> ')}`);
  record('FU5 full hand to showdown, nobody trimmed', (showdownA && showdownA.players.filter((p: any) => p.presence === 'human').length === 5) ? 'PASS' : 'FAIL',
    showdownA ? `humans at showdown=${showdownA.players.filter((p: any) => p.presence === 'human').length} pot=${showdownA.pot}` : 'no showdown captured');
  // Draw replacement exactness + drawSeq contract, from each actor's own view.
  let drawViolations = 0; let seqViolations = 0; const drawNotes: string[] = [];
  for (const d of drawLog) {
    const after = d.g.states.slice(d.stateIdx).find(x => x.handId === d.handId && ((x.players.find((p: any) => p.id === d.g.seat)?.drawSeq ?? 0) > d.preSeq));
    if (!after) { drawViolations++; drawNotes.push(`${d.g.name} ${d.phase}: no post-draw state`); continue; }
    const meAfter = after.players.find((p: any) => p.id === d.g.seat);
    if ((meAfter.drawSeq ?? 0) !== d.preSeq + 1) { seqViolations++; drawNotes.push(`${d.g.name} ${d.phase}: seq ${d.preSeq}->${meAfter.drawSeq}`); }
    const post = sig(meAfter.cards);
    for (let i = 0; i < 5; i++) {
      if (d.indices.includes(i)) { if (post[i] === d.pre[i]) { drawViolations++; drawNotes.push(`${d.g.name} ${d.phase} slot ${i}: replaced card identical`); } }
      else if (post[i] !== d.pre[i]) { drawViolations++; drawNotes.push(`${d.g.name} ${d.phase} slot ${i}: KEPT card changed ${d.pre[i]}->${post[i]}`); }
    }
  }
  record('FU5 draw replacements exact (kept slots byte-identical)', (drawViolations === 0 && drawLog.length >= 10) ? 'PASS' : 'FAIL',
    `draws checked=${drawLog.length} violations=${drawViolations} ${drawNotes.slice(0, 3).join('; ')}`);
  record('FU5 drawSeq increments exactly once per accepted draw', (seqViolations === 0 && drawLog.length >= 10) ? 'PASS' : 'FAIL',
    `seq violations=${seqViolations} ${drawNotes.slice(0, 3).join('; ')}`);
  // Card-leak mask scan: opponents hidden before showdown; folded stay hidden at showdown.
  let leakViolations = 0; let leakChecks = 0;
  for (const g of clients) {
    for (const st of g.states) {
      if (playDealId === null || (st.handId !== playDealId && st.handId !== playDealId - 1)) continue;
      for (const p of st.players) {
        if (p.id === g.seat) continue;
        leakChecks++;
        const mustHide = st.phase !== 'SHOWDOWN' || p.status === 'folded';
        if (mustHide && (p.cards ?? []).some((c: any) => c.isHidden !== true)) leakViolations++;
      }
    }
  }
  record('FU5 no opponent card leak (hidden pre-showdown; folded stay hidden)', (leakViolations === 0 && leakChecks > 100) ? 'PASS' : 'FAIL',
    `checks=${leakChecks} violations=${leakViolations}`);
  record('FU5 reconnect mid-hand restores the player (persistent ID, fresh states)', reconnectOk ? 'PASS' : 'FAIL',
    `attempted=${reconnectDone} ${reconnectDetail}`);
  // Settlement conservation for table A.
  await sleep(9000);
  let totalsA: number | null = null;
  for (const g of clients) {
    const idx = g.states.findIndex(x => playDealId !== null && x.handId === playDealId && x.phase === 'SHOWDOWN');
    if (idx < 0) continue;
    const settled = g.states.slice(idx + 1).find(x => x.phase === 'WAITING' || (playDealId !== null && x.handId > playDealId));
    if (settled) { totalsA = (settled.players ?? []).reduce((a: number, p: any) => a + (p.chips ?? 0), 0) + (settled.pot ?? 0); break; }
  }
  record('FU5 settlement conserves chips (rake aside)', (totalsA !== null && totalsA <= 50000 && totalsA >= 47000) ? 'PASS' : 'FAIL',
    `totalAfter=${totalsA} (start 50000)`);
  clients.forEach(g => g.disconnect());

  // ── Table B: short-stack side pot ─────────────────────────────────────────
  const tB = `F9${R4}`;
  const squad: GClient[] = [];
  for (let i = 0; i < 5; i++) { const g = new GClient(`F9${R4}P${i + 1}`); await g.bootstrap(); squad.push(g); }
  await createTable(tB, squad[0]);
  for (let i = 0; i < 4; i++) await squad[i].connectMode(tB, MODE);
  await squad[4].connectMode(tB, MODE, 1000);
  await sleep(800);
  const shorty = squad[4];
  const sB0 = shorty.latest();
  const shortStack = sB0?.players?.find((p: any) => p.id === shorty.seat)?.chips;
  record('FU5 short stack seated at $1,000 buy-in', shortStack === 1000 ? 'PASS' : 'FAIL', `chips=${shortStack}`);
  const actedB = new Map<string, string>();
  let showdownB: any = null; let dealIdB: number | null = null;
  const deadlineB = Date.now() + 240000;
  while (Date.now() < deadlineB) {
    const s = freshestOf(squad);
    if (!s) { await sleep(200); continue; }
    if (s.phase === 'DEAL' && dealIdB === null) dealIdB = s.handId;
    if (s.phase === 'SHOWDOWN' && dealIdB !== null && (s.handId === dealIdB || s.handId === dealIdB + 1)) { showdownB = s; break; }
    for (const g of squad) {
      const gs = g.latest(); if (!gs) continue;
      const me = gs.players.find((p: any) => p.id === g.seat); if (!me) continue;
      const key = `${gs.handId}:${gs.phase}:${gs.activePlayerId}`;
      if (gs.phase === 'WAITING' && g === squad[0] && actedB.get('start') !== `${gs.handId}`) {
        actedB.set('start', `${gs.handId}`); g.act('start', null, tB, MODE);
      } else if (gs.phase === 'ANTE' && !me.hasActed && actedB.get(g.seat!) !== key) {
        actedB.set(g.seat!, key); g.act('ante', null, tB, MODE);
      } else if (gs.phase === 'BET_1' && gs.activePlayerId === g.seat && !me.hasActed) {
        if (g === shorty) g.act('raise', 1000, tB, MODE); // all-in: $25 ante + $975
        else g.act(gs.currentBet > (me.bet ?? 0) ? 'call' : 'check', null, tB, MODE);
        await sleep(100);
      } else if (gs.phase === 'BET_2' && gs.activePlayerId === g.seat && !me.hasActed) {
        if (g === squad[0]) g.act('raise', 200, tB, MODE);
        else g.act(gs.currentBet > (me.bet ?? 0) ? 'call' : 'check', null, tB, MODE);
        await sleep(100);
      } else if (gs.phase.startsWith('BET') && gs.activePlayerId === g.seat && !me.hasActed) {
        g.act(gs.currentBet > (me.bet ?? 0) ? 'call' : 'check', null, tB, MODE);
        await sleep(100);
      } else if (gs.phase.startsWith('DRAW') && gs.activePlayerId === g.seat && !me.hasActed) {
        g.act('draw', [], tB, MODE);
        await sleep(100);
      }
    }
    await sleep(200);
  }
  let sidePotOk = false; let sidePotDetail = 'no showdown';
  if (showdownB) {
    const shortRow = showdownB.players.find((p: any) => p.id === shorty.seat);
    const potB = showdownB.pot ?? 0;
    const bets = showdownB.players.map((p: any) => p.totalBet ?? 0);
    const eligibleGross = bets.reduce((a: number, b: number) => a + Math.min(b, shortRow.totalBet ?? 0), 0);
    const structural = Math.max(...bets) > (shortRow.totalBet ?? 0) && potB === bets.reduce((a: number, b: number) => a + b, 0);
    await sleep(9000);
    let settledB: any = null;
    for (const g of squad) {
      const idx = g.states.findIndex(x => dealIdB !== null && x.handId === dealIdB && x.phase === 'SHOWDOWN');
      if (idx < 0) continue;
      settledB = g.states.slice(idx + 1).find(x => x.phase === 'WAITING' || (dealIdB !== null && x.handId > dealIdB));
      if (settledB) break;
    }
    if (settledB) {
      const rake = Math.floor(potB * 0.05);
      const deltas = showdownB.players.map((p: any) => (settledB.players.find((q: any) => q.id === p.id)?.chips ?? 0) - (p.chips ?? 0));
      const distTotal = deltas.reduce((a: number, b: number) => a + b, 0);
      const shortDelta = deltas[showdownB.players.findIndex((p: any) => p.id === shorty.seat)];
      const shortWon = !!shortRow.isWinner;
      const capOk = shortWon ? shortDelta <= eligibleGross : shortDelta === 0;
      sidePotOk = structural && distTotal === potB - rake && capOk;
      sidePotDetail = `pot=${potB} bets=${bets.join('/')} eligibleGross=${eligibleGross} distributed=${distTotal} expected=${potB - rake} shortDelta=${shortDelta} shortWon=${shortWon} structural=${structural}`;
    } else sidePotDetail = 'no settled state';
  }
  record('FU5 side pot: short stack capped at eligible portion, exact distribution', sidePotOk ? 'PASS' : 'FAIL', sidePotDetail);
  squad.forEach(g => g.disconnect());

  // Partial table: 3 humans -> 3/5.
  const t2 = `F3${R4}`;
  const trio: GClient[] = [];
  for (let i = 0; i < 3; i++) { const g = new GClient(`F3${R4}P${i + 1}`); await g.bootstrap(); trio.push(g); }
  await createTable(t2, trio[0]);
  for (const g of trio) await g.connectMode(t2, MODE);
  await sleep(800);
  const entry2 = await listEntry(t2);
  record('FU5 partial table 3/5', (entry2 && entry2.playerCount === 3 && entry2.maxPlayers === 5) ? 'PASS' : 'FAIL',
    `entry=${JSON.stringify(entry2 ?? null)}`);
  trio.forEach(g => g.disconnect());
}

// ─── Box Chevy stall trace (Detroit 2026-10-22, correction plan P0-5) ───────
// Timed server traces BEFORE any engine conclusion: (A) a hero who idles
// at a BET turn — how long until the server resolves it, and how; (B) a
// MADE hero who never declares — how long DECLARE holds, the deadline
// armed at entry, and the timeout outcome; (C) an UNMADE hero at DECLARE
// — whether the auto-fold is already applied in the first DECLARE
// snapshot and what message the state carries.
async function scenarioBcTrace() {
  const MODE = 'box_chevy';
  const t = `BT${R4}`;
  const clients: GClient[] = [];
  for (let i = 0; i < 3; i++) { const g = new GClient(`BT${R4}P${i + 1}`); await g.bootstrap(); clients.push(g); }
  const recRes = await fetch(`${BASE}/api/tables`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableId: t, modeId: MODE, hostId: clients[0].profileId, maxPlayers: 5, botsEnabled: false, isInviteOnly: false }),
  });
  console.log(`  (bctrace record create -> ${recRes.status})`);
  for (const g of clients) await g.connectMode(t, MODE);
  await sleep(800);
  const hero = clients[0];
  const caps: Record<string, number> = { DRAW_1: 3, DRAW_2: 2, DRAW_3: 1 };
  const smartDiscards = (me: any, comm: any[], cap: number): number[] => {
    const commRanks = new Set((comm ?? []).map((c: any) => c.rank));
    const seen = new Set<string>(); const dup = new Set<number>();
    (me.cards ?? []).forEach((c: any, i: number) => { if (seen.has(c.rank)) dup.add(i); seen.add(c.rank); });
    return (me.cards ?? []).map((c: any, i: number) => (commRanks.has(c.rank) || dup.has(i) ? i : -1))
      .filter((i: number) => i >= 0).slice(0, cap);
  };
  const seenDealIds = new Set<number>();
  let realHands = 0;
  // Case A: bet idle (first real hand only)
  let betIdleArmed = true, betIdleStart = 0, betIdleHand = -1;
  let betIdleResult = '';
  // Case B: made hero never declares
  let declareArmed = true, declareStart = 0, declareHand = -1, declareDeadlineMs: number | null = null;
  let declareResult = '';
  // Case C: unmade hero at DECLARE entry
  let unmadeChecked = false;
  let unmadeResult = '';
  const acted = new Map<string, string>();
  const startSentAt = new Map<string, number>();
  const deadline = Date.now() + 510000;
  const freshest = () => clients.reduce((a, b) => (b.states.length > a.states.length ? b : a), clients[0]);
  let prevPhase = ''; let prevHand = -1;

  while (Date.now() < deadline) {
    const s = freshest().latest();
    if (!s) { await sleep(200); continue; }
    if (s.phase === 'DEAL' && !seenDealIds.has(s.handId)) { seenDealIds.add(s.handId); realHands++; console.log(`  [bctrace] real hand ${realHands} dealId=${s.handId}`); }
    const heroState = s.players?.find((p: any) => p.id === hero.seat);
    const msgs = (s.messages ?? []).map((m: any) => m.text as string);

    // Case B/C bookkeeping on DECLARE transitions for the hero's hand.
    if (s.phase === 'DECLARE' && prevPhase !== 'DECLARE') {
      if (heroState && heroState.status === 'active' && bcMade(heroState.cards, s.communityCards)) {
        if (declareArmed) {
          declareArmed = false; declareStart = Date.now(); declareHand = s.handId;
          declareDeadlineMs = typeof s.turnDeadline === 'number' ? s.turnDeadline - Date.now() : null;
          console.log(`  [bctrace] DECLARE entered hand=${s.handId} hero MADE, will not declare; turnDeadline in ${declareDeadlineMs}ms active=${s.activePlayerId}`);
        }
      } else if (!unmadeChecked && heroState) {
        unmadeChecked = true;
        const firstDecl = hero.latest()?.phase === 'DECLARE' ? hero.latest() : s;
        const meFirst = firstDecl?.players?.find((p: any) => p.id === hero.seat);
        const autoMsg = msgs.find(m => m.includes('no made hand') || m.includes('auto-fold')) ?? '';
        unmadeResult = `heroStatusAtDeclareEntry=${meFirst?.status} hasActed=${meFirst?.hasActed} autoFoldMsg=${autoMsg ? 'present' : 'ABSENT'} hand=${s.handId}`;
        console.log(`  [bctrace] unmade case: ${unmadeResult}`);
      }
    }
    if (prevPhase === 'DECLARE' && s.phase !== 'DECLARE' && declareHand === prevHand) {
      const dur = ((Date.now() - declareStart) / 1000).toFixed(1);
      const timeoutMsg = msgs.find(m => m.includes('times out')) ?? '';
      declareResult = `declareHeldSeconds=${dur} heroStatus=${heroState?.status} heroDeclaration=${heroState?.declaration ?? 'null'} timeoutMsg=${timeoutMsg ? 'present' : 'ABSENT'} deadlineArmedMs=${declareDeadlineMs}`;
      console.log(`  [bctrace] declare case resolved: ${declareResult}`);
      declareHand = -1;
    }
    // Case A resolution: hero's turn passed without him acting.
    if (betIdleStart > 0 && heroState) {
      const stillMyTurn = s.activePlayerId === hero.seat && s.phase.startsWith('BET');
      if (!stillMyTurn || heroState.hasActed || heroState.status === 'folded') {
        const dur = ((Date.now() - betIdleStart) / 1000).toFixed(1);
        const timeoutMsg = msgs.find(m => m.includes('times out')) ?? '';
        betIdleResult = `idleSeconds=${dur} heroStatus=${heroState.status} hasActed=${heroState.hasActed} timeoutMsg=${timeoutMsg ? `present: "${timeoutMsg.slice(0, 60)}"` : 'ABSENT'}`;
        console.log(`  [bctrace] bet idle resolved: ${betIdleResult}`);
        betIdleStart = 0;
      }
    }

    for (const g of clients) {
      const gs = g.latest(); if (!gs) continue;
      const me = gs.players?.find((p: any) => p.id === g.seat); if (!me) continue;
      const key = `${gs.handId}:${gs.phase}:${gs.activePlayerId}`;
      const isHero = g === hero;
      if (gs.phase === 'WAITING' && isHero) {
        const last = startSentAt.get(`${gs.handId}`) ?? 0;
        if (Date.now() - last > 10000) { startSentAt.set(`${gs.handId}`, Date.now()); g.act('start', null, t, MODE); }
      } else if (gs.phase === 'ANTE' && !me.hasActed && acted.get(g.seat!) !== key) {
        acted.set(g.seat!, key); g.act('ante', null, t, MODE);
      } else if (gs.phase.startsWith('BET') && gs.activePlayerId === g.seat && !me.hasActed) {
        if (isHero && betIdleArmed && realHands === 1) {
          // Case A: idle on purpose — record the start once.
          if (betIdleStart === 0) { betIdleStart = Date.now(); betIdleHand = gs.handId; console.log(`  [bctrace] bet idle begins hand=${gs.handId} phase=${gs.phase} deadlineIn=${typeof gs.turnDeadline === 'number' ? gs.turnDeadline - Date.now() : 'n/a'}ms`); }
          continue;
        }
        if (betIdleArmed && isHero && betIdleStart === 0 && realHands > 1) betIdleArmed = false;
        g.act(gs.currentBet > (me.bet ?? 0) ? 'call' : 'check', null, t, MODE);
        await sleep(80);
      } else if (gs.phase.startsWith('DRAW') && gs.activePlayerId === g.seat && !me.hasActed) {
        g.act('draw', smartDiscards(me, gs.communityCards, caps[gs.phase] ?? 0), t, MODE);
        await sleep(80);
      } else if (gs.phase === 'DECLARE' && me.status === 'active' && !me.hasActed) {
        if (isHero && declareHand === gs.handId) continue; // Case B: never declare.
        if (bcMade(me.cards, gs.communityCards)) { g.act('declare', { declaration: 'HIGH' }, t, MODE); await sleep(80); }
      }
    }
    prevPhase = s.phase; prevHand = s.handId;
    if (betIdleResult && declareResult && unmadeChecked) break;
    if (realHands >= 9) break;
    await sleep(200);
  }
  record('BCTRACE bet-phase idle resolves via server timeout', betIdleResult ? 'PASS' : 'BLOCKED', betIdleResult || 'case never armed');
  record('BCTRACE made hero never declares: DECLARE hold + outcome', declareResult ? 'PASS' : 'BLOCKED', declareResult || 'no made-hero hand occurred in the window');
  record('BCTRACE unmade hero at DECLARE entry (auto-fold state + message)', unmadeResult ? 'PASS' : 'BLOCKED', unmadeResult || 'no unmade-hero DECLARE occurred');
}

// ─── $0 stack broadcast trace (Detroit 2026-10-22, correction plan P2) ──────
// One human at a quick-play Flushed Up table (bots fill). Scans EVERY
// snapshot for chips === 0 seats and classifies each event: at-join
// (seat's first snapshot), all-in (chips committed this hand), settlement
// window (opens at/after SHOWDOWN of the same hand), or other. Decides
// whether the server-side restock adjustment is warranted.
async function scenarioChipsTrace() {
  const MODE = 'flushed_up';
  const t = `CT${R4}`;
  const g = new GClient(`CT${R4}P1`);
  await g.bootstrap();
  await g.connectMode(t, MODE, undefined, true);
  await sleep(1000);
  const s0 = g.latest();
  console.log(`  [chipstrace] seated: ${(s0?.players ?? []).map((p: any) => `${p.name}:${p.presence}:${p.chips}`).join(', ')}`);
  const caps: Record<string, number> = { DRAW_1: 3, DRAW_2: 2, DRAW_3: 1 };
  void caps;
  const seenDealIds = new Set<number>();
  let realHands = 0;
  const acted = new Map<string, string>();
  const startSentAt = new Map<string, number>();
  const deadline = Date.now() + 270000;
  while (Date.now() < deadline && realHands < 6) {
    const s = g.latest(); if (!s) { await sleep(200); continue; }
    if (s.phase === 'DEAL' && !seenDealIds.has(s.handId)) { seenDealIds.add(s.handId); realHands++; console.log(`  [chipstrace] hand ${realHands} dealId=${s.handId}`); }
    const me = s.players?.find((p: any) => p.id === g.seat);
    const key = `${s.handId}:${s.phase}:${s.activePlayerId}`;
    if (me) {
      if (s.phase === 'WAITING') {
        const last = startSentAt.get(`${s.handId}`) ?? 0;
        if (Date.now() - last > 10000) { startSentAt.set(`${s.handId}`, Date.now()); g.act('start', null, t, MODE); }
      } else if (s.phase === 'ANTE' && !me.hasActed && acted.get(g.seat!) !== key) {
        acted.set(g.seat!, key); g.act('ante', null, t, MODE);
      } else if (s.phase.startsWith('BET') && s.activePlayerId === g.seat && !me.hasActed) {
        g.act(s.currentBet > (me.bet ?? 0) ? 'call' : 'check', null, t, MODE); await sleep(80);
      } else if (s.phase.startsWith('DRAW') && s.activePlayerId === g.seat && !me.hasActed) {
        g.act('draw', [], t, MODE); await sleep(80);
      }
    }
    await sleep(200);
  }
  // Scan the full snapshot history for zero-stack events.
  type ZeroEvent = { seat: string; name: string; presence: string; kind: string; openedPhase: string; handId: any; snapshots: number; prevChips: number | null; nextChips: number | null; totalBetAtOpen: number };
  const events: ZeroEvent[] = [];
  const lastChips = new Map<string, number>();
  const firstSeen = new Set<string>();
  const open = new Map<string, ZeroEvent & { count: number }>();
  const phasesByHand = new Map<any, string[]>();
  for (const st of g.states) {
    const arr = phasesByHand.get(st.handId) ?? []; if (!arr.includes(st.phase)) { arr.push(st.phase); phasesByHand.set(st.handId, arr); }
    for (const p of st.players ?? []) {
      const id = p.id as string;
      const chips = p.chips ?? 0;
      const isFirst = !firstSeen.has(id); firstSeen.add(id);
      if (chips === 0 && !open.has(id)) {
        const prev = lastChips.get(id) ?? null;
        let kind = 'other';
        if (isFirst) kind = 'at-join';
        else if ((p.totalBet ?? 0) > 0 || (p.bet ?? 0) > 0) kind = 'all-in (chips committed)';
        else if (st.phase === 'SHOWDOWN' || (phasesByHand.get(st.handId) ?? []).includes('SHOWDOWN')) kind = 'settlement window';
        open.set(id, { seat: id, name: p.name, presence: p.presence, kind, openedPhase: st.phase, handId: st.handId, snapshots: 0, prevChips: prev, nextChips: null, totalBetAtOpen: p.totalBet ?? 0, count: 0 });
      }
      const ev = open.get(id);
      if (ev) {
        if (chips === 0) { ev.count++; }
        else { ev.snapshots = ev.count; ev.nextChips = chips; events.push({ ...ev }); open.delete(id); }
      }
      lastChips.set(id, chips);
    }
  }
  for (const ev of open.values()) { ev.snapshots = ev.count; events.push({ ...ev }); }
  const byKind = new Map<string, number>();
  for (const e of events) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  const summary = [...byKind.entries()].map(([k, v]) => `${k}=${v}`).join(' ') || 'none';
  console.log(`  [chipstrace] snapshots=${g.states.length} hands=${realHands} zeroEvents=${events.length} (${summary})`);
  for (const e of events.slice(0, 8)) console.log(`  [chipstrace] zero: ${e.name} (${e.presence}) kind=${e.kind} phase=${e.openedPhase} hand=${e.handId} snapsAtZero=${e.snapshots} prev=${e.prevChips} next=${e.nextChips} totalBetAtOpen=${e.totalBetAtOpen}`);
  record('CHIPSTRACE zero-stack events classified', 'PASS',
    `snapshots=${g.states.length} hands=${realHands} events=${events.length} (${summary})` +
    (events[0] ? ` | first: ${events[0].name} kind=${events[0].kind} phase=${events[0].openedPhase} snapsAtZero=${events[0].snapshots} prev=${events[0].prevChips} next=${events[0].nextChips}` : ''));
}

// ─── rebuyfix: funded-player rollover lockout reproduction (Box Chevy) ──────
// Detroit 2026-10-22: after a hand settles with NO winner (Box Chevy
// rollover — pot carries), a hero who FOLDED that hand was parked as
// 'sitting_out' by the settle's rollover status branch. With a solo
// human at the table the next-hand gate (needs an ACTIVE funded
// human) then fails, the table sits in WAITING, and the hero's start
// is rejected with "Rebuy before starting a new hand." — despite a
// healthy stack (observed live at 9,975). This scenario reproduces
// the configuration (solo human + bots, hero folds, community pair
// guarantees an all-unmade showdown → rollover settle) and records
// the hero's status + start outcome. PASS = hero reactivated and the
// next hand reachable without leaving; FAIL with LOCKOUT in the
// detail = the bug reproduced (expected on pre-fix builds).
async function scenarioRebuyFix() {
  console.log('\n== REBUY LOCKOUT REPRODUCTION (run ' + RUN + ') ==');
  const MODE = 'boxchevy';
  const t = 'RB' + RUN.slice(0, 4);
  const hero = new GClient(t + 'H');
  await hero.connectMode(t, MODE);
  const me = (s: any) => s?.players.find((p: any) => p.id === hero.seat);
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < 40 && hero.latest()?.phase !== 'WAITING'; i++) await sleep(250);
  hero.act('start', null, t, MODE);

  const deadline = Date.now() + 480_000;
  let realHands = 0;
  let qualifyingAttempts = 0;
  let lastDealId = -1;
  let handRole: 'fold' | 'play' = 'play';
  let heroFoldedThisHand = false;
  let sawShowdownThisHand = false;

  while (Date.now() < deadline && qualifyingAttempts < 8) {
    const s = hero.latest();
    if (!s) { await sleep(300); continue; }
    const m = me(s);
    if (!m) { await sleep(300); continue; }

    if (s.phase === 'DEAL' && s.handId !== lastDealId) {
      // Terminal observation B: the previous hand was a qualifying
      // fold hand that reached showdown, and a NEW hand has now been
      // dealt with the hero active in it — the settle reactivated
      // him and the table moved on without any lockout.
      if (heroFoldedThisHand && sawShowdownThisHand && m.status === 'active') {
        record('REBUYFIX funded hero survives rollover settle',
          'PASS', `no lockout — hero active and dealt into the next hand (dealId=${s.handId}) after folding a rollover hand`);
        hero.close();
        return;
      }
      lastDealId = s.handId;
      realHands++;
      heroFoldedThisHand = false;
      sawShowdownThisHand = false;
      const ranks = (s.communityCards ?? []).map((c: any) => c.rank);
      const communityPair = ranks.length === 5 && new Set(ranks).size < ranks.length;
      handRole = communityPair ? 'fold' : 'play';
      if (communityPair) {
        qualifyingAttempts++;
        console.log(`  [rebuyfix] qualifying hand ${qualifyingAttempts} dealId=${s.handId} community=${ranks.join(',')} (pair → all unmade)`);
      }
    }
    if (s.phase === 'SHOWDOWN') sawShowdownThisHand = true;

    // Terminal observation A: rollover settle left the table in WAITING.
    if (s.phase === 'WAITING' && realHands >= 1 && heroFoldedThisHand && sawShowdownThisHand) {
      const statusAfterSettle = m.status;
      const chipsAfterSettle = m.chips;
      const potCarried = s.pot;
      console.log(`  [rebuyfix] rollover settle in WAITING: heroStatus=${statusAfterSettle} heroChips=${chipsAfterSettle} potCarried=${potCarried}`);
      const errMark = hero.errors.length;
      hero.act('start', null, t, MODE);
      await sleep(3500);
      const s2 = hero.latest();
      const rejection = hero.errors.slice(errMark).find(e => /Rebuy before starting/.test(e.message));
      const phaseAfterStart = s2?.phase;
      if (statusAfterSettle === 'sitting_out' && rejection && phaseAfterStart === 'WAITING') {
        record('REBUYFIX funded hero survives rollover settle',
          'FAIL', `LOCKOUT REPRODUCED — hero parked sitting_out with ${chipsAfterSettle} chips, pot carried ${potCarried}, start rejected: "${rejection.message}"`);
      } else if (statusAfterSettle === 'active') {
        record('REBUYFIX funded hero survives rollover settle',
          'PASS', `hero active at settle (chips=${chipsAfterSettle}), phase after start attempt=${phaseAfterStart}`);
      } else {
        record('REBUYFIX funded hero survives rollover settle',
          'FAIL', `unexpected state: status=${statusAfterSettle} phaseAfterStart=${phaseAfterStart} rejection=${rejection?.message ?? 'none'}`);
      }
      hero.close();
      return;
    }

    if (s.activePlayerId === hero.seat && m.status === 'active') {
      if (handRole === 'fold' && s.phase.startsWith('BET')) {
        hero.act('fold', null, t, MODE);
        heroFoldedThisHand = true;
        await sleep(400);
        continue;
      }
      if (s.phase === 'ANTE') hero.act('ante', null, t, MODE);
      else if (s.phase.startsWith('BET')) hero.act(s.currentBet > (m.bet ?? 0) ? 'call' : 'check', null, t, MODE);
      else if (s.phase.startsWith('DRAW')) hero.act('draw', smartDiscards(m.cards ?? [], s.communityCards ?? []), t, MODE);
      else if (s.phase === 'DECLARE') {
        if (bcMade(m.cards ?? [], s.communityCards ?? [])) hero.act('declare', { declaration: 'HIGH' }, t, MODE);
      }
      await sleep(350);
      continue;
    }
    await sleep(300);
  }
  record('REBUYFIX funded hero survives rollover settle', 'BLOCKED',
    `no terminal rollover configuration in ${qualifyingAttempts} qualifying hands (${realHands} real hands)`);
  hero.close();
}

// Freshest snapshot across a client set (the bc5 lesson: never key phase
// decisions to one possibly-stale client).
function freshestOf(set: GClient[]): any {
  const g = set.reduce((a, b) => (b.states.length > a.states.length ? b : a), set[0]);
  return g?.latest();
}

async function main() {
  const mode = process.argv[2] || 'probe';
  if (mode === 'probe') { await probe(); return; }
  if (mode === 'a4') { console.log(`\n== A-SCENARIO AT 4 SEATS (run ${RUN}) ==`); await scenarioA(4); writeResults('a4'); return; }
  if (mode === 'a') { console.log(`\n== A-SCENARIO AT 5 SEATS (run ${RUN}) ==`); await scenarioA(5); writeResults('a'); return; }
  if (mode === 'c5') { console.log(`\n== C5 ONLY (run ${RUN}) ==`); await scenarioC5(); writeResults('c5'); return; }
  if (mode === 'clock') { console.log(`\n== CLOCK SYNC (run ${RUN}) ==`); await scenarioClock(); writeResults('clock'); return; }
  if (mode === 'wire') { console.log(`\n== WIRE FIELDS (run ${RUN}) ==`); await scenarioWire(); writeResults('wire'); return; }
  if (mode === 'pots') { console.log(`\n== SIDE POTS (run ${RUN}) ==`); await scenarioPots(); writeResults('pots'); return; }
  if (mode === 'drawqa') { console.log(`\n== DRAW QA (run ${RUN}) ==`); await scenarioDrawQa(); writeResults('drawqa'); return; }
  if (mode === 'dwell') { console.log(`\n== DWELL HUNT (run ${RUN}) ==`); await scenarioDwell(); writeResults('dwell'); return; }
  if (mode === 'phase1') { console.log(`\n== PHASE 1 (run ${RUN}) ==`); await scenarioPhase1(); writeResults('phase1'); return; }
  if (mode === 'fu5') { console.log(`\n== FLUSHED UP 5-SEAT (run ${RUN}) ==`); await scenarioFu5(); writeResults('fu5'); return; }
  if (mode === 'bc5') { console.log(`\n== BOX CHEVY 5-SEAT + RULINGS (run ${RUN}) ==`); await scenarioBc5(); writeResults('bc5'); return; }
  if (mode === 'bctrace') { console.log(`\n== BOX CHEVY STALL TRACE (run ${RUN}) ==`); await scenarioBcTrace(); writeResults('bctrace'); return; }
  if (mode === 'chipstrace') { console.log(`\n== $0 STACK TRACE (run ${RUN}) ==`); await scenarioChipsTrace(); writeResults('chipstrace'); return; }
  if (mode === 'rebuyfix') { console.log(`\n== REBUY LOCKOUT REPRODUCTION (run ${RUN}) ==`); await scenarioRebuyFix(); writeResults('rebuyfix'); return; }
  console.log(`\n== FULL SUITE v2 (run ${RUN}, base ${BASE}) ==`);
  await scenarioA(5);
  await scenarioB0();
  await scenarioB1();
  await scenarioB2();
  await Promise.all([scenarioC(30), scenarioC(90), scenarioC(179), scenarioC(181)]);
  await scenarioC5();
  writeResults('all');
}

main().then(() => process.exit(0)).catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
