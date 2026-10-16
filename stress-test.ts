// CGP shared-logic stress test — 10k+ hands per mode.
// Run: ./node_modules/.bin/tsx stress-test.ts
import { BadugiMode, evaluateBadugi } from './shared/modes/badugi.ts';
import { FlushedUpMode, evaluateFlushedUpHand } from './shared/modes/flushedUp.ts';
import { BoxChevyMode, evaluateBoxChevy10 } from './shared/modes/boxchevy.ts';
import {
  sidePotsForShowdown, computeSidePots, totalSidePotAmount,
  resolveSplitPots, resolveSwingSidePots,
} from './shared/engine/sidePots.ts';
import type { CardType, Player } from './shared/gameTypes.ts';

// ─── Seeded RNG (mulberry32) for reproducibility ────────────────────────────
let _s = 0x9e3779b9;
function seed(n: number) { _s = n >>> 0; }
function rnd(): number {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (n: number) => Math.floor(rnd() * n);
function pick<T>(arr: T[]): T { return arr[ri(arr.length)]; }

// ─── Helpers ────────────────────────────────────────────────────────────────
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
const SUITS = ['h','d','c','s'] as const;

function makeDeck(): CardType[] {
  const d: CardType[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ suit: s as any, rank: r as any, isHidden: true });
  return d;
}
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function makePlayer(id: string, chips: number): Player {
  return {
    id, name: id, chips, bet: 0, totalBet: 0, cards: [],
    status: 'active', isDealer: false, declaration: null, hasActed: true,
  } as Player;
}

// ─── Failure tracking ───────────────────────────────────────────────────────
interface Fail { test: string; hand: number; detail: string; snapshot?: any }
const fails: Fail[] = [];
const stats = { conservationChecks: 0, evals: 0, hands: 0 };
function fail(test: string, hand: number, detail: string, snapshot?: any) {
  if (fails.length < 25) fails.push({ test, hand, detail, snapshot });
}

// conservation: sum(chips)+pot must be equal before/after
function checkConservation(test: string, hand: number, before: Player[], potBefore: number, after: Player[], potAfter: number) {
  const tb = before.reduce((s, p) => s + p.chips, 0) + potBefore;
  const ta = after.reduce((s, p) => s + p.chips, 0) + potAfter;
  stats.conservationChecks++;
  if (tb !== ta) fail(test, hand, `CONSERVATION VIOLATION: before=${tb} after=${ta} (delta=${ta - tb})`);
  if (potAfter < 0) fail(test, hand, `NEGATIVE POT: ${potAfter}`);
  for (const p of after) if (p.chips < 0) fail(test, hand, `NEGATIVE CHIPS for ${p.id}: ${p.chips}`);
}

// ─── Full-hand simulation for one mode ──────────────────────────────────────
type Mode = 'badugi' | 'flushedUp' | 'boxchevy';
const MODES: Record<Mode, any> = { badugi: BadugiMode, flushedUp: FlushedUpMode, boxchevy: BoxChevyMode };

function simulateHand(mode: Mode, handNo: number, carriedPot: number): number {
  const M = MODES[mode];
  const n = 2 + ri(3); // 2..4 players
  const players: Player[] = [];
  for (let i = 0; i < n; i++) players.push(makePlayer(`p${i + 1}`, 200 + ri(5000)));

  // Deal from a fresh shuffled deck
  let community: CardType[] = [];
  try {
    const r = M.deal(shuffle(makeDeck()), players, 'p1');
    for (const rp of r.players) {
      const lp = players.find(p => p.id === rp.id)!;
      lp.cards = rp.cards;
    }
    community = r.communityCards ?? [];
  } catch (e: any) {
    fail(`${mode}-deal`, handNo, `DEAL CRASH: ${e?.message}`, { n });
    return carriedPot;
  }

  // Contributions (ante/bets), random stack depths incl. all-ins
  let pot = carriedPot;
  for (const p of players) {
    if (p.chips <= 0) continue;
    const contrib = Math.min(p.chips, 1 + ri(400));
    p.chips -= contrib;
    p.totalBet = (p.totalBet ?? 0) + contrib;
    pot += contrib;
  }

  // Random folds: 0..n-1 (bias toward some action)
  const foldCount = ri(n); // 0..n-1 → always at least 1 active
  const order = shuffle([...players]);
  for (let i = 0; i < foldCount; i++) order[i].status = 'folded';

  // Declarations
  for (const p of players) {
    if (p.status === 'folded') { p.declaration = 'FOLD'; continue; }
    if (mode === 'boxchevy') p.declaration = pick(['HIGH', 'LOW', 'SWING'] as const);
    else if (mode === 'badugi') p.declaration = rnd() < 0.15 ? null : pick(['HIGH', 'LOW'] as const);
  }

  const beforeChips = players.reduce((s, p) => s + p.chips, 0);
  let result: { players: Player[]; pot: number };
  try {
    result = mode === 'boxchevy'
      ? M.resolveShowdown(players, pot, 'p1', community)
      : mode === 'badugi'
        ? M.resolveShowdown(players, pot, 'p1')
        : M.resolveShowdown(players, pot);
  } catch (e: any) {
    fail(`${mode}-resolve`, handNo, `RESOLVE CRASH: ${e?.message}`, {
      n, pot, statuses: players.map(p => p.status), decls: players.map(p => p.declaration),
    });
    return pot; // treat as rollover on crash path accounting
  }
  checkConservation(`${mode}-hand`, handNo, players, pot, result.players, result.pot);
  stats.hands++;
  return result.pot; // carry rollover into next hand (chains rollover across sim)
}

