import { GameMode } from '../engine/types';
import { GameState, Player, CardType, GamePhase, Declaration } from '../types';
import { getNextActivePlayerIndex } from '../engine/core';
import { decideBet, applyBetDecision } from '../engine/botUtils';

function suitsCardValue(rank: string): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return parseInt(rank, 10);
}

const pokerRankValues: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

function getCombinations<T>(array: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k === 1) return array.map(a => [a]);
  if (array.length < k) return [];
  const combs: T[][] = [];
  array.forEach((current, index) => {
    const smallerCombs = getCombinations(array.slice(index + 1), k - 1);
    smallerCombs.forEach(sc => combs.push([current, ...sc]));
  });
  return combs;
}

function eval5Cards(cards: CardType[]): { value: number; name: string } {
  const ranks = cards.map(c => pokerRankValues[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  const isFlush = new Set(suits).size === 1;
  const uniqueRanks = new Set(ranks);
  const isStraight = (uniqueRanks.size === 5 && ranks[0] - ranks[4] === 4) ||
                     (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2);

  const rankCounts = ranks.reduce((acc, r) => {
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const counts = Object.values(rankCounts).sort((a, b) => b - a);

  const sortedByCount = Object.entries(rankCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return parseInt(b[0]) - parseInt(a[0]);
    })
    .map(([r]) => parseInt(r));

  const kicker = sortedByCount.reduce((sum, r, i) => sum + r * Math.pow(15, 4 - i), 0);

  if (isStraight && isFlush) {
    if (ranks[0] === 14 && ranks[1] === 13) return { value: 9000000 + kicker, name: "Royal Flush" };
    return { value: 8000000 + (ranks[0] === 14 ? 5 : kicker), name: "Straight Flush" };
  }
  if (counts[0] === 4) return { value: 7000000 + kicker, name: "Four of a Kind" };
  if (counts[0] === 3 && counts[1] === 2) return { value: 6000000 + kicker, name: "Full House" };
  if (isFlush) return { value: 5000000 + kicker, name: "Flush" };
  if (isStraight) return { value: 4000000 + (ranks[0] === 14 && ranks[1] === 5 ? 5 : kicker), name: "Straight" };
  if (counts[0] === 3) return { value: 3000000 + kicker, name: "Three of a Kind" };
  if (counts[0] === 2 && counts[1] === 2) return { value: 2000000 + kicker, name: "Two Pair" };
  if (counts[0] === 2) return { value: 1000000 + kicker, name: "Pair" };
  return { value: kicker, name: "High Card" };
}

const PATH_A_INDICES = [0, 1, 2, 6, 7, 8, 9, 10, 11];
const PATH_B_INDICES = [3, 4, 5, 6, 7, 8, 9, 10, 11];

interface CardEntry {
  card: CardType;
  index: number;
  type: 'hole' | 'comm';
}

function getVisibleEntries(holeCards: CardType[], communityCards: CardType[], pathIndices: number[]): CardEntry[] {
  const holeEntries: CardEntry[] = holeCards
    .map((c, i) => ({ card: c, index: i, type: 'hole' as const }))
    .filter(e => !e.card.isHidden);

  const commEntries: CardEntry[] = pathIndices
    .map(i => ({ card: communityCards[i], index: i, type: 'comm' as const }))
    .filter(e => e.card && !e.card.isHidden);

  return [...holeEntries, ...commEntries];
}

function evaluateBestPokerOnPath(
  holeCards: CardType[],
  communityCards: CardType[],
  pathIndices: number[]
): { value: number; name: string; holeIndices: number[]; commIndices: number[] } | null {
  const allEntries = getVisibleEntries(holeCards, communityCards, pathIndices);
  if (allEntries.length < 5) return null;

  const combos = getCombinations(allEntries, 5);
  let best: { value: number; name: string; holeIndices: number[]; commIndices: number[] } | null = null;

  for (const combo of combos) {
    const result = eval5Cards(combo.map(c => c.card));
    if (!best || result.value > best.value) {
      best = {
        value: result.value,
        name: result.name,
        holeIndices: combo.filter(c => c.type === 'hole').map(c => c.index),
        commIndices: combo.filter(c => c.type === 'comm').map(c => c.index)
      };
    }
  }
  return best;
}

function evaluateBestSuitsOnPath(
  holeCards: CardType[],
  communityCards: CardType[],
  pathIndices: number[]
): { score: number; valid: boolean; suit: string; holeIndices: number[]; commIndices: number[] } {
  const allEntries = getVisibleEntries(holeCards, communityCards, pathIndices);

  const bySuit: Record<string, CardEntry[]> = {};
  for (const entry of allEntries) {
    const s = entry.card.suit;
    if (!bySuit[s]) bySuit[s] = [];
    bySuit[s].push(entry);
  }

  let best = { score: 0, valid: false, suit: '', holeIndices: [] as number[], commIndices: [] as number[] };

  for (const [suit, entries] of Object.entries(bySuit)) {
    if (entries.length < 5) continue;
    const sorted = [...entries].sort((a, b) => suitsCardValue(b.card.rank) - suitsCardValue(a.card.rank));
    const top5 = sorted.slice(0, 5);
    const score = top5.reduce((sum, e) => sum + suitsCardValue(e.card.rank), 0);

    if (score > best.score) {
      best = {
        score,
        valid: true,
        suit,
        holeIndices: top5.filter(e => e.type === 'hole').map(e => e.index),
        commIndices: top5.filter(e => e.type === 'comm').map(e => e.index)
      };
    }
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
  let pokerPath = 'A';
  if (pokerB && (!pokerA || pokerB.value > pokerA.value)) {
    bestPoker = pokerB;
    pokerPath = 'B';
  }

  let bestSuits = suitsA;
  let suitsPath = 'A';
  if (suitsB.score > suitsA.score) {
    bestSuits = suitsB;
    suitsPath = 'B';
  }

  const suitsValid = bestSuits.valid;
  const suitSymbols: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const suitSymbol = suitSymbols[bestSuits.suit] || '';

  const swingOnA = pokerA !== null && suitsA.valid;
  const swingOnB = pokerB !== null && suitsB.valid;
  const isSwingCandidate = swingOnA || swingOnB;

  let swingPokerValue = 0;
  let swingSuitsScore = 0;
  if (swingOnA && swingOnB) {
    const scoreA = (pokerA?.value || 0) + suitsA.score;
    const scoreB = (pokerB?.value || 0) + suitsB.score;
    if (scoreA >= scoreB) {
      swingPokerValue = pokerA?.value || 0;
      swingSuitsScore = suitsA.score;
    } else {
      swingPokerValue = pokerB?.value || 0;
      swingSuitsScore = suitsB.score;
    }
  } else if (swingOnA) {
    swingPokerValue = pokerA?.value || 0;
    swingSuitsScore = suitsA.score;
  } else if (swingOnB) {
    swingPokerValue = pokerB?.value || 0;
    swingSuitsScore = suitsB.score;
  }

  let descParts: string[] = [];
  if (pokerPath === suitsPath || !suitsValid) {
    descParts.push(`Path ${pokerPath}`);
  } else {
    descParts.push(`P:${pokerPath} S:${suitsPath}`);
  }
  if (isSwingCandidate) {
    const swingPaths = [swingOnA && 'A', swingOnB && 'B'].filter(Boolean).join('/');
    descParts.push(`Swing ✓ (${swingPaths})`);
  }

  return {
    high: bestPoker?.name || 'No Hand',
    low: suitsValid ? `${suitSymbol} ${bestSuits.score}pts` : 'No Suits',
    highEval: bestPoker ? {
      description: bestPoker.name,
      usedHoleCardIndices: bestPoker.holeIndices,
      usedCommunityCardIndices: bestPoker.commIndices
    } : { description: 'No Hand', usedHoleCardIndices: [] as number[], usedCommunityCardIndices: [] as number[] },
    lowEval: suitsValid ? {
      description: `${suitSymbol} ${bestSuits.score}pts`,
      usedHoleCardIndices: bestSuits.holeIndices,
      usedCommunityCardIndices: bestSuits.commIndices
    } : { description: 'No Suits', usedHoleCardIndices: [] as number[], usedCommunityCardIndices: [] as number[] },
    description: descParts.join(' · '),
    isValidBadugi: suitsValid,
    pokerValue: bestPoker?.value || 0,
    suitsScore: bestSuits.score,
    suitsValid,
    swingPokerValue,
    swingSuitsScore
  };
}

export const SuitsPokerMode: GameMode = {
  id: 'suits_poker',
  name: 'Suits & Poker',
  phases: [
    'WAITING',
    'ANTE',
    'DEAL',
    'REVEAL_TOP_ROW',
    'DRAW',
    'BET_1',
    'REVEAL_SECOND_ROW',
    'BET_2',
    'REVEAL_LOWER_CENTER',
    'BET_3',
    'REVEAL_FACTOR_CARD',
    'DECLARE_AND_BET',
    'SHOWDOWN'
  ],

  deal: (deck, players, myId) => {
    const newDeck = [...deck];
    const newPlayers = players.map(p => {
      if (p.status !== 'active') return p;
      const cards = newDeck.splice(0, 5).map(c => ({
        ...c,
        isHidden: p.id !== myId
      }));
      return { ...p, cards };
    });

    const communityCards = newDeck.splice(0, 12).map(c => ({
      ...c,
      isHidden: true
    }));

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
      const newPlayers = players.map(p =>
        p.id === botId ? { ...p, chips: p.chips - 1, hasActed: true } : p
      );
      const roundOver = newPlayers.filter(p => p.status === 'active').every(p => p.hasActed);
      return {
        stateUpdates: { pot: pot + 1, players: newPlayers },
        message: `${bot.name} antes $1`,
        roundOver,
        nextPlayerId: roundOver ? undefined : players[nextIdx].id
      };
    }

    if (phase === 'DRAW') {
      const evaluation = spEvaluateHand(bot, state.communityCards);
      const pokerValue = evaluation?.pokerValue || 0;
      const suitsScore = evaluation?.suitsScore || 0;
      const suitsValid = evaluation?.suitsValid || false;

      const cardsToKeep = new Set<number>();

      if (pokerValue > 1000000) {
        evaluation?.highEval.usedHoleCardIndices.forEach(idx => cardsToKeep.add(idx));
      }

      if (suitsValid && suitsScore > 25) {
        evaluation?.lowEval.usedHoleCardIndices.forEach(idx => cardsToKeep.add(idx));
      }

      const suitCounts: Record<string, number[]> = {};
      bot.cards.forEach((c, i) => {
        if (!suitCounts[c.suit]) suitCounts[c.suit] = [];
        suitCounts[c.suit].push(i);
      });
      const bestSuitGroup = Object.values(suitCounts).sort((a, b) => b.length - a.length)[0];
      if (bestSuitGroup && bestSuitGroup.length >= 3) {
        bestSuitGroup.forEach(i => cardsToKeep.add(i));
      }

      if (cardsToKeep.size < 3) {
        const sortedHole = bot.cards.map((c, i) => ({ c, i }))
          .sort((a, b) => pokerRankValues[b.c.rank] - pokerRankValues[a.c.rank]);
        for (const entry of sortedHole) {
          if (cardsToKeep.size >= 3) break;
          cardsToKeep.add(entry.i);
        }
      }

      const indicesToDiscard = bot.cards.map((_, i) => i).filter(i => !cardsToKeep.has(i));
      const finalDiscard = indicesToDiscard.slice(0, 2);

      const numDiscard = finalDiscard.length;
      const newDeck = [...state.deck];
      const newPlayers = players.map(p => {
        if (p.id !== botId) return p;
        const newCards = [...p.cards];
        if (numDiscard > 0) {
          finalDiscard.forEach(idx => {
            newCards[idx] = { ...newDeck.shift()!, isHidden: true };
          });
        }
        return { ...p, cards: newCards, hasActed: true };
      });
      const roundOver = newPlayers.filter(p => p.status === 'active').every(p => p.hasActed);
      return {
        stateUpdates: { deck: newDeck, players: newPlayers },
        message: numDiscard > 0 ? `${bot.name} draws ${numDiscard}` : `${bot.name} stands pat`,
        roundOver,
        nextPlayerId: roundOver ? undefined : players[nextIdx].id
      };
    }

    if (phase.startsWith('BET') || phase === 'DECLARE_AND_BET') {
      const evaluation = spEvaluateHand(bot, state.communityCards);
      const pokerValue = evaluation?.pokerValue || 0;
      const suitsScore = evaluation?.suitsScore || 0;
      const suitsValid = evaluation?.suitsValid || false;

      let declaration: Declaration = bot.declaration;
      if (phase === 'DECLARE_AND_BET') {
        const isStrongPoker = pokerValue >= 2000000;
        const isDecentPoker = pokerValue >= 1000000;
        const isStrongSuits = suitsValid && suitsScore >= 45;
        const isDecentSuits = suitsValid && suitsScore >= 35;

        if (isStrongPoker && isStrongSuits) {
          declaration = 'SWING';
        } else if (isDecentPoker && isStrongSuits && Math.random() < 0.3) {
          declaration = 'SWING';
        } else if (isDecentSuits && !isDecentPoker) {
          declaration = 'SUITS';
        } else if (isDecentPoker && !isDecentSuits) {
          declaration = 'POKER';
        } else if (suitsValid && suitsScore > pokerValue / 100000) {
          declaration = 'SUITS';
        } else {
          declaration = 'POKER';
        }
      }

      const pokerStrength = Math.min(pokerValue / 5000000, 1);
      const suitsStrength = suitsValid ? Math.min(suitsScore / 55, 1) : 0;

      let handStrength = 0;
      if (declaration === 'SWING') handStrength = Math.min(pokerStrength, suitsStrength);
      else if (declaration === 'SUITS') handStrength = suitsStrength;
      else handStrength = pokerStrength;

      const decision = decideBet(handStrength, pot, currentBet, bot.bet, bot.chips);
      const result = applyBetDecision(decision, bot, currentBet, pot);

      const newPlayers = players.map(p => {
        if (p.id !== botId) return p;
        return {
          ...p,
          status: result.status as any,
          chips: result.chips,
          bet: result.bet,
          hasActed: true,
          declaration: declaration || p.declaration
        };
      });

      const activePlayersForRound = isDeclarePhase
        ? newPlayers.filter(p => p.status === 'active')
        : newPlayers.filter(p => p.status === 'active' && p.chips > 0);
      const allActed = activePlayersForRound.every(p => p.hasActed);
      const allBetsMatch = activePlayersForRound.every(p => p.bet === result.currentBet || p.chips === 0);
      const roundOver = allActed && allBetsMatch;

      let msg = `${bot.name}`;
      if (phase === 'DECLARE_AND_BET' && declaration) msg += ` declares ${declaration} and`;
      if (decision.action === 'fold') msg += ' folds';
      else if (decision.action === 'check') msg += ' checks';
      else if (decision.action === 'call') msg += ` calls $${currentBet - bot.bet}`;
      else msg += ` raises to $${result.bet}`;

      return {
        stateUpdates: { pot: result.pot, currentBet: result.currentBet, players: newPlayers },
        message: msg,
        roundOver,
        nextPlayerId: roundOver ? undefined : players[nextIdx].id
      };
    }

    return null;
  },

  getAutoTransition: (phase) => {
    if (phase === 'REVEAL_TOP_ROW') {
      return {
        delay: 1000,
        action: (state) => ({
          stateUpdates: {
            communityCards: state.communityCards.map((c, i) =>
              i < 6 ? { ...c, isHidden: false } : c
            )
          },
          message: 'Side A & Side B flops revealed!',
          advancePhase: true
        })
      };
    }

    if (phase === 'REVEAL_SECOND_ROW') {
      return {
        delay: 1000,
        action: (state) => ({
          stateUpdates: {
            communityCards: state.communityCards.map((c, i) =>
              (i >= 6 && i <= 8) ? { ...c, isHidden: false } : c
            )
          },
          message: 'Center flop revealed!',
          advancePhase: true
        })
      };
    }

    if (phase === 'REVEAL_LOWER_CENTER') {
      return {
        delay: 1000,
        action: (state) => ({
          stateUpdates: {
            communityCards: state.communityCards.map((c, i) =>
              (i === 9 || i === 10) ? { ...c, isHidden: false } : c
            )
          },
          message: 'Lower center cards revealed!',
          advancePhase: true
        })
      };
    }

    if (phase === 'REVEAL_FACTOR_CARD') {
      return {
        delay: 1000,
        action: (state) => ({
          stateUpdates: {
            communityCards: state.communityCards.map((c, i) =>
              i === 11 ? { ...c, isHidden: false } : c
            )
          },
          message: 'Final card revealed!',
          advancePhase: true
        })
      };
    }

    return null;
  },

  evaluateHand: (player, communityCards) => {
    return spEvaluateHand(player, communityCards);
  },

  resolveShowdown: (players, pot, myId, communityCards) => {
    const cc = communityCards || [];

    const finalPlayers: Player[] = players.map(p => {
      if (p.status === 'folded') return p;
      const cards = p.cards.map(c => ({ ...c, isHidden: false }));
      const score = spEvaluateHand({ ...p, cards }, cc) || undefined;
      return { ...p, cards, score };
    });

    const activePlayers = finalPlayers.filter(p => p.status !== 'folded');
    let messages: string[] = [];

    if (activePlayers.length === 1) {
      activePlayers[0].chips += pot;
      activePlayers[0].isWinner = true;
      messages.push(`${activePlayers[0].name} wins $${pot} (last player standing)`);
      return { players: finalPlayers, pot: 0, messages };
    }

    const findPokerWinner = (contenders: Player[]): Player[] => {
      let bestVal = -1;
      let winners: Player[] = [];
      for (const p of contenders) {
        const val = p.declaration === 'SWING'
          ? (p.score?.swingPokerValue || 0)
          : (p.score?.pokerValue || 0);
        if (val > bestVal) { bestVal = val; winners = [p]; }
        else if (val === bestVal && val > 0) winners.push(p);
      }
      return winners;
    };

    const findSuitsWinner = (contenders: Player[]): Player[] => {
      let bestVal = 0;
      let winners: Player[] = [];
      for (const p of contenders) {
        const val = p.declaration === 'SWING'
          ? (p.score?.swingSuitsScore || 0)
          : (p.score?.suitsScore || 0);
        const valid = p.declaration === 'SWING'
          ? ((p.score?.swingSuitsScore || 0) > 0)
          : (p.score?.suitsValid || false);
        if (!valid) continue;
        if (val > bestVal) { bestVal = val; winners = [p]; }
        else if (val === bestVal && val > 0) winners.push(p);
      }
      return winners;
    };

    let pokerEligible = activePlayers.filter(p => p.declaration === 'POKER' || p.declaration === 'SWING');
    let suitsEligible = activePlayers.filter(p => p.declaration === 'SUITS' || p.declaration === 'SWING');

    let pokerWinners = findPokerWinner(pokerEligible);
    let suitsWinners = findSuitsWinner(suitsEligible);

    const swingIds = activePlayers.filter(p => p.declaration === 'SWING').map(p => p.id);
    const failedSwingIds: string[] = [];

    const successfulSwings = swingIds.filter(sid => {
      return pokerWinners.some(w => w.id === sid) && suitsWinners.some(w => w.id === sid);
    });

    if (successfulSwings.length > 0) {
      const share = Math.floor(pot / successfulSwings.length);
      if (successfulSwings.length > 1) {
        messages.push(`Split Pot — ${successfulSwings.length} SWING scoops split $${pot}`);
      }
      for (const sid of successfulSwings) {
        const p = finalPlayers.find(pp => pp.id === sid)!;
        p.chips += share;
        p.isWinner = true;
        messages.push(`${p.name} SCOOPS $${share} with SWING! (${p.score?.high} + ${p.score?.low})`);
      }
      finalPlayers.forEach(p => { if (p.status !== 'folded' && !p.isWinner) p.isLoser = true; });
      return { players: finalPlayers, pot: 0, messages };
    }

    for (const sid of swingIds) {
      failedSwingIds.push(sid);
      const sp = finalPlayers.find(p => p.id === sid)!;
      messages.push(`${sp.name} fails SWING`);
    }

    pokerEligible = pokerEligible.filter(p => !failedSwingIds.includes(p.id));
    suitsEligible = suitsEligible.filter(p => !failedSwingIds.includes(p.id));
    pokerWinners = findPokerWinner(pokerEligible);
    suitsWinners = findSuitsWinner(suitsEligible);

    if (pokerWinners.length === 0 && suitsWinners.length === 0) {
      messages.push(`No qualifiers. $${pot} rolls over!`);
      return { players: finalPlayers, pot, messages };
    }

    let pokerPot = 0, suitsPot = 0;
    if (pokerWinners.length > 0 && suitsWinners.length > 0) {
      pokerPot = Math.floor(pot / 2);
      suitsPot = pot - pokerPot;
      messages.push(`Split Pot — POKER/SUITS split $${pot}`);
    } else if (pokerWinners.length > 0) {
      pokerPot = pot;
    } else {
      suitsPot = pot;
    }

    if (pokerWinners.length > 0) {
      const share = Math.floor(pokerPot / pokerWinners.length);
      for (const w of pokerWinners) {
        const p = finalPlayers.find(pp => pp.id === w.id)!;
        p.chips += share;
        p.isWinner = true;
        if (pokerWinners.length > 1) {
          messages.push(`${p.name} wins POKER — $${share} of $${pokerPot} (${p.score?.high})`);
        } else {
          messages.push(`${p.name} wins POKER — $${pokerPot} (${p.score?.high})`);
        }
      }
    }

    if (suitsWinners.length > 0) {
      const share = Math.floor(suitsPot / suitsWinners.length);
      for (const w of suitsWinners) {
        const p = finalPlayers.find(pp => pp.id === w.id)!;
        p.chips += share;
        p.isWinner = true;
        if (suitsWinners.length > 1) {
          messages.push(`${p.name} wins SUITS — $${share} of $${suitsPot} (${p.score?.low})`);
        } else {
          messages.push(`${p.name} wins SUITS — $${suitsPot} (${p.score?.low})`);
        }
      }
    }

    finalPlayers.forEach(p => {
      if (p.status !== 'folded' && !p.isWinner) p.isLoser = true;
    });

    return { players: finalPlayers, pot: 0, messages };
  }
};
