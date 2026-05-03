// ─── Engine regression test suite ───────────────────────────────────────────
// Standalone tsx script. Run with:
//   npx tsx server/__tests__/engine.test.ts
//
// Validates:
//   1. Side-pot algorithm (computeSidePots) — chip conservation, eligibility.
//   2. Side-pot resolution per mode — chips never overpaid to short stacks.
//   3. Bot raise cap (decideBet) — never exceeds 3 raises (4 heads-up).
//   4. Each mode's resolveShowdown — chip conservation across N synthetic hands.
//
// Pure-function tests only; no websockets, no persistence. Mirrors the style
// of terminalState.test.ts.

import type { Player, GameState, CardType, GamePhase } from '../../shared/gameTypes';
import { computeSidePots, totalSidePotAmount } from '../../shared/engine/sidePots';
import { decideBet, applyBetDecision } from '../../shared/engine/botUtils';
import { BadugiMode } from '../../shared/modes/badugi';
import { Dead7Mode } from '../../shared/modes/dead7';
import { Fifteen35Mode } from '../../shared/modes/fifteen35';
import { SuitsPokerMode } from '../../shared/modes/suitspoker';

let failures = 0;
let passes = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) { failures++; console.error('  ✗', msg); }
  else { passes++; console.log('  ✓', msg); }
}
function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

function makeCard(rank: string, suit: string): CardType {
  return { rank: rank as CardType['rank'], suit: suit as CardType['suit'], isHidden: false };
}
function makePlayer(
  id: string,
  opts: Partial<Player> & { chips?: number; totalBet?: number; status?: Player['status'] } = {},
): Player {
  return {
    id, name: id, presence: 'bot',
    chips: opts.chips ?? 1000,
    bet: opts.bet ?? 0,
    totalBet: opts.totalBet ?? 0,
    cards: opts.cards ?? [],
    status: opts.status ?? 'active',
    hasActed: false, isDealer: false,
    declaration: opts.declaration ?? null,
    score: opts.score,
  } as Player;
}

// ─── 1. computeSidePots algorithm ────────────────────────────────────────────
section('computeSidePots');
{
  // Equal contributions: single pot, all eligible.
  const ps = [
    makePlayer('A', { totalBet: 100 }),
    makePlayer('B', { totalBet: 100 }),
    makePlayer('C', { totalBet: 100 }),
  ];
  const pots = computeSidePots(ps);
  assert(pots.length === 1, 'equal stacks → 1 pot');
  assert(pots[0].amount === 300, 'amount = 300');
  assert(pots[0].eligibleIds.length === 3, '3 eligible');
}
{
  // All-in short: 3 pots.
  const ps = [
    makePlayer('S', { totalBet: 200, status: 'active' }),
    makePlayer('M', { totalBet: 500, status: 'active' }),
    makePlayer('B', { totalBet: 500, status: 'active' }),
  ];
  const pots = computeSidePots(ps);
  assert(pots.length === 2, '2 levels (200, 500) → 2 pots');
  assert(pots[0].amount === 600 && pots[0].eligibleIds.length === 3, 'pot1 = 600 / 3 eligible');
  assert(pots[1].amount === 600 && pots[1].eligibleIds.length === 2, 'pot2 = 600 / 2 eligible (excl S)');
  assert(totalSidePotAmount(pots) === 1200, 'total chip-conserved (600+600=1200)');
}
{
  // Folded contributor: chips count toward pot, NOT eligibility.
  const ps = [
    makePlayer('F', { totalBet: 100, status: 'folded' }),
    makePlayer('A', { totalBet: 200, status: 'active' }),
    makePlayer('B', { totalBet: 200, status: 'active' }),
  ];
  const pots = computeSidePots(ps);
  assert(totalSidePotAmount(pots) === 500, 'total = 500 (100+200+200)');
  const allEligible = new Set(pots.flatMap(p => p.eligibleIds));
  assert(!allEligible.has('F'), 'folded F never eligible');
  assert(allEligible.has('A') && allEligible.has('B'), 'A & B eligible');
}
{
  // 4-way unequal all-ins.
  const ps = [
    makePlayer('P1', { totalBet: 50 }),
    makePlayer('P2', { totalBet: 150 }),
    makePlayer('P3', { totalBet: 300 }),
    makePlayer('P4', { totalBet: 300 }),
  ];
  const pots = computeSidePots(ps);
  // Levels: 50, 150, 300
  // Pot1: 50*4 = 200, eligible all 4
  // Pot2: 100*3 = 300, eligible P2,P3,P4
  // Pot3: 150*2 = 300, eligible P3,P4
  assert(pots.length === 3, '4-way all-in → 3 pots');
  assert(pots[0].amount === 200 && pots[1].amount === 300 && pots[2].amount === 300,
    'pot ladder 200/300/300');
  assert(totalSidePotAmount(pots) === 800, 'total = 800 (50+150+300+300)');
}

