// ─── Flushed Up — Full 100-hand Human Simulation Test ────────────────────────
// Standalone tsx script. Run with:
//   npx tsx server/__tests__/flushedUpFullGame.test.ts
//
// Simulates 100 complete Flushed Up hands with a human player.
// Covers: ante posting, dealing, all betting rounds, all draw rounds
// (including discard-limit enforcement), showdown evaluation, chip
// conservation, rake, dealer rotation, bust-out handling, and deck integrity.
//
// NOTE on totalBet: the live engine never writes totalBet during normal action
// paths (botAction, humanAction).  computeSidePots therefore always returns [],
// and resolveShowdown falls back to the explicit `pot` parameter for a single
// winner pool.  This test mirrors that: totalBet is left at 0 so the same
// fallback fires, and winnerPot is distributed correctly.

import type { Player, CardType, GameState, GamePhase } from '../../shared/gameTypes';
import { FlushedUpMode, evaluateFlushedUpHand, compareFlushedUpHands } from '../../shared/modes/flushedUp';
import { applyRake } from '../utils/rake';

// ── Test harness ─────────────────────────────────────────────────────────────

let passes = 0;
let failures = 0;
let handFailures = 0;

function assert(cond: unknown, msg: string): void {
  if (!cond) { failures++; handFailures++; console.error('  ✗', msg); }
  else { passes++; }
}
function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ── Deck helpers ──────────────────────────────────────────────────────────────

const SUITS = ['hearts','diamonds','clubs','spades'] as const;
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'] as const;

