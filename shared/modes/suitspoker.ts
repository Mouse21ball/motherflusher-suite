import { GameMode, GameState, Player, CardType, GamePhase, Declaration } from '../gameTypes';
import { getNextActivePlayerIndex } from '../engine/core';
import { decideBet, applyBetDecision } from '../engine/botUtils';
import { computeSidePots, totalSidePotAmount, type SidePot } from '../engine/sidePots';

function suitsCardValue(rank: string): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return parseInt(rank, 10);
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

const PATH_A_INDICES = [0, 1, 2, 6, 7, 8, 9, 10, 11];
const PATH_B_INDICES = [3, 4, 5, 6, 7, 8, 9, 10, 11];

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

function evaluateBestSuitsOnPath(holeCards: CardType[], communityCards: CardType[], pathIndices: number[]): { score: number; valid: boolean; suit: string; holeIndices: number[]; commIndices: number[] } {
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
  let bestSuits = suitsA.score >= suitsB.score ? suitsA : suitsB;
  const suitSymbols: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const swingOnA = pokerA !== null && suitsA.valid, swingOnB = pokerB !== null && suitsB.valid;
  let swingPokerValue = 0, swingSuitsScore = 0;
  if (swingOnA && swingOnB) { const scoreA = (pokerA?.value || 0) + suitsA.score, scoreB = (pokerB?.value || 0) + suitsB.score; if (scoreA >= scoreB) { swingPokerValue = pokerA?.value || 0; swingSuitsScore = suitsA.score; } else { swingPokerValue = pokerB?.value || 0; swingSuitsScore = suitsB.score; } }
  else if (swingOnA) { swingPokerValue = pokerA?.value || 0; swingSuitsScore = suitsA.score; }
  else if (swingOnB) { swingPokerValue = pokerB?.value || 0; swingSuitsScore = suitsB.score; }
  return {
    high: bestPoker?.name || 'No Hand',
    low: bestSuits.valid ? `${suitSymbols[bestSuits.suit] || ''}${bestSuits.score}pts` : 'No Suits',
    highEval: bestPoker ? { description: bestPoker.name, usedHoleCardIndices: bestPoker.holeIndices, usedCommunityCardIndices: bestPoker.commIndices } : { description: 'No Hand', usedHoleCardIndices: [] as number[], usedCommunityCardIndices: [] as number[] },
    lowEval: bestSuits.valid ? { description: `${suitSymbols[bestSuits.suit] || ''}${bestSuits.score}pts`, usedHoleCardIndices: bestSuits.holeIndices, usedCommunityCardIndices: bestSuits.commIndices } : { description: 'No Suits', usedHoleCardIndices: [] as number[], usedCommunityCardIndices: [] as number[] },
    description: 'Evaluated', isValidBadugi: bestSuits.valid, pokerValue: bestPoker?.value || 0, suitsScore: bestSuits.score, suitsValid: bestSuits.valid, swingPokerValue, swingSuitsScore
  };
}

