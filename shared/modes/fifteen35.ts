import { GameMode, GameState, Player, CardType, GamePhase } from '../gameTypes';
import { getNextActivePlayerIndex, getDealerIndex } from '../engine/core';
import { decideBet, applyBetDecision } from '../engine/botUtils';
import { computeSidePots, totalSidePotAmount, resolveSplitPots } from '../engine/sidePots';

const cardValue = (rank: string): number => {
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 0.5;
  if (rank === 'A') return 11;
  return parseInt(rank, 10);
};

// Returns the HIGHEST achievable total that is <= 35, considering all ace combinations.
// If every combination exceeds 35, returns minimum possible (all aces as 1) to signal BUST.
// Edge cases: A+A = try 22 first (both 11) → valid → use 22; never picks 12 over 22.
const bestTotal = (cards: CardType[]): { total: number; aceAs1Count: number; aceCount: number } => {
  const aceCount = cards.filter(c => c.rank === 'A').length;
  const baseTotal = cards.reduce((sum, c) => c.rank === 'A' ? sum : sum + cardValue(c.rank), 0);

  // Try every ace combination: a1 = number of aces treated as 1 (rest are 11).
  // Collect all valid totals and pick the highest one.
  let highestValid: number | null = null;
  let bestA1 = 0;
  for (let a1 = 0; a1 <= aceCount; a1++) {
    const t = baseTotal + (aceCount - a1) * 11 + a1 * 1;
    if (t <= 35 && (highestValid === null || t > highestValid)) {
      highestValid = t;
      bestA1 = a1;
    }
  }

  if (highestValid !== null) {
    return { total: highestValid, aceAs1Count: bestA1, aceCount };
  }

  // All combinations bust — return min possible total (all aces as 1) for bust message display
  return { total: baseTotal + aceCount * 1, aceAs1Count: aceCount, aceCount };
};

const qualifiesLow = (total: number) => total >= 13 && total <= 15;
const qualifiesHigh = (total: number) => total >= 33 && total <= 35;
const isBust = (total: number) => total > 35;

const allDoneHitting = (players: Player[]): boolean => {
  const active = players.filter(p => p.status === 'active');
  if (active.length <= 1) return true;
  return active.every(p => p.declaration === 'STAY' || p.declaration === 'BUST');
};

