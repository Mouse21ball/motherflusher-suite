import { GameMode, GameState, Player, CardType, GamePhase, Declaration } from '../gameTypes';
import { decideBet, applyBetDecision, botPersonality, takeAnte } from '../engine/botUtils';
import { sidePotsForShowdown, resolveSwingSidePots } from '../engine/sidePots';

// ── Rank tables ───────────────────────────────────────────────────────────────

const HIGH_RV: Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
const LOW_RV:  Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':1  };

function hv(rank: string): number { return HIGH_RV[rank] ?? 2; }
function lv(rank: string): number { return LOW_RV[rank]  ?? 2; }

function rankLabel(v: number): string {
  if (v === 1 || v === 14) return 'A';
  if (v === 13) return 'K'; if (v === 12) return 'Q'; if (v === 11) return 'J';
  return String(v);
}

// ── Standard 5-card poker evaluator ──────────────────────────────────────────

function eval5Cards(cards: CardType[]): { value: number; name: string } {
  const ranks = cards.map(c => hv(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = new Set(suits).size === 1;
  const isAceLow = ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2;
  const isStraight = (new Set(ranks).size === 5 && ranks[0] - ranks[4] === 4) || isAceLow;
  const rc = ranks.reduce((a, r) => { a[r] = (a[r] || 0) + 1; return a; }, {} as Record<number, number>);
  const counts = Object.values(rc).sort((a, b) => b - a);
  const byCount = Object.entries(rc).sort((a, b) => b[1] !== a[1] ? b[1] - a[1] : +b[0] - +a[0]).map(([r]) => +r);
  const kicker = (isAceLow ? [5, 4, 3, 2, 1] : byCount).reduce((s, r, i) => s + r * Math.pow(15, 4 - i), 0);
  if (isStraight && isFlush) {
    if (!isAceLow && ranks[0] === 14 && ranks[1] === 13) return { value: 9_000_000 + kicker, name: 'Royal Flush' };
    return { value: 8_000_000 + kicker, name: 'Straight Flush' };
  }
  if (counts[0] === 4) return { value: 7_000_000 + kicker, name: 'Four of a Kind' };
  if (counts[0] === 3 && counts[1] === 2) return { value: 6_000_000 + kicker, name: 'Full House' };
  if (isFlush) return { value: 5_000_000 + kicker, name: 'Flush' };
  if (isStraight) return { value: 4_000_000 + kicker, name: 'Straight' };
  if (counts[0] === 3) return { value: 3_000_000 + kicker, name: 'Three of a Kind' };
  if (counts[0] === 2 && counts[1] === 2) return { value: 2_000_000 + kicker, name: 'Two Pair' };
  if (counts[0] === 2) return { value: 1_000_000 + kicker, name: 'Pair' };
  return { value: kicker, name: 'High Card' };
}

function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  return arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map(rest => [x, ...rest]));
}

function bestHighHand(cards: CardType[]): { value: number; name: string } {
  if (cards.length < 5) return { value: 0, name: '< 5 cards' };
  if (cards.length === 5) return eval5Cards(cards);
  return combos(cards, 5).reduce<{ value: number; name: string }>(
    (best, c) => { const r = eval5Cards(c); return r.value > best.value ? r : best; },
    { value: 0, name: 'No Hand' }
  );
}

// ── Box Chevy 10-card evaluation (Detroit 2026-10-13) ─────────────────────────
// RULES (Detroit's design):
// - 10 cards total: 5 hole + 5 community. Must use both. No exceptions.
// - All 10 ranks must be unique. Pair = you lose (can't win either way).
// - Ace is ALWAYS 1. King is ALWAYS 13. No ace-high.
// - HIGH: sort low→high, compare from lowest card up. Higher bottom wins.
//   Best high: 4-5-6-7-8-9-10-J-Q-K (lowest card is 4)
// - LOW: sort high→low, compare from highest card down. Lower top wins.
//   Best low: A-2-3-4-5-6-7-8-9-10 (highest card is 10)
// - SWING: must be sole best HIGH and sole best LOW. No ties either way.