export const SuitsPokerMode: GameMode = {
  id: 'suits_poker',
  name: 'Suits & Poker',
  phases: ['WAITING','ANTE','DEAL','REVEAL_TOP_ROW','DRAW','BET_1','REVEAL_SECOND_ROW','BET_2','REVEAL_LOWER_CENTER','BET_3','REVEAL_FACTOR_CARD','DECLARE_AND_BET','SHOWDOWN'],

  deal: (deck, players, myId) => {
    const newDeck = [...deck];
    const newPlayers = players.map(p => { if (p.status !== 'active') return p; return { ...p, cards: newDeck.splice(0, 5).map(c => ({ ...c, isHidden: p.id !== myId })) }; });
    const communityCards = newDeck.splice(0, 12).map(c => ({ ...c, isHidden: true }));
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
      const newPlayers = players.map(p => p.id === botId ? { ...p, chips: p.chips - 1, hasActed: true } : p);
      const roundOver = newPlayers.filter(p => p.status === 'active').every(p => p.hasActed);
      return { stateUpdates: { pot: pot + 1, players: newPlayers }, message: `${bot.name} antes $1`, roundOver, nextPlayerId: roundOver ? undefined : players[nextIdx].id };
    }

    if (phase === 'DRAW') {
      const evaluation = spEvaluateHand(bot, state.communityCards);
      const cardsToKeep = new Set<number>();
      if ((evaluation?.pokerValue || 0) > 1000000) evaluation?.highEval.usedHoleCardIndices.forEach(idx => cardsToKeep.add(idx));
      if (evaluation?.suitsValid && (evaluation?.suitsScore || 0) > 25) evaluation?.lowEval.usedHoleCardIndices.forEach(idx => cardsToKeep.add(idx));
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
        const isStrongPoker = (evaluation?.pokerValue || 0) >= 2000000;
        const isDecentSuits = evaluation?.suitsValid && (evaluation?.suitsScore || 0) >= 35;
        const isStrongSuits = evaluation?.suitsValid && (evaluation?.suitsScore || 0) >= 45;
        if (isStrongPoker && isStrongSuits) declaration = 'SWING';
        else if (isDecentSuits && !isStrongPoker) declaration = 'SUITS';
        else if (isStrongPoker && !isDecentSuits) declaration = 'POKER';
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
    if (phase === 'REVEAL_TOP_ROW') return { delay: 1000, action: (state) => ({ stateUpdates: { communityCards: state.communityCards.map((c, i) => i < 6 ? { ...c, isHidden: false } : c) }, message: 'Side A & Side B flops revealed!', advancePhase: true }) };
    if (phase === 'REVEAL_SECOND_ROW') return { delay: 1000, action: (state) => ({ stateUpdates: { communityCards: state.communityCards.map((c, i) => (i >= 6 && i <= 8) ? { ...c, isHidden: false } : c) }, message: 'Center flop revealed!', advancePhase: true }) };
    if (phase === 'REVEAL_LOWER_CENTER') return { delay: 1000, action: (state) => ({ stateUpdates: { communityCards: state.communityCards.map((c, i) => (i === 9 || i === 10) ? { ...c, isHidden: false } : c) }, message: 'Lower center cards revealed!', advancePhase: true }) };
    if (phase === 'REVEAL_FACTOR_CARD') return { delay: 1000, action: (state) => ({ stateUpdates: { communityCards: state.communityCards.map((c, i) => i === 11 ? { ...c, isHidden: false } : c) }, message: 'Final card revealed!', advancePhase: true }) };
    return null;
  },

  evaluateHand: (player, communityCards) => spEvaluateHand(player, communityCards),

  resolveShowdown: (players, pot, myId, communityCards) => {
    const cc = communityCards || [];
    const finalPlayers: Player[] = players.map(p => { if (p.status === 'folded') return p; const cards = p.cards.map(c => ({ ...c, isHidden: false })); return { ...p, cards, score: spEvaluateHand({ ...p, cards }, cc) || undefined }; });
    const activePlayers = finalPlayers.filter(p => p.status !== 'folded');
    const messages: string[] = [];

    let sidePots: SidePot[] = computeSidePots(finalPlayers);
    if (sidePots.length === 0 && pot > 0) {
      sidePots = [{ amount: pot, eligibleIds: activePlayers.map(p => p.id) }];
    }
    const totalAwardable = totalSidePotAmount(sidePots);

    if (activePlayers.length === 1) {
      const sole = activePlayers[0];
      const award = sidePots.filter(sp => sp.eligibleIds.includes(sole.id)).reduce((s, sp) => s + sp.amount, 0);
      sole.chips += award; sole.isWinner = true;
      messages.push(`${sole.name} wins $${award} (last player standing)`);
      return { players: finalPlayers, pot: totalAwardable - award, messages };
    }

    const findPokerWinner = (contenders: Player[]): Player[] => { let bestVal = -1, winners: Player[] = []; for (const p of contenders) { const val = p.declaration === 'SWING' ? (p.score?.swingPokerValue || 0) : (p.score?.pokerValue || 0); if (val > bestVal) { bestVal = val; winners = [p]; } else if (val === bestVal && val > 0) winners.push(p); } return winners; };
    const findSuitsWinner = (contenders: Player[]): Player[] => { let bestVal = 0, winners: Player[] = []; for (const p of contenders) { const val = p.declaration === 'SWING' ? (p.score?.swingSuitsScore || 0) : (p.score?.suitsScore || 0); const valid = p.declaration === 'SWING' ? ((p.score?.swingSuitsScore || 0) > 0) : (p.score?.suitsValid || false); if (!valid) continue; if (val > bestVal) { bestVal = val; winners = [p]; } else if (val === bestVal && val > 0) winners.push(p); } return winners; };

    const deltas: Record<string, number> = {};
    const swingScoopIds = new Set<string>();
    const pokerWinIds = new Set<string>();
    const suitsWinIds = new Set<string>();
    const failedSwingsAnnounced = new Set<string>();
    let rolledOver = 0;
    let anyWinner = false;

    const distribute = (ids: string[], amount: number) => {
      if (ids.length === 0 || amount === 0) return;
      const share = Math.floor(amount / ids.length);
      let rem = amount - share * ids.length;
      for (const id of ids) {
        const award = share + (rem > 0 ? 1 : 0);
        deltas[id] = (deltas[id] || 0) + award;
        if (rem > 0) rem--;
      }
    };

    for (const sp of sidePots) {
      const eligible = activePlayers.filter(p => sp.eligibleIds.includes(p.id));
      let pokerCands = eligible.filter(p => p.declaration === 'POKER' || p.declaration === 'SWING');
      let suitsCands = eligible.filter(p => p.declaration === 'SUITS' || p.declaration === 'SWING');
      let pokerW = findPokerWinner(pokerCands);
      let suitsW = findSuitsWinner(suitsCands);

      const swingIds = eligible.filter(p => p.declaration === 'SWING').map(p => p.id);
      const successfulSwings = swingIds.filter(sid =>
        pokerW.some(w => w.id === sid) && suitsW.some(w => w.id === sid));

      if (successfulSwings.length > 0) {
        distribute(successfulSwings, sp.amount);
        successfulSwings.forEach(id => swingScoopIds.add(id));
        anyWinner = true;
        continue;
      }

      // Failed SWINGs disqualified from this pot.
      for (const sid of swingIds) {
        if (!failedSwingsAnnounced.has(sid)) {
          const fp = finalPlayers.find(p => p.id === sid)!;
          messages.push(`${fp.name} fails SWING`);
          failedSwingsAnnounced.add(sid);
        }
      }
      pokerCands = pokerCands.filter(p => !swingIds.includes(p.id));
      suitsCands = suitsCands.filter(p => !swingIds.includes(p.id));
      pokerW = findPokerWinner(pokerCands);
      suitsW = findSuitsWinner(suitsCands);

      if (pokerW.length === 0 && suitsW.length === 0) { rolledOver += sp.amount; continue; }
      let pokerShare = 0, suitsShare = 0;
      if (pokerW.length > 0 && suitsW.length > 0) {
        pokerShare = Math.floor(sp.amount / 2);
        suitsShare = sp.amount - pokerShare;
      } else if (pokerW.length > 0) pokerShare = sp.amount;
      else suitsShare = sp.amount;
      distribute(pokerW.map(w => w.id), pokerShare);
      distribute(suitsW.map(w => w.id), suitsShare);
      pokerW.forEach(w => pokerWinIds.add(w.id));
      suitsW.forEach(w => suitsWinIds.add(w.id));
      anyWinner = true;
    }

    if (!anyWinner) {
      messages.push(`No qualifiers. $${rolledOver} rolls over!`);
      return { players: finalPlayers, pot: rolledOver, messages };
    }

    const awardedTotal = totalAwardable - rolledOver;
    if (swingScoopIds.size > 0 && swingScoopIds.size > 1) messages.push(`Split Pot — ${swingScoopIds.size} SWING scoops split $${awardedTotal}`);
    else if (pokerWinIds.size > 0 && suitsWinIds.size > 0) messages.push(`Split Pot — POKER/SUITS split $${awardedTotal}`);

    for (const id of Object.keys(deltas)) {
      const fp = finalPlayers.find(p => p.id === id);
      if (!fp) continue;
      const award = deltas[id];
      fp.chips += award;
      fp.isWinner = true;
      if (swingScoopIds.has(id)) messages.push(`${fp.name} SCOOPS $${award} with SWING!`);
      else if (pokerWinIds.has(id)) messages.push(`${fp.name} wins POKER — $${award} (${fp.score?.high})`);
      else if (suitsWinIds.has(id)) messages.push(`${fp.name} wins SUITS — $${award} (${fp.score?.low})`);
    }
    finalPlayers.forEach(p => { if (p.status !== 'folded' && !p.isWinner) p.isLoser = true; });
    return { players: finalPlayers, pot: rolledOver, messages };
  }
};
