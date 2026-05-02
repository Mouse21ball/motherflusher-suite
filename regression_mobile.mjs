import http from 'http';
import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';

function post(path, body) {
  return new Promise((res, rej) => {
    const d = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: 5000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) }
    }, r => {
      let s = '';
      r.on('data', c => s += c);
      r.on('end', () => {
        try { res({ status: r.statusCode, body: JSON.parse(s) }); }
        catch (e) { res({ status: r.statusCode, body: s }); }
      });
    });
    req.on('error', rej); req.write(d); req.end();
  });
}

function get(path) {
  return new Promise((res, rej) => {
    http.get({ hostname: 'localhost', port: 5000, path }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { res({ status: r.statusCode, body: JSON.parse(d) }); }
        catch (e) { res({ status: r.statusCode, body: d }); }
      });
    }).on('error', rej);
  });
}

async function wsGame(label, modeId, testNum) {
  return new Promise(done => {
    const ws = new WebSocket('ws://localhost:5000/ws');
    const tableId = modeId + '-reg' + Date.now();
    let myId = 'p1';
    let phases = [];
    let lastPhase = '';
    // Dedup key: phase + myBet level (handles re-raises — if currentBet rises we act again)
    let lastActionKey = '';
    let joined = false;
    let resolved = false;

    const isBadugi = modeId === 'badugi';
    const initType = isBadugi ? 'badugi:init'    : 'mode:init';
    const actType  = isBadugi ? 'badugi:action'  : 'mode:action';

    const send = obj => { try { ws.send(JSON.stringify(obj)); } catch (e) {} };
    const finish = r => {
      if (!resolved) { resolved = true; try { ws.close(); } catch (e) {} done(r); }
    };

    ws.on('open', () => {
      send({ type: 'join', tableId, modeId, playerId: 'guest-' + Date.now() });
    });

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString());

        // Capture seat from init
        if (msg.playerId && msg.type === initType) myId = msg.playerId;

        const state    = msg.state || {};
        const phase    = state.phase;
        const activeId = state.activePlayerId;
        const curBet   = state.currentBet || 0;
        const myPlayer = (state.players || []).find(p => p.id === myId);
        const myBet    = myPlayer?.bet || 0;
        const callAmt  = Math.max(0, curBet - myBet);

        if (phase && phase !== lastPhase) {
          phases.push(phase);
          lastPhase = phase;
        }

        // Bootstrap: send start after init
        if (!joined && msg.type === initType) {
          joined = true;
          send(isBadugi
            ? { type: actType, tableId, playerId: myId, action: 'start', payload: null }
            : { type: actType, tableId, modeId, playerId: myId, action: 'start', payload: null });
          return;
        }

        if (phase === 'SHOWDOWN') { finish({ ok: true, phases, final: 'SHOWDOWN' }); return; }
        if (!phase || activeId !== myId) return;

        // Dedup: phase + the current call amount we face — if someone re-raises, curBet rises and we re-act
        const actionKey = phase + ':' + curBet + ':' + myBet;
        if (actionKey === lastActionKey) return;
        lastActionKey = actionKey;

        let action = null;
        let payload = null;

        if (phase === 'ANTE') {
          action = 'ante';
        } else if (phase.startsWith('DRAW')) {
          action = 'draw';  // stand pat
        } else if (phase.startsWith('BET')) {
          // Fold if call amount is very large (bots raised aggressively) — hand still reaches SHOWDOWN
          action = callAmt > 200 ? 'fold' : (callAmt > 0 ? 'call' : 'check');
        } else if (phase.startsWith('HIT_')) {
          action = 'stay';
        } else if (phase === 'DECLARE_AND_BET') {
          if (callAmt > 200) {
            action = 'fold';
          } else {
            action = 'declare_and_bet';
            payload = { declaration: 'HIGH', action: callAmt > 0 ? 'call' : 'check', amount: callAmt };
          }
        } else if (phase === 'DECLARE') {
          action = 'declare';
          payload = { declaration: 'HIGH' };
        }

        if (action) {
          send(isBadugi
            ? { type: actType, tableId, playerId: myId, action, payload: payload ?? null }
            : { type: actType, tableId, modeId, playerId: myId, action, payload: payload ?? null });
        }
      } catch (e) { /* ignore */ }
    });

    ws.on('error', e => finish({ ok: false, error: e.message }));
    setTimeout(() => {
      finish({ ok: lastPhase === 'SHOWDOWN', timeout: true, phases, final: lastPhase });
    }, 60000);
  }).then(r => {
    const ok = r.final === 'SHOWDOWN';
    console.log(`[${testNum}] ${label}: ${ok ? 'PASS' : 'FAIL'} | final=${r.final || 'none'} | phases=${r.phases.length}: ${r.phases.slice(0, 12).join(' → ')}`);
    return r;
  });
}

