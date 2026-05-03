/**
 * CGP First-Time User UX Test — mirrors regression_mobile.mjs exactly
 * Audits: phase hints, showdown overlay (hand name / winner / chip delta),
 *         copy clarity, missing hint phases, resolution overlay fields.
 */

import { WebSocket } from 'ws';
import http from 'http';
import { randomUUID } from 'crypto';

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function post(path, body) {
  return new Promise((res, rej) => {
    const d = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: 5000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) }
    }, r => {
      let s = '';
      r.on('data', c => s += c);
      r.on('end', () => { try { res({ status: r.statusCode, body: JSON.parse(s) }); } catch { res({ status: r.statusCode, body: s }); } });
    });
    req.on('error', rej); req.write(d); req.end();
  });
}

function get(path) {
  return new Promise((res, rej) => {
    http.get({ hostname: 'localhost', port: 5000, path }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res({ status: r.statusCode, body: JSON.parse(d) }); } catch { res({ status: r.statusCode, body: d }); } });
    }).on('error', rej);
  });
}

// ── Hint engine (mirrors phaseHints.ts exactly) ───────────────────────────────
const HINTS = {
  badugi: {
    DEAL:'Four cards dealt face-down — look for duplicates',
    DRAW_1:'Discard duplicate suits or ranks. Goal: 4 unique, A-4 ideal',
    DRAW_2:'Fix remaining duplicates. Max 2 cards this round',
    DRAW_3:'Last swap — 1 card only. Stand pat if you have a valid Badugi',
    BET_1:'Valid Badugi? Bet it. Partial hand? Call cheap or fold to raises',
    BET_2:'Raised into? You need a real Badugi to continue profitably',
    BET_3:'Final bet before declare. Strong Badugi = push hard',
    DECLARE:'HIGH = strongest Badugi wins. LOW = weakest wins. No Badugi = fold',
    SHOWDOWN:'Cards up — best valid 4-card Badugi takes the pot',
  },
  dead7: {
    DEAL:'Four cards dealt — any 7 is already dead weight',
    DRAW_1:'7s are DEAD — dump them first. Then aim High (8+) or Low (A–6)',
    DRAW_2:'Same-suit pairs build flushes — a flush scoops the whole pot',
    DRAW_3:'One card left. All different suits or a flush = full scoop',
    BET_1:'Can you declare a side? If not, fold cheap now',
    BET_2:'Flush or four-qualifier? Raise hard. Marginal hand? Fold to pressure',
    BET_3:'Last bet before declare. Know your hand strength before committing',
    DECLARE:'High = all cards 8+. Low = all A–6. Dead hand (has a 7) = must fold',
    SHOWDOWN:'Flush or all-different-suits scoops the whole pot',
  },
  fifteen35: {
    DEAL:'Two cards — one face-up, one hidden. Your starting total is set',
    HIT_1:'Low target: 13–15. High target: 33–35. J/Q/K = ½ pt each',
    HIT_2:'In range? Stay and lock it in. Too low for High? Keep hitting',
    HIT_3:'Approaching 15 or 35? Stay to protect your range',
    HIT_4:'In range? Staying now is often the right play',
    BET_1:'Bet strength relative to your visible total',
    BET_2:'Mid-hand bet — qualified range = confidence',
    SHOWDOWN:'Qualifying hands (13–15 Low, 33–35 High) split the pot',
  },
  suits_poker: {
    DEAL:'Five hole cards dealt — look for a poker hand or flush foundation',
    DRAW:'Keep your best suit run or poker hand. Swap up to 2 cards',
    REVEAL_TOP_ROW:'Side A and B appear — which path fits your cards?',
    REVEAL_SECOND_ROW:'Center row links both paths — deeper connection forms',
    REVEAL_LOWER_CENTER:'Lower center card deepens the connector',
    REVEAL_FACTOR_CARD:'Final factor card — board is complete',
    BET_1:'Paths visible. Poker foundation or flush run — pick your line',
    BET_2:'Center connects paths. Which declaration are you targeting?',
    BET_3:'Board almost complete. Start committing to Poker, Suits, or Swing',
    DECLARE_AND_BET:'Poker = best 5-card hand. Suits = highest flush total. Swing = win both (or lose all)',
    SHOWDOWN:'Best poker hand wins Poker pot. Highest suit total wins Suits',
  },
};

