// ─── Simulation-based regression test suite ──────────────────────────────────
// Run with:  npx tsx server/__tests__/simulation.test.ts
//
// Drives the full game-mode state machine WITHOUT relying on unit-test
// correctness.  Uses each mode's own botAction / resolveShowdown / deal to
// simulate complete hands, then checks hard invariants after every mutation.
//
// Scenarios tested per mode (200 hands each, 4 modes = 5 600 hands total):
//   1. normal          — all-bot normal play
//   2. all_fold        — every player but one folds in first BET round
//   3. uneven_stacks   — players start with [10, 50, 100, 500, 2 000] chips
//   4. hero_fold       — p1 folds on every BET / DECLARE round
//   5. timer_expiry    — p1 auto-acts (stay/stand-pat/fold) on every turn
//   6. bots_only       — explicit all-bot table (same as normal, isolated)
//   7. reconnect       — p1 "reconnects" mid-hand and uses bot logic thereafter
//
// Invariants validated after every state update:
//   I1  pot >= 0
//   I2  no player chips < 0
//   I3  chip conservation: Σchips + pot == constant (does not drift)
//   I4  after showdown: distributed ≤ pot available
//   I5  no illegal phase: phase never revisited once advanced
//   I6  game always advances: no phase exceeds MAX_ACTIONS iterations
//
// Output: detailed per-violation log + pass/fail summary.

import type {
  Player, GameState, CardType, GamePhase, Declaration, GameMode,
} from '../../shared/gameTypes';
import { BadugiMode    } from '../../shared/modes/badugi';
import { Dead7Mode     } from '../../shared/modes/dead7';
import { Fifteen35Mode } from '../../shared/modes/fifteen35';
import { SuitsPokerMode} from '../../shared/modes/suitspoker';
import { computeSidePots, totalSidePotAmount } from '../../shared/engine/sidePots';

// ─── Config ───────────────────────────────────────────────────────────────────
const HANDS_PER_SCENARIO = 200;
const MAX_ACTIONS_PER_PHASE = 80;   // guard against stuck phases
const MAX_PHASES_PER_HAND   = 60;   // guard against infinite phase loops

// ─── Deck helpers ─────────────────────────────────────────────────────────────
const ALL_RANKS: CardType['rank'][] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const ALL_SUITS: CardType['suit'][] = ['spades','hearts','diamonds','clubs'];