// ─── 1) Card evaluation volume ──────────────────────────────────────────────
function testEvaluations() {
  const N = 10_000;
  for (let i = 0; i < N; i++) {
    try {
      const d = shuffle(makeDeck());
      const r = evaluateBadugi(d.slice(0, 4));
      stats.evals++;
      if (!r || typeof r.isValidBadugi !== 'boolean') fail('badugi-eval', i, 'bad return shape');
    } catch (e: any) { fail('badugi-eval', i, `CRASH: ${e?.message}`); }
  }
  for (let i = 0; i < N; i++) {
    try {
      const d = shuffle(makeDeck());
      const r = evaluateFlushedUpHand(d.slice(0, 5));
      stats.evals++;
      if (!r) fail('flushedup-eval', i, 'falsy return');
    } catch (e: any) { fail('flushedup-eval', i, `CRASH: ${e?.message}`); }
  }
  for (let i = 0; i < N; i++) {
    try {
      const d = shuffle(makeDeck());
      const r = evaluateBoxChevy10(d.slice(0, 5), d.slice(5, 10));
      stats.evals++;
      if (!r || typeof r.isMade !== 'boolean') fail('boxchevy-eval', i, 'bad return shape');
    } catch (e: any) { fail('boxchevy-eval', i, `CRASH: ${e?.message}`); }
  }
}

// ─── 2) sidePotsForShowdown allocation ───────────────────────────────────────
function testSidePots() {
  const N = 10_000;
  for (let i = 0; i < N; i++) {
    const n = 2 + ri(3);
    const players: Player[] = [];
    let contributed = 0;
    for (let k = 0; k < n; k++) {
      const p = makePlayer(`p${k + 1}`, 0);
      const tb = ri(4) === 0 ? 0 : 1 + ri(1000); // some may contribute 0
      p.totalBet = tb;
      contributed += tb;
      if (ri(5) === 0) p.status = 'folded';
      players.push(p);
    }
    // pot may include rollover carry-in (bigger) or be equal
    const pot = contributed + (ri(3) === 0 ? ri(2000) : 0);
    const eligible = players.filter(p => p.status !== 'folded').map(p => p.id);
    const pots = sidePotsForShowdown(players, pot, eligible);
    const sum = totalSidePotAmount(pots);
    if (sum !== pot) fail('sidepots-sum', i, `pots sum ${sum} !== pot ${pot}`, { n, contributed });
    // eligibility sanity: eligible ids must be non-folded players only
    for (const sp of pots) {
      for (const id of sp.eligibleIds) {
        const p = players.find(x => x.id === id)!;
        if (p.status === 'folded') fail('sidepots-elig', i, `folded player ${id} eligible`, { sp });
      }
      if (sp.amount <= 0) fail('sidepots-amt', i, `non-positive pot amount ${sp.amount}`);
    }
  }
}

