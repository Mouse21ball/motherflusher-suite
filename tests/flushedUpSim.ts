/**
 * Flushed Up — end-to-end hand simulation.
 * Runs 10 complete hands (ANTE → … → SHOWDOWN → ANTE) with 1 human + 4 bots.
 * Human actions are auto-simulated: ante auto-posts, calls/checks on bet rounds,
 * stands pat on draw rounds — mirrors what the fixed FlushedUpActionBar now does.
 *
 * Run: npx tsx tests/flushedUpSim.ts
 */

import { FlushedUpMode } from '../shared/modes/flushedUp';
import type { GameState, Player, CardType, GamePhase } from '../shared/gameTypes';

// ── Helpers ────────────────────────────────────────────────────────────────

function createDeck(): CardType[] {
  const suits: Array<CardType['suit']> = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: Array<CardType['rank']> = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: CardType[] = [];
  for (const suit of suits)
    for (const rank of ranks)
      deck.push({ suit, rank, isHidden: false });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function makePlayer(id: string, name: string, presence: Player['presence']): Player {
  return {
    id, name, presence,
    chips: 10000, bet: 0,
    status: 'active',
    cards: [],
    hasActed: false,
    declaration: null,
    score: undefined,
    isDealer: id === 'p1',
  };
}

function makeState(players: Player[]): GameState {
  return {
    tableId: 'SIM',
    phase: 'WAITING' as GamePhase,
    pot: 0,
    currentBet: 0,
    minBet: 25,
    activePlayerId: null,
    players,
    communityCards: [],
    messages: [],
    chatMessages: [],
    deck: [],
    discardPile: [],
    raisesThisRound: 0,
  };
}

// ── Round-over check (mirrors isPhaseRoundOver in genericEngine) ───────────

function isRoundOver(state: GameState): boolean {
  const { phase, players } = state;
  const active = players.filter(p => p.status === 'active');
  if (active.length === 0) return true;
  if (phase === 'ANTE') return active.every(p => p.hasActed);
  const isDrawPhase = ['DRAW_1', 'DRAW_2', 'DRAW_3'].includes(phase);
  if (isDrawPhase) return active.every(p => p.hasActed);
  if (phase.startsWith('BET_')) {
    const allActed = active.every(p => p.hasActed);
    const allMatch = active.every(p => p.bet === state.currentBet || p.chips === 0);
    return allActed && allMatch;
  }
  return true;
}

// ── Human action simulation ────────────────────────────────────────────────

function humanAnteAction(state: GameState): Partial<GameState> {
  const pIdx = state.players.findIndex(p => p.id === 'p1');
  const player = state.players[pIdx];
  const paid = Math.min(25, player.chips);
  const newPlayers = [...state.players];
  newPlayers[pIdx] = { ...player, chips: player.chips - paid, hasActed: true };
  return { players: newPlayers, pot: state.pot + paid };
}

function humanBetAction(state: GameState): Partial<GameState> {
  const pIdx = state.players.findIndex(p => p.id === 'p1');
  const player = state.players[pIdx];
  const callAmount = Math.max(0, state.currentBet - player.bet);
  if (callAmount <= 0) {
    const newPlayers = [...state.players];
    newPlayers[pIdx] = { ...player, hasActed: true };
    return { players: newPlayers };
  }
  const paid = Math.min(callAmount, player.chips);
  const newPlayers = [...state.players];
  newPlayers[pIdx] = { ...player, chips: player.chips - paid, bet: player.bet + paid, hasActed: true };
  return { players: newPlayers, pot: state.pot + paid };
}

function humanDrawAction(state: GameState): Partial<GameState> {
  const pIdx = state.players.findIndex(p => p.id === 'p1');
  const newPlayers = [...state.players];
  newPlayers[pIdx] = { ...state.players[pIdx], hasActed: true };
  return { players: newPlayers };
}

// ── Phase runner ───────────────────────────────────────────────────────────

function resetForNewPhase(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      hasActed: false,
      bet: 0,
    })),
    currentBet: 0,
    raisesThisRound: 0,
  };
}