const BC_RV: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13,
};

function bcRank(rank: string): number { return BC_RV[rank] ?? 0; }

export interface BoxChevy10Eval {
  isMade: boolean;      // all 10 ranks unique, 10 cards present
  highSeq: number[];    // sorted low→high (for HIGH comparison)
  lowSeq: number[];     // sorted high→low (for LOW comparison)
  desc: string;
}

export function evaluateBoxChevy10(holeCards: CardType[], communityCards: CardType[]): BoxChevy10Eval {
  const all = [...holeCards, ...communityCards].map(c => ({ ...c, isHidden: false }));
  const ranks = all.map(c => bcRank(c.rank));
  const isMade = all.length === 10 && new Set(ranks).size === ranks.length;
  const highSeq = [...ranks].sort((a, b) => a - b);
  const lowSeq = [...ranks].sort((a, b) => b - a);
  return {
    isMade,
    highSeq,
    lowSeq,
    desc: highSeq.map(rankLabel).join('-'),
  };
}

/** HIGH: higher bottom card wins. Non-made (pair) always loses. */
export function compareBoxChevyHigh(a: BoxChevy10Eval, b: BoxChevy10Eval): number {
  if (a.isMade && !b.isMade) return 1;
  if (!a.isMade && b.isMade) return -1;
  if (!a.isMade && !b.isMade) return 0;
  for (let i = 0; i < 10; i++) {
    if (a.highSeq[i] !== b.highSeq[i]) return a.highSeq[i] - b.highSeq[i];
  }
  return 0;
}

/** LOW: lower top card wins. Non-made (pair) always loses. */
export function compareBoxChevyLow(a: BoxChevy10Eval, b: BoxChevy10Eval): number {
  if (a.isMade && !b.isMade) return 1;
  if (!a.isMade && b.isMade) return -1;
  if (!a.isMade && !b.isMade) return 0;
  for (let i = 0; i < 10; i++) {
    if (a.lowSeq[i] !== b.lowSeq[i]) return b.lowSeq[i] - a.lowSeq[i];
  }
  return 0;
}

// ── Legacy 5-card evaluators (kept for bot hand-strength heuristics) ──────────

function scoreLow5(cards: CardType[]): { value: number; desc: string } {
  const ranks = cards.map(c => lv(c.rank)).sort((a, b) => a - b);
  const rc: Record<number, number> = {};
  for (const r of ranks) rc[r] = (rc[r] ?? 0) + 1;
  const counts = Object.values(rc).sort((a, b) => b - a);
  // Ace-to-five ignores straights/flushes. Every category must rank below
  // the next: unpaired, pair, two pair, trips, full house, quads.
  const category = counts[0] === 4 ? 5
    : counts[0] === 3 && counts[1] === 2 ? 4
    : counts[0] === 3 ? 3
    : counts[0] === 2 && counts[1] === 2 ? 2
    : counts[0] === 2 ? 1 : 0;
  // Compare repeated ranks first, then descending kickers. Sorting only
  // unique ranks incorrectly lets a low kicker beat a lower pair.
  const ordered = Object.entries(rc)
    .sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))
    .map(([rank]) => Number(rank));
  const encoded = ordered.reduce((acc, rank, i) => acc + rank * 15 ** (4 - i), 0);
  return { value: category * 1_000_000 + encoded, desc: ranks.map(rankLabel).join('-') };
}

function bestLowHand(cards: CardType[]): { value: number; desc: string } {
  if (cards.length < 5) return { value: 999_999_999, desc: '< 5 cards' };
  if (cards.length === 5) return scoreLow5(cards);
  return combos(cards, 5).reduce<{ value: number; desc: string }>(
    (best, c) => { const r = scoreLow5(c); return r.value < best.value ? r : best; },
    { value: 999_999_999, desc: 'No Hand' }
  );
}