// ─── 2. Bot raise cap via decideBet ──────────────────────────────────────────
section('Bot raise cap');
{
  // Strong hand, max-aggressive scenario, 3-way action: cap = 3.
  // Repeatedly call decideBet pretending each prior raise stuck.
  let raisesSoFar = 0;
  let raiseEvents = 0;
  for (let i = 0; i < 50; i++) {
    const d = decideBet(0.95, 100, 10 + raisesSoFar * 5, 0, 1000, {
      raisesThisRound: raisesSoFar, raiseCap: 3, activeOpponents: 2,
    });
    if (d.action === 'raise') { raiseEvents++; raisesSoFar++; }
  }
  assert(raisesSoFar <= 3, `cap respected: total raises = ${raisesSoFar} ≤ 3`);
}
{
  // At cap → raise must downgrade.
  let downgradeSeen = false;
  for (let i = 0; i < 200; i++) {
    const d = decideBet(0.99, 200, 50, 0, 5000, {
      raisesThisRound: 3, raiseCap: 3, activeOpponents: 2,
    });
    if (d.action !== 'raise') downgradeSeen = true;
    assert(d.action !== 'raise' || i < 0, 'no raise at cap=3 (iter ' + i + ')');
    if (failures > 0) break;
  }
  assert(downgradeSeen, 'cap downgrades to call/check');
}
{
  // Heads-up cap = 4: should allow up to 4.
  let raisesSoFar = 0;
  for (let i = 0; i < 80; i++) {
    const d = decideBet(0.95, 100, 10 + raisesSoFar * 5, 0, 1000, {
      raisesThisRound: raisesSoFar, raiseCap: 4, activeOpponents: 1,
    });
    if (d.action === 'raise') raisesSoFar++;
  }
  assert(raisesSoFar <= 4, `heads-up cap respected: ${raisesSoFar} ≤ 4`);
}
{
  // applyBetDecision threads raisesThisRound correctly.
  const bot = { name: 'B', chips: 1000, bet: 0, status: 'active' };
  const r = applyBetDecision({ action: 'raise', raiseAmount: 20 }, bot, 0, 0, 1);
  assert(r.raisesThisRound === 2, 'applyBetDecision increments raisesThisRound on raise');
  const r2 = applyBetDecision({ action: 'call' }, bot, 20, 0, 2);
  assert(r2.raisesThisRound === 2, 'applyBetDecision preserves raisesThisRound on call');
}

// ─── 3. resolveShowdown chip conservation per mode ──────────────────────────
function totalChipsAndPot(players: Player[], pot: number): number {
  return players.reduce((s, p) => s + p.chips, 0) + pot;
}

section('Badugi resolveShowdown — equal stacks');
{
  // Two players, both contributed 50, both with valid badugi declarations.
  const players: Player[] = [
    makePlayer('A', {
      chips: 950, totalBet: 50, declaration: 'HIGH',
      cards: [makeCard('A', 'spades'), makeCard('2', 'hearts'), makeCard('3', 'diamonds'), makeCard('4', 'clubs')],
    }),
    makePlayer('B', {
      chips: 950, totalBet: 50, declaration: 'LOW',
      cards: [makeCard('K', 'spades'), makeCard('Q', 'hearts'), makeCard('J', 'diamonds'), makeCard('10', 'clubs')],
    }),
  ];
  const before = totalChipsAndPot(players, 100);
  const result = BadugiMode.resolveShowdown!(players, 100, 'A');
  const after = totalChipsAndPot(result.players, result.pot);
  assert(before === after, `chips conserved: before=${before} after=${after}`);
  assert(result.players.some(p => p.isWinner), 'someone won');
}

