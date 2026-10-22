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

    // Declarations audit (Detroit 2026-10-22): who reached DECLARE and
    // what became of them, from the authoritative input states.
    const declarations = players
      .filter(p => p.cards.length > 0 || p.declaration != null)
      .map(p => ({
        playerId: p.id,
        declaration: p.declaration ?? null,
        outcome:
          p.declaration === 'HIGH' || p.declaration === 'LOW' || p.declaration === 'SWING' ? 'declared'
          : p.declaration === 'FOLD' ? 'timed out — folded'
          : (p as any).foldReason === 'declare-auto-invalid' ? 'auto-folded (no made hand)'
          : p.status === 'folded' ? 'folded before declare'
          : 'in hand',
      }));

    if (active.length === 0) {
      return {
        players: finalPlayers, pot, messages: ['No declarers — pot rolls over'],
        summary: {
          modeId: 'boxchevy',
          headline: `No declarers — $${pot} rolls over`,
          awards: [],
          entries: [],
          comparisons: ['No player could declare — every remaining hand was unmade or folded at DECLARE, so the whole pot rolls to the next hand.'],
          declarations,
          rollover: pot,
        },
      };
    }
    if (active.length === 1) {
      const sole = active[0];
      const idx = finalPlayers.findIndex(p => p.id === sole.id);
      finalPlayers[idx] = { ...finalPlayers[idx], chips: finalPlayers[idx].chips + pot, isWinner: true };
      messages.push(`${sole.name} wins $${pot} — last one standing`);
      const soleEval = evaluateBoxChevy10(sole.cards, comm);
      return {
        players: finalPlayers, pot: 0, messages,
        summary: {
          modeId: 'boxchevy',
          headline: `${sole.name} wins $${pot} — last one standing`,
          awards: [{ playerId: sole.id, amount: pot, part: 'SOLE', reason: `Last one standing — the only player who declared ${sole.declaration ?? ''}`.trim() }],
          entries: [{ playerId: sole.id, description: soleEval.desc, made: soleEval.isMade }],
          comparisons: [],
          declarations,
          rollover: 0,
        },
      };
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

    // Structured summary (Detroit 2026-10-22) — from this settlement's
    // own resolution: deltas, winner sets, and the approved comparators.
    const nameOf = (id: string) => finalPlayers.find(p => p.id === id)?.name ?? id;
    const partReason = (part: 'HIGH' | 'LOW'): string | null => {
      const pool = active.filter(p =>
        part === 'HIGH'
          ? (p.declaration === 'HIGH' || p.declaration === 'SWING')
          : (p.declaration === 'LOW' || p.declaration === 'SWING'));
      const made = pool.filter(p => evalMap.get(p.id)!.isMade);
      if (pool.length === 0) return null;
      if (made.length === 0) return `${part}: no made hand among the ${part} declarers — that side does not pay.`;
      const winners = part === 'HIGH' ? findHighWinners(pool) : findLowWinners(pool);
      if (winners.length === 0) return null;
      const w = evalMap.get(winners[0].id)!;
      if (winners.length > 1) return `${part}: tied — identical 10-card sequences (${w.desc}) — split.`;
      const rest = made.filter(p => p.id !== winners[0].id);
      if (rest.length === 0) return `${part}: ${nameOf(winners[0].id)} holds the only made ${part} hand (${w.desc}).`;
      const cmp = part === 'HIGH' ? compareBoxChevyHigh : compareBoxChevyLow;
      let runner = rest[0];
      for (const p of rest) if (cmp(evalMap.get(p.id)!, evalMap.get(runner.id)!) > 0) runner = p;
      const r = evalMap.get(runner.id)!;
      const seqW = part === 'HIGH' ? w.highSeq : w.lowSeq;
      const seqR = part === 'HIGH' ? r.highSeq : r.lowSeq;
      let i = 0;
      while (i < 10 && seqW[i] === seqR[i]) i++;
      const where = part === 'HIGH' ? `card ${i + 1} from the bottom` : `card ${i + 1} from the top`;
      const verb = part === 'HIGH' ? 'over' : 'under';
      return `${part}: ${nameOf(winners[0].id)} (${w.desc}) beats ${nameOf(runner.id)} (${r.desc}) — decided at ${where}: ${rankLabel(seqW[i])} ${verb} ${rankLabel(seqR[i])}.`;
    };
    const highReason = partReason('HIGH');
    const lowReason = partReason('LOW');
    const comparisons: string[] = [];
    if (highReason) comparisons.push(highReason);
    if (lowReason) comparisons.push(lowReason);
    const scoopIds = [...resolution.scoopWinnerIds];
    for (const id of scoopIds) {
      comparisons.push(`SWING: ${nameOf(id)} is the sole best HIGH and the sole best LOW — takes both sides.`);
    }
    if (remainingPot > 0) {
      comparisons.push(`No qualifying hand for the remaining $${remainingPot} — it rolls over to the next hand.`);
    }
    const awards = Object.entries(deltas).map(([id, amount]) => {
      const parts: string[] = [];
      if (resolution.scoopWinnerIds.has(id)) parts.push('SWING');
      else {
        if (resolution.highWinnerIds.has(id)) parts.push('HIGH');
        if (resolution.lowWinnerIds.has(id)) parts.push('LOW');
      }
      const part = parts.join(' + ') || 'POT';
      const reason =
        part === 'SWING' ? `Sole best HIGH and sole best LOW (declared SWING).`
        : part === 'HIGH' ? (highReason ?? 'Best HIGH hand.')
        : part === 'LOW' ? (lowReason ?? 'Best LOW hand.')
        : [highReason, lowReason].filter(Boolean).join(' ');
      return { playerId: id, amount, part, reason };
    });
    const winnerNames = awards.map(a => nameOf(a.playerId));
    const headline =
      awards.length === 1
        ? (awards[0].part === 'SWING' ? `${winnerNames[0]} SWINGS $${awards[0].amount}` : `${winnerNames[0]} wins $${awards[0].amount}`)
        : `Split pot — ${winnerNames.join(' & ')}`;
    const summary = {
      modeId: 'boxchevy',
      headline,
      awards,
      entries: active.map(p => ({
        playerId: p.id,
        description: evalMap.get(p.id)!.desc,
        made: evalMap.get(p.id)!.isMade,
      })),
      comparisons,
      declarations,
      rollover: remainingPot,
    };
    return { players: result, pot: remainingPot, messages, summary };
  },

  getNextPhase: undefined,
  checkAutoStay: undefined,
};