function runPhase(state: GameState, phase: GamePhase, verbose: boolean): GameState {
  let s: GameState = { ...state, phase };

  // DEAL: auto-deal and return
  if (phase === 'DEAL') {
    const deck = createDeck();
    const dealt = FlushedUpMode.deal(deck, s.players, '__server__');
    s = { ...s, ...dealt };
    if (verbose) console.log(`    dealt 5 cards to each active player`);
    return s;
  }

  // SHOWDOWN: resolve and return
  if (phase === 'SHOWDOWN') {
    // FlushedUpMode.resolveShowdown takes (players, pot) — local overload, 2 params
    const result = (FlushedUpMode.resolveShowdown as (p: Player[], pot: number) => { players: Player[]; pot: number; messages: string[] })(s.players, s.pot);
    s = { ...s, players: result.players, pot: result.pot };
    if (verbose) {
      const winner = result.players.find(p => p.isWinner);
      console.log(`    showdown resolved — winner: ${winner?.name ?? 'unknown'}, messages: ${result.messages.join('; ')}`);
    }
    return s;
  }

  // Action phases: iterate active players round-robin until round is over
  let safety = 0;
  let activeIdx = s.players.findIndex(p => p.status === 'active');
  if (activeIdx === -1) return s;

  while (!isRoundOver(s) && safety++ < 300) {
    const player = s.players[activeIdx];

    // Skip non-active or already-acted (unless they still owe chips)
    const stillOwes = phase.startsWith('BET_') && player.bet < s.currentBet && player.chips > 0;
    if (player.status !== 'active' || (player.hasActed && !stillOwes)) {
      activeIdx = (activeIdx + 1) % s.players.length;
      continue;
    }

    let updates: Partial<GameState>;

    if (player.id === 'p1') {
      // Human: simulate the now-fixed auto-ante / call / stand-pat
      if (phase === 'ANTE') {
        updates = humanAnteAction(s);
        if (verbose) console.log(`    [p1 Hero] posted $25 ante`);
      } else if (phase.startsWith('BET_')) {
        updates = humanBetAction(s);
        const callAmt = Math.max(0, s.currentBet - player.bet);
        if (verbose) console.log(`    [p1 Hero] ${callAmt <= 0 ? 'checked' : `called $${callAmt}`}`);
      } else {
        // DRAW_*
        updates = humanDrawAction(s);
        if (verbose) console.log(`    [p1 Hero] stood pat`);
      }
      s = { ...s, ...updates };
    } else {
      const result = FlushedUpMode.botAction(s, player.id);
      s = { ...s, ...result.stateUpdates };
      if (verbose) console.log(`    [${player.id} ${player.name}] ${result.message}`);

      if (result.roundOver) break;
      if (result.nextPlayerId) {
        const ni = s.players.findIndex(p => p.id === result.nextPlayerId);
        if (ni !== -1) { activeIdx = ni; continue; }
      }
    }

    activeIdx = (activeIdx + 1) % s.players.length;
  }

  if (safety >= 300) {
    throw new Error(`Safety limit hit in phase ${phase} — round never completed.\nState: ${JSON.stringify(s.players.map(p => ({ id: p.id, status: p.status, hasActed: p.hasActed, bet: p.bet, chips: p.chips })))}`);
  }

  return s;
}

// ── Single hand ────────────────────────────────────────────────────────────

const HAND_PHASES: GamePhase[] = [
  'ANTE', 'DEAL',
  'BET_1', 'DRAW_1',
  'BET_2', 'DRAW_2',
  'BET_3', 'DRAW_3',
  'BET_4',
  'SHOWDOWN',
];

function runHand(
  inputPlayers: Player[],
  handNum: number,
  verbose: boolean,
): { outputPlayers: Player[]; success: boolean; completedPhases: GamePhase[] } {
  let s = makeState(inputPlayers);
  const completedPhases: GamePhase[] = [];

  if (verbose) console.log(`\n── Hand ${handNum} ─────────────────────────────────────────`);

  for (const phase of HAND_PHASES) {
    if (verbose) console.log(`  >> ${phase}`);
    s = runPhase(resetForNewPhase(s), phase, verbose);
    completedPhases.push(phase);
  }

  // Prepare players for next hand: reset to active, reset cards
  const outputPlayers: Player[] = inputPlayers.map((orig) => {
    const after = s.players.find(p => p.id === orig.id)!;
    return {
      ...orig,
      chips: Math.max(after.chips, 100), // no-zero protection for sim
      bet: 0,
      hasActed: false,
      cards: [],
      status: 'active' as const,
      declaration: null,
      score: undefined,
      isWinner: undefined,
      isLoser: undefined,
    };
  });

  return {
    outputPlayers,
    success: completedPhases.length === HAND_PHASES.length,
    completedPhases,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const HANDS = 10;
  const VERBOSE = true;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Flushed Up — Hand Simulation');
  console.log('═══════════════════════════════════════════════════════════════');

  let players: Player[] = [
    makePlayer('p1', 'Hero',  'human'),
    makePlayer('p2', 'Slick', 'bot'),
    makePlayer('p3', 'Vega',  'bot'),
    makePlayer('p4', 'Rosie', 'bot'),
    makePlayer('p5', 'Duke',  'bot'),
  ];

  let passed = 0;

  for (let i = 1; i <= HANDS; i++) {
    try {
      const { outputPlayers, success, completedPhases } = runHand(players, i, VERBOSE);
      players = outputPlayers;
      if (success) {
        passed++;
        console.log(`✅ Hand ${i}: ${completedPhases.join(' → ')}`);
      } else {
        console.log(`❌ Hand ${i}: INCOMPLETE — ${completedPhases.length}/${HAND_PHASES.length} phases: ${completedPhases.join(' → ')}`);
      }
    } catch (err) {
      console.log(`❌ Hand ${i}: THREW — ${(err as Error).message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(` RESULT: ${passed}/${HANDS} hands completed successfully`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (passed < HANDS) process.exit(1);
}

main();