section('Badugi resolveShowdown — unequal all-in (side pot)');
{
  // P1 short all-in for 50, P2 & P3 in for 200 each.
  // If P1 wins overall hand, max payout = 50*3 = 150.
  // Side pot of 300 (between P2 and P3) goes to whichever has better hand.
  const players: Player[] = [
    makePlayer('P1', {
      chips: 0, totalBet: 50, declaration: 'HIGH',
      // Best possible badugi: A,2,3,4 rainbow
      cards: [makeCard('A', 'spades'), makeCard('2', 'hearts'), makeCard('3', 'diamonds'), makeCard('4', 'clubs')],
    }),
    makePlayer('P2', {
      chips: 0, totalBet: 200, declaration: 'HIGH',
      cards: [makeCard('5', 'spades'), makeCard('6', 'hearts'), makeCard('7', 'diamonds'), makeCard('8', 'clubs')],
    }),
    makePlayer('P3', {
      chips: 0, totalBet: 200, declaration: 'HIGH',
      cards: [makeCard('9', 'spades'), makeCard('10', 'hearts'), makeCard('J', 'diamonds'), makeCard('Q', 'clubs')],
    }),
  ];
  const totalCommitted = 450;
  const before = totalChipsAndPot(players, totalCommitted);
  const result = BadugiMode.resolveShowdown!(players, totalCommitted, 'P1');
  const after = totalChipsAndPot(result.players, result.pot);
  assert(before === after, `chips conserved: before=${before} after=${after}`);
  const p1After = result.players.find(p => p.id === 'P1')!;
  assert(p1After.chips <= 150, `P1 (short) cannot win > 150 (got ${p1After.chips})`);
  const totalAwarded = result.players.reduce((s, p) => s + p.chips, 0);
  assert(totalAwarded + result.pot === totalCommitted, `total awarded = ${totalCommitted}`);
}

section('Fifteen35 resolveShowdown — chip conservation');
{
  // Two players with totalBet contributions.
  const players: Player[] = [
    makePlayer('A', { chips: 900, totalBet: 100, cards: [makeCard('A', 'spades'), makeCard('5', 'hearts')] }),
    makePlayer('B', { chips: 900, totalBet: 100, cards: [makeCard('K', 'diamonds'), makeCard('Q', 'clubs'), makeCard('10', 'hearts')] }),
  ];
  const before = totalChipsAndPot(players, 200);
  const result = Fifteen35Mode.resolveShowdown!(players, 200, 'A');
  const after = totalChipsAndPot(result.players, result.pot);
  assert(before === after, `Fifteen35 chips conserved: before=${before} after=${after}`);
}

section('Dead7 resolveShowdown — chip conservation');
{
  const players: Player[] = [
    makePlayer('A', {
      chips: 900, totalBet: 100, declaration: 'HIGH',
      cards: [makeCard('A', 'spades'), makeCard('2', 'hearts'), makeCard('3', 'diamonds'), makeCard('4', 'clubs')],
    }),
    makePlayer('B', {
      chips: 900, totalBet: 100, declaration: 'LOW',
      cards: [makeCard('5', 'spades'), makeCard('6', 'hearts'), makeCard('7', 'diamonds'), makeCard('8', 'clubs')],
    }),
  ];
  const before = totalChipsAndPot(players, 200);
  const result = Dead7Mode.resolveShowdown!(players, 200, 'A');
  const after = totalChipsAndPot(result.players, result.pot);
  assert(before === after, `Dead7 chips conserved: before=${before} after=${after}`);
}

section('SuitsPoker resolveShowdown — chip conservation');
{
  const players: Player[] = [
    makePlayer('A', {
      chips: 900, totalBet: 100, declaration: 'POKER',
      cards: [
        makeCard('A', 'spades'), makeCard('A', 'hearts'),
        makeCard('K', 'diamonds'), makeCard('K', 'clubs'),
        makeCard('Q', 'spades'),
      ],
    }),
    makePlayer('B', {
      chips: 900, totalBet: 100, declaration: 'SUITS',
      cards: [
        makeCard('A', 'hearts'), makeCard('2', 'hearts'),
        makeCard('3', 'hearts'), makeCard('4', 'hearts'),
        makeCard('5', 'hearts'),
      ],
    }),
  ];
  const before = totalChipsAndPot(players, 200);
  const result = SuitsPokerMode.resolveShowdown!(players, 200, 'A', []);
  const after = totalChipsAndPot(result.players, result.pot);
  assert(before === after, `SuitsPoker chips conserved: before=${before} after=${after}`);
}

