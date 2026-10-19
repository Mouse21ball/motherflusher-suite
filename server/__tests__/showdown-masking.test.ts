// ─── Showdown card-masking security suite ─────────────────────────────────────
// Detroit 2026-10-18 Stage 1, Task 1.
// Standalone tsx script. Run with:
//   npx tsx server/__tests__/showdown-masking.test.ts
//
// Verifies that maskStateForPlayer in BOTH engines never leaks hidden cards:
//
//   M1  At showdown, hero sees their own cards (unmasked).
//   M2  At showdown, active (non-folded) opponents' cards ARE revealed.
//   M3  At showdown, FOLDED opponents' cards stay masked ({ isHidden: true }, no rank/suit).
//   M4  At showdown, SITTING_OUT opponents' cards stay masked.
//   M5  At showdown, spectators see active players' cards but NOT folded players' cards.
//   M6  Pre-showdown, opponents' cards are always masked.
//   M7  Deck is never exposed.
//
// Both server/genericEngine.ts and server/gameEngine.ts are tested.

import { maskStateForPlayer as maskGeneric } from '../genericEngine.js';
import { maskStateForPlayer as maskLegacy } from '../gameEngine.js';
import type { GameState, Player, CardType } from '../../shared/gameTypes.js';

let failures = 0;
let passes = 0;

function assert(cond: unknown, msg: string): void {
  if (!cond) { failures++; console.error('  ✗', msg); }
  else        { passes++;   console.log('  ✓', msg); }
}

function hasRealCards(cards: CardType[]): boolean {
  return cards.some(c => (c as any).rank !== undefined || (c as any).suit !== undefined);
}

function mkCard(rank: string, suit: string): CardType {
  return { rank, suit, isHidden: false } as unknown as CardType;
}

function mkPlayer(id: string, status: Player['status'], cards: CardType[]): Player {
  return {
    id, name: id, status, chips: 10000,
    cards, bet: 0, hasActed: true, isDealer: false,
    presence: 'human',
  } as unknown as Player;
}

function mkShowdownState(): GameState {
  return {
    phase: 'SHOWDOWN',
    players: [
      mkPlayer('hero', 'active', [mkCard('A', 'spades'), mkCard('K', 'hearts')]),
      mkPlayer('opp-active', 'active', [mkCard('Q', 'clubs'), mkCard('J', 'diamonds')]),
      mkPlayer('opp-folded', 'folded', [mkCard('10', 'spades'), mkCard('9', 'hearts')]),
      mkPlayer('opp-sitting', 'sitting_out', [mkCard('8', 'clubs'), mkCard('7', 'diamonds')]),
    ],
    communityCards: [],
    deck: [mkCard('2', 'spades')],
    discardPile: [],
    pot: 1000,
  } as unknown as GameState;
}