export const Fifteen35Mode: GameMode = {
  id: 'fifteen35',
  name: '15 / 35',
  phases: ['WAITING','ANTE','DEAL','BET_1','HIT_1','BET_2','HIT_2','BET_3','HIT_3','BET_4','HIT_4','BET_5','HIT_5','BET_6','HIT_6','BET_7','HIT_7','BET_8','HIT_8','SHOWDOWN'],

  getNextPhase: (currentPhase: GamePhase, state: GameState): GamePhase | null => {
    if (currentPhase.startsWith('HIT_')) { if (allDoneHitting(state.players)) return 'SHOWDOWN'; return null; }
    if (currentPhase.startsWith('BET_')) { if (allDoneHitting(state.players)) return 'SHOWDOWN'; }
    return null;
  },

  deal: (deck: CardType[], players: Player[], myId: string) => {
    const freshDeck = [...deck];
    const newPlayers = players.map(p => {
      if (p.status !== 'active') return { ...p, cards: [] };
      const card1 = { ...freshDeck.shift()!, isHidden: false };
      const card2 = { ...freshDeck.shift()!, isHidden: p.id !== myId };
      return { ...p, cards: [card1, card2] };
    });
    return { players: newPlayers, communityCards: [], deck: freshDeck };
  },

  botAction: (state: GameState, botId: string) => {
    let newPlayers = [...state.players];
    let newDeck = [...state.deck];
    let newPot = state.pot;
    let newCurrentBet = state.currentBet;
    let newRaisesThisRound = state.raisesThisRound ?? 0;
    let message = '';
    const bIdx = newPlayers.findIndex(p => p.id === botId);
    const bot = newPlayers[bIdx];
    const isHitPhase = state.phase.startsWith('HIT_');

    if (state.phase === 'ANTE') {
      newPlayers[bIdx] = { ...bot, chips: Math.max(0, bot.chips - 1), hasActed: true };
      newPot += 1;
      message = `${bot.name} paid $1 Ante`;
    } else if (isHitPhase) {
      if (bot.declaration === 'STAY' || bot.declaration === 'BUST') {
        newPlayers[bIdx] = { ...bot, hasActed: true };
        message = `${bot.name} stays`;
      } else {
        const { total } = bestTotal(bot.cards);
        const numCards = bot.cards.length;
        let shouldStay = false;
        if (qualifiesLow(total) || qualifiesHigh(total)) shouldStay = true;
        else if (total <= 12) shouldStay = false;
        else if (total >= 16 && total <= 27) shouldStay = false;
        else if (total >= 28 && total <= 32) {
          const safeMax = 35 - total;
          let bustRanks = 0;
          for (let v = 2; v <= 10; v++) { if (v > safeMax) bustRanks++; }
          const bustRisk = bustRanks / 13;
          if (numCards >= 6) shouldStay = bustRisk > 0.5;
          else if (numCards >= 5 && bustRisk > 0.55) shouldStay = Math.random() < bustRisk * 0.5;
          else shouldStay = false;
        } else if (total > 35) shouldStay = true;

        if (shouldStay) {
          newPlayers[bIdx] = { ...bot, declaration: 'STAY', hasActed: true };
          message = `${bot.name} stays`;
        } else {
          const hitCard = newDeck.shift();
          if (hitCard) {
            const newCards = [...bot.cards, { ...hitCard, isHidden: false }];
            const { total: newTotal } = bestTotal(newCards);
            if (isBust(newTotal)) {
              newPlayers[bIdx] = { ...bot, cards: newCards, declaration: 'BUST', status: 'folded', hasActed: true };
              message = `${bot.name} hits and BUSTS!`;
            } else {
              let autoStay = false;
              const active = newPlayers.filter(p => p.status === 'active');
              if (active.length === 2) {
                const other = active.find(p => p.id !== botId);
                if (other && other.declaration === 'STAY') {
                  const otherTotal = bestTotal(other.cards).total;
                  if ((qualifiesLow(otherTotal) && qualifiesHigh(newTotal)) || (qualifiesHigh(otherTotal) && qualifiesLow(newTotal))) autoStay = true;
                }
              }
              if (autoStay) { newPlayers[bIdx] = { ...bot, cards: newCards, declaration: 'STAY', hasActed: true }; message = `${bot.name} hits and auto-stays!`; }
              else { newPlayers[bIdx] = { ...bot, cards: newCards, hasActed: true }; message = `${bot.name} hits`; }
            }
          } else { newPlayers[bIdx] = { ...bot, declaration: 'STAY', hasActed: true }; message = `${bot.name} stays`; }
        }
      }
    } else {
      const { total } = bestTotal(bot.cards);
      let strength = 0.08;
      if (qualifiesLow(total) || qualifiesHigh(total)) {
        if (total === 15 || total === 35) strength = 0.9;
        else if (total === 14 || total === 34) strength = 0.7;
        else strength = 0.5;
      } else if (bot.declaration === 'STAY') strength = 0.05;
      else {
        const distToLow = total < 13 ? 13 - total : (total > 15 ? 999 : 0);
        const distToHigh = total > 35 ? 999 : (total < 33 ? 33 - total : 0);
        const bestDist = Math.min(distToLow, distToHigh);
        if (bestDist <= 2) strength = 0.44 - bot.cards.length * 0.02;
        else if (bestDist <= 5) strength = 0.34 - bot.cards.length * 0.02;
        else if (bestDist <= 10) strength = 0.24 - bot.cards.length * 0.01;
        else strength = 0.12;
        strength = Math.max(strength, 0.08);
      }
      const heroPlayer = state.players.find(p => p.presence === 'human');
      const heroWeak   = heroPlayer ? heroPlayer.declaration !== 'STAY' : false;
      const largePot   = state.pot >= 20;
      const raisesSoFar = state.raisesThisRound ?? 0;
      const activeOpponents = state.players.filter(p => p.id !== botId && p.status === 'active').length;
      const raiseCap = activeOpponents <= 1 ? 4 : 3;
      const decision = decideBet(strength, state.pot, state.currentBet, bot.bet, bot.chips, { heroWeak, largePot, raisesThisRound: raisesSoFar, raiseCap });
      const result = applyBetDecision(decision, bot, state.currentBet, state.pot, raisesSoFar);
      newPlayers[bIdx] = { ...bot, chips: result.chips, bet: result.bet, status: result.status as any, hasActed: true };
      newPot = result.pot; newCurrentBet = result.currentBet; newRaisesThisRound = result.raisesThisRound; message = result.message;
    }

    const activePlayers = isHitPhase ? newPlayers.filter(p => p.status === 'active') : newPlayers.filter(p => p.status === 'active' && p.chips > 0);
    const allActed = activePlayers.every(p => p.hasActed);
    const allBetsMatch = activePlayers.every(p => p.bet === newCurrentBet);
    const doneHitting = isHitPhase && allDoneHitting(newPlayers);
    const roundOver = isHitPhase ? (allActed || doneHitting) : (allActed && allBetsMatch);
    let nextPlayerId = undefined;
    if (!roundOver) {
      let nextIdx = (bIdx + 1) % newPlayers.length, count = 0;
      while (count < newPlayers.length) {
        const p = newPlayers[nextIdx];
        if (isHitPhase) { if (p.status === 'active' && !p.hasActed) break; }
        else { if (p.status === 'active' && p.chips > 0 && (!p.hasActed || p.bet < newCurrentBet)) break; }
        nextIdx = (nextIdx + 1) % newPlayers.length; count++;
      }
      nextPlayerId = newPlayers[nextIdx].id;
    }
    return { stateUpdates: { players: newPlayers, deck: newDeck, pot: newPot, currentBet: newCurrentBet, raisesThisRound: newRaisesThisRound }, message, roundOver, nextPlayerId };
  },

  getAutoTransition: () => null,

  evaluateHand: (player: Player) => {
    if (player.cards.length === 0) return undefined;
    const { total } = bestTotal(player.cards);
    if (isBust(total)) return { description: `BUST (${total})`, isValidBadugi: false, badugiRankValues: [total] };
    let description = `Total: ${total}`, valid = false;
    if (qualifiesLow(total)) { description += ' — LOW'; valid = true; }
    if (qualifiesHigh(total)) { description += ' — HIGH'; valid = true; }
    if (!valid) description += ' — No Qualifier';
    return { description, isValidBadugi: valid, badugiRankValues: [total] };
  },

  resolveShowdown: (players: Player[], pot: number) => {
    const finalPlayers = players.map(p => {
      const newCards = p.cards.map((c): CardType => ({ ...c, isHidden: false }));
      const { total } = bestTotal(newCards);
      if (p.status === 'folded' && p.declaration === 'BUST') return { ...p, cards: newCards, score: { description: `BUST (${total})`, isValidBadugi: false, badugiRankValues: [total] } };
      if (p.status === 'folded') return { ...p, cards: newCards };
      let description = `Total: ${total}`, isValidBadugi = false;
      if (qualifiesLow(total)) { description += ' — LOW'; isValidBadugi = true; }
      if (qualifiesHigh(total)) { description += ' — HIGH'; isValidBadugi = true; }
      if (isBust(total)) description = `BUST (${total})`;
      return { ...p, cards: newCards, score: { description, isValidBadugi, badugiRankValues: [total] } };
    });
    const messages: string[] = [];
    const activePlayers = finalPlayers.filter(p => p.status !== 'folded');

    let sidePots = computeSidePots(finalPlayers);
    if (sidePots.length === 0 && pot > 0) {
      sidePots = [{ amount: pot, eligibleIds: activePlayers.map(p => p.id) }];
    }
    const totalAwardable = totalSidePotAmount(sidePots);

    if (activePlayers.length === 1) {
      const sole = activePlayers[0];
      const award = sidePots.filter(sp => sp.eligibleIds.includes(sole.id)).reduce((s, sp) => s + sp.amount, 0);
      const idx = finalPlayers.findIndex(p => p.id === sole.id);
      finalPlayers[idx].chips += award;
      finalPlayers[idx].isWinner = true;
      messages.push(`${finalPlayers[idx].name} wins $${award} (last player standing)`);
      return { players: finalPlayers, pot: totalAwardable - award, messages };
    }
    if (activePlayers.length === 0) {
      messages.push(`No active players. $${totalAwardable} rolls over!`);
      return { players: finalPlayers, pot: totalAwardable, messages };
    }

    const findHigh = (eligible: Player[]): string[] => {
      const cands = eligible.filter(p => qualifiesHigh(bestTotal(p.cards).total));
      if (cands.length === 0) return [];
      cands.sort((a, b) => bestTotal(b.cards).total - bestTotal(a.cards).total);
      const best = bestTotal(cands[0].cards).total;
      return cands.filter(p => bestTotal(p.cards).total === best).map(p => p.id);
    };
    const findLow = (eligible: Player[]): string[] => {
      const cands = eligible.filter(p => qualifiesLow(bestTotal(p.cards).total));
      if (cands.length === 0) return [];
      cands.sort((a, b) =>
        Math.abs(bestTotal(b.cards).total - 15) - Math.abs(bestTotal(a.cards).total - 15)
        || bestTotal(b.cards).total - bestTotal(a.cards).total);
      const best = bestTotal(cands[0].cards).total;
      return cands.filter(p => bestTotal(p.cards).total === best).map(p => p.id);
    };

    const resolution = resolveSplitPots(sidePots, finalPlayers, { findHigh, findLow });

    if (!resolution.hadAnyWinner) {
      messages.push(`No qualifying hands. $${resolution.rolledOver} rolls over!`);
      return { players: finalPlayers, pot: resolution.rolledOver, messages };
    }

    if (resolution.highWinnerIds.size > 0 && resolution.lowWinnerIds.size > 0) {
      messages.push(`Split Pot — HIGH/LOW split $${totalAwardable}`);
    }

    for (const id of Object.keys(resolution.deltas)) {
      const idx = finalPlayers.findIndex(p => p.id === id);
      if (idx === -1) continue;
      const award = resolution.deltas[id];
      finalPlayers[idx].chips += award;
      finalPlayers[idx].isWinner = true;
      const total = bestTotal(finalPlayers[idx].cards).total;
      if (resolution.highWinnerIds.has(id)) messages.push(`${finalPlayers[idx].name} wins HIGH — $${award} (${total})`);
      else if (resolution.lowWinnerIds.has(id)) messages.push(`${finalPlayers[idx].name} wins LOW — $${award} (${total})`);
    }

    finalPlayers.forEach(p => { if (p.status !== 'folded' && !p.isWinner) p.isLoser = true; });
    return { players: finalPlayers, pot: resolution.rolledOver, messages };
  },

  checkAutoStay: (state: GameState, playerId: string): boolean => {
    const active = state.players.filter(p => p.status === 'active');
    if (active.length !== 2) return false;
    const me = active.find(p => p.id === playerId);
    const other = active.find(p => p.id !== playerId);
    if (!me || !other || me.declaration || other.declaration !== 'STAY') return false;
    const myTotal = bestTotal(me.cards).total;
    const otherTotal = bestTotal(other.cards).total;
    return (qualifiesLow(myTotal) && qualifiesHigh(otherTotal)) || (qualifiesHigh(myTotal) && qualifiesLow(otherTotal));
  }
};