// ─── 3) resolveSplitPots math: odd chip, ties, no-winner rollover ────────────
function testSplitMath() {
  const mk = (ids: string[]): Player[] => ids.map(id => makePlayer(id, 1000));
  // odd chip → LOW
  {
    const players = mk(['a', 'b']);
    const res = resolveSplitPots([{ amount: 101, eligibleIds: ['a', 'b'] }], players, {
      findHigh: () => ['a'], findLow: () => ['b'], oddChipToLow: true,
    });
    if (res.deltas['a'] !== 50 || res.deltas['b'] !== 51)
      fail('split-odd-low', 0, `expected a=50,b=51 got a=${res.deltas['a']},b=${res.deltas['b']}`);
    if ((res.deltas['a'] ?? 0) + (res.deltas['b'] ?? 0) + res.rolledOver !== 101)
      fail('split-odd-low', 0, 'chips leaked on odd split');
  }
  // odd chip → HIGH (default)
  {
    const players = mk(['a', 'b']);
    const res = resolveSplitPots([{ amount: 101, eligibleIds: ['a', 'b'] }], players, {
      findHigh: () => ['a'], findLow: () => ['b'],
    });
    if (res.deltas['a'] !== 51 || res.deltas['b'] !== 50)
      fail('split-odd-high', 0, `expected a=51,b=50 got a=${res.deltas['a']},b=${res.deltas['b']}`);
  }
  // tied winners split evenly; remainder goes in order
  {
    const players = mk(['a', 'b', 'c']);
    const res = resolveSplitPots([{ amount: 100, eligibleIds: ['a', 'b', 'c'] }], players, {
      findHigh: () => ['a', 'b', 'c'],
    });
    const tot = (res.deltas['a'] ?? 0) + (res.deltas['b'] ?? 0) + (res.deltas['c'] ?? 0);
    if (tot !== 100) fail('split-tie', 0, `tie split total ${tot} !== 100`);
    if (res.deltas['a'] !== 34 || res.deltas['b'] !== 33 || res.deltas['c'] !== 33)
      fail('split-tie', 0, `expected 34/33/33 got ${res.deltas['a']}/${res.deltas['b']}/${res.deltas['c']}`);
  }
  // no winners → rollover
  {
    const players = mk(['a']);
    const res = resolveSplitPots([{ amount: 77, eligibleIds: ['a'] }], players, {
      findHigh: () => [], findLow: () => [],
    });
    if (res.rolledOver !== 77 || res.hadAnyWinner) fail('split-nowinner', 0, 'no-winner pot did not roll over cleanly');
  }
  // only-high winner takes whole pot
  {
    const players = mk(['a', 'b']);
    const res = resolveSplitPots([{ amount: 200, eligibleIds: ['a', 'b'] }], players, {
      findHigh: () => ['a'], findLow: () => [],
    });
    if (res.deltas['a'] !== 200) fail('split-highonly', 0, `high-only got ${res.deltas['a']} !== 200`);
  }
  // resolveSwingSidePots conservation fuzz (with real declarations set on players)
  for (let i = 0; i < 2000; i++) {
    const n = 2 + ri(3);
    const ids = Array.from({ length: n }, (_, k) => `p${k + 1}`);
    const players = mk(ids);
    const amt = 1 + ri(999);
    const decls = ids.map(() => pick(['HIGH', 'LOW', 'SWING'] as const));
    players.forEach((p, k) => { p.declaration = decls[k]; });
    // made-ness is irrelevant here: findHigh/findLow return from pool directly,
    // so the resolver's split/rollover paths all get exercised with real decls.
    const res = resolveSwingSidePots(
      [{ amount: amt, eligibleIds: ids }],
      players,
      (pool) => pool.filter(p => p.declaration === 'HIGH').slice(0, 1 + ri(2)).map(p => p.id),
      (pool) => pool.filter(p => p.declaration === 'LOW').slice(0, 1 + ri(2)).map(p => p.id),
    );
    const tot = Object.values(res.deltas).reduce((s, v) => s + v, 0) + res.rolledOver;
    if (tot !== amt) fail('swing-fuzz', i, `swing conservation: ${tot} !== ${amt}`, { amt, decls });
  }
}

