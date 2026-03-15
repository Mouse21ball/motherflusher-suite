import { GameMode } from '../engine/types';
import { GameState, Player, CardType, GamePhase } from '../types';
import { getNextActivePlayerIndex, getDealerIndex } from '../engine/core';
import { decideBet, applyBetDecision } from '../engine/botUtils';

const cardValue = (rank: string): number => {
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 0.5;
  if (rank === 'A') return 11;
  return parseInt(rank, 10);
};

const calcTotal = (cards: CardType[]): { total: number; aceAs1Count: number } => {
  let total = 0;
  let aceCount = 0;
  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === 'A') aceCount++;
  }
  let aceAs1Count = 0;
  while (total > 35 && aceAs1Count < aceCount) {
    total -= 10;
    aceAs1Count++;
  }
  return { total, aceAs1Count };
};

const bestTotal = (cards: CardType[]): { total: number; aceAs1Count: number; aceCount: number } => {
  let aceCount = cards.filter(c => c.rank === 'A').length;
  if (aceCount === 0) {
    const t = cards.reduce((sum, c) => sum + cardValue(c.rank), 0);
    return { total: t, aceAs1Count: 0, aceCount: 0 };
  }

  let best = { total: 0, aceAs1Count: 0, aceCount };
  let bestDist = Infinity;

  for (let a1 = 0; a1 <= aceCount; a1++) {
    const t = cards.reduce((sum, c) => {
      if (c.rank === 'A') return sum;
      return sum + cardValue(c.rank);
    }, 0) + (aceCount - a1) * 11 + a1 * 1;

    const distLow = Math.abs(t - 15);
    const distHigh = Math.abs(t - 35);
    const dist = Math.min(distLow, distHigh);

    if (t <= 35 && (dist < bestDist || (dist === bestDist && t > best.total))) {
      bestDist = dist;
      best = { total: t, aceAs1Count: a1, aceCount };
    }
  }

  if (best.total === 0) {
    const { total, aceAs1Count } = calcTotal(cards);
    return { total, aceAs1Count, aceCount };
  }

  return best;
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
  phases: [
    'WAITING',
    'ANTE',
    'DEAL',
    'BET_1',
    'HIT_1', 'BET_2',
    'HIT_2', 'BET_3',
    'HIT_3', 'BET_4',
    'HIT_4', 'BET_5',
    'HIT_5', 'BET_6',
    'HIT_6', 'BET_7',
    'HIT_7', 'BET_8',
    'HIT_8',
    'SHOWDOWN'
  ],

  getNextPhase: (currentPhase: GamePhase, state: GameState): GamePhase | null => {
    const isHitPhase = currentPhase.startsWith('HIT_');
    const isBetPhase = currentPhase.startsWith('BET_');

    if (isHitPhase) {
      if (allDoneHitting(state.players)) {
        return 'SHOWDOWN';
      }
      return null;
    }

    if (isBetPhase) {
      if (allDoneHitting(state.players)) {
        return 'SHOWDOWN';
      }
    }

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
    let message = '';

    const bIdx = newPlayers.findIndex(p => p.id === botId);
    const bot = newPlayers[bIdx];
    const isHitPhase = state.phase.startsWith('HIT_');

    if (state.phase === 'ANTE') {
      newPlayers[bIdx] = { ...bot, chips: bot.chips - 1, hasActed: true };
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
        if (qualifiesLow(total) || qualifiesHigh(total)) {
          shouldStay = true;
        } else if (total <= 12) {
          shouldStay = false;
        } else if (total >= 16 && total <= 27) {
          shouldStay = false;
        } else if (total >= 28 && total <= 32) {
          const safeMax = 35 - total;
          let bustRanks = 0;
          for (let v = 2; v <= 10; v++) { if (v > safeMax) bustRanks++; }
          const bustRisk = bustRanks / 13;
          if (numCards >= 6) {
            shouldStay = bustRisk > 0.5;
          } else if (numCards >= 5 && bustRisk > 0.55) {
            shouldStay = Math.random() < bustRisk * 0.5;
          } else {
            shouldStay = false;
          }
        } else if (total > 35) {
          shouldStay = true;
        } else {
          shouldStay = false;
        }

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
                  const otherIsLow = qualifiesLow(otherTotal);
                  const otherIsHigh = qualifiesHigh(otherTotal);
                  const meIsLow = qualifiesLow(newTotal);
                  const meIsHigh = qualifiesHigh(newTotal);
                  if ((otherIsLow && meIsHigh) || (otherIsHigh && meIsLow)) {
                    autoStay = true;
                  }
                }
              }
              if (autoStay) {
                newPlayers[bIdx] = { ...bot, cards: newCards, declaration: 'STAY', hasActed: true };
                message = `${bot.name} hits and auto-stays!`;
              } else {
                newPlayers[bIdx] = { ...bot, cards: newCards, hasActed: true };
                message = `${bot.name} hits`;
              }
            }
          } else {
            newPlayers[bIdx] = { ...bot, declaration: 'STAY', hasActed: true };
            message = `${bot.name} stays`;
          }
        }
      }
    } else {
      const { total } = bestTotal(bot.cards);
      const isQualLow = qualifiesLow(total);
      const isQualHigh = qualifiesHigh(total);
      const isQualifying = isQualLow || isQualHigh;

      let strength = 0.08;
      if (isQualifying) {
        if (total === 15 || total === 35) {
          strength = 0.9;
        } else if (total === 14 || total === 34) {
          strength = 0.7;
        } else {
          strength = 0.5;
        }
      } else if (bot.declaration === 'STAY') {
        strength = 0.05;
      } else {
        const numCards = bot.cards.length;
        const distToLow = total < 13 ? 13 - total : (total > 15 ? 999 : 0);
        const distToHigh = total > 35 ? 999 : (total < 33 ? 33 - total : 0);
        const bestDist = Math.min(distToLow, distToHigh);
        const pursuingHigh = distToHigh < distToLow;
        if (bestDist <= 2) {
          strength = 0.32 - numCards * 0.02;
        } else if (bestDist <= 5) {
          strength = 0.24 - numCards * 0.02;
        } else if (bestDist <= 10) {
          strength = 0.16 - numCards * 0.01;
        } else {
          strength = 0.08;
        }
        if (pursuingHigh && total >= 28) {
          const safeMax = 35 - total;
          let bustRanks = 0;
          for (let v = 2; v <= 10; v++) { if (v > safeMax) bustRanks++; }
          const bustRisk = bustRanks / 13;
          strength *= (1 - bustRisk * 0.3);
        }
        strength = Math.max(strength, 0.05);
      }

      const decision = decideBet(strength, state.pot, state.currentBet, bot.bet, bot.chips);
      const result = applyBetDecision(decision, bot, state.currentBet, state.pot);
      newPlayers[bIdx] = { ...bot, chips: result.chips, bet: result.bet, status: result.status as any, hasActed: true };
      newPot = result.pot;
      newCurrentBet = result.currentBet;
      message = result.message;
    }

    const activePlayers = isHitPhase
      ? newPlayers.filter(p => p.status === 'active')
      : newPlayers.filter(p => p.status === 'active' && p.chips > 0);
    const allActed = activePlayers.every(p => p.hasActed);
    const allBetsMatch = activePlayers.every(p => p.bet === newCurrentBet);
    const doneHitting = isHitPhase && allDoneHitting(newPlayers);
    const roundOver = isHitPhase ? (allActed || doneHitting) : (allActed && allBetsMatch);

    let nextPlayerId = undefined;
    if (!roundOver) {
      let nextIdx = (bIdx + 1) % newPlayers.length;
      let count = 0;
      while (count < newPlayers.length) {
        const p = newPlayers[nextIdx];
        if (isHitPhase) {
          if (p.status === 'active' && !p.hasActed) break;
        } else {
          if (p.status === 'active' && p.chips > 0 && (!p.hasActed || p.bet < newCurrentBet)) break;
        }
        nextIdx = (nextIdx + 1) % newPlayers.length;
        count++;
      }
      nextPlayerId = newPlayers[nextIdx].id;
    }

    return {
      stateUpdates: { players: newPlayers, deck: newDeck, pot: newPot, currentBet: newCurrentBet },
      message,
      roundOver,
      nextPlayerId
    };
  },

  getAutoTransition: () => null,

  evaluateHand: (player: Player) => {
    if (player.cards.length === 0) return undefined;
    const { total: gameTotal, aceAs1Count, aceCount } = bestTotal(player.cards);

    if (isBust(gameTotal)) {
      return { description: `BUST (${gameTotal})`, isValidBadugi: false, badugiRankValues: [gameTotal] };
    }

    if (aceCount === 0) {
      let description = `Total: ${gameTotal}`;
      let valid = false;
      if (qualifiesLow(gameTotal)) { description += ' — LOW'; valid = true; }
      if (qualifiesHigh(gameTotal)) { description += ' — HIGH'; valid = true; }
      if (!valid) description += ' — No Qualifier';
      return { description, isValidBadugi: valid, badugiRankValues: [gameTotal] };
    }

    const nonAceSum = player.cards.reduce((sum, c) => c.rank === 'A' ? sum : sum + cardValue(c.rank), 0);
    const lowTotal = nonAceSum + aceCount;
    let highTotal = nonAceSum + aceCount * 11;
    let highAceAs11 = aceCount;
    while (highTotal > 35 && highAceAs11 > 0) {
      highTotal -= 10;
      highAceAs11--;
    }

    if (player.declaration === 'STAY') {
      let description = `Total: ${gameTotal}`;
      const aceLabel = aceAs1Count === aceCount
        ? `Ace${aceCount > 1 ? 's' : ''} = 1`
        : aceAs1Count === 0
          ? `Ace${aceCount > 1 ? 's' : ''} = 11`
          : `${aceCount - aceAs1Count}×11, ${aceAs1Count}×1`;
      description += ` (${aceLabel})`;
      let valid = false;
      if (qualifiesLow(gameTotal)) { description += ' — LOW'; valid = true; }
      if (qualifiesHigh(gameTotal)) { description += ' — HIGH'; valid = true; }
      if (!valid) description += ' — No Qualifier';
      return { description, isValidBadugi: valid, badugiRankValues: [gameTotal] };
    }

    if (lowTotal === highTotal) {
      let description = `Total: ${lowTotal} (Ace${aceCount > 1 ? 's' : ''} = 1)`;
      let valid = false;
      if (qualifiesLow(lowTotal)) { description += ' — LOW'; valid = true; }
      if (qualifiesHigh(lowTotal)) { description += ' — HIGH'; valid = true; }
      if (!valid) description += ' — No Qualifier';
      return { description, isValidBadugi: valid, badugiRankValues: [gameTotal] };
    }

    const aceS = aceCount > 1 ? 's' : '';
    let lowLine = `Low: ${lowTotal} (Ace${aceS} = 1)`;
    let highLine = `High: ${highTotal}`;
    if (highAceAs11 === aceCount) {
      highLine += ` (Ace${aceS} = 11)`;
    } else {
      highLine += ` (${highAceAs11}×11, ${aceCount - highAceAs11}×1)`;
    }

    let valid = false;
    if (qualifiesLow(lowTotal)) { lowLine += ' — LOW'; valid = true; }
    if (qualifiesHigh(lowTotal)) { lowLine += ' — HIGH'; valid = true; }
    if (qualifiesLow(highTotal)) { highLine += ' — LOW'; valid = true; }
    if (qualifiesHigh(highTotal)) { highLine += ' — HIGH'; valid = true; }

    const description = `${lowLine} · ${highLine}`;
    return { description, isValidBadugi: valid, badugiRankValues: [gameTotal] };
  },

  resolveShowdown: (players: Player[], pot: number, myId: string) => {
    const finalPlayers = players.map(p => {
      const newCards = p.cards.map((c): CardType => ({ ...c, isHidden: false }));
      const { total } = bestTotal(newCards);
      let description = `Total: ${total}`;
      let isValidBadugi = false;

      if (p.status === 'folded' && p.declaration === 'BUST') {
        description = `BUST (${total})`;
      } else if (p.status === 'folded') {
        return { ...p, cards: newCards };
      } else {
        if (qualifiesLow(total)) { description += ' — LOW'; isValidBadugi = true; }
        if (qualifiesHigh(total)) { description += ' — HIGH'; isValidBadugi = true; }
        if (isBust(total)) { description = `BUST (${total})`; }
      }

      return {
        ...p,
        cards: newCards,
        score: { description, isValidBadugi, badugiRankValues: [total] }
      };
    });

    const messages: string[] = [];
    const activePlayers = finalPlayers.filter(p => p.status !== 'folded');

    if (activePlayers.length === 1) {
      const sole = finalPlayers.find(p => p.id === activePlayers[0].id)!;
      sole.chips += pot;
      sole.isWinner = true;
      messages.push(`${sole.name} wins $${pot} (last player standing)`);
      return { players: finalPlayers, pot: 0, messages };
    }

    if (activePlayers.length === 0) {
      messages.push(`No active players. $${pot} rolls over!`);
      return { players: finalPlayers, pot, messages };
    }

    const lowCandidates = activePlayers.filter(p => {
      const { total } = bestTotal(p.cards);
      return qualifiesLow(total);
    });
    const highCandidates = activePlayers.filter(p => {
      const { total } = bestTotal(p.cards);
      return qualifiesHigh(total);
    });

    if (lowCandidates.length === 0 && highCandidates.length === 0) {
      messages.push(`No qualifying hands. $${pot} rolls over!`);
      return { players: finalPlayers, pot, messages };
    }

    const halfPot = Math.floor(pot / 2);
    let lowPot = halfPot;
    let highPot = halfPot;
    if (pot % 2 !== 0) highPot += 1;

    if (lowCandidates.length === 0) { highPot += lowPot; lowPot = 0; }
    if (highCandidates.length === 0) { lowPot += highPot; highPot = 0; }

    const winners = new Set<string>();

    const hasBothSides = highCandidates.length > 0 && lowCandidates.length > 0;

    if (highCandidates.length > 0) {
      highCandidates.sort((a, b) => bestTotal(b.cards).total - bestTotal(a.cards).total);
      const bestHighTotal = bestTotal(highCandidates[0].cards).total;
      const highWinners = highCandidates.filter(p => bestTotal(p.cards).total === bestHighTotal);
      const share = Math.floor(highPot / highWinners.length);
      let remainder = highPot - share * highWinners.length;

      for (const w of highWinners) {
        const fp = finalPlayers.find(p => p.id === w.id)!;
        const award = share + (remainder > 0 ? 1 : 0);
        fp.chips += award;
        if (remainder > 0) remainder--;
        fp.isWinner = true;
        winners.add(w.id);
        if (highWinners.length > 1) {
          messages.push(`${w.name} wins HIGH — $${award} of $${highPot} (${bestHighTotal})`);
        }
      }
      if (highWinners.length === 1) {
        messages.push(`${highWinners[0].name} wins HIGH — $${highPot} (${bestHighTotal})`);
      }
    }

    if (lowCandidates.length > 0) {
      lowCandidates.sort((a, b) => {
        const aT = bestTotal(a.cards).total;
        const bT = bestTotal(b.cards).total;
        return Math.abs(bT - 15) - Math.abs(aT - 15) || bT - aT;
      });
      const bestLowTotal = bestTotal(lowCandidates[0].cards).total;
      const lowWinners = lowCandidates.filter(p => bestTotal(p.cards).total === bestLowTotal);
      const share = Math.floor(lowPot / lowWinners.length);
      let remainder = lowPot - share * lowWinners.length;

      for (const w of lowWinners) {
        const fp = finalPlayers.find(p => p.id === w.id)!;
        const award = share + (remainder > 0 ? 1 : 0);
        fp.chips += award;
        if (remainder > 0) remainder--;
        fp.isWinner = true;
        winners.add(w.id);
        if (lowWinners.length > 1) {
          messages.push(`${w.name} wins LOW — $${award} of $${lowPot} (${bestLowTotal})`);
        }
      }
      if (lowWinners.length === 1) {
        messages.push(`${lowWinners[0].name} wins LOW — $${lowPot} (${bestLowTotal})`);
      }
    }

    if (hasBothSides) {
      messages.unshift(`Split Pot — HIGH/LOW split $${pot}`);
    }

    finalPlayers.forEach(p => {
      if (p.status !== 'folded' && !winners.has(p.id)) {
        p.isLoser = true;
      }
    });

    return { players: finalPlayers, pot: 0, messages };
  },

  checkAutoStay: (state: GameState, playerId: string): boolean => {
    const active = state.players.filter(p => p.status === 'active');
    if (active.length !== 2) return false;
    const me = active.find(p => p.id === playerId);
    const other = active.find(p => p.id !== playerId);
    if (!me || !other) return false;
    if (me.declaration) return false;
    if (other.declaration !== 'STAY') return false;
    const myTotal = bestTotal(me.cards).total;
    const otherTotal = bestTotal(other.cards).total;
    const myIsLow = qualifiesLow(myTotal);
    const myIsHigh = qualifiesHigh(myTotal);
    const otherIsLow = qualifiesLow(otherTotal);
    const otherIsHigh = qualifiesHigh(otherTotal);
    return (myIsLow && otherIsHigh) || (myIsHigh && otherIsLow);
  }
};