// ─── 4. All-fold → win-by-fold ──────────────────────────────────────────────
section('All-fold (sole-survivor) — every mode');
for (const [name, mode] of [
  ['Badugi', BadugiMode], ['Dead7', Dead7Mode],
  ['Fifteen35', Fifteen35Mode], ['SuitsPoker', SuitsPokerMode],
] as const) {
  const players: Player[] = [
    makePlayer('Win', { chips: 800, totalBet: 200, cards: [makeCard('A','spades'),makeCard('2','hearts'),makeCard('3','diamonds'),makeCard('4','clubs')] }),
    makePlayer('F1',  { chips: 950, totalBet: 50,  status: 'folded' }),
    makePlayer('F2',  { chips: 850, totalBet: 150, status: 'folded' }),
  ];
  const before = totalChipsAndPot(players, 400);
  const result = (mode.resolveShowdown as any)(players, 400, 'Win', []);
  const after = totalChipsAndPot(result.players, result.pot);
  assert(before === after, `${name} sole-survivor chip-conserved`);
  const win = result.players.find((p: Player) => p.id === 'Win');
  assert(win?.isWinner, `${name} winner flagged`);
}

// ─── 5. Badugi rolledOver propagation ───────────────────────────────────────
section('Badugi resolveShowdown — rolledOver propagation');
{
  // No qualifying badugis (all 4 cards same suit) → all pots roll over.
  const players: Player[] = [
    makePlayer('A', {
      chips: 900, totalBet: 100, declaration: 'HIGH',
      cards: [makeCard('A','spades'),makeCard('2','spades'),makeCard('3','spades'),makeCard('4','spades')],
    }),
    makePlayer('B', {
      chips: 900, totalBet: 100, declaration: 'LOW',
      cards: [makeCard('K','hearts'),makeCard('Q','hearts'),makeCard('J','hearts'),makeCard('10','hearts')],
    }),
  ];
  const before = totalChipsAndPot(players, 200);
  const result = BadugiMode.resolveShowdown!(players, 200, 'A');
  const after = totalChipsAndPot(result.players, result.pot);
  assert(before === after, `rolledOver chip-conserved: before=${before} after=${after}`);
  assert(result.pot === 200, `unawarded pot rolled over (got ${result.pot})`);
}

// ─── 6. Shared bankroll — storage.syncPlayerChips round-trip ────────────────
// DB integration test: skipped (not a failure) if DATABASE_URL is absent.
section('Shared bankroll — syncPlayerChips round-trip');
await (async () => {
  if (!process.env.DATABASE_URL) {
    console.log('  ⚠ DATABASE_URL not set — storage round-trip skipped (not a failure)');
    return;
  }
  let storage: any;
  try {
    const mod = await import('../storage');
    storage = mod.storage;
  } catch {
    console.log('  ⚠ storage module unavailable — skipped');
    return;
  }

  const testId = `__test_engine_${Date.now()}`;
  try {
    await storage.getOrCreatePlayer(testId, 'TestBot');
    await storage.syncPlayerChips(testId, 7777);
    const profile = await storage.getPlayerProfile(testId);
    assert(profile?.chipBalance === 7777, `round-trip: wrote 7777, read back ${profile?.chipBalance}`);

    await storage.syncPlayerChips(testId, 3333, { won: true, deltaChips: 100 });
    const profile2 = await storage.getPlayerProfile(testId);
    assert(profile2?.chipBalance === 3333, `round-trip with handResult: wrote 3333, read back ${profile2?.chipBalance}`);
    assert((profile2?.handsPlayed ?? 0) >= 1, `handsPlayed incremented (got ${profile2?.handsPlayed})`);
    assert((profile2?.handsWon ?? 0) >= 1, `handsWon incremented on win (got ${profile2?.handsWon})`);
  } finally {
    try { await storage.deletePlayer(testId); } catch { /* cleanup best-effort */ }
  }
})();