// ─── 4) Badugi uncontested = rollover (by design), FlushedUp/BoxChevy pay ───
function testUncontested() {
  const N = 3000;
  // Badugi: all-but-one fold → pot rolls over unchanged, chips untouched
  for (let i = 0; i < N; i++) {
    const players = [makePlayer('p1', 1000), makePlayer('p2', 1000), makePlayer('p3', 1000)];
    players.forEach(p => { p.totalBet = 100; p.chips = 900; });
    const pot = 300;
    players[1].status = 'folded'; players[2].status = 'folded';
    const r = BadugiMode.resolveShowdown(players, pot, 'p1');
    checkConservation('badugi-uncontested', i, players, pot, r.players, r.pot);
    if (r.pot !== pot) fail('badugi-uncontested', i, `rollover pot changed: ${pot} → ${r.pot}`);
    const surv = r.players.find(p => p.id === 'p1')!;
    if (surv.chips !== 900) fail('badugi-uncontested', i, `survivor chips changed: 900 → ${surv.chips} (rollover expected)`);
  }
  // Flushed Up: sole survivor is PAID
  for (let i = 0; i < N; i++) {
    const players = [makePlayer('p1', 900), makePlayer('p2', 800), makePlayer('p3', 700)];
    players[0].totalBet = 100; players[1].totalBet = 200; players[2].totalBet = 300;
    const pot = 600;
    players[1].status = 'folded'; players[2].status = 'folded';
    const r = FlushedUpMode.resolveShowdown(players, pot);
    checkConservation('flushedup-uncontested', i, players, pot, r.players, r.pot);
    const surv = r.players.find(p => p.id === 'p1')!;
    if (surv.chips !== 900 + 600) fail('flushedup-uncontested', i, `survivor should get full pot: 900 → ${surv.chips}`);
    if (r.pot !== 0) fail('flushedup-uncontested', i, `pot should be 0, got ${r.pot}`);
  }
  // Box Chevy: single declarer takes all
  for (let i = 0; i < N; i++) {
    const deck = shuffle(makeDeck());
    const players = [makePlayer('p1', 1000), makePlayer('p2', 1000)];
    const dealt = BoxChevyMode.deal(deck, players, 'p1');
    for (const rp of dealt.players) players.find(p => p.id === rp.id)!.cards = rp.cards;
    players.forEach(p => { p.totalBet = 100; p.chips = 900; p.declaration = 'HIGH'; });
    players[1].status = 'folded'; players[1].declaration = 'FOLD';
    const pot = 200;
    const r = BoxChevyMode.resolveShowdown(players, pot, 'p1', dealt.communityCards);
    checkConservation('boxchevy-uncontested', i, players, pot, r.players, r.pot);
    const surv = r.players.find(p => p.id === 'p1')!;
    if (surv.chips !== 1100) fail('boxchevy-uncontested', i, `sole declarer should get pot: 900 → ${surv.chips}`);
    if (r.pot !== 0) fail('boxchevy-uncontested', i, `pot should be 0, got ${r.pot}`);
  }
}

// ─── 5) Rollover chain integrity (the fixed bug) ─────────────────────────────
function testRolloverChains() {
  for (let chain = 0; chain < 1000; chain++) {
    let systemChips = 0;
    let pot = 0;
    const players = [makePlayer('p1', 1500), makePlayer('p2', 1500), makePlayer('p3', 1500)];
    systemChips = players.reduce((s, p) => s + p.chips, 0);
    // 1-3 uncontested badugi hands (rollover), then 1 contested
    const uncontested = 1 + ri(3);
    for (let h = 0; h < uncontested; h++) {
      players.forEach(p => { const c = 1 + ri(100); p.chips -= c; p.totalBet = (p.totalBet ?? 0) + c; pot += c; p.status = 'active'; });
      players[1].status = 'folded'; players[2].status = 'folded';
      const r = BadugiMode.resolveShowdown(players, pot, 'p1');
      // move resolved state forward
      for (const rp of r.players) { const lp = players.find(p => p.id === rp.id)!; lp.chips = rp.chips; lp.status = 'active'; lp.totalBet = 0; lp.declaration = null; }
      pot = r.pot;
      const total = players.reduce((s, p) => s + p.chips, 0) + pot;
      if (total !== systemChips) fail('rollover-chain', chain * 10 + h, `chain leak mid-rollover: ${total} !== ${systemChips}`);
    }
    // contested hand: deal real cards, all stay in, declare
    const deck = shuffle(makeDeck());
    const dealt = BadugiMode.deal(deck, players, 'p1');
    for (const rp of dealt.players) { const lp = players.find(p => p.id === rp.id)!; lp.cards = rp.cards; lp.status = 'active'; lp.totalBet = 0; lp.declaration = pick(['HIGH', 'LOW'] as const); }
    players.forEach(p => { const c = 1 + ri(100); p.chips -= c; p.totalBet = c; pot += c; });
    const r = BadugiMode.resolveShowdown(players, pot, 'p1');
    const total = r.players.reduce((s, p) => s + p.chips, 0) + r.pot;
    if (total !== systemChips) fail('rollover-chain', chain * 10 + 9, `Rollover chain leak: ${total} !== ${systemChips} (pot was ${pot}, rolled ${r.pot})`);
  }
}