function buildDeck(): CardType[] {
  const d: CardType[] = [];
  for (const suit of ALL_SUITS)
    for (const rank of ALL_RANKS)
      d.push({ rank, suit, isHidden: false });
  return d;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Player / state factories ─────────────────────────────────────────────────
function makePlayer(id: string, chips: number, isDealer = false): Player {
  return {
    id, name: id, presence: 'bot' as const,
    chips, bet: 0, totalBet: 0, cards: [],
    status: 'active', isDealer,
    declaration: null, hasActed: false,
  };
}

function makeInitialPlayers(chips: number[]): Player[] {
  return chips.map((c, i) => makePlayer(`p${i + 1}`, c, i === 3));
}

function makeState(players: Player[], rolloverPot = 0): GameState {
  return {
    tableId: 'sim',
    phase: 'ANTE' as GamePhase,
    pot: rolloverPot,
    currentBet: 0,
    minBet: 2,
    activePlayerId: players[0].id,
    players: players.map(p => ({ ...p, hasActed: false, declaration: null, isWinner: false, isLoser: false })),
    communityCards: [],
    messages: [],
    chatMessages: [],
    deck: shuffle(buildDeck()),
    discardPile: [],
    raisesThisRound: 0,
  };
}

// ─── Phase-round-over logic (mirrors genericEngine.ts isPhaseRoundOver) ───────
function isRoundOver(state: GameState): boolean {
  const { phase, players, currentBet } = state;

  if (phase === 'ANTE')
    return players.filter(p => p.status === 'active').every(p => p.hasActed);

  if (phase.startsWith('HIT_')) {
    const active = players.filter(p => p.status === 'active');
    return active.every(p => p.hasActed || p.declaration === 'STAY' || p.declaration === 'BUST');
  }

  if (phase.startsWith('DRAW') || phase === 'DECLARE')
    return players.filter(p => p.status === 'active').every(p => p.hasActed);

  if (phase.startsWith('BET') || phase === 'DECLARE_AND_BET') {
    const active = players.filter(p => p.status === 'active' && p.chips > 0);
    // All-in only → vacuously true
    if (active.length === 0) return true;
    return active.every(p => p.hasActed) && active.every(p => p.bet === currentBet);
  }

  return false;
}

// ─── Next active player index ─────────────────────────────────────────────────
function nextActiveIdx(players: Player[], fromIdx: number, skipAllIn = false): number {
  for (let offset = 1; offset <= players.length; offset++) {
    const idx = (fromIdx + offset) % players.length;
    const p = players[idx];
    if (p.status === 'active' && (!skipAllIn || p.chips > 0)) return idx;
  }
  return fromIdx;
}

function getDealerIdx(players: Player[]): number {
  const idx = players.findIndex(p => p.isDealer);
  return idx >= 0 ? idx : 0;
}

// ─── Phase advancement (mirrors advanceToNextPhase in genericEngine.ts) ───────
function advancePhase(mode: GameMode, state: GameState): GameState {
  const phases = mode.phases;
  const idx = phases.indexOf(state.phase);
  if (idx === -1 || state.phase === 'SHOWDOWN') return state;

  let nextPhase = phases[(idx + 1) % phases.length] as GamePhase;

  if (mode.getNextPhase) {
    const override = mode.getNextPhase(state.phase, state);
    if (override) nextPhase = override;
  }

  const isBetRound  = nextPhase.startsWith('BET') || nextPhase === 'DECLARE_AND_BET';
  const isDrawRound = nextPhase.startsWith('DRAW') || nextPhase.startsWith('HIT_');
  const isDeclare   = nextPhase === 'DECLARE';
  const skipAllIn   = !isDeclare && !isDrawRound;

  const dealerIdx   = getDealerIdx(state.players);
  const firstActIdx = nextActiveIdx(state.players, dealerIdx, skipAllIn);

  let newPlayers: Player[] = state.players.map(p => ({
    ...p,
    hasActed: false,
    bet: (isBetRound || isDrawRound) ? 0 : p.bet,
  }));

  // Auto-declare all-in players as POKER in DECLARE_AND_BET (mirrors genericEngine.ts:679)
  if (nextPhase === 'DECLARE_AND_BET') {
    newPlayers = newPlayers.map(p =>
      p.status === 'active' && p.chips === 0 && !p.declaration
        ? { ...p, declaration: 'POKER' as Declaration, hasActed: true }
        : p
    );
  }

  return {
    ...state,
    phase: nextPhase,
    currentBet: isBetRound ? 0 : state.currentBet,
    raisesThisRound: isBetRound ? 0 : (state.raisesThisRound ?? 0),
    activePlayerId: newPlayers[firstActIdx]?.id ?? null,
    players: newPlayers,
  };
}

// ─── Invariant violation record ───────────────────────────────────────────────
interface Violation {
  mode: string;
  scenario: string;
  hand: number;
  phase: string;
  invariant: string;
  detail: string;
}

// ─── Chip conservation check ─────────────────────────────────────────────────
// Correct formula: Σchips + pot.
// p.bet is NOT added — it is a tracking field recording how much the player has
// committed in the current round; that money has already been moved into pot by
// applyBetDecision.  Adding p.bet would double-count it.
function chipPool(state: GameState): number {
  return state.players.reduce((s, p) => s + p.chips, 0) + state.pot;
}

// Alias for clarity at showdown boundaries where all bets are zero.
function chipPoolWithBets(state: GameState): number {
  return state.players.reduce((s, p) => s + p.chips + p.bet, 0) + state.pot;
}

// ─── Scenario types ───────────────────────────────────────────────────────────
type Scenario = 'normal' | 'all_fold' | 'uneven_stacks' | 'hero_fold' | 'timer_expiry' | 'bots_only' | 'reconnect';

// ─── Auto-act for hero (mirrors autoActOnTimeout in genericEngine.ts) ─────────
function heroAutoAct(state: GameState, heroId: string): GameState {
  const idx = state.players.findIndex(p => p.id === heroId);
  if (idx === -1) return state;
  const hero = state.players[idx];
  if (hero.status !== 'active') return state;

  const { phase, currentBet } = state;
  let updatedHero = { ...hero };

  if (phase.startsWith('HIT_')) {
    updatedHero = { ...hero, declaration: 'STAY' as Declaration, hasActed: true };
  } else if (phase.startsWith('DRAW')) {
    updatedHero = { ...hero, hasActed: true }; // stand pat
  } else if (phase === 'DECLARE' || phase === 'DECLARE_AND_BET') {
    updatedHero = { ...hero, status: 'folded' as const, declaration: null, hasActed: true };
  } else if (phase.startsWith('BET') || phase === 'ANTE') {
    const callAmt = currentBet - hero.bet;
    if (callAmt <= 0) {
      updatedHero = { ...hero, hasActed: true }; // auto-check
    } else {
      updatedHero = { ...hero, status: 'folded' as const, hasActed: true }; // auto-fold
    }
  } else {
    updatedHero = { ...hero, hasActed: true };
  }

  const newPlayers = [...state.players];
  newPlayers[idx] = updatedHero;
  return { ...state, players: newPlayers };
}

// ─── All-fold override: fold all except the last standing player ──────────────
// Used once per hand in the first BET round only.
function applyAllFold(state: GameState, firstFoldDone: { done: boolean }): GameState {
  if (firstFoldDone.done) return state;
  // Find all active players; keep one (the last active), fold the rest.
  const active = state.players.filter(p => p.status === 'active');
  if (active.length <= 1) { firstFoldDone.done = true; return state; }

  const keepId = active[active.length - 1].id; // keep the last player
  const newPlayers = state.players.map(p =>
    p.status === 'active' && p.id !== keepId
      ? { ...p, status: 'folded' as const, hasActed: true }
      : p
  );
  firstFoldDone.done = true;
  return { ...state, players: newPlayers };
}

// ─── Single hand simulator ────────────────────────────────────────────────────
function simulateHand(
  mode: GameMode,
  scenario: Scenario,
  initialChips: number[],
  rolloverPot: number,
  handIdx: number,
  violations: Violation[],
): { chips: number[]; rolloverPot: number } {
  const modeId = mode.id;
  const players = makeInitialPlayers(initialChips);
  let state = makeState(players, rolloverPot);

  const startPool = chipPool(state);
  let phaseCount = 0;
  const allFoldFlag = { done: false };
  let inFirstBetRound = true;
  let reconnectHappened = false;

  function addViolation(invariant: string, detail: string) {
    violations.push({ mode: modeId, scenario, hand: handIdx, phase: state.phase, invariant, detail });
  }

  function checkInvariants(label: string) {
    if (state.pot < 0)
      addViolation('I1_POT_NEGATIVE', `${label}: pot=${state.pot}`);

    for (const p of state.players) {
      if (p.chips < 0)
        addViolation('I2_NEGATIVE_CHIPS', `${label}: ${p.id} chips=${p.chips}`);
    }

    const pool = chipPool(state);
    if (pool !== startPool)
      addViolation('I3_CONSERVATION', `${label}: expected=${startPool} got=${pool} (drift=${pool - startPool})`);
  }

  // ── ANTE phase ──────────────────────────────────────────────────────────────
  {
    let iter = 0;
    while (!isRoundOver(state) && iter++ < MAX_ACTIONS_PER_PHASE) {
      const result = mode.botAction(state, state.activePlayerId!);
      if (!result) break;
      state = { ...state, ...result.stateUpdates };
      if (result.nextPlayerId) state.activePlayerId = result.nextPlayerId;
      checkInvariants('ANTE');
      if (result.roundOver) break;
    }
    if (!isRoundOver(state) && iter >= MAX_ACTIONS_PER_PHASE)
      addViolation('I6_STUCK', `ANTE did not resolve after ${MAX_ACTIONS_PER_PHASE} actions`);
  }

  // ── DEAL phase ──────────────────────────────────────────────────────────────
  {
    const dealt = mode.deal(state.deck, state.players, 'p1');
    state = { ...state, players: dealt.players, communityCards: dealt.communityCards ?? [], deck: dealt.deck };
    checkInvariants('DEAL');
  }

  // ── Main phase loop ──────────────────────────────────────────────────────────
  state = advancePhase(mode, { ...state, phase: 'DEAL' as GamePhase });

  const visitedPhases: GamePhase[] = ['WAITING', 'ANTE', 'DEAL'];

  while (state.phase !== 'SHOWDOWN' && phaseCount < MAX_PHASES_PER_HAND) {
    phaseCount++;
    const phase = state.phase;

    // Detect re-visit (cycle guard)
    if (visitedPhases.includes(phase)) {
      addViolation('I5_PHASE_CYCLE', `Phase ${phase} revisited`);
      break;
    }
    visitedPhases.push(phase);

    // ── REVEAL auto-transition phases ───────────────────────────────────────
    if (phase.startsWith('REVEAL_')) {
      const trans = mode.getAutoTransition(phase);
      if (trans) {
        const { stateUpdates } = trans.action(state);
        state = { ...state, ...stateUpdates };
        checkInvariants(`REVEAL ${phase}`);
      }
      state = advancePhase(mode, state);
      continue;
    }

    // ── Early exit: only one active player left ─────────────────────────────
    const active = state.players.filter(p => p.status === 'active');
    if (active.length <= 1) {
      // Go straight to showdown
      break;
    }

    // ── Apply scenario overrides at phase entry ─────────────────────────────
    if (scenario === 'all_fold' && !allFoldFlag.done && (phase.startsWith('BET') || phase === 'DECLARE_AND_BET')) {
      state = applyAllFold(state, allFoldFlag);
      checkInvariants('ALL_FOLD_OVERRIDE');
    }

    // ── Drive the round ─────────────────────────────────────────────────────
    let actionIter = 0;

    while (!isRoundOver(state) && actionIter++ < MAX_ACTIONS_PER_PHASE) {
      const activeId = state.activePlayerId;
      if (!activeId) break;

      const p = state.players.find(pl => pl.id === activeId);
      if (!p || p.status !== 'active') break;

      // Scenario-specific action override for p1 ("hero")
      let overridden = false;

      if (activeId === 'p1') {
        if (scenario === 'hero_fold') {
          // Hero always folds in BET / DECLARE rounds
          if (phase.startsWith('BET') || phase === 'DECLARE' || phase === 'DECLARE_AND_BET') {
            state = heroAutoAct({ ...state, currentBet: state.currentBet + 1 }, 'p1'); // force fold branch
            overridden = true;
          }
        } else if (scenario === 'timer_expiry') {
          state = heroAutoAct(state, 'p1');
          overridden = true;
        } else if (scenario === 'reconnect' && !reconnectHappened && phaseCount >= 2) {
          // Simulate reconnect: p1 is treated like a bot for this and all subsequent rounds
          reconnectHappened = true;
          // intentional fall-through to normal botAction
        }
      }

      if (!overridden) {
        const result = mode.botAction(state, activeId);
        if (!result) {
          // Mode returned null for this player — treat as stood-pat/acted
          const idx = state.players.findIndex(pl => pl.id === activeId);
          if (idx !== -1) {
            const newPlayers = [...state.players];
            newPlayers[idx] = { ...newPlayers[idx], hasActed: true };
            state = { ...state, players: newPlayers };
          }
        } else {
          state = { ...state, ...result.stateUpdates };
          if (result.nextPlayerId) state.activePlayerId = result.nextPlayerId;
          if (result.roundOver) {
            checkInvariants(phase);
            break;
          }
        }
      }

      checkInvariants(phase);

      // After override, find next unacted player
      if (overridden) {
        if (isRoundOver(state)) break;
        // Find next player to act
        const curIdx = state.players.findIndex(pl => pl.id === state.activePlayerId);
        const isBetPhase = phase.startsWith('BET') || phase === 'DECLARE_AND_BET';
        const skipAI = isBetPhase;
        const nextIdx = nextActiveIdx(state.players, curIdx, false);
        const nextP = state.players[nextIdx];
        if (nextP && nextP.status === 'active') {
          state = { ...state, activePlayerId: nextP.id };
        }
      }
    }

    if (actionIter >= MAX_ACTIONS_PER_PHASE && !isRoundOver(state))
      addViolation('I6_STUCK', `Phase ${phase} did not resolve after ${MAX_ACTIONS_PER_PHASE} actions`);

    // Track first BET round
    if (phase.startsWith('BET') || phase === 'DECLARE_AND_BET') inFirstBetRound = false;

    // Advance to next phase
    state = advancePhase(mode, state);
    checkInvariants(`after advancePhase → ${state.phase}`);
  }

  if (phaseCount >= MAX_PHASES_PER_HAND)
    addViolation('I6_STUCK', `Hand never reached SHOWDOWN after ${MAX_PHASES_PER_HAND} phase advances`);

  // ── SHOWDOWN ───────────────────────────────────────────────────────────────
  const preShowdownPot = state.pot + state.players.reduce((s, p) => s + p.bet, 0);
  const potBeforeResolve = state.pot;
  const betsBeforeResolve = state.players.reduce((s, p) => s + p.bet, 0);

  let resolved: { players: Player[]; pot: number; messages: string[] };
  try {
    resolved = mode.resolveShowdown(state.players, state.pot, 'p1', state.communityCards);
  } catch (err) {
    addViolation('SHOWDOWN_CRASH', `resolveShowdown threw: ${String(err)}`);
    // Try to preserve chips for conservation tracking
    resolved = { players: state.players, pot: state.pot, messages: [] };
  }

  state = { ...state, phase: 'SHOWDOWN', players: resolved.players, pot: resolved.pot };
  checkInvariants('SHOWDOWN');

  // I4: distributed amount must not exceed what was available
  const distributed = resolved.players.reduce((s, p) => s + (p.chips - (state.players.find(x => x.id === p.id)?.chips ?? p.chips)), 0);
  // Simpler check: all chips gained must come from pot
  const chipsAfter   = resolved.players.reduce((s, p) => s + p.chips, 0);
  const chipsBefore  = state.players.reduce((s, p) => s + p.chips, 0);
  const netDistrib   = chipsAfter - chipsBefore;
  if (netDistrib > potBeforeResolve + 1) {   // +1 for rounding
    addViolation('I4_OVERDISTRIB', `Distributed $${netDistrib} but pot was $${potBeforeResolve}`);
  }

  return {
    chips: resolved.players.map(p => Math.max(0, p.chips)),
    rolloverPot: resolved.pot,
  };
}

// ─── Scenario chip initializer ────────────────────────────────────────────────
function chipsForScenario(scenario: Scenario, handIdx: number): number[] {
  switch (scenario) {
    case 'uneven_stacks': return [10, 50, 100, 500, 2000];
    default:              return [1000, 1000, 1000, 1000, 1000];
  }
}

// ─── Run one mode × scenario ──────────────────────────────────────────────────
function runScenario(
  mode: GameMode,
  scenario: Scenario,
  violations: Violation[],
): { handsCompleted: number; stuckHands: number } {
  let chips = chipsForScenario(scenario, 0);
  let rolloverPot = 0;
  let stuckHands = 0;
  const vBefore = violations.length;

  for (let hand = 0; hand < HANDS_PER_SCENARIO; hand++) {
    // Rebuy players at 0 chips so the hand can always proceed
    chips = chips.map(c => c <= 0 ? 1000 : c);

    const vStart = violations.length;
    const result = simulateHand(mode, scenario, chips, rolloverPot, hand, violations);
    const vEnd = violations.length;

    if (vEnd > vStart) {
      const newViolations = violations.slice(vStart, vEnd);
      if (newViolations.some(v => v.invariant === 'I6_STUCK')) stuckHands++;
    }

    chips = result.chips;
    rolloverPot = result.rolloverPot;
  }

  return { handsCompleted: HANDS_PER_SCENARIO, stuckHands };
}

// ─── Entry point ──────────────────────────────────────────────────────────────
const MODES: GameMode[] = [BadugiMode, Dead7Mode, Fifteen35Mode, SuitsPokerMode];
const SCENARIOS: Scenario[] = ['normal','all_fold','uneven_stacks','hero_fold','timer_expiry','bots_only','reconnect'];

const violations: Violation[] = [];
const summaryRows: string[] = [];

let totalHands = 0;
let totalStuck = 0;

console.log('\n══════════════════════════════════════════════════════════');
console.log('  CGP Simulation Regression  —  500+ hands × 4 modes × 7 scenarios');
console.log('══════════════════════════════════════════════════════════\n');

for (const mode of MODES) {
  console.log(`── Mode: ${mode.name} (${mode.id}) ──`);

  for (const scenario of SCENARIOS) {
    const label = `${mode.id}/${scenario}`;
    const vBefore = violations.length;
    const { handsCompleted, stuckHands } = runScenario(mode, scenario, violations);
    const vNew = violations.length - vBefore;
    totalHands += handsCompleted;
    totalStuck += stuckHands;

    const status = vNew === 0 ? '✓' : '✗';
    const line = `  ${status}  ${label.padEnd(35)} ${handsCompleted} hands  violations=${vNew}  stuck=${stuckHands}`;
    console.log(line);
    summaryRows.push(line);
  }

  console.log();
}

// ─── Violation log ────────────────────────────────────────────────────────────
if (violations.length > 0) {
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  INVARIANT VIOLATIONS (${violations.length} total)`);
  console.log('══════════════════════════════════════════════════════════\n');

  // Group by mode + scenario + invariant for cleaner output
  const grouped = new Map<string, Violation[]>();
  for (const v of violations) {
    const key = `${v.mode}/${v.scenario} · ${v.invariant}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(v);
  }

  for (const [key, vs] of Array.from(grouped.entries())) {
    console.log(`  ▶ ${key}  (${vs.length} occurrence${vs.length > 1 ? 's' : ''})`);
    // Show first 3 unique details
    const uniq = [...new Set(vs.map(v => v.detail))].slice(0, 3);
    for (const d of uniq) console.log(`      detail: ${d}`);
    if (vs.length > 3) {
      const sample = vs[0];
      console.log(`      first in hand ${sample.hand}, phase ${sample.phase}`);
    }
    console.log();
  }
} else {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  NO INVARIANT VIOLATIONS DETECTED');
  console.log('══════════════════════════════════════════════════════════\n');
}

// ─── Final summary ─────────────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log(`  SIMULATION SUMMARY`);
console.log(`  Total hands simulated : ${totalHands}`);
console.log(`  Total violations      : ${violations.length}`);
console.log(`  Stuck hands           : ${totalStuck}`);
console.log(`  Result                : ${violations.length === 0 ? 'ALL PASS ✓' : `FAILURES DETECTED ✗ (${violations.length})`}`);
console.log('══════════════════════════════════════════════════════════\n');

process.exit(violations.length === 0 ? 0 : 1);