function runSuite(maskFn: typeof maskGeneric, engineName: string) {
  console.log(`\n── ${engineName} ──`);

  // M1: hero sees own cards
  {
    const masked = maskFn(mkShowdownState(), 'hero');
    const hero = masked.players.find(p => p.id === 'hero')!;
    assert(hasRealCards(hero.cards), 'M1 hero sees own cards at showdown');
  }

  // M2: active opponents revealed
  {
    const masked = maskFn(mkShowdownState(), 'hero');
    const opp = masked.players.find(p => p.id === 'opp-active')!;
    assert(hasRealCards(opp.cards), 'M2 active opponent cards revealed at showdown');
  }

  // M3: folded opponents stay masked
  {
    const masked = maskFn(mkShowdownState(), 'hero');
    const folded = masked.players.find(p => p.id === 'opp-folded')!;
    assert(!hasRealCards(folded.cards), 'M3 folded opponent cards stay masked at showdown');
    assert(folded.cards.every(c => c.isHidden === true), 'M3 folded cards marked isHidden');
  }

  // M4: sitting-out opponents stay masked
  {
    const masked = maskFn(mkShowdownState(), 'hero');
    const sitting = masked.players.find(p => p.id === 'opp-sitting')!;
    assert(!hasRealCards(sitting.cards), 'M4 sitting-out opponent cards stay masked at showdown');
  }

  // M5: spectators see active but not folded
  {
    const masked = maskFn(mkShowdownState(), '__spectator__');
    const active = masked.players.find(p => p.id === 'opp-active')!;
    const folded = masked.players.find(p => p.id === 'opp-folded')!;
    assert(hasRealCards(active.cards), 'M5 spectator sees active player cards at showdown');
    assert(!hasRealCards(folded.cards), 'M5 spectator does NOT see folded player cards at showdown');
  }

  // M6: pre-showdown, opponents masked
  {
    const preState = mkShowdownState();
    (preState as any).phase = 'BET_1';
    const masked = maskFn(preState, 'hero');
    const opp = masked.players.find(p => p.id === 'opp-active')!;
    assert(!hasRealCards(opp.cards), 'M6 opponent cards masked pre-showdown');
  }

  // M7: deck never exposed
  {
    const masked = maskFn(mkShowdownState(), 'hero');
    assert(masked.deck.length === 0, 'M7 deck never exposed to clients');
  }

  // M8: unexpected/undefined status values stay masked (allowlist safety)
  // If a new status is added in the future, or status is corrupted,
  // cards must NOT be revealed. Only 'active' earns revelation.
  {
    const state = mkShowdownState();
    const weird = mkPlayer('opp-weird', 'active', [mkCard('A', 'spades')]);
    (weird as any).status = 'disconnected'; // hypothetical future status
    const undef = mkPlayer('opp-undef', 'active', [mkCard('K', 'hearts')]);
    (undef as any).status = undefined;
    const nulled = mkPlayer('opp-null', 'active', [mkCard('Q', 'diamonds')]);
    (nulled as any).status = null;
    state.players.push(weird, undef, nulled);

    const masked = maskFn(state, 'hero');
    const w = masked.players.find(p => p.id === 'opp-weird')!;
    const u = masked.players.find(p => p.id === 'opp-undef')!;
    const n = masked.players.find(p => p.id === 'opp-null')!;
    assert(!hasRealCards(w.cards), 'M8 unknown status "disconnected" stays masked');
    assert(!hasRealCards(u.cards), 'M8 undefined status stays masked');
    assert(!hasRealCards(n.cards), 'M8 null status stays masked');
  }

  // M9: spectator never sees hero's or folded players' cards, only active
  {
    const state = mkShowdownState();
    const masked = maskFn(state, '__spectator__');
    const hero = masked.players.find(p => p.id === 'hero')!;
    const sitting = masked.players.find(p => p.id === 'opp-sitting')!;
    // Spectator is not the hero, so hero's cards are treated as opponent cards.
    // Hero is 'active', so spectator SHOULD see them (they contested the pot).
    assert(hasRealCards(hero.cards), 'M9 spectator sees hero cards (hero is active)');
    assert(!hasRealCards(sitting.cards), 'M9 spectator does NOT see sitting_out cards');
  }

  // M10: serialized WebSocket snapshot contains no leaked card data
  // Simulates what actually goes over the wire via JSON.stringify
  {
    const masked = maskFn(mkShowdownState(), 'hero');
    const wireData = JSON.stringify(masked);
    // Folded player's real cards were 10-spades and 9-hearts.
    // These strings must NOT appear in the serialized payload.
    assert(!wireData.includes('"rank":"10"'), 'M10 wire: folded 10-spades rank not serialized');
    // Sitting-out player's cards were 8-clubs and 7-diamonds.
    assert(!wireData.includes('"rank":"8"'), 'M10 wire: sitting_out 8-clubs rank not serialized');
    // Active opponent's Q-clubs SHOULD be present (legitimate revelation).
    assert(wireData.includes('"rank":"Q"'), 'M10 wire: active opponent Q-clubs IS serialized');
    // Hero's A-spades SHOULD be present (own cards).
    assert(wireData.includes('"rank":"A"'), 'M10 wire: hero A-spades IS serialized');
  }
}

console.log('Showdown card-masking security suite');
runSuite(maskGeneric, 'genericEngine (all modes)');
runSuite(maskLegacy, 'gameEngine (legacy Badugi)');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