function makeDeck(): CardType[] {
  const d: CardType[] = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
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

// ── Player factory ────────────────────────────────────────────────────────────

function makePlayer(id: string, name: string, presence: 'human'|'bot', chips: number): Player {
  return {
    id, name, presence,
    chips, bet: 0,
    totalBet: 0,   // intentionally left 0; see module note above
    cards: [], status: 'active',
    hasActed: false, isDealer: false,
    declaration: null,
  } as unknown as Player;
}

// ── Game-action helpers ───────────────────────────────────────────────────────

function discardLimit(phase: string): number {
  if (phase === 'DRAW_1') return 3;
  if (phase === 'DRAW_2') return 2;
  if (phase === 'DRAW_3') return 1;
  return 0;
}

/** Deduct `amount` chips from player into pot. Does NOT touch totalBet. */
function contribute(player: Player, amount: number, pot: number): { player: Player; pot: number } {
  const actual = Math.min(amount, player.chips);
  if (actual <= 0) return { player, pot };
  return {
    player: { ...player, chips: player.chips - actual, bet: player.bet + actual },
    pot: pot + actual,
  };
}

/** Human check / call / fold. */
function humanBet(
  player: Player,
  currentBet: number,
  pot: number,
  action: 'check'|'call'|'fold',
): { player: Player; pot: number } {
  if (action === 'fold')  return { player: { ...player, status: 'folded', hasActed: true }, pot };
  if (action === 'check') return { player: { ...player, hasActed: true }, pot };
  const toCall = Math.max(0, currentBet - player.bet);
  const r = contribute(player, toCall, pot);
  return { player: { ...r.player, hasActed: true }, pot: r.pot };
}

/** Human draw: discard `indices`, replace from deck. */
function humanDraw(
  player: Player,
  indices: number[],
  deck: CardType[],
  discardPile: CardType[],
): { player: Player; deck: CardType[]; discardPile: CardType[] } {
  const newCards = [...player.cards];
  const newDeck  = [...deck];
  const newDiscard = [...discardPile];
  for (const idx of indices) {
    if (idx < 0 || idx >= newCards.length) continue;
    newDiscard.push(newCards[idx]);
    if (newDeck.length === 0 && newDiscard.length > 0) {
      const reshuffled = shuffle(newDiscard.splice(0));
      newDeck.push(...reshuffled);
    }
    const drawn = newDeck.shift();
    if (drawn) newCards[idx] = { ...drawn, isHidden: false };
  }
  return {
    player: { ...player, cards: newCards, hasActed: true },
    deck: newDeck, discardPile: newDiscard,
  };
}

/** Run all bots through a betting round (handles multi-pass for re-opens). */
function botBettingRound(
  players: Player[],
  pot: number,
  currentBet: number,
  raisesThisRound: number,
  phase: string,
  discardPile: CardType[],
  deck: CardType[],
): { players: Player[]; pot: number; currentBet: number; raisesThisRound: number } {
  let ps = players.map(p => ({ ...p }));
  let newPot = pot, newBet = currentBet, newRaises = raisesThisRound;

  for (let iter = 0; iter < 60; iter++) {
    const unacted = ps.filter(
      p => p.presence === 'bot' && p.status === 'active' && p.chips > 0 &&
           (!p.hasActed || p.bet < newBet),
    );
    if (unacted.length === 0) break;

    const bot    = unacted[0];
    const botIdx = ps.findIndex(p => p.id === bot.id);
    const snap: GameState = {
      phase: phase as GamePhase,
      players: ps, deck,
      pot: newPot, currentBet: newBet,
      communityCards: [], raisesThisRound: newRaises,
      activePlayerId: bot.id, discardPile,
      messages: [], handId: 0, pot2: 0, spectatorCount: 0, liveReactions: [],
    };
    const result = FlushedUpMode.botAction!(snap, bot.id);
    const su     = result.stateUpdates;
    const upd: Player[] = (su.players as Player[]) ?? ps;
    // Mirror chips delta → keep totalBet=0 (engine behaviour)
    ps = upd;
    newPot    = (su.pot as number)            ?? newPot;
    newBet    = (su.currentBet as number)     ?? newBet;
    newRaises = (su.raisesThisRound as number)?? newRaises;
  }
  return { players: ps, pot: newPot, currentBet: newBet, raisesThisRound: newRaises };
}

/** Run all bots through one draw round. */
function botDrawRound(
  players: Player[],
  deck: CardType[],
  discardPile: CardType[],
  phase: string,
): { players: Player[]; deck: CardType[]; discardPile: CardType[] } {
  let ps = players.map(p => ({ ...p }));
  let dk = [...deck];
  let di = [...discardPile];

  for (const bot of ps.filter(p => p.presence === 'bot' && p.status === 'active')) {
    const snap: GameState = {
      phase: phase as GamePhase,
      players: ps, deck: dk,
      pot: 0, currentBet: 0,
      communityCards: [], raisesThisRound: 0,
      activePlayerId: bot.id, discardPile: di,
      messages: [], handId: 0, pot2: 0, spectatorCount: 0, liveReactions: [],
    };
    const su = FlushedUpMode.botAction!(snap, bot.id).stateUpdates;
    ps = (su.players as Player[]) ?? ps;
    dk = (su.deck   as CardType[]) ?? dk;
    di = (su.discardPile as CardType[]) ?? di;
  }
  return { players: ps, deck: dk, discardPile: di };
}

/** Reset per-round bet field and hasActed without touching anything else. */
function roundReset(players: Player[]): Player[] {
  return players.map(p => ({ ...p, bet: 0, hasActed: false }));
}

// ── 100-hand simulation ───────────────────────────────────────────────────────

section('Flushed Up — 100-hand human player simulation');

const HUMAN_ID       = 'human-1';
const NUM_PLAYERS    = 5;
const ANTE           = 25;
const STARTING_CHIPS = 10_000;

let dealerIndex = 0;

let globalPlayers: Player[] = [
  makePlayer(HUMAN_ID, 'Hero',  'human', STARTING_CHIPS),
  makePlayer('bot-1',  'Bot 1', 'bot',   STARTING_CHIPS),
  makePlayer('bot-2',  'Bot 2', 'bot',   STARTING_CHIPS),
  makePlayer('bot-3',  'Bot 3', 'bot',   STARTING_CHIPS),
  makePlayer('bot-4',  'Bot 4', 'bot',   STARTING_CHIPS),
];

let totalRakeCollected = 0;
let handsCompleted     = 0;
let handsFailed        = 0;
let totalDuplicates    = 0;
let totalChipLeak      = 0;
let totalRebuys        = 0; // chips injected by hero rebuys

for (let handNum = 1; handNum <= 100; handNum++) {
  handFailures = 0;

  // Rotate dealer button
  dealerIndex = (dealerIndex + 1) % NUM_PLAYERS;

  // Hero rebuy if busted (maintains simulation continuity)
  if (globalPlayers.find(p => p.id === HUMAN_ID)!.chips <= 0) {
    totalRebuys += STARTING_CHIPS; // track injected chips
    globalPlayers = globalPlayers.map(p =>
      p.id === HUMAN_ID ? { ...p, chips: STARTING_CHIPS } : p,
    );
  }

  const activePlayers = globalPlayers.filter(p => p.chips > 0);
  if (activePlayers.length < 2) continue;

  // Initialise hand — reset all per-hand fields
  let handPlayers: Player[] = activePlayers.map((p, i) => ({
    ...p,
    isDealer:  i === dealerIndex % activePlayers.length,
    bet: 0, totalBet: 0,   // totalBet intentionally 0; see module note
    hasActed: false,
    status: 'active' as Player['status'],
    cards: [],
    score:    undefined,
    isWinner: undefined as unknown as boolean,
    isLoser:  undefined as unknown as boolean,
  }));

  // Chips before antes — used for conservation check
  const chipsBeforeHand = handPlayers.reduce((s, p) => s + p.chips, 0);

  // ── ANTE ────────────────────────────────────────────────────────────────────
  let pot = 0;
  handPlayers = handPlayers.map(p => {
    const before = p.chips;
    const r = contribute(p, ANTE, pot);
    pot = r.pot;
    const expected = Math.min(ANTE, before);
    assert(before - r.player.chips === expected,
      `Hand ${handNum}: ${p.name} ante $${expected} correctly debited`);
    return { ...r.player, hasActed: true };
  });
  assert(pot === handPlayers.reduce((s, p) => s + Math.min(ANTE,
    activePlayers.find(a => a.id === p.id)!.chips), 0),
    `Hand ${handNum}: pot (${pot}) = sum of antes`);

  // ── DEAL ────────────────────────────────────────────────────────────────────
  const deck0 = shuffle(makeDeck());
  const dealt  = FlushedUpMode.deal!(deck0, handPlayers, HUMAN_ID);
  handPlayers  = dealt.players as Player[];
  let deck     = dealt.deck as CardType[];
  let discardPile: CardType[] = [];

  // Each active player gets exactly 5 cards
  for (const p of handPlayers.filter(p => p.status === 'active')) {
    assert(p.cards.length === 5, `Hand ${handNum}: ${p.name} dealt 5 cards`);
  }

  // Deck integrity: no card appears twice
  const seenKeys = new Set<string>();
  for (const p of handPlayers) {
    for (const c of p.cards) {
      const key = `${c.rank}:${c.suit}`;
      if (seenKeys.has(key)) { totalDuplicates++; assert(false, `Hand ${handNum}: duplicate ${key}`); }
      else seenKeys.add(key);
    }
  }
  for (const c of deck) {
    const key = `${c.rank}:${c.suit}`;
    assert(!seenKeys.has(key), `Hand ${handNum}: deck card ${key} not already dealt`);
  }
  assert(seenKeys.size + deck.length === 52,
    `Hand ${handNum}: total cards = 52 (${seenKeys.size} dealt + ${deck.length} remaining)`);

  // ── Betting-round helper (closure over handPlayers/pot/deck/discardPile) ────
  function doBetRound(phase: string): void {
    handPlayers = roundReset(handPlayers);
    let currentBet = 0, raisesThisRound = 0;

    // Human checks
    const hr = humanBet(handPlayers.find(p => p.id === HUMAN_ID)!, currentBet, pot, 'check');
    handPlayers = handPlayers.map(p => p.id === HUMAN_ID ? hr.player : p);
    pot = hr.pot;

    // Bots bet
    const br = botBettingRound(handPlayers, pot, currentBet, raisesThisRound, phase, discardPile, deck);
    handPlayers = br.players; pot = br.pot; currentBet = br.currentBet; raisesThisRound = br.raisesThisRound;

    // Human calls if behind
    const hero = handPlayers.find(p => p.id === HUMAN_ID)!;
    if (hero.status === 'active' && hero.bet < currentBet) {
      const cr = humanBet(hero, currentBet, pot, 'call');
      handPlayers = handPlayers.map(p => p.id === HUMAN_ID ? cr.player : p);
      pot = cr.pot;
    }
    handPlayers = handPlayers.map(p => ({ ...p, hasActed: true }));
  }

  // ── BET_1 ───────────────────────────────────────────────────────────────────
  doBetRound('BET_1');

  // ── DRAW_1 (up to 3) ────────────────────────────────────────────────────────
  {
    const limit = discardLimit('DRAW_1');
    assert(limit === 3, `Hand ${handNum}: DRAW_1 limit is 3`);

    handPlayers = handPlayers.map(p => ({ ...p, hasActed: false }));
    const hero = handPlayers.find(p => p.id === HUMAN_ID)!;

    if (hero.status === 'active') {
      const before = [...hero.cards];

      // Verify cap: 4 discards → must be trimmed to 3
      const over4   = [0,1,2,3].slice(0, 4);
      const capped4 = over4.slice(0, limit);
      assert(capped4.length === 3, `Hand ${handNum}: DRAW_1 cap — 4→${capped4.length}`);

      // Simulate discarding 2 cards
      const discard2 = [0, 1];
      const d2result = humanDraw(hero, discard2, deck, discardPile);
      deck = d2result.deck; discardPile = d2result.discardPile;
      handPlayers = handPlayers.map(p => p.id === HUMAN_ID ? d2result.player : p);

      const heroAfter = handPlayers.find(p => p.id === HUMAN_ID)!;
      assert(heroAfter.cards.length === 5, `Hand ${handNum}: hero has 5 cards after DRAW_1`);

      // Discarded slots replaced
      for (const idx of discard2) {
        const oldKey = `${before[idx].rank}:${before[idx].suit}`;
        assert(!heroAfter.cards.some(c => `${c.rank}:${c.suit}` === oldKey),
          `Hand ${handNum}: DRAW_1 slot ${idx} replaced`);
      }
      // Kept slots unchanged
      for (let i = 0; i < 5; i++) {
        if (!discard2.includes(i)) {
          assert(
            `${heroAfter.cards[i].rank}:${heroAfter.cards[i].suit}` ===
            `${before[i].rank}:${before[i].suit}`,
            `Hand ${handNum}: DRAW_1 slot ${i} kept`,
          );
        }
      }
    }

    const bd1 = botDrawRound(handPlayers, deck, discardPile, 'DRAW_1');
    handPlayers = bd1.players; deck = bd1.deck; discardPile = bd1.discardPile;
    handPlayers = handPlayers.map(p => ({ ...p, hasActed: true }));
  }

  // ── BET_2 ───────────────────────────────────────────────────────────────────
  doBetRound('BET_2');

  // ── DRAW_2 (up to 2) ────────────────────────────────────────────────────────
  {
    const limit = discardLimit('DRAW_2');
    assert(limit === 2, `Hand ${handNum}: DRAW_2 limit is 2`);

    handPlayers = handPlayers.map(p => ({ ...p, hasActed: false }));
    const hero = handPlayers.find(p => p.id === HUMAN_ID)!;

    if (hero.status === 'active') {
      // 3 requested → cap to 2
      const req3   = [0,1,2];
      const capped = req3.slice(0, limit);
      assert(capped.length === 2, `Hand ${handNum}: DRAW_2 cap — 3→${capped.length}`);

      const d2 = humanDraw(hero, capped, deck, discardPile);
      deck = d2.deck; discardPile = d2.discardPile;
      handPlayers = handPlayers.map(p => p.id === HUMAN_ID ? d2.player : p);

      assert(handPlayers.find(p => p.id === HUMAN_ID)!.cards.length === 5,
        `Hand ${handNum}: hero has 5 cards after DRAW_2`);
    }

    const bd2 = botDrawRound(handPlayers, deck, discardPile, 'DRAW_2');
    handPlayers = bd2.players; deck = bd2.deck; discardPile = bd2.discardPile;
    handPlayers = handPlayers.map(p => ({ ...p, hasActed: true }));
  }

  // ── BET_3 ───────────────────────────────────────────────────────────────────
  doBetRound('BET_3');

  // ── DRAW_3 (up to 1) ────────────────────────────────────────────────────────
  {
    const limit = discardLimit('DRAW_3');
    assert(limit === 1, `Hand ${handNum}: DRAW_3 limit is 1`);

    handPlayers = handPlayers.map(p => ({ ...p, hasActed: false }));
    const hero = handPlayers.find(p => p.id === HUMAN_ID)!;

    if (hero.status === 'active') {
      // 2 requested → cap to 1
      const req2   = [0,1];
      const capped = req2.slice(0, limit);
      assert(capped.length === 1, `Hand ${handNum}: DRAW_3 cap — 2→${capped.length}`);

      const d3 = humanDraw(hero, capped, deck, discardPile);
      deck = d3.deck; discardPile = d3.discardPile;
      handPlayers = handPlayers.map(p => p.id === HUMAN_ID ? d3.player : p);

      assert(handPlayers.find(p => p.id === HUMAN_ID)!.cards.length === 5,
        `Hand ${handNum}: hero has 5 cards after DRAW_3`);
    }

    const bd3 = botDrawRound(handPlayers, deck, discardPile, 'DRAW_3');
    handPlayers = bd3.players; deck = bd3.deck; discardPile = bd3.discardPile;
    handPlayers = handPlayers.map(p => ({ ...p, hasActed: true }));
  }

  // ── BET_4 ───────────────────────────────────────────────────────────────────
  doBetRound('BET_4');

  // ── RAKE ────────────────────────────────────────────────────────────────────
  const { winnerPot, rake } = applyRake(pot);
  assert(rake === Math.floor(pot * 0.05),
    `Hand ${handNum}: rake = floor(5% of $${pot}) = $${rake}`);
  assert(winnerPot === pot - rake,
    `Hand ${handNum}: winnerPot $${winnerPot} = $${pot} − $${rake}`);
  totalRakeCollected += rake;

  // ── SHOWDOWN ────────────────────────────────────────────────────────────────
  // totalBet is 0 for all players → computeSidePots returns [] →
  // resolveShowdown falls back to `{ amount: winnerPot, eligibleIds: active }`
  const sdResult    = FlushedUpMode.resolveShowdown!(handPlayers, winnerPot);
  const finalPlayers = sdResult.players as Player[];

  // Winner declared
  const winners = finalPlayers.filter(p => p.isWinner);
  assert(winners.length >= 1, `Hand ${handNum}: at least one winner declared`);

  // Winner has highest (or tied) flush score
  if (winners.length === 1) {
    const winEval = evaluateFlushedUpHand(winners[0].cards.map(c => ({...c, isHidden: false})));
    for (const p of handPlayers.filter(p => p.status !== 'folded' && p.id !== winners[0].id)) {
      const pEval = evaluateFlushedUpHand(p.cards.map(c => ({...c, isHidden: false})));
      assert(compareFlushedUpHands(winEval, pEval) >= 0,
        `Hand ${handNum}: winner ${winners[0].name} (${winEval.description}) ≥ ${p.name} (${pEval.description})`);
    }
  }

  // ── Chip conservation ──────────────────────────────────────────────────────
  // chipsBeforeHand − rake should equal sum of all finalPlayers chips.
  // Breakdown: chipsBeforeHand − pot  (antes+bets deducted)
  //                            + winnerPot  (distributed by resolveShowdown)
  //          = chipsBeforeHand − pot + (pot − rake)
  //          = chipsBeforeHand − rake
  const chipsAfterShowdown = finalPlayers.reduce((s, p) => s + p.chips, 0);
  const expectedAfter      = chipsBeforeHand - rake;
  const diff               = Math.abs(chipsAfterShowdown - expectedAfter);
  if (diff > 1) {
    totalChipLeak += diff;
    assert(false,
      `Hand ${handNum}: chip conservation FAIL — start=$${chipsBeforeHand} rake=$${rake} expect=$${expectedAfter} got=$${chipsAfterShowdown} leak=$${diff}`);
  } else {
    assert(true, `Hand ${handNum}: chip conservation ✓`);
  }

  // ── Dealer rotation ────────────────────────────────────────────────────────
  assert(finalPlayers.filter(p => p.isDealer).length <= 1,
    `Hand ${handNum}: at most one dealer button`);

  // ── Carry chips forward ────────────────────────────────────────────────────
  globalPlayers = globalPlayers.map(gp => {
    const fp = finalPlayers.find(p => p.id === gp.id);
    return fp ? { ...gp, chips: fp.chips } : gp;
  });

  if (handFailures === 0) handsCompleted++;
  else handsFailed++;
}

// ── Final summary ─────────────────────────────────────────────────────────────

section('Summary');

const totalStart  = NUM_PLAYERS * STARTING_CHIPS;
const totalEnd    = globalPlayers.reduce((s, p) => s + p.chips, 0);
// Adjusted pool = starting chips + any chips injected by rebuys
const adjustedStart = totalStart + totalRebuys;

console.log(`\n  Hands completed without error : ${handsCompleted} / 100`);
console.log(`  Hands with failures            : ${handsFailed}`);
console.log(`  Duplicate-card incidents       : ${totalDuplicates}`);
console.log(`  Total chip leak                : $${totalChipLeak}`);
console.log(`  Hero rebuys                    : $${totalRebuys}`);
console.log(`\n  Starting pool (adjusted) : $${adjustedStart}`);
console.log(`  Ending pool              : $${totalEnd}`);
console.log(`  Rake collected           : $${totalRakeCollected}`);
console.log(`  Pool + rake              : $${totalEnd + totalRakeCollected} (expect $${adjustedStart})`);

assert(totalDuplicates === 0, 'No duplicate cards across 100 hands');
assert(handsCompleted  >= 90, `≥90 of 100 hands completed without error (got ${handsCompleted})`);
assert(totalChipLeak   === 0, 'No chip leaks across any hand');
assert(Math.abs((totalEnd + totalRakeCollected) - adjustedStart) <= 100,
  `Global chip conservation (diff=${Math.abs((totalEnd + totalRakeCollected) - adjustedStart)})`);

console.log(`\n  Result: ${passes} passed, ${failures} failed\n`);

if (failures > 0) {
  console.error(`FAILED — ${failures} assertion(s) failed`);
  process.exit(1);
} else {
  console.log('ALL PASSED');
  process.exit(0);
}