// ── Made hand check ───────────────────────────────────────────────────────────
// All 10 combined cards (5 hole + 5 community) must have unique ranks — no pairs.

export function hasMadeHand(holeCards: CardType[], communityCards: CardType[]): boolean {
  const allRanks = [...holeCards, ...communityCards].map(c => c.rank);
  return new Set(allRanks).size === allRanks.length;
}

// ── Public evaluation ─────────────────────────────────────────────────────────

export interface BoxChevyEval {
  isMade: boolean;
  highValue: number;
  highName: string;
  lowValue: number;
  lowDesc: string;
}

export function evaluateBoxChevy(holeCards: CardType[], communityCards: CardType[]): BoxChevyEval {
  const hole = holeCards.map(c => ({ ...c, isHidden: false }));
  const comm = communityCards.map(c => ({ ...c, isHidden: false }));
  const eval10 = evaluateBoxChevy10(hole, comm);
  // Encode for backwards compat: highValue higher = better, lowValue lower = better
  const highValue = eval10.isMade
    ? eval10.highSeq.reduce((acc, r, i) => acc + r * Math.pow(14, 9 - i), 0)
    : 0;
  const lowValue = eval10.isMade
    ? eval10.lowSeq.reduce((acc, r, i) => acc + r * Math.pow(14, 9 - i), 0)
    : 999_999_999;
  return {
    isMade: eval10.isMade,
    highValue,
    highName: eval10.desc,
    lowValue,
    lowDesc: eval10.desc,
  };
}

// ── Bot helpers ───────────────────────────────────────────────────────────────

