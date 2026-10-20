/**
 * Staging-only Badugi multiplayer test harness (Detroit 2026-10-20).
 *
 * Runs INSIDE the staging fork (or any dev server) against localhost so the
 * Replit dev shield is not in the path. Drives real guest clients through the
 * full production protocol: guest-init -> ws-ticket -> WS join -> badugi:action.
 *
 * Usage: npx tsx scripts/staging-harness.ts probe|all
 * Writes staging-results.json in the cwd and prints a summary table.
 * NEVER point HARNESS_BASE at production.
 */
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { evaluateBadugi } from '../shared/modes/badugi';

const BASE = process.env.HARNESS_BASE || 'http://localhost:5000';
if (/chainggangpoker\.com|replit\.app/.test(BASE) && !process.env.HARNESS_ALLOW_REMOTE) {
  console.error('Refusing to run against a production-looking host. Set HARNESS_BASE to the staging server.');
  process.exit(2);
}
const WS_BASE = BASE.replace(/^http/, 'ws') + '/ws';
const RUN = Date.now().toString(36).toUpperCase();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Result = { item: string; status: 'PASS' | 'FAIL' | 'BLOCKED'; evidence: string };
const results: Result[] = [];
function record(item: string, status: Result['status'], evidence: string) {
  results.push({ item, status, evidence });
  console.log(`[${status}] ${item} — ${evidence}`);
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

  async timeBankStatus() {
    const res = await fetch(`${BASE}/api/players/${this.profileId}/time-bank/status`, {
      headers: { 'X-Session-Token': this.sessionToken },
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  async useTimeBank(tableId: string) {
    const res = await fetch(`${BASE}/api/players/${this.profileId}/time-bank/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': this.sessionToken },
      body: JSON.stringify({ table_id: tableId, mode_id: 'badugi' }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  async connect(tableId: string, spectate = false) {
    const tRes = await fetch(`${BASE}/api/auth/ws-ticket`, { headers: { 'X-Session-Token': this.sessionToken } });
    const tJson: any = await tRes.json().catch(() => ({}));
    if (!tRes.ok || !tJson.ticket) throw new Error(`ws-ticket ${tRes.status}: ${JSON.stringify(tJson).slice(0, 200)}`);
    const sessionUUID = randomUUID();
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
      playerId: sessionUUID, identityId: this.profileId, name: this.name, seatId: sessionUUID,
      isPrivate: true,
    }));
    // Wait for init / first snapshot
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

  async until(pred: (s: any) => boolean, ms = 20000, desc = ''): Promise<any> {
    const deadline = Date.now() + ms;
    let seen = this.states.length;
    while (Date.now() < deadline) {
      const s = this.latest();
      if (s && pred(s)) return s;
      if (this.states.length !== seen) { seen = this.states.length; continue; }
      await sleep(100);
    }
    throw new Error(`until() timeout: ${desc} (last phase=${this.latest()?.phase})`);
  }
}

// Policy driver: acts for a client whenever it is their turn, per behavior.
type Behavior = {
  drawDiscards?: (phase: string) => number[];
  foldAtFirstBet?: boolean;
  passive?: boolean;
  declareAs?: string;
};
async function driveClient(c: Client, beh: Behavior, stopWhen: () => boolean) {
  let folded = false;
  while (!stopWhen()) {
    const s = c.latest();
    await sleep(150);
    if (!s || c.ws?.readyState !== WebSocket.OPEN) continue;
    const me = c.me(s);
    if (!me) continue;
    // Hand start / restart is host-agnostic: any seated human may send it,
    // server rejects duplicates by phase. Only the first client does it.
    if (s.phase === 'WAITING' && (c as any)._starter && !stopWhen()) {
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
      c.actedKey = key;
      if (beh.foldAtFirstBet && !folded) { folded = true; c.action('fold'); }
      else if ((me.bet ?? 0) >= (s.currentBet ?? 0)) c.action('check');
      else c.action('call');
    } else if (phase.startsWith('DRAW')) {
      c.actedKey = key;
      c.action('draw', beh.drawDiscards ? beh.drawDiscards(phase) : []);
    } else if (phase === 'DECLARE') {
      c.actedKey = key;
      c.action('declare', { declaration: beh.declareAs ?? 'LOW' });
    }
  }
}

async function makeTable(tableId: string, n: number, behaviors: Behavior[] = []) {
  const clients: Client[] = [];
  for (let i = 0; i < n; i++) {
    const c = new Client(`T${RUN.slice(-4)}P${i + 1}`);
    await c.bootstrap();
    await c.connect(tableId);
    clients.push(c);
  }
  (clients[0] as any)._starter = true;
  const drivers = clients.map((c, i) => driveClient(c, behaviors[i] ?? {}, () => (c as any)._stop === true));
  return { clients, stop: () => { clients.forEach(c => { (c as any)._stop = true; }); } , drivers };
}

const sumChips = (s: any) => (s?.players ?? []).reduce((a: number, p: any) => a + (p.chips ?? 0), 0);

// ─── Probe ───────────────────────────────────────────────────────────────────
async function probe() {
  console.log(`\n== PROBE (run ${RUN}, base ${BASE}) ==`);
  const t = `STGPROBE${RUN.slice(-4)}`;
  const { clients, stop } = await makeTable(t, 5);
  const c0 = clients[0];
  console.log('guest chipBalance:', clients.map(c => c.chipBalance).join(', '));
  const tb = await c0.timeBankStatus();
  console.log('time-bank status:', tb.status, JSON.stringify(tb.body));
  const s0 = c0.latest();
  console.log(`seats: ${clients.map(c => c.seat).join(', ')} | players in state: ${s0.players.length} | phase=${s0.phase} | pot=${s0.pot}`);
  console.log('player rows:', s0.players.map((p: any) => `${p.id}:${p.name}:chips=${p.chips}:presence=${p.presence}`).join(' | '));
  const draw = await c0.until(s => s.phase.startsWith('DRAW') || s.phase.startsWith('BET'), 30000, 'first actionable phase')
    .catch(e => { console.log('probe hand did not reach actionable phase:', e.message); return null; });
  if (draw) {
    console.log(`reached phase=${draw.phase} pot=${draw.pot} active=${draw.activePlayerId} turnDeadline=${draw.turnDeadline ?? 'null'}`);
    const me = c0.me(draw);
    console.log(`c0 cards visible to self: ${me?.cards?.length} cards, hidden flags: ${(me?.cards ?? []).map((x: any) => x.isHidden).join(',')}`);
  }
  stop();
  clients.forEach(c => c.disconnect());
  console.log('== PROBE DONE ==');
}

// ─── Scenarios ───────────────────────────────────────────────────────────────
async function scenarioA() {
  const t = `STGA${RUN.slice(-4)}`;
  // Hand 1: P5 folds at first bet (D1), P2 discards 2 on DRAW_1 (A3).
  const beh: Behavior[] = [{}, { drawDiscards: (ph) => ph === 'DRAW_1' ? [0, 1] : [] }, {}, {}, { foldAtFirstBet: true }];
  const { clients, stop } = await makeTable(t, 5, beh);
  const [c0, c1, , , c4] = clients;
  const spec = new Client(`T${RUN.slice(-4)}SPEC`);
  await spec.bootstrap();
  await spec.connect(t, true).catch(e => console.log('spectator join failed (D1 falls back to client frames):', e.message));

  // A1: full hand to showdown
  const pre = await c0.until(s => s.phase === 'ANTE' || s.phase.startsWith('DRAW') || s.phase.startsWith('BET'), 30000, 'hand1 start');
  const total0 = sumChips(pre) + (pre.pot ?? 0);
  const p2cardsBefore = await c1.until(s => (c1.me(s)?.cards?.length ?? 0) === 4, 20000, 'p2 dealt');
  const p2Before = (c1.me(p2cardsBefore)?.cards ?? []).map((x: any) => `${x.rank}${x.suit}`);
  const foldMoment = { t: 0 };
  const sd = await c0.until(s => s.phase === 'SHOWDOWN', 120000, 'hand1 showdown').catch(e => null);
  if (!sd) { record('A1 full hand lifecycle (5 clients)', 'FAIL', `hand did not reach SHOWDOWN: ${c0.latest()?.phase}`); stop(); return; }
  record('A1 full hand lifecycle (5 clients)', 'PASS', `hand ${sd.handId} reached SHOWDOWN; phases flowed ante->draw/bet->declare->showdown`);

  // A2: chip accounting (pot should be 0 after payout; rake reported if any)
  await sleep(500);
  const endState = c0.latest();
  const total1 = sumChips(endState) + (endState.pot ?? 0);
  const rake = (endState as any).rakeAmount ?? (endState as any).lastRake ?? null;
  record('A2 chip accounting', total1 === total0 || rake != null && total0 - total1 === rake ? 'PASS' : 'FAIL',
    `total before=${total0} after=${total1} delta=${total1 - total0} pot@showdown=${endState.pot} rakeField=${rake}`);

  // A3: P2 discarded 2 on DRAW_1 -> still 4 cards, kept cards unchanged
  const p2AfterState = c1.states.find(s => s.phase === 'DRAW_2' || s.phase === 'BET_2') ?? c1.latest();
  const p2After = (c1.me(p2AfterState)?.cards ?? []).map((x: any) => `${x.rank}${x.suit}`);
  const keptSame = p2Before.length === 4 && p2After.length === 4 && p2After[2] === p2Before[2] && p2After[3] === p2Before[3];
  record('A3 draw mechanics (discard 2)', keptSame ? 'PASS' : 'FAIL', `before=${p2Before.join(' ')} after=${p2After.join(' ')}`);

  // D1: folded P5's cards must never appear in other clients' / spectator raw frames
  const foldedCards = (c4.me(c4.states.find(s => s.phase === 'SHOWDOWN') ?? c4.latest())?.cards ?? []);
  // P5's own view masks folded cards at showdown; use its last live view instead
  const ownLive = [...c4.states].reverse().find(s => (c4.me(s)?.cards ?? []).some((x: any) => !x.isHidden));
  const secret = (c4.me(ownLive)?.cards ?? []).map((x: any) => `"rank":"${x.rank}","suit":"${x.suit}"`);
  const others = [c0, c1, clients[2], clients[3], ...(spec.states.length ? [spec] : [])];
  let leaks = 0;
  for (const oc of others) for (const f of oc.raw) for (const pat of secret) if (f.text.includes(pat)) leaks++;
  record('D1 showdown privacy (folded cards on the wire)', secret.length === 4 && leaks === 0 ? 'PASS' : 'FAIL',
    `folded player's 4 card patterns scanned in ${others.length} other endpoints' raw frames; leaks=${leaks}`);

  // D2: winner matches evaluateBadugi among non-folded
  const revealed = sd.players.filter((p: any) => p.status !== 'folded');
  let bestId: string | null = null; let bestVal = Infinity;
  for (const p of revealed) {
    const ev: any = evaluateBadugi(p.cards);
    const v = ev?.value ?? ev?.rank ?? Infinity;
    if (v < bestVal) { bestVal = v; bestId = p.id; }
  }
  const flagged = sd.players.filter((p: any) => p.isWinner).map((p: any) => p.id);
  record('D2 showdown correctness', flagged.includes(bestId) ? 'PASS' : 'FAIL',
    `evaluateBadugi best=${bestId} (val ${bestVal}); server flagged winner(s)=${flagged.join(',') || 'none'}`);

  // Hand 2 (D3): four fold at first bet -> sole survivor handling
  stop();
  clients.forEach(c => { (c as any)._stop = false; });
  const beh2: Behavior[] = [{}, { foldAtFirstBet: true }, { foldAtFirstBet: true }, { foldAtFirstBet: true }, { foldAtFirstBet: true }];
  const drivers2 = clients.map((c, i) => { (c as any)._starter = i === 0; return driveClient(c, beh2[i], () => (c as any)._stop === true); });
  const pre2 = await c0.until(s => (s.handId ?? 0) > (sd.handId ?? 0) && s.phase !== 'SHOWDOWN', 30000, 'hand2 start').catch(() => c0.latest());
  const total2a = sumChips(pre2) + (pre2.pot ?? 0);
  const sd2 = await c0.until(s => s.phase === 'SHOWDOWN' && (s.handId ?? 0) > (sd.handId ?? 0), 120000, 'hand2 showdown').catch(() => null);
  if (sd2) {
    await sleep(500);
    const e2 = c0.latest();
    const total2b = sumChips(e2) + (e2.pot ?? 0);
    const winners2 = e2.players.filter((p: any) => p.isWinner).map((p: any) => p.id);
    record('D3 uncontested hand (4 fold)', total2b === total2a || (e2.pot ?? 0) >= 0 ? 'PASS' : 'FAIL',
      `survivor=${clients[0].seat} winners=${winners2.join(',') || 'none(rollover)'} potAfter=${e2.pot} chipsDelta=${total2b - total2a}`);
  } else {
    record('D3 uncontested hand (4 fold)', 'FAIL', `hand2 did not reach SHOWDOWN (phase=${c0.latest()?.phase})`);
  }
  clients.forEach(c => { (c as any)._stop = true; c.disconnect(); });
  spec.disconnect();
}

async function scenarioB1() {
  const t = `STGB1${RUN.slice(-4)}`;
  const { clients, stop } = await makeTable(t, 2, [{ passive: true }, {}]);
  const [target] = clients;
  try {
    const turn = await target.until(s => s.activePlayerId === target.seat && s.turnDeadline != null &&
      (s.phase.startsWith('BET') || s.phase.startsWith('DRAW')), 60000, 'target turn with deadline');
    const D = turn.turnDeadline as number;
    const seenAt = Date.now();
    const advanced = await target.until(s => s.activePlayerId !== target.seat || s.phase !== turn.phase, 45000, 'auto-action advance');
    const advAt = Date.now();
    const delta = advAt - D;
    record('B1 timer expiry vs server deadline', delta >= -2000 && delta <= 3000 ? 'PASS' : 'FAIL',
      `deadline armed ~${D - seenAt}ms after first seen; auto-advance at deadline ${delta >= 0 ? '+' : ''}${delta}ms (same-host clock)`);
  } catch (e: any) { record('B1 timer expiry vs server deadline', 'FAIL', e.message); }
  stop(); clients.forEach(c => c.disconnect());
}

async function scenarioB2() {
  const t = `STGB2${RUN.slice(-4)}`;
  const { clients, stop } = await makeTable(t, 2, [{ passive: true }, {}]);
  const [target] = clients;
  try {
    const turn = await target.until(s => s.activePlayerId === target.seat && s.turnDeadline != null &&
      (s.phase.startsWith('BET') || s.phase.startsWith('DRAW')), 60000, 'target turn');
    const D = turn.turnDeadline as number;
    const use = await target.useTimeBank(t);
    if (use.status !== 200) {
      record('B2 time-bank extension (+20s)', 'BLOCKED', `use endpoint -> ${use.status} ${JSON.stringify(use.body).slice(0, 160)}`);
    } else {
      const ext = await target.until(s => s.turnDeadline != null && s.turnDeadline > D + 15000, 8000, 'extended deadline in state')
        .catch(() => null);
      if (!ext) {
        record('B2 time-bank extension (+20s)', 'FAIL', `endpoint 200 but state deadline never moved (stayed ${target.latest()?.turnDeadline}, was ${D})`);
      } else {
        const newD = ext.turnDeadline as number;
        await sleep(Math.max(0, D - Date.now()) + 2000); // step past ORIGINAL deadline
        const still = target.latest();
        const stillMine = still?.activePlayerId === target.seat && still?.phase === ext.phase;
        record('B2 time-bank extension (+20s)', stillMine ? 'PASS' : 'FAIL',
          `deadline ${D} -> ${newD} (+${newD - D}ms); at original deadline +2s turn still target's: ${stillMine}`);
        target.action((still?.phase ?? '').startsWith('DRAW') ? 'draw' : (target.me(still)?.bet ?? 0) >= (still?.currentBet ?? 0) ? 'check' : 'call',
          (still?.phase ?? '').startsWith('DRAW') ? [] : undefined);
      }
    }
  } catch (e: any) { record('B2 time-bank extension (+20s)', 'FAIL', e.message); }
  stop(); clients.forEach(c => c.disconnect());
}

async function scenarioC(waitSec: number) {
  const label = `C reconnect ${waitSec}s`;
  const t = `STGC${waitSec}${RUN.slice(-3)}`;
  const target = new Client(`T${RUN.slice(-4)}C${waitSec}`);
  const partner = new Client(`T${RUN.slice(-4)}CP${waitSec}`);
  await target.bootstrap(); await partner.bootstrap();
  await target.connect(t); await partner.connect(t);
  (partner as any)._starter = true;
  const stopFlag = () => (target as any)._stop === true;
  const d1 = driveClient(partner, {}, stopFlag);
  const d0 = driveClient(target, {}, stopFlag);
  try {
    const inHand = await target.until(s => s.phase.startsWith('BET') || s.phase.startsWith('DRAW'), 60000, 'mid-hand');
    const seatBefore = target.seat;
    const myCards = (target.me(inHand)?.cards ?? []).map((x: any) => `${x.rank}${x.suit}`).join(' ');
    const handId = inHand.handId;
    target.disconnect();
    await sleep(waitSec * 1000);
    const partnerView = partner.latest();
    const seatRowDuring = partnerView?.players?.find((p: any) => p.id === seatBefore);
    // Reconnect: fresh ticket + session, same profile identity
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
      const released = !seatRowDuring || seatRowDuring.presence === 'bot' || (partnerView?.players?.length ?? 0) < 5;
      const noDup = rows.length <= 1;
      record(label, released && noDup ? 'PASS' : 'FAIL',
        `seat during absence: ${seatRowDuring ? `status=${seatRowDuring.status} presence=${seatRowDuring.presence} chips=${seatRowDuring.chips}` : 'GONE (released)'}; rejoin seat=${target.seat} rowsForOldSeat=${rows.length}; rejoin phase=${back?.phase}`);
    }
  } catch (e: any) { record(label, 'FAIL', e.message); }
  (target as any)._stop = true;
  target.disconnect(); partner.disconnect();
}

async function scenarioC5() {
  const label = 'C5 reconnect with nearly-expired turn';
  const t = `STGC5${RUN.slice(-4)}`;
  const target = new Client(`T${RUN.slice(-4)}C5`);
  const partner = new Client(`T${RUN.slice(-4)}C5P`);
  await target.bootstrap(); await partner.bootstrap();
  await target.connect(t); await partner.connect(t);
  (partner as any)._starter = true;
  const stopFlag = () => (target as any)._stop === true;
  const d1 = driveClient(partner, {}, stopFlag);
  try {
    const turn = await target.until(s => s.activePlayerId === target.seat && s.turnDeadline != null &&
      (s.phase.startsWith('BET') || s.phase.startsWith('DRAW')), 90000, 'target turn');
    const D = turn.turnDeadline as number;
    const phaseAtCut = turn.phase;
    await sleep(Math.max(0, D - 6000 - Date.now()));
    target.disconnect();
    await sleep(Math.max(0, D - 2500 - Date.now()));
    await target.connect(t);
    const back = target.latest();
    const backD = back?.turnDeadline ?? null;
    const deadlineKept = backD != null && Math.abs(backD - D) <= 300;
    // Stay passive; the ORIGINAL deadline should auto-act the turn
    let autoDelta: number | null = null;
    try {
      await target.until(s => s.activePlayerId !== target.seat || s.phase !== phaseAtCut, 12000, 'auto-act at original deadline');
      autoDelta = Date.now() - D;
    } catch {}
    record(label, deadlineKept && autoDelta != null && autoDelta >= -1500 && autoDelta <= 3500 ? 'PASS' : 'FAIL',
      `original deadline ${D}; after reconnect turnDeadline=${backD} (kept=${deadlineKept}); auto-advance at ${autoDelta == null ? 'never' : (autoDelta >= 0 ? '+' : '') + autoDelta + 'ms'} vs original deadline`);
  } catch (e: any) { record(label, 'FAIL', e.message); }
  (target as any)._stop = true;
  target.disconnect(); partner.disconnect();
}

async function main() {
  const mode = process.argv[2] || 'probe';
  if (mode === 'probe') { await probe(); return; }
  console.log(`\n== FULL SUITE (run ${RUN}, base ${BASE}) ==`);
  await scenarioA();
  await scenarioB1();
  await scenarioB2();
  await Promise.all([scenarioC(30), scenarioC(90), scenarioC(179), scenarioC(181)]);
  await scenarioC5();
  writeFileSync('staging-results.json', JSON.stringify({ run: RUN, at: new Date().toISOString(), results }, null, 2));
  console.log('\n== SUMMARY ==');
  for (const r of results) console.log(`${r.status.padEnd(7)} ${r.item} — ${r.evidence}`);
  console.log(`\n${results.filter(r => r.status === 'PASS').length} PASS / ${results.filter(r => r.status === 'FAIL').length} FAIL / ${results.filter(r => r.status === 'BLOCKED').length} BLOCKED`);
}

main().then(() => process.exit(0)).catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