// ─── 6) Box Chevy split-pot end-to-end (swing / high-low split) ─────────────
function testBoxChevySplits() {
  // Constructed: two made hands sharing community; force declarations.
  for (let i = 0; i < 2000; i++) {
    const deck = shuffle(makeDeck());
    const players = [makePlayer('p1', 1000), makePlayer('p2', 1000)];
    const dealt = BoxChevyMode.deal(deck, players, 'p1');
    for (const rp of dealt.players) players.find(p => p.id === rp.id)!.cards = rp.cards;
    players.forEach(p => { p.totalBet = 100; p.chips = 900; });
    players[0].declaration = pick(['HIGH', 'LOW', 'SWING'] as const);
    players[1].declaration = pick(['HIGH', 'LOW', 'SWING'] as const);
    const pot = 200;
    const r = BoxChevyMode.resolveShowdown(players, pot, 'p1', dealt.communityCards);
    checkConservation('boxchevy-split', i, players, pot, r.players, r.pot);
  }
  // Forced swing: single declarer already covered; here force identical evals is
  // impractical (unique deck), so verify the odd-chip split at resolver level:
  const players = [makePlayer('a', 1000), makePlayer('b', 1000)];
  const res = resolveSwingSidePots(
    [{ amount: 101, eligibleIds: ['a', 'b'] }],
    players,
    (pool) => pool.slice(0, 1).map(p => p.id), // one high winner
    (pool) => pool.slice(1, 2).map(p => p.id), // one low winner
  );
  // Note: declarations are null here; resolveSwingSidePots filters by
  // declaration inside, so this exercises the no-declaration path. Verify conservation only.
  const tot = Object.values(res.deltas).reduce((s, v) => s + v, 0) + res.rolledOver;
  if (tot !== 101) fail('boxchevy-oddchip', 0, `conservation ${tot} !== 101`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
const t0 = Date.now();
seed(20261016);
console.log('--- eval volume (10k/mode) ---');
testEvaluations();
console.log(`evals done in ${Date.now() - t0}ms`);

const t1 = Date.now();
console.log('--- side-pot allocation (10k) ---');
testSidePots();
console.log(`sidepots done in ${Date.now() - t1}ms`);

const t2 = Date.now();
console.log('--- split math (deterministic + 2k swing fuzz) ---');
testSplitMath();
console.log(`split math done in ${Date.now() - t2}ms`);

const t3 = Date.now();
console.log('--- uncontested (3k/mode) ---');
testUncontested();
console.log(`uncontested done in ${Date.now() - t3}ms`);

const t4 = Date.now();
console.log('--- rollover chains (1k chains) ---');
testRolloverChains();
console.log(`rollover done in ${Date.now() - t4}ms`);

const t5 = Date.now();
console.log('--- full hands: 10k/mode ---');
for (const mode of ['badugi', 'flushedUp', 'boxchevy'] as Mode[]) {
  let carry = 0;
  const s = Date.now();
  for (let h = 0; h < 10_000; h++) carry = simulateHand(mode, h, carry);
  console.log(`  ${mode}: 10000 hands in ${Date.now() - s}ms`);
}
console.log(`full hands done in ${Date.now() - t5}ms`);

const t6 = Date.now();
console.log('--- box chevy splits (2k) ---');
testBoxChevySplits();
console.log(`splits done in ${Date.now() - t6}ms`);

console.log('\n================ RESULTS ================');
console.log(`hands simulated: ${stats.hands}`);
console.log(`conservation checks: ${stats.conservationChecks}`);
console.log(`evaluations: ${stats.evals}`);
console.log(`FAILURES: ${fails.length}`);
for (const f of fails) {
  console.log(`  [${f.test}] hand=${f.hand} :: ${f.detail}`);
  if (f.snapshot) console.log(`      snapshot: ${JSON.stringify(f.snapshot).slice(0, 300)}`);
}
console.log(`total time: ${Date.now() - t0}ms`);
process.exit(fails.length ? 1 : 0);
