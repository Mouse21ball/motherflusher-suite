import { GameMode, GameState, Player, CardType, GamePhase, Declaration } from '../gameTypes';
import { getNextActivePlayerIndex } from '../engine/core';
import { decideBet, applyBetDecision } from '../engine/botUtils';
import { computeSidePots, totalSidePotAmount, type SidePot } from '../engine/sidePots';

function suitsCardValue(rank: string): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return parseInt(rank, 10);
}

// Raw suit-point total for the best single suit in the supplied cards.
// Does NOT enforce the 5-card minimum — use qualifiesForSuits() for that.
export function evaluateSuitsScore(cards: CardType[]): number {
  if (!cards || cards.length === 0) return 0;
  const suitTotals: Record<string, number> = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
  for (const card of cards) {
    const pts = suitsCardValue(card.rank);
    if (!isNaN(pts)) suitTotals[card.suit] = (suitTotals[card.suit] || 0) + pts;
  }
  return Math.max(suitTotals.hearts, suitTotals.diamonds, suitTotals.clubs, suitTotals.spades);
}

// Per-spec: a player qualifies for the suits pot only if they have ≥5 visible
// cards of the same suit.  Points are irrelevant for qualification.
export function qualifiesForSuits(cards: CardType[]): boolean {
  const counts: Record<string, number> = {};
  for (const c of cards) {
    if (!c.isHidden) counts[c.suit] = (counts[c.suit] || 0) + 1;
  }
  return Object.values(counts).some(n => n >= 5);
}

export function evaluatePokerHand(cards: CardType[]): { description: string; tier: number } | null {
  if (!cards || cards.length < 5) return null;
  const result = eval5Cards(cards.slice(0, 5));
  const tier = Math.floor(result.value / 1000000);
  return { description: result.name, tier };
}

const pokerRankValues: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function getCombinations<T>(array: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k === 1) return array.map(a => [a]);
  if (array.length < k) return [];
  const combs: T[][] = [];
  array.forEach((current, index) => { const sc = getCombinations(array.slice(index + 1), k - 1); sc.forEach(s => combs.push([current, ...s])); });
  return combs;
}