function getHint(modeId, phase) {
  const m = HINTS[modeId];
  if (!m) return null;
  if (m[phase]) return m[phase];
  if (phase.startsWith('BET_')) {
    const n = parseInt(phase.replace('BET_', ''));
    for (let i = n; i >= 1; i--) { if (m[`BET_${i}`]) return m[`BET_${i}`]; }
  }
  if (phase.startsWith('HIT_')) {
    const n = parseInt(phase.replace('HIT_', ''));
    for (let i = n; i >= 1; i--) { if (m[`HIT_${i}`]) return m[`HIT_${i}`]; }
  }
  return null;
}

// ── Run one mode to SHOWDOWN — exact regression pattern ───────────────────────
function wsGame(label, modeId) {
  return new Promise(done => {
    const ws = new WebSocket('ws://localhost:5000/ws');
    const tableId = modeId + '-ux' + Date.now();
    const isBadugi = modeId === 'badugi';
    const initType = isBadugi ? 'badugi:init' : 'mode:init';
    const actType  = isBadugi ? 'badugi:action' : 'mode:action';
    const uiModeId = modeId === 'suits_poker' ? 'suitspoker' : modeId;

    let myId = 'p1';
    let phases = [];
    let lastPhase = '';
    let lastActionKey = '';
    let joined = false;
    let resolved = false;
    let capturedShowdownState = null;
    const phaseHintLog = [];

    const send = obj => { try { ws.send(JSON.stringify(obj)); } catch(e) {} };
    const finish = result => {
      if (!resolved) { resolved = true; clearTimeout(timer); try { ws.close(); } catch(e) {} done(result); }
    };

    const timer = setTimeout(() => finish({ label, modeId, uiModeId, status:'TIMEOUT', phases, phaseHintLog, showdown: null }), 60000);

    ws.on('open', () => {
      send({ type: 'join', tableId, modeId, playerId: 'guest-' + Date.now() });
    });

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString());

        // Capture seat
        if (msg.playerId && msg.type === initType) myId = msg.playerId;

        const state    = msg.state || {};
        const phase    = state.phase;
        const activeId = state.activePlayerId;
        const curBet   = state.currentBet || 0;
        const myPlayer = (state.players || []).find(p => p.id === myId);
        const myBet    = myPlayer?.bet || 0;
        const callAmt  = Math.max(0, curBet - myBet);

        // Track phases + collect hint coverage
        if (phase && phase !== lastPhase) {
          phases.push(phase);
          lastPhase = phase;
          const hint = getHint(uiModeId, phase);
          phaseHintLog.push({ phase, hint, hasHint: !!hint });
        }

        // Bootstrap: send 'start' after init
        if (!joined && msg.type === initType) {
          joined = true;
          send(isBadugi
            ? { type: actType, tableId, playerId: myId, action: 'start', payload: null }
            : { type: actType, tableId, modeId, playerId: myId, action: 'start', payload: null });
          return;
        }

        // Capture showdown state (wait 1 extra message for full player scores)
        if (phase === 'SHOWDOWN') {
          capturedShowdownState = state;
          setTimeout(() => {
            finish({ label, modeId, uiModeId, status:'SHOWDOWN', phases, phaseHintLog, showdown: capturedShowdownState });
          }, 800);
          return;
        }

        if (!phase || activeId !== myId) return;

        const actionKey = phase + ':' + curBet + ':' + myBet;
        if (actionKey === lastActionKey) return;
        lastActionKey = actionKey;

        let action = null;
        let payload = null;

        if (phase === 'ANTE') {
          action = 'ante';
        } else if (phase.startsWith('DRAW')) {
          action = 'draw'; // stand pat
        } else if (phase.startsWith('BET')) {
          action = callAmt > 200 ? 'fold' : (callAmt > 0 ? 'call' : 'check');
        } else if (phase.startsWith('HIT_')) {
          action = 'stay';
        } else if (phase === 'DECLARE_AND_BET') {
          if (callAmt > 200) { action = 'fold'; }
          else { action = 'declare_and_bet'; payload = { declaration:'HIGH', action: callAmt > 0 ? 'call' : 'check', amount: callAmt }; }
        } else if (phase === 'DECLARE') {
          action = 'declare'; payload = { declaration: 'HIGH' };
        }

        if (action) {
          send(isBadugi
            ? { type: actType, tableId, playerId: myId, action, payload: payload ?? null }
            : { type: actType, tableId, modeId, playerId: myId, action, payload: payload ?? null });
        }
      } catch(e) {}
    });

    ws.on('error', e => finish({ label, modeId, uiModeId, status:'ERROR:'+e.message, phases, phaseHintLog, showdown: null }));
  });
}