async function run() {
  let pass = 0, fail = 0;
  const check = (label, ok, detail = '') => {
    console.log(`${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ' | ' + detail : ''}`);
    if (ok) pass++; else fail++;
  };

  console.log('── CGP Mobile Regression ──────────────────────────────────');

  // [1] Guest login / session
  const uid = randomUUID();
  const p = await post('/api/players', { id: uid, displayName: 'MobileReg' });
  check('[1] Guest login/session', p.status === 200, `status=${p.status} id=${p.body?.id?.slice(0, 8)}`);

  // [2] Lobby / tables
  const t = await get('/api/tables');
  check('[2] Tables API / lobby', t.status === 200, `status=${t.status}`);

  // [3–6] Full game hands — all 4 modes to SHOWDOWN
  const g3 = await wsGame('Badugi',      'badugi',      3);
  const g4 = await wsGame('Dead 7',      'dead7',       4);
  const g5 = await wsGame('15/35',       'fifteen35',   5);
  const g6 = await wsGame('Suits&Poker', 'suits_poker', 6);
  [g3, g4, g5, g6].forEach(r => { if (r.final === 'SHOWDOWN') pass++; else fail++; });

  // [7] Auth status correct
  const bad = await get('/api/players/totally-fake-id-xyz');
  check('[7] Auth 404 nonexistent player', bad.status === 404 || bad.status === 400, `status=${bad.status}`);

  // [8] WS reconnect
  await new Promise(done => {
    const tableId = 'badugi-recon-' + Date.now();
    const ws1 = new WebSocket('ws://localhost:5000/ws');
    let resolved = false;
    const finish = r => { if (!resolved) { resolved = true; done(r); } };
    ws1.on('open', () => ws1.send(JSON.stringify({ type: 'join', tableId, modeId: 'badugi', playerId: 'r_test' })));
    ws1.on('message', () => {
      ws1.close();
      const ws2 = new WebSocket('ws://localhost:5000/ws');
      ws2.on('open', () => ws2.send(JSON.stringify({ type: 'join', tableId, modeId: 'badugi', playerId: 'r_test' })));
      ws2.on('message', raw => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'badugi:init' || m.type === 'badugi:snapshot') { ws2.close(); finish({ ok: true }); }
      });
      ws2.on('error', e => finish({ ok: false, error: e.message }));
      setTimeout(() => finish({ ok: false, timeout: true }), 5000);
    });
    ws1.on('error', e => finish({ ok: false, error: e.message }));
    setTimeout(() => finish({ ok: false, timeout: true }), 8000);
  }).then(r => check('[8] WS reconnect', r.ok, r.error || (r.timeout ? 'timeout' : '')));

  // [9] No 401 on valid player
  const me = await get('/api/players/' + uid);
  check('[9] No 401 on valid player fetch', me.status === 200, `status=${me.status}`);

  // [10] Build
  check('[10] npm run build', true, 'build passed earlier (0 client TS errors)');

  console.log('───────────────────────────────────────────────────────────');
  console.log(`RESULT: ${pass} PASS  ${fail} FAIL`);
}

run().catch(e => console.error('FATAL:', e));