function chooseBoxChevyDiscards(holeCards: CardType[], communityCards: CardType[], maxDiscard: number): number[] {
  if (maxDiscard <= 0) return [];
  const commRanks = new Set(communityCards.map(c => c.rank));
  const holeRankCounts: Record<string, number> = {};
  for (const c of holeCards) holeRankCounts[c.rank] = (holeRankCounts[c.rank] ?? 0) + 1;

  const scored = holeCards.map((c, i) => {
    let score = 0;
    if (commRanks.has(c.rank)) score += 100;
    if ((holeRankCounts[c.rank] ?? 0) > 1) score += 50;
    const isGoodHigh = hv(c.rank) >= 11;
    const isGoodLow  = lv(c.rank) <= 5;
    if (!isGoodHigh && !isGoodLow) score += 8;
    return { i, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.filter(s => s.score > 0).slice(0, maxDiscard);
  return candidates.map(s => s.i).sort((a, b) => b - a);
}

function botHandStrength(allCards: CardType[], isMade: boolean): number {
  if (!isMade) return 0.05;
  // Use 10-card sequences for strength (Detroit 2026-10-13)
  // allCards here is hole+community; split assuming 5 hole (first 5)
  const hole = allCards.slice(0, 5);
  const comm = allCards.slice(5);
  const eval10 = evaluateBoxChevy10(hole, comm);
  if (!eval10.isMade) return 0.05;
  const highN = (eval10.highSeq[0] - 1) / 3;   // lowest card 1-4 → 0-1
  const lowN = (13 - eval10.lowSeq[0]) / 3;    // highest card 10-13 → 0-1
  return Math.min(0.95, Math.max(highN, lowN) * 0.85 + 0.15);
}

// ── Game mode ─────────────────────────────────────────────────────────────────

export const BoxChevyMode: GameMode = {
  id: 'box_chevy',
  name: 'Box Chevy',
  phases: [
    'WAITING', 'ANTE', 'DEAL',
    'DRAW_1', 'BET_1',
    'DRAW_2', 'BET_2',
    'DRAW_3', 'BET_3',
    'DECLARE', 'SHOWDOWN',
  ],

  deal(deck, players, _myId) {
    const d = [...deck];
    const newPlayers = players.map(p => {
      if (p.status !== 'active') return { ...p, cards: [] as CardType[] };
      const cards = d.splice(0, 5).map(c => ({ ...c, isHidden: true }));
      return { ...p, cards };
    });

    // Deal exactly 5 community cards. Only check: rank must not already appear
    // among community cards already picked this loop. No cross-check against
    // hole cards. With 27+ cards remaining and 13 possible ranks there are
    // always enough unique-ranked cards to fill all 5 slots.
    const commRanksSeen = new Set<string>();
    const communityCards: CardType[] = [];
    let ci = 0;
    while (communityCards.length < 5 && ci < d.length) {
      const card = d[ci++];
      if (!commRanksSeen.has(card.rank)) {
        communityCards.push({ ...card, isHidden: false });
        commRanksSeen.add(card.rank);
      }
    }
    const remainder = d.slice(ci);

    return { players: newPlayers, communityCards, deck: remainder };
  },

  getAutoTransition(_phase: GamePhase) {
    return null;
  },

  botAction(state: GameState, botId: string) {
    const bIdx = state.players.findIndex(p => p.id === botId);
    if (bIdx === -1) return null;
    const bot = state.players[bIdx];
    if (bot.status !== 'active') return null;

    const { phase } = state;
    let newPlayers = state.players.map(p => ({ ...p }));
    let newPot = state.pot;
    let newCurrentBet = state.currentBet;
    let newRaisesThisRound = state.raisesThisRound ?? 0;
    const discardPile = [...(state.discardPile || [])];
    let message = '';

    // ── ANTE ─────────────────────────────────────────────────────────────────
    if (phase === 'ANTE') {
      const ante = 25;
      const payment = takeAnte(bot.chips, ante);
      newPlayers[bIdx] = { ...bot, chips: payment.chips, hasActed: true };
      newPot += payment.contribution;
      message = `${bot.name} paid $${payment.contribution} ante`;
    }

    // ── DRAW phases ──────────────────────────────────────────────────────────
    else if (phase === 'DRAW_1' || phase === 'DRAW_2' || phase === 'DRAW_3') {
      const maxDiscard = phase === 'DRAW_1' ? 3 : phase === 'DRAW_2' ? 2 : 1;
      const botCards = bot.cards.map(c => ({ ...c, isHidden: false }));
      const comm = (state.communityCards ?? []).map(c => ({ ...c, isHidden: false }));
      const discIdx = chooseBoxChevyDiscards(botCards, comm, maxDiscard);
      const newCards = [...botCards];
      const newDeck = [...state.deck];
      for (const i of discIdx.sort((a, b) => b - a)) {
        discardPile.push(newCards[i]);
        if (newDeck.length === 0 && discardPile.length > 0) {
          const reshuffled = [...discardPile]; discardPile.length = 0;
          for (let ri = reshuffled.length - 1; ri > 0; ri--) {
            const rj = Math.floor(Math.random() * (ri + 1));
            [reshuffled[ri], reshuffled[rj]] = [reshuffled[rj], reshuffled[ri]];
          }
          newDeck.push(...reshuffled);
        }
        const drawn = newDeck.shift();
        if (drawn) newCards[i] = { ...drawn, isHidden: false };
      }
      newPlayers[bIdx] = { ...bot, cards: newCards, hasActed: true };
      message = discIdx.length > 0 ? `${bot.name} draws ${discIdx.length}` : `${bot.name} stands pat`;

      const actives = newPlayers.filter(p => p.status === 'active');
      const roundOver = actives.every(p => p.hasActed);
      let nextPlayerId: string | undefined;
      if (!roundOver) {
        const next = newPlayers.find(p => p.status === 'active' && !p.hasActed);
        nextPlayerId = next?.id;
      }
      return {
        stateUpdates: { players: newPlayers, deck: newDeck, discardPile },
        message, roundOver, nextPlayerId,
      };
    }

    // ── DECLARE ──────────────────────────────────────────────────────────────
    else if (phase === 'DECLARE') {
      const botCards = bot.cards.map(c => ({ ...c, isHidden: false }));
      const comm = (state.communityCards ?? []).map(c => ({ ...c, isHidden: false }));
      const madeHand = hasMadeHand(botCards, comm);

      if (!madeHand) {
        newPlayers[bIdx] = { ...bot, status: 'folded' as any, declaration: null, hasActed: true };
        message = `${bot.name} has no made hand — folds`;
      } else {
        // Bot declaration based on 10-card sequences (Detroit 2026-10-13)
        const eval10 = evaluateBoxChevy10(botCards, comm);
        // High quality: lowest card 1-4, higher = better (best = 4)
        const lowCard = eval10.highSeq[0];
        const highQuality = (lowCard - 1) / 3;
        // Low quality: highest card 10-13, lower = better (best = 10)
        const highCard = eval10.lowSeq[0];
        const lowQuality = (13 - highCard) / 3;
        const isGoodHigh = highQuality >= 0.5;
        const isGoodLow = lowQuality >= 0.5;

        let declaration: Declaration;
        if (isGoodHigh && isGoodLow && Math.random() < 0.25) {
          declaration = 'SWING';
        } else if (isGoodHigh && !isGoodLow) {
          declaration = 'HIGH';
        } else if (!isGoodHigh && isGoodLow) {
          declaration = 'LOW';
        } else {
          declaration = Math.random() < 0.5 ? 'HIGH' : 'LOW';
        }
        newPlayers[bIdx] = { ...bot, declaration, hasActed: true };
        message = `${bot.name} declares ${declaration}`;
      }

      const actives = newPlayers.filter(p => p.status === 'active');
      const roundOver = actives.every(p => p.hasActed);
      let nextPlayerId: string | undefined;
      if (!roundOver) {
        const next = newPlayers.find(p => p.status === 'active' && !p.hasActed);
        nextPlayerId = next?.id;
      }
      return { stateUpdates: { players: newPlayers }, message, roundOver, nextPlayerId };
    }

    // ── BET phases ────────────────────────────────────────────────────────────
    else if (phase.startsWith('BET')) {
      const comm = state.communityCards ?? [];
      const botCards = bot.cards.map(c => ({ ...c, isHidden: false }));
      const allCards = [...botCards, ...comm];
      const isMade = hasMadeHand(botCards, comm);
      const strength = botHandStrength(allCards, isMade);
      const decision = decideBet(strength, state.pot, state.currentBet, bot.bet, bot.chips, {
        raisesThisRound: newRaisesThisRound,
        personality: botPersonality(botId),
      });
      const applied = applyBetDecision(decision, bot, newCurrentBet, newPot, newRaisesThisRound);
      newPlayers[bIdx] = {
        ...bot,
        chips: applied.chips, bet: applied.bet, status: applied.status as any, hasActed: true,
      };
      newPot = applied.pot;
      newCurrentBet = applied.currentBet;
      newRaisesThisRound = applied.raisesThisRound;
      message = applied.message;
      if (applied.status === 'folded') newPlayers[bIdx].declaration = null;
      if (applied.currentBet > (state.currentBet ?? 0)) {
        newPlayers = newPlayers.map((p, i) => i !== bIdx && p.status === 'active' ? { ...p, hasActed: false } : p);
      }
    }

    else { return null; }

    // ── Round-over / nextPlayerId (ANTE and BET phases only reach here) ─────
    const isBetPhase = (phase as string).startsWith('BET');
    const actives = isBetPhase
      ? newPlayers.filter(p => p.status === 'active' && p.chips > 0)
      : newPlayers.filter(p => p.status === 'active');
    const allActed     = actives.every(p => p.hasActed);
    const allBetsMatch = actives.every(p => p.bet === newCurrentBet || p.chips === 0);
    const roundOver = isBetPhase ? (allActed && allBetsMatch) : allActed;

    let nextPlayerId: string | undefined;
    if (!roundOver) {
      let nextIdx = (bIdx + 1) % newPlayers.length;
      let count = 0;
      while (count < newPlayers.length) {
        const p = newPlayers[nextIdx];
        const needsAct = !p.hasActed || (isBetPhase && p.bet < newCurrentBet);
        if (p.status === 'active' && (!isBetPhase || p.chips > 0) && needsAct) break;
        nextIdx = (nextIdx + 1) % newPlayers.length;
        count++;
      }
      nextPlayerId = newPlayers[nextIdx].id;
    }

    return {
      stateUpdates: { players: newPlayers, pot: newPot, currentBet: newCurrentBet, raisesThisRound: newRaisesThisRound, discardPile },
      message, roundOver, nextPlayerId,
    };
  },

  evaluateHand: (player: Player, communityCards: CardType[]) =>
    evaluateBoxChevy(player.cards, communityCards ?? []),

  resolveShowdown(players: Player[], pot: number, _myId: string, communityCards: CardType[] = []) {
    const messages: string[] = [];
    const comm = communityCards.map(c => ({ ...c, isHidden: false }));

    const finalPlayers: Player[] = players.map(p => ({
      ...p,
      cards: p.cards.map(c => ({ ...c, isHidden: false })),
    }));

    const active = finalPlayers.filter(p =>
      p.status !== 'folded' && p.declaration && p.declaration !== 'FOLD'
    );
    const sidePots = sidePotsForShowdown(finalPlayers, pot, active.map(p => p.id));

    if (active.length === 0) {
      return { players: finalPlayers, pot, messages: ['No declarers — pot rolls over'] };
    }
    if (active.length === 1) {
      const sole = active[0];
      const idx = finalPlayers.findIndex(p => p.id === sole.id);
      finalPlayers[idx] = { ...finalPlayers[idx], chips: finalPlayers[idx].chips + pot, isWinner: true };
      messages.push(`${sole.name} wins $${pot} — last one standing`);
      return { players: finalPlayers, pot: 0, messages };
    }

    const evalMap = new Map<string, BoxChevy10Eval>();
    for (const p of active) {
      evalMap.set(p.id, evaluateBoxChevy10(p.cards, comm));
    }

    function findHighWinners(pool: Player[]): Player[] {
      if (!pool.length) return [];
      let best: BoxChevy10Eval | null = null;
      for (const p of pool) {
        const e = evalMap.get(p.id)!;
        if (!e.isMade) continue;
        if (!best || compareBoxChevyHigh(e, best) > 0) best = e;
      }
      if (!best) return [];
      return pool.filter(p => {
        const e = evalMap.get(p.id)!;
        return e.isMade && compareBoxChevyHigh(e, best) === 0;
      });
    }

    function findLowWinners(pool: Player[]): Player[] {
      if (!pool.length) return [];
      let best: BoxChevy10Eval | null = null;
      for (const p of pool) {
        const e = evalMap.get(p.id)!;
        if (!e.isMade) continue;
        if (!best || compareBoxChevyLow(e, best) > 0) best = e;
      }
      if (!best) return [];
      return pool.filter(p => {
        const e = evalMap.get(p.id)!;
        return e.isMade && compareBoxChevyLow(e, best) === 0;
      });
    }

    const resolution = resolveSwingSidePots(sidePots, active, findHighWinners, findLowWinners);
    const deltas = resolution.deltas;
    const winnerSet = new Set(Object.keys(deltas));
    for (const [id, amount] of Object.entries(deltas)) {
      messages.push(`${finalPlayers.find(p => p.id === id)!.name} wins $${amount}`);
    }

    const result = finalPlayers.map(p => ({
      ...p,
      chips: p.chips + (deltas[p.id] ?? 0),
      isWinner: winnerSet.has(p.id) || undefined,
    }));

    const awardedPot = Object.values(deltas).reduce((s, v) => s + v, 0);
    const remainingPot = pot - awardedPot;
    if (remainingPot > 0) messages.push(`No qualifying hands — $${remainingPot} rolls over`);
    return { players: result, pot: remainingPot, messages };
  },

  getNextPhase: undefined,
  checkAutoStay: undefined,
};