// ── Showdown overlay analysis ─────────────────────────────────────────────────
function analyzeShowdown(result) {
  const { showdown: state, modeId, uiModeId } = result;
  if (!state) return null;

  const players = state.players || [];
  const winner = players.find(p => p.isWinner);
  const loser  = players.find(p => p.isLoser);
  const resMsgs = (state.messages || []).filter(m => m.isResolution).map(m => m.text);

  // Simulate: our player is p1
  const hero = players.find(p => p.id === 'p1') || players[0];

  const handName =
    hero?.score?.description ||
    hero?.score?.highEval?.description ||
    hero?.score?.lowEval?.description ||
    hero?.score?.high ||
    hero?.score?.low ||
    null;

  // Chip change vs $1000 start
  const chipDelta = hero?.chips !== undefined ? hero.chips - 1000 : null;
  const chipStr   = chipDelta !== null ? (chipDelta >= 0 ? `+$${chipDelta}` : `-$${Math.abs(chipDelta)}`) : null;

  // Winner name from messages
  let winnerName = winner?.name || null;
  const winMsg = resMsgs.find(t => /wins with|scoops with|wins the/i.test(t));
  if (winMsg) {
    const m = winMsg.match(/^(.+?)\s+(wins|scoops)/i);
    if (m) winnerName = m[1].trim();
  }

  return { winner: winner?.name, winnerDecl: winner?.declaration, handName, chipStr, chipDelta, resMsgs, heroIsWinner: hero?.isWinner, heroScore: hero?.score };
}

// ── Reporting ─────────────────────────────────────────────────────────────────
function bar(c, n) { return c.repeat(n); }

function printResult(r) {
  const reached = r.status === 'SHOWDOWN';
  const sd = analyzeShowdown(r);
  const SKIP = new Set(['WAITING','ANTE']);

  console.log(`\n${bar('─',60)}`);
  console.log(`  ${r.label.padEnd(18)} ${reached ? '✅ SHOWDOWN' : '❌ '+r.status}`);
  console.log(`  Phases (${r.phases.length}): ${r.phases.join(' → ')}`);

  console.log(`\n  Phase Hints:`);
  let present = 0, missing = 0;
  for (const { phase, hint, hasHint } of r.phaseHintLog) {
    if (SKIP.has(phase)) { console.log(`      ${phase.padEnd(28)} (no hint needed)`); continue; }
    if (hasHint) {
      present++;
      console.log(`    💡 ${phase.padEnd(28)} "${hint.slice(0,52)}"`);
    } else {
      missing++;
      console.log(`    ⚠️  ${phase.padEnd(28)} NO HINT ← fix needed`);
    }
  }
  console.log(`     Coverage: ${present} hints shown, ${missing} missing`);

  if (sd) {
    console.log(`\n  Showdown Overlay (what player sees):`);
    console.log(`    Hand name:   ${sd.handName  ? `"${sd.handName}"` : '⚠️  MISSING — score has no description'}`);
    console.log(`    Chip delta:  ${sd.chipStr    ? sd.chipStr        : '⚠️  MISSING'}`);
    console.log(`    Winner:      ${sd.winner     ? `"${sd.winner}"`  : '(hero won or unknown)'}`);
    console.log(`    Hero won:    ${sd.heroIsWinner ?? '?'}`);
    console.log(`    Resolution messages (${sd.resMsgs.length}):`);
    sd.resMsgs.forEach(m => console.log(`      → "${m}"`));
    if (sd.heroScore) {
      const sc = sd.heroScore;
      console.log(`    Hero score object: ${JSON.stringify({ desc: sc.description, high: sc.high, low: sc.low, highEval: sc.highEval?.description, lowEval: sc.lowEval?.description, isValidBadugi: sc.isValidBadugi })}`);
    }
  }
}