function eval5Cards(cards: CardType[]): { value: number; name: string } {
  const ranks = cards.map(c => pokerRankValues[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = new Set(suits).size === 1;
  const isStraight = (new Set(ranks).size === 5 && ranks[0] - ranks[4] === 4) || (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2);
  const rankCounts = ranks.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {} as Record<number, number>);
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const sortedByCount = Object.entries(rankCounts).sort((a, b) => b[1] !== a[1] ? b[1] - a[1] : parseInt(b[0]) - parseInt(a[0])).map(([r]) => parseInt(r));
  const kicker = sortedByCount.reduce((sum, r, i) => sum + r * Math.pow(15, 4 - i), 0);
  if (isStraight && isFlush) { if (ranks[0] === 14 && ranks[1] === 13) return { value: 9000000 + kicker, name: 'Royal Flush' }; return { value: 8000000 + kicker, name: 'Straight Flush' }; }
  if (counts[0] === 4) return { value: 7000000 + kicker, name: 'Four of a Kind' };
  if (counts[0] === 3 && counts[1] === 2) return { value: 6000000 + kicker, name: 'Full House' };
  if (isFlush) return { value: 5000000 + kicker, name: 'Flush' };
  if (isStraight) return { value: 4000000 + kicker, name: 'Straight' };
  if (counts[0] === 3) return { value: 3000000 + kicker, name: 'Three of a Kind' };
  if (counts[0] === 2 && counts[1] === 2) return { value: 2000000 + kicker, name: 'Two Pair' };
  if (counts[0] === 2) return { value: 1000000 + kicker, name: 'Pair' };
  return { value: kicker, name: 'High Card' };
}

// Board layout (15 community cards):
//   Side A  : indices 0, 1, 2                             = 3 cards (single row, left)
//   Side B  : indices 3, 4, 5                             = 3 cards (single row, right)
//   Center  : indices 6,7,8 / 9,10 / 11,12 / 13,14       = 9 cards (4 rows, middle)
//
// PATH_A = Side A (0-2) + Center (6-14)  — never includes Side B
// PATH_B = Side B (3-5) + Center (6-14)  — never includes Side A
export const PATH_A_INDICES = [0, 1, 2, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const PATH_B_INDICES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

interface CE { card: CardType; index: number; type: 'hole' | 'comm'; }

function getVisibleEntries(holeCards: CardType[], communityCards: CardType[], pathIndices: number[]): CE[] {
  const holeEntries: CE[] = holeCards.map((c, i) => ({ card: c, index: i, type: 'hole' as const })).filter(e => !e.card.isHidden);
  const commEntries: CE[] = pathIndices.map(i => ({ card: communityCards[i], index: i, type: 'comm' as const })).filter(e => e.card && !e.card.isHidden);
  return [...holeEntries, ...commEntries];
}

function evaluateBestPokerOnPath(holeCards: CardType[], communityCards: CardType[], pathIndices: number[]): { value: number; name: string; holeIndices: number[]; commIndices: number[] } | null {
  const allEntries = getVisibleEntries(holeCards, communityCards, pathIndices);
  if (allEntries.length < 5) return null;
  const combos = getCombinations(allEntries, 5);
  let best: { value: number; name: string; holeIndices: number[]; commIndices: number[] } | null = null;
  for (const combo of combos) {
    const result = eval5Cards(combo.map(c => c.card));
    if (!best || result.value > best.value) best = { value: result.value, name: result.name, holeIndices: combo.filter(c => c.type === 'hole').map(c => c.index), commIndices: combo.filter(c => c.type === 'comm').map(c => c.index) };
  }
  return best;
}

export function evaluateBestSuitsOnPath(holeCards: CardType[], communityCards: CardType[], pathIndices: number[]): { score: number; valid: boolean; suit: string; holeIndices: number[]; commIndices: number[] } {
  const allEntries = getVisibleEntries(holeCards, communityCards, pathIndices);
  const bySuit: Record<string, CE[]> = {};
  for (const entry of allEntries) { const s = entry.card.suit; if (!bySuit[s]) bySuit[s] = []; bySuit[s].push(entry); }
  let best = { score: 0, valid: false, suit: '', holeIndices: [] as number[], commIndices: [] as number[] };
  for (const [suit, entries] of Object.entries(bySuit)) {
    if (entries.length < 5) continue;
    const sorted = [...entries].sort((a, b) => suitsCardValue(b.card.rank) - suitsCardValue(a.card.rank));
    const top5 = sorted.slice(0, 5);
    const score = top5.reduce((sum, e) => sum + suitsCardValue(e.card.rank), 0);
    if (score > best.score) best = { score, valid: true, suit, holeIndices: top5.filter(e => e.type === 'hole').map(e => e.index), commIndices: top5.filter(e => e.type === 'comm').map(e => e.index) };
  }
  return best;
}

function spEvaluateHand(player: Player, communityCards: CardType[]) {
  if (player.cards.length === 0) return null;
  const pokerA = evaluateBestPokerOnPath(player.cards, communityCards, PATH_A_INDICES);
  const pokerB = evaluateBestPokerOnPath(player.cards, communityCards, PATH_B_INDICES);
  const suitsA = evaluateBestSuitsOnPath(player.cards, communityCards, PATH_A_INDICES);
  const suitsB = evaluateBestSuitsOnPath(player.cards, communityCards, PATH_B_INDICES);
  let bestPoker = pokerA;
  if (pokerB && (!pokerA || pokerB.value > pokerA.value)) bestPoker = pokerB;
  const bestSuits = suitsA.score >= suitsB.score ? suitsA : suitsB;
  const suitSymbols: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  return {
    high: bestPoker?.name || 'No Hand',
    low: bestSuits.valid ? `${suitSymbols[bestSuits.suit] || ''}${bestSuits.score} pts` : 'No Suits',
    highEval: bestPoker ? { description: bestPoker.name, usedHoleCardIndices: bestPoker.holeIndices, usedCommunityCardIndices: bestPoker.commIndices } : { description: 'No Hand', usedHoleCardIndices: [] as number[], usedCommunityCardIndices: [] as number[] },
    lowEval: bestSuits.valid ? { description: `${suitSymbols[bestSuits.suit] || ''}${bestSuits.score} pts`, usedHoleCardIndices: bestSuits.holeIndices, usedCommunityCardIndices: bestSuits.commIndices } : { description: 'No Suits', usedHoleCardIndices: [] as number[], usedCommunityCardIndices: [] as number[] },
    description: 'Evaluated',
    isValidBadugi: bestSuits.valid,
    pokerValue: bestPoker?.value || 0,
    suitsScore: bestSuits.score,
    suitsValid: bestSuits.valid,
    // Legacy fields kept for compatibility
    swingPokerValue: bestPoker?.value || 0,
    swingSuitsScore: bestSuits.score,
  };
}

export const SuitsPokerMode: GameMode = {
  id: 'suits_poker',
  name: 'Suits & Poker',
  phases: ['WAITING','ANTE','DEAL','REVEAL_TOP_ROW','DRAW','BET_1','REVEAL_SECOND_ROW','BET_2','REVEAL_LOWER_CENTER','BET_3','REVEAL_FACTOR_CARD','DECLARE_AND_BET','SHOWDOWN'],

  deal: (deck, players, myId) => {
    const newDeck = [...deck];
    const newPlayers = players.map(p => { if (p.status !== 'active') return p; return { ...p, cards: newDeck.splice(0, 5).map(c => ({ ...c, isHidden: p.id !== myId })) }; });
    const communityCards = newDeck.splice(0, 15).map(c => ({ ...c, isHidden: true }));
    return { players: newPlayers, communityCards, deck: newDeck };
  },

  botAction: (state, botId) => {
    const bot = state.players.find(p => p.id === botId);
    if (!bot || bot.status !== 'active') return null;
    const { phase, players, pot, currentBet } = state;
    const botIdx = players.findIndex(p => p.id === botId);
    const isDeclarePhase = phase === 'DECLARE_AND_BET';
    const isDrawPhase = phase === 'DRAW';
    const skipAllIn = !isDeclarePhase && !isDrawPhase;
    const nextIdx = getNextActivePlayerIndex(players, botIdx, skipAllIn);

    if (phase === 'ANTE') {
      const newPlayers = players.map(p => p.id === botId ? { ...p, chips: Math.max(0, p.chips - 25), hasActed: true } : p);
      const roundOver = newPlayers.filter(p => p.status === 'active').every(p => p.hasActed);
      return { stateUpdates: { pot: pot + 25, players: newPlayers }, message: `${bot.name} antes $25`, roundOver, nextPlayerId: roundOver ? undefined : players[nextIdx].id };
    }

    if (phase === 'DRAW') {
      const evaluation = spEvaluateHand(bot, state.communityCards);
      const cardsToKeep = new Set<number>();
      if ((evaluation?.pokerValue || 0) > 1000000) evaluation?.highEval.usedHoleCardIndices.forEach(idx => cardsToKeep.add(idx));
      if (evaluation?.suitsValid && (evaluation?.suitsScore || 0) > 0) evaluation?.lowEval.usedHoleCardIndices.forEach(idx => cardsToKeep.add(idx));
      const suitCounts: Record<string, number[]> = {};
      bot.cards.forEach((c, i) => { if (!suitCounts[c.suit]) suitCounts[c.suit] = []; suitCounts[c.suit].push(i); });
      const bestSuitGroup = Object.values(suitCounts).sort((a, b) => b.length - a.length)[0];
      if (bestSuitGroup && bestSuitGroup.length >= 3) bestSuitGroup.forEach(i => cardsToKeep.add(i));
      if (cardsToKeep.size < 3) { const sorted = bot.cards.map((c, i) => ({ c, i })).sort((a, b) => pokerRankValues[b.c.rank] - pokerRankValues[a.c.rank]); for (const entry of sorted) { if (cardsToKeep.size >= 3) break; cardsToKeep.add(entry.i); } }
      const finalDiscard = bot.cards.map((_, i) => i).filter(i => !cardsToKeep.has(i)).slice(0, 2);
      const newDeck = [...state.deck]; const newDiscard = [...(state.discardPile || [])];
      const newPlayers = players.map(p => {
        if (p.id !== botId) return p;
        const newCards = [...p.cards];
        finalDiscard.forEach(idx => { newDiscard.push(newCards[idx]); if (newDeck.length === 0 && newDiscard.length > 0) { const r = [...newDiscard]; newDiscard.length = 0; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } newDeck.push(...r); } newCards[idx] = { ...newDeck.shift()!, isHidden: true }; });
        return { ...p, cards: newCards, hasActed: true };
      });
      const roundOver = newPlayers.filter(p => p.status === 'active').every(p => p.hasActed);
      return { stateUpdates: { deck: newDeck, players: newPlayers, discardPile: newDiscard }, message: finalDiscard.length > 0 ? `${bot.name} draws ${finalDiscard.length}` : `${bot.name} stands pat`, roundOver, nextPlayerId: roundOver ? undefined : players[nextIdx].id };
    }

    if (phase.startsWith('BET') || phase === 'DECLARE_AND_BET') {
      const evaluation = spEvaluateHand(bot, state.communityCards);
      let declaration: Declaration = bot.declaration;
      if (phase === 'DECLARE_AND_BET') {
        // Use path-based suits evaluation (requires 5 same-suit cards on a path)
        const hasSuits = evaluation?.suitsValid ?? false;
        const isStrongPoker = (evaluation?.pokerValue || 0) >= 2000000;
        const isStrongSuits = hasSuits && (evaluation?.suitsScore || 0) >= 45;
        if (isStrongPoker && isStrongSuits) declaration = 'SWING';
        else if (hasSuits && !isStrongPoker) declaration = 'SUITS';
        else declaration = 'POKER';
      }
      const pokerStrength = Math.min((evaluation?.pokerValue || 0) / 5000000, 1);
      const suitsStrength = evaluation?.suitsValid ? Math.min((evaluation?.suitsScore || 0) / 55, 1) : 0;
      let handStrength = declaration === 'SWING' ? Math.min(pokerStrength, suitsStrength) : declaration === 'SUITS' ? suitsStrength : pokerStrength;
      if (phase === 'BET_1') handStrength = Math.max(handStrength, 0.15); else if (phase === 'BET_2') handStrength = Math.max(handStrength, 0.12);
      const raisesSoFar = state.raisesThisRound ?? 0;
      const activeOpponents = players.filter(p => p.id !== botId && p.status === 'active').length;
      const raiseCap = activeOpponents <= 1 ? 4 : 3;
      const decision = decideBet(handStrength, pot, currentBet, bot.bet, bot.chips, { raisesThisRound: raisesSoFar, raiseCap });
      const result = applyBetDecision(decision, bot, currentBet, pot, raisesSoFar);
      const newPlayers = players.map(p => p.id !== botId ? p : { ...p, status: result.status as any, chips: result.chips, bet: result.bet, hasActed: true, declaration: declaration || p.declaration });
      const activeForRound = isDeclarePhase ? newPlayers.filter(p => p.status === 'active') : newPlayers.filter(p => p.status === 'active' && p.chips > 0);
      const roundOver = activeForRound.every(p => p.hasActed) && activeForRound.every(p => p.bet === result.currentBet || p.chips === 0);
      let msg = `${bot.name}`;
      if (phase === 'DECLARE_AND_BET' && declaration) msg += ` declares ${declaration} and`;
      if (decision.action === 'fold') msg += ' folds'; else if (decision.action === 'check') msg += ' checks'; else if (decision.action === 'call') msg += ` calls $${currentBet - bot.bet}`; else msg += ` raises to $${result.bet}`;
      return { stateUpdates: { pot: result.pot, currentBet: result.currentBet, raisesThisRound: result.raisesThisRound, players: newPlayers }, message: msg, roundOver, nextPlayerId: roundOver ? undefined : players[nextIdx].id };
    }
    return null;
  },

  getAutoTransition: (phase) => {
    // REVEAL_TOP_ROW: Side A (0-2) + Side B (3-5) + Center row 1 (6-8) — all visible before the draw
    if (phase === 'REVEAL_TOP_ROW') return { delay: 1000, action: (state) => { console.log('[CGP][suits_poker] auto-transition REVEAL_TOP_ROW → DRAW'); return { stateUpdates: { communityCards: state.communityCards.map((c, i) => i < 9 ? { ...c, isHidden: false } : c) }, message: 'Side A, Side B & Center row 1 revealed!', advancePhase: true }; } };
    // REVEAL_SECOND_ROW: Center row 2 (9-10)
    if (phase === 'REVEAL_SECOND_ROW') return { delay: 1000, action: (state) => { console.log('[CGP][suits_poker] auto-transition REVEAL_SECOND_ROW → BET_2'); return { stateUpdates: { communityCards: state.communityCards.map((c, i) => (i === 9 || i === 10) ? { ...c, isHidden: false } : c) }, message: 'Center row 2 revealed!', advancePhase: true }; } };
    // REVEAL_LOWER_CENTER: Center row 3 (11-12)
    if (phase === 'REVEAL_LOWER_CENTER') return { delay: 1000, action: (state) => { console.log('[CGP][suits_poker] auto-transition REVEAL_LOWER_CENTER → BET_3'); return { stateUpdates: { communityCards: state.communityCards.map((c, i) => (i === 11 || i === 12) ? { ...c, isHidden: false } : c) }, message: 'Center row 3 revealed!', advancePhase: true }; } };
    // REVEAL_FACTOR_CARD: Center row 4 (13-14)
    if (phase === 'REVEAL_FACTOR_CARD') return { delay: 1000, action: (state) => { console.log('[CGP][suits_poker] auto-transition REVEAL_FACTOR_CARD → DECLARE_AND_BET'); return { stateUpdates: { communityCards: state.communityCards.map((c, i) => (i === 13 || i === 14) ? { ...c, isHidden: false } : c) }, message: 'Center row 4 revealed!', advancePhase: true }; } };
    return null;
  },

  evaluateHand: (player, communityCards) => spEvaluateHand(player, communityCards),

  // ─── resolveShowdown ───────────────────────────────────────────────────────
  // TWO POTS: each half of the total.
  // POKER POT — declared POKER or SWING; best 5-card standard poker hand wins.
  // SUITS POT — declared SUITS or SWING AND have ≥5 cards of the same suit on
  //             any path; best 5-card same-suit point total wins.
  // SWING — must win BOTH sides simultaneously; all-or-nothing.  A player who
  //         loses either side wins nothing from either pot.
  // UNCONTESTED — if no qualified SUITS contestant, POKER winner takes both;
  //               if no qualified POKER contestant, SUITS winner takes both.
  // SHOWDOWN DISPLAY — messages carry SP_POKER|name|hand|amount and
  //                    SP_SUITS|name|hand|amount tags for the client overlay.
  resolveShowdown: (players, pot, myId, communityCards) => {
    const cc = communityCards || [];
    const suitSymbols: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

    // ── 1. Reveal all cards, compute full path-aware hand evaluations ──────
    const finalPlayers: Player[] = players.map(p => {
      if (p.status === 'folded') return p;
      const cards = p.cards.map(c => ({ ...c, isHidden: false }));
      return { ...p, cards, score: spEvaluateHand({ ...p, cards }, cc) || undefined };
    });

    const activePlayers = finalPlayers.filter(p => p.status !== 'folded');
    const messages: string[] = [];

    // ── 2. Side-pot setup ─────────────────────────────────────────────────
    let sidePots: SidePot[] = computeSidePots(finalPlayers);
    if (sidePots.length === 0 && pot > 0) {
      sidePots = [{ amount: pot, eligibleIds: activePlayers.map(p => p.id) }];
    }
    const totalAwardable = totalSidePotAmount(sidePots);

    // ── 3. Sole survivor ──────────────────────────────────────────────────
    if (activePlayers.length === 1) {
      const sole = activePlayers[0];
      const award = sidePots.filter(sp => sp.eligibleIds.includes(sole.id)).reduce((s, sp) => s + sp.amount, 0);
      sole.chips += award;
      sole.isWinner = true;
      const ph = Math.floor(award / 2);
      const sh = award - ph;
      messages.push(`SP_POKER|${sole.name}|—|${ph}`);
      messages.push(`SP_SUITS|${sole.name}|—|${sh}`);
      return { players: finalPlayers, pot: totalAwardable - award, messages };
    }

    // ── 4. Winner-selection helpers ───────────────────────────────────────

    // Best poker hand — returns players with the highest pokerValue > 0
    const findPokerWinner = (contenders: Player[]): Player[] => {
      let best = 0;
      const winners: Player[] = [];
      for (const p of contenders) {
        const val = p.score?.pokerValue ?? 0;
        if (val <= 0) continue;
        if (val > best) { best = val; winners.length = 0; winners.push(p); }
        else if (val === best) winners.push(p);
      }
      return winners;
    };

    // Best suits hand — player MUST have suitsValid (≥5 same-suit cards on a path)
    const findSuitsWinner = (contenders: Player[]): Player[] => {
      let best = 0;
      const winners: Player[] = [];
      for (const p of contenders) {
        if (!p.score?.suitsValid) continue; // no 5-card same-suit combo → disqualified
        const val = p.score.suitsScore ?? 0;
        if (val > best) { best = val; winners.length = 0; winners.push(p); }
        else if (val === best && val > 0) winners.push(p);
      }
      return winners;
    };

    // ── 5. Distribute across side pots ───────────────────────────────────
    const pokerDeltas: Record<string, number> = {};
    const suitsDeltas: Record<string, number> = {};

    const dist = (record: Record<string, number>, ids: string[], amount: number) => {
      if (!ids.length || !amount) return;
      const share = Math.floor(amount / ids.length);
      let rem = amount - share * ids.length;
      for (const id of ids) { record[id] = (record[id] || 0) + share + (rem-- > 0 ? 1 : 0); }
    };

    const pokerWinIds = new Set<string>();
    const suitsWinIds = new Set<string>();
    const swingScoopIds = new Set<string>();
    let rolledOver = 0;
    let anyWinner = false;

    for (const sp of sidePots) {
      const eligible = activePlayers.filter(p => sp.eligibleIds.includes(p.id));
      const pokerHalf = Math.floor(sp.amount / 2);
      const suitsHalf = sp.amount - pokerHalf;

      // All declared contestants (SWING competes on both sides)
      const pokerCands = eligible.filter(p => p.declaration === 'POKER' || p.declaration === 'SWING');
      const suitsCands = eligible.filter(p => p.declaration === 'SUITS' || p.declaration === 'SWING');

      let pokerW = findPokerWinner(pokerCands);
      let suitsW = findSuitsWinner(suitsCands);

      // ── SWING: all-or-nothing ──────────────────────────────────────────
      const swingIds = new Set(eligible.filter(p => p.declaration === 'SWING').map(p => p.id));
      const successfulSwings = [...swingIds].filter(id =>
        pokerW.some(w => w.id === id) && suitsW.some(w => w.id === id)
      );

      if (successfulSwings.length > 0) {
        // SWING player(s) scoop the full side pot
        dist(pokerDeltas, successfulSwings, pokerHalf);
        dist(suitsDeltas, successfulSwings, suitsHalf);
        successfulSwings.forEach(id => { swingScoopIds.add(id); pokerWinIds.add(id); suitsWinIds.add(id); });
        anyWinner = true;
        continue;
      }

      // Failed SWINGs — removed from both sides, win nothing
      if (swingIds.size > 0) {
        const names = eligible.filter(p => swingIds.has(p.id)).map(p => p.name).join(', ');
        messages.push(`${names} fail${swingIds.size === 1 ? 's' : ''} SWING`);
        pokerW = findPokerWinner(pokerCands.filter(p => !swingIds.has(p.id)));
        suitsW = findSuitsWinner(suitsCands.filter(p => !swingIds.has(p.id)));
      }

      if (!pokerW.length && !suitsW.length) { rolledOver += sp.amount; continue; }

      anyWinner = true;

      if (pokerW.length && suitsW.length) {
        // ── Both sides contested: normal 50/50 split ──
        dist(pokerDeltas, pokerW.map(w => w.id), pokerHalf);
        dist(suitsDeltas, suitsW.map(w => w.id), suitsHalf);
      } else if (pokerW.length) {
        // ── Uncontested suits: poker winner takes both pots ──
        dist(pokerDeltas, pokerW.map(w => w.id), pokerHalf);
        dist(suitsDeltas, pokerW.map(w => w.id), suitsHalf);
        suitsW = pokerW; // poker winner also awarded the suits pot
      } else {
        // ── Uncontested poker: suits winner takes both pots ──
        dist(pokerDeltas, suitsW.map(w => w.id), pokerHalf);
        dist(suitsDeltas, suitsW.map(w => w.id), suitsHalf);
        pokerW = suitsW; // suits winner also awarded the poker pot
      }

      pokerW.forEach(w => pokerWinIds.add(w.id));
      suitsW.forEach(w => suitsWinIds.add(w.id));
    }

    if (!anyWinner) {
      messages.push(`No qualifiers — $${rolledOver} rolls over`);
      return { players: finalPlayers, pot: rolledOver, messages };
    }

    // ── 6. Apply deltas, set winner/loser ─────────────────────────────────
    const allIds = new Set([...Object.keys(pokerDeltas), ...Object.keys(suitsDeltas)]);
    for (const id of allIds) {
      const p = finalPlayers.find(fp => fp.id === id);
      if (!p) continue;
      p.chips += (pokerDeltas[id] || 0) + (suitsDeltas[id] || 0);
      p.isWinner = true;
    }
    finalPlayers.forEach(p => { if (p.status !== 'folded' && !p.isWinner) p.isLoser = true; });

    // ── 7. Display messages ────────────────────────────────────────────────
    // SP_POKER|name|handDesc|amount  and  SP_SUITS|name|handDesc|amount
    // The overlay detects these to render its two-panel showdown display.
    const totalPokerPot = Object.values(pokerDeltas).reduce((s, v) => s + v, 0);
    const totalSuitsPot = Object.values(suitsDeltas).reduce((s, v) => s + v, 0);

    // Determine per-side winners for display
    const resolvedPokerWinners = [...pokerWinIds].map(id => finalPlayers.find(p => p.id === id)!).filter(Boolean);
    const resolvedSuitsWinners = [...suitsWinIds].map(id => finalPlayers.find(p => p.id === id)!).filter(Boolean);

    // Poker panel
    if (resolvedPokerWinners.length) {
      const names = resolvedPokerWinners.map(p => p.name).join(' & ');
      // Pick the best poker hand description from the poker winners
      let handDesc = 'High Card';
      let bestVal = 0;
      for (const w of resolvedPokerWinners) {
        if ((w.score?.pokerValue ?? 0) > bestVal) { bestVal = w.score!.pokerValue!; handDesc = w.score?.high ?? 'High Card'; }
      }
      // Is this uncontested (suits winner also won poker pot)?
      const isUncontested = resolvedPokerWinners.every(w => suitsWinIds.has(w.id)) && suitsWinIds.size > 0 && pokerWinIds.size === suitsWinIds.size;
      const pokerDesc = isUncontested && !swingScoopIds.has(resolvedPokerWinners[0].id) ? `${handDesc} (uncontested suits)` : handDesc;
      messages.push(`SP_POKER|${names}|${pokerDesc}|${totalPokerPot}`);
    }

    // Suits panel
    if (resolvedSuitsWinners.length) {
      const names = resolvedSuitsWinners.map(p => p.name).join(' & ');
      let suitsDesc = '—';
      let bestScore = 0;
      for (const w of resolvedSuitsWinners) {
        if ((w.score?.suitsScore ?? 0) > bestScore) { bestScore = w.score!.suitsScore!; suitsDesc = w.score?.low ?? '—'; }
      }
      // Uncontested poker: suits winner also won poker pot, no poker hand needed
      const isUncontested = resolvedSuitsWinners.every(w => pokerWinIds.has(w.id)) && pokerWinIds.size > 0 && pokerWinIds.size === suitsWinIds.size;
      const displayDesc = (isUncontested && !swingScoopIds.has(resolvedSuitsWinners[0].id)) ? `${suitsDesc} (uncontested poker)` : suitsDesc;
      messages.push(`SP_SUITS|${names}|${displayDesc}|${totalSuitsPot}`);
    }

    return { players: finalPlayers, pot: rolledOver, messages };
  }
};