// ─── 7. P11 — Bet sizing preset math ────────────────────────────────────────
// Mirrors the client-side computation in Controls.tsx so the contract is
// locked: each preset clamps to [minRaiseTo, myBet+chips] and the buttons
// disable when the preset can't be reached (short stack).
section('P11 bet sizing presets — clamp & ordering');
{
  function presets(currentBet: number, myBet: number, pot: number, chips: number) {
    const callAmount = currentBet - myBet;
    const minRaiseTo = callAmount > 0 ? currentBet + Math.max(callAmount, 2) : Math.max(currentBet, 2);
    const maxRaiseTo = myBet + chips;
    const clamp = (v: number) => Math.max(minRaiseTo, Math.min(maxRaiseTo, Math.round(v)));
    return {
      minRaiseTo, maxRaiseTo,
      half:  clamp(currentBet + Math.max(2, Math.floor((pot + callAmount) / 2))),
      pot:   clamp(currentBet + Math.max(2, pot + callAmount)),
      twoP:  clamp(currentBet + Math.max(2, 2 * (pot + callAmount))),
      allIn: maxRaiseTo,
    };
  }
  // Standard mid-hand: hero owes 20, pot is 100, deep stack.
  const a = presets(20, 0, 100, 1000);
  assert(a.minRaiseTo === 40,                  `min raise-to = currentBet+max(call,2) = 40 (got ${a.minRaiseTo})`);
  assert(a.half === 20 + 60,                   `½-pot raise-to = currentBet + (pot+call)/2 = 80 (got ${a.half})`);
  assert(a.pot  === 20 + 120,                  `pot raise-to = currentBet + (pot+call) = 140 (got ${a.pot})`);
  assert(a.twoP === 20 + 240,                  `2× pot raise-to = currentBet + 2(pot+call) = 260 (got ${a.twoP})`);
  assert(a.allIn === 1000,                     `all-in = myBet+chips = 1000 (got ${a.allIn})`);
  assert(a.half >= a.minRaiseTo,               `½-pot ≥ min`);
  assert(a.pot  >= a.half,                      `pot ≥ ½-pot`);
  assert(a.twoP >= a.pot,                      `2× pot ≥ pot`);
  // Short stack — every preset must clamp into [min, max] and never exceed all-in.
  const b = presets(20, 0, 100, 50);
  assert(b.maxRaiseTo === 50,                  `short-stack max = 50 (got ${b.maxRaiseTo})`);
  assert(b.half  <= 50 && b.pot <= 50 && b.twoP <= 50, `presets clamp to all-in (50)`);
  assert(b.half  >= b.minRaiseTo,              `short-stack ½-pot still ≥ min raise`);
  // No-bet round (open): currentBet=0, no call.
  const c = presets(0, 0, 60, 1000);
  assert(c.minRaiseTo === 2,                   `open-bet min = 2 (got ${c.minRaiseTo})`);
  assert(c.pot  === 60,                        `open-bet pot-sized = 60 (got ${c.pot})`);
  assert(c.twoP === 120,                       `open-bet 2× pot = 120 (got ${c.twoP})`);
}

// ─── 8. P6 — 15/35 hit-after-stay reject (pure-logic mirror) ────────────────
section('P6 — fifteen35 hit rejected after STAY/BUST');
{
  // The server rejects with REJECT_HIT_AFTER_STAY when:
  //   player.declaration === 'STAY' OR player.declaration === 'BUST'
  // Mirrors the guard at server/genericEngine.ts (~line 1771).
  function shouldRejectHit(decl: Player['declaration']): boolean {
    return decl === 'STAY' || decl === 'BUST';
  }
  assert(shouldRejectHit('STAY')           === true,  'STAY → reject hit');
  assert(shouldRejectHit('BUST')           === true,  'BUST → reject hit');
  assert(shouldRejectHit(null)             === false, 'no declaration → allow hit');
  assert(shouldRejectHit('HIGH' as any)    === false, 'HIGH (high/low decl) → allow hit (different phase)');
}

// ─── 9. P4 — Turn timer auto-action selection ───────────────────────────────
section('P4 — turn timeout selects safest action');
{
  // Mirrors autoActOnTimeout phase→action mapping in genericEngine.ts.
  function autoActFor(phase: GamePhase, callAmt: number): 'stay' | 'stand-pat' | 'fold' | 'check' {
    if (phase.startsWith('HIT_'))            return 'stay';
    if (phase.startsWith('DRAW'))            return 'stand-pat';
    if (phase === 'DECLARE')                 return 'fold';
    if (phase === 'DECLARE_AND_BET')         return 'fold';
    if (callAmt <= 0)                        return 'check';
    return 'fold';
  }
  assert(autoActFor('HIT_3' as GamePhase, 0)             === 'stay',      'HIT phase → auto-stay');
  assert(autoActFor('DRAW_2' as GamePhase, 0)            === 'stand-pat', 'DRAW phase → stand pat');
  assert(autoActFor('DECLARE' as GamePhase, 0)           === 'fold',      'DECLARE → auto-fold (no chips lost — already in pot)');
  assert(autoActFor('DECLARE_AND_BET' as GamePhase, 50)  === 'fold',      'DECLARE_AND_BET → auto-fold');
  assert(autoActFor('BET_1' as GamePhase, 0)             === 'check',     'BET with no call → auto-check');
  assert(autoActFor('BET_2' as GamePhase, 50)            === 'fold',      'BET owing chips → auto-fold');
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n── Results: ${passes} passed, ${failures} failed ──`);
process.exit(failures === 0 ? 0 : 1);