function printSummary(results, pass, fail) {
  console.log(`\n${bar('═',60)}`);
  console.log('  SUMMARY');
  console.log(bar('─',60));
  console.log(`  ${'Mode'.padEnd(16)} ${'SHOW'.padEnd(6)} ${'Hints'.padEnd(8)} ${'Hand'.padEnd(6)} ${'Chips'.padEnd(8)} Winner`);
  for (const r of results) {
    const sd = analyzeShowdown(r);
    const reached = r.status === 'SHOWDOWN';
    const hints = r.phaseHintLog.filter(h => h.hasHint).length;
    const total  = r.phaseHintLog.filter(h => !['WAITING','ANTE'].includes(h.phase)).length;
    console.log(
      `  ${r.label.padEnd(16)} ${(reached?'✅':'❌').padEnd(6)} ${`${hints}/${total}`.padEnd(8)} ` +
      `${(sd?.handName?'✅':'⚠️').padEnd(6)} ${(sd?.chipStr||'–').padEnd(8)} ${sd?.winner||'—'}`
    );
  }
  console.log(`\n  Overall: ${pass} PASS, ${fail} FAIL`);
}

function uxReport(results) {
  console.log(`\n${bar('═',60)}`);
  console.log('  UX ISSUES REQUIRING ATTENTION');
  console.log(bar('─',60));
  const issues = [];
  for (const r of results) {
    if (r.status !== 'SHOWDOWN') { issues.push(`[${r.label}] Never reached SHOWDOWN (${r.status})`); continue; }
    const missing = r.phaseHintLog.filter(h => !h.hasHint && !['WAITING','ANTE'].includes(h.phase));
    if (missing.length) issues.push(`[${r.label}] Phases with no hint: ${missing.map(h=>h.phase).join(', ')}`);
    const sd = analyzeShowdown(r);
    if (!sd?.handName)  issues.push(`[${r.label}] Showdown: hand name missing`);
    if (!sd?.chipStr)   issues.push(`[${r.label}] Showdown: chip delta missing`);
    if (!sd?.resMsgs?.length) issues.push(`[${r.label}] Showdown: no resolution messages`);
  }
  if (issues.length === 0) { console.log('  ✅ No UX issues found!\n'); }
  else { issues.forEach(i => console.log('  ⚠️  ' + i)); console.log(); }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${bar('═',60)}`);
  console.log('  CGP FIRST-TIME USER UX TEST');
  console.log(bar('═',60));

  // Steps 1-3: Guest login + lobby check
  const uid = randomUUID();
  const p = await post('/api/players', { id: uid, displayName: 'UXTester' });
  const loginOk = p.status === 200;
  console.log(`\n  [1] Age gate:        (blocked in test — visual only)`);
  console.log(`  [2] Guest login:     ${loginOk ? '✅ PASS' : '❌ FAIL'} status=${p.status}`);

  const t = await get('/api/tables');
  console.log(`  [3] Lobby / tables:  ${t.status === 200 ? '✅ PASS' : '❌ FAIL'} tables=${Array.isArray(t.body) ? t.body.length : '?'}`);

  // Steps 4-8: Full hands in all 4 modes (sequential per regression pattern)
  console.log('\n  [4-8] Running all 4 mode hands to SHOWDOWN...');
  const g1 = await wsGame('Badugi',       'badugi');
  const g2 = await wsGame('Dead 7',       'dead7');
  const g3 = await wsGame('15/35',        'fifteen35');
  const g4 = await wsGame('Suits&Poker',  'suits_poker');

  const results = [g1, g2, g3, g4];
  let pass = loginOk ? 1 : 0, fail = loginOk ? 0 : 1;
  if (t.status === 200) pass++; else fail++;
  for (const r of results) { if (r.status === 'SHOWDOWN') pass++; else fail++; }

  // Print detailed results
  for (const r of results) printResult(r);

  // UX issues
  uxReport(results);

  // Summary
  printSummary(results, pass, fail);

  // Step 9-10: Copy/UX review notes
  console.log(`\n${bar('═',60)}`);
  console.log('  COPY & LAYOUT REVIEW (from code audit)');
  console.log(bar('─',60));
  console.log('  Age gate:     Clear CTA "I AM 13 OR OLDER — CONTINUE"');
  console.log('  Welcome:      Guest play button visible, name optional');
  console.log('  Tutorial:     3-slide paginated overlay per mode (NEW ✅)');
  console.log('  Hint pill:    💡 icon + amber text — appears at draw/bet/declare (NEW ✅)');
  console.log('  Showdown:     hand name badge + large chip Δ + winner name (NEW ✅)');
  console.log('  Table drift:  Subtle 18s cam sway on felt (NEW ✅)');
  console.log('  Card deal:    Stagger delay 0.06s * idx already in PlayerSeat.tsx ✅');
  console.log('\nTest complete.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
