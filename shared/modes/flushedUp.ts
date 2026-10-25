import { GameMode, GameState, Player, CardType, GamePhase } from '../gameTypes';
import { decideBet, applyBetDecision, takeAnte, botPersonality } from '../engine/botUtils';
import { computeSidePots, totalSidePotAmount, sidePotsForShowdown, type SidePot } from '../engine/sidePots';

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

function rv(rank: string): number { return RANK_VALUES[rank] ?? 0; }

const SUIT_LABEL: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};

function rankLabel(v: number): string {
  if (v === 14) return 'A';
  if (v === 13) return 'K';
  if (v === 12) return 'Q';
  if (v === 11) return 'J';
  return String(v);
}

export interface FlushedUpEval {
  description: string;
  suitCount: number;
  bestSuit: string;
  rankValues: number[];
  isFlush: boolean;
}

function compareDescLists(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

export function evaluateFlushedUpHand(cards: CardType[]): FlushedUpEval {
  if (!cards || cards.length === 0) {
    return { description: 'No Cards', suitCount: 0, bestSuit: 'spades', rankValues: [], isFlush: false };
  }
  const suitGroups: Record<string, number[]> = {};
  for (const c of cards) {
    if (!suitGroups[c.suit]) suitGroups[c.suit] = [];
    suitGroups[c.suit].push(rv(c.rank));
  }
  let bestSuit = '';
  let bestRanks: number[] = [];
  for (const [suit, vals] of Object.entries(suitGroups)) {
    const desc = [...vals].sort((a, b) => b - a);
    if (
      desc.length > bestRanks.length ||
      (desc.length === bestRanks.length && compareDescLists(desc, bestRanks) > 0)
    ) {
      bestSuit = suit;
      bestRanks = desc;
    }
  }
  const isFlush = bestRanks.length >= 5;
  const rankStr = bestRanks.map(rankLabel).join('-');
  const suitSym = SUIT_LABEL[bestSuit] ?? bestSuit;
  const description = isFlush
    ? `Flush ${suitSym}${rankStr}`
    : `${bestRanks.length}-card ${suitSym} ${rankStr}`;
  return { description, suitCount: bestRanks.length, bestSuit, rankValues: bestRanks, isFlush };
}

export function compareFlushedUpHands(a: FlushedUpEval, b: FlushedUpEval): number {
  if (a.suitCount !== b.suitCount) return a.suitCount - b.suitCount;
  return compareDescLists(a.rankValues, b.rankValues);
}

function discardLimitForPhase(phase: GamePhase | string): number {
  if (phase === 'DRAW_1') return 3;
  if (phase === 'DRAW_2') return 2;
  if (phase === 'DRAW_3') return 1;
  return 0;
}

function drawsRemainingForBet(phase: GamePhase | string): number {
  if (phase === 'BET_1') return 3;
  if (phase === 'BET_2') return 2;
  if (phase === 'BET_3') return 1;
  return 0;
}

function botDiscardIndices(cards: CardType[], maxDiscard: number): number[] {
  if (maxDiscard === 0) return [];
  const suitGroups: Record<string, number[]> = {};
  for (let i = 0; i < cards.length; i++) {
    const s = cards[i].suit;
    if (!suitGroups[s]) suitGroups[s] = [];
    suitGroups[s].push(i);
  }
  let bestSuit = '';
  let bestCount = 0;
  for (const [suit, idxs] of Object.entries(suitGroups)) {
    if (idxs.length > bestCount) { bestSuit = suit; bestCount = idxs.length; }
  }
  if (bestCount >= 5) return [];
  const nonSuitIndices = cards
    .map((c, i) => ({ i, suit: c.suit, val: rv(c.rank) }))
    .filter(x => x.suit !== bestSuit)
    .sort((a, b) => a.val - b.val)
    .map(x => x.i)
    .slice(0, maxDiscard);
  return nonSuitIndices;
}

function performBotDraw(
  botCards: CardType[],
  indices: number[],
  deck: CardType[],
  discard: CardType[],
): { cards: CardType[]; deck: CardType[]; discard: CardType[] } {
  const newCards = [...botCards];
  const newDeck = [...deck];
  const newDiscard = [...discard];
  for (const idx of indices) {
    newDiscard.push(newCards[idx]);
    if (newDeck.length === 0 && newDiscard.length > 0) {
      const reshuffled = [...newDiscard];
      newDiscard.length = 0;
      for (let ri = reshuffled.length - 1; ri > 0; ri--) {
        const rj = Math.floor(Math.random() * (ri + 1));
        [reshuffled[ri], reshuffled[rj]] = [reshuffled[rj], reshuffled[ri]];
      }
      newDeck.push(...reshuffled);
    }
    const drawn = newDeck.shift();
    if (drawn) newCards[idx] = { ...drawn, isHidden: true };
  }
  return { cards: newCards, deck: newDeck, discard: newDiscard };
}

export const FlushedUpMode: GameMode = {
  id: 'flushed_up',
  name: 'Flushed Up',
  phases: ['WAITING', 'ANTE', 'DEAL', 'BET_1', 'DRAW_1', 'BET_2', 'DRAW_2', 'BET_3', 'DRAW_3', 'BET_4', 'SHOWDOWN'],

  deal: (deck: CardType[], players: Player[], myId: string) => {
    const freshDeck = [...deck];
    const newPlayers = players.map(p => {
      if (p.status !== 'active') return { ...p, cards: [] };
      const cards = freshDeck.splice(0, 5).map(c => ({ ...c, isHidden: p.id !== myId }));
      return { ...p, cards };
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
    let discardPile = state.discardPile || [];

    const bIdx = newPlayers.findIndex(p => p.id === botId);
    const bot = newPlayers[bIdx];

    const isDrawPhase = ['DRAW_1', 'DRAW_2', 'DRAW_3'].includes(state.phase);

    if (state.phase === 'ANTE') {
      const ante = takeAnte(bot.chips, 25);
      newPlayers[bIdx] = { ...bot, chips: ante.chips, hasActed: true };
      newPot += ante.contribution;
      message = `${bot.name} paid $${ante.contribution} Ante`;

    } else if (isDrawPhase) {
      const maxDiscard = discardLimitForPhase(state.phase);
      const botCards = bot.cards.map(c => ({ ...c, isHidden: false }));
      const indices = botDiscardIndices(botCards, maxDiscard);

      if (indices.length > 0) {
        const drawn = performBotDraw(botCards, indices, newDeck, discardPile);
        newPlayers[bIdx] = { ...bot, cards: drawn.cards, hasActed: true };
        newDeck = drawn.deck;
        discardPile = drawn.discard;
        message = `${bot.name} discarded ${indices.length} card${indices.length > 1 ? 's' : ''}`;
      } else {
        newPlayers[bIdx] = { ...bot, hasActed: true };
        message = `${bot.name} stood pat`;
      }

    } else {
      const botCards = bot.cards.map(c => ({ ...c, isHidden: false }));
      const fuEval = evaluateFlushedUpHand(botCards);
      const drawsLeft = drawsRemainingForBet(state.phase);

      let strength = 0.08;
      if (fuEval.isFlush) {
        const topRankSum = fuEval.rankValues.slice(0, 3).reduce((s, v) => s + v, 0);
        strength = Math.min(0.99, 0.88 + topRankSum / 500);
      } else if (fuEval.suitCount >= 4) {
        strength = drawsLeft > 0 ? 0.65 : 0.50;
      } else if (fuEval.suitCount >= 3) {
        strength = drawsLeft > 0 ? 0.38 : 0.22;
      } else if (fuEval.suitCount >= 2) {
        strength = drawsLeft > 0 ? 0.16 : 0.07;
      } else {
        strength = 0.04;
      }

      const activeOpponents = state.players.filter(p => p.id !== botId && p.status === 'active').length;
      const raiseCap = activeOpponents <= 1 ? 4 : 3;
      const largePot = state.pot >= 200;
      const raisesSoFar = state.raisesThisRound ?? 0;

      const decision = decideBet(strength, state.pot, state.currentBet, bot.bet, bot.chips, {
        largePot, raisesThisRound: raisesSoFar, raiseCap, personality: botPersonality(botId),
      });
      const result = applyBetDecision(decision, bot, state.currentBet, state.pot, raisesSoFar);
      newPlayers[bIdx] = {
        ...bot,
        chips: result.chips,
        bet: result.bet,
        status: result.status as Player['status'],
        hasActed: true,
      };
      newPot = result.pot;
      newCurrentBet = result.currentBet;
      newRaisesThisRound = result.raisesThisRound;
      message = result.message;
    }

    const activePlayers = isDrawPhase
      ? newPlayers.filter(p => p.status === 'active')
      : newPlayers.filter(p => p.status === 'active' && p.chips > 0);
    const allActed = activePlayers.every(p => p.hasActed);
    const allBetsMatch = activePlayers.every(p => p.bet === newCurrentBet || p.chips === 0);
    const roundOver = isDrawPhase ? allActed : (allActed && allBetsMatch);

    let nextPlayerId: string | undefined;
    if (!roundOver) {
      let nextIdx = (bIdx + 1) % newPlayers.length;
      let count = 0;
      while (count < newPlayers.length) {
        const p = newPlayers[nextIdx];
        if (
          p.status === 'active' &&
          (isDrawPhase || p.chips > 0) &&
          (!p.hasActed || (!isDrawPhase && p.bet < newCurrentBet))
        ) break;
        nextIdx = (nextIdx + 1) % newPlayers.length;
        count++;
      }
      nextPlayerId = newPlayers[nextIdx].id;
    }

    return {
      stateUpdates: {
        players: newPlayers,
        deck: newDeck,
        pot: newPot,
        currentBet: newCurrentBet,
        raisesThisRound: newRaisesThisRound,
        discardPile,
      },
      message,
      roundOver,
      nextPlayerId,
    };
  },

  getAutoTransition: () => null,

  evaluateHand: (player: Player) =>
    evaluateFlushedUpHand(player.cards.map(c => ({ ...c, isHidden: false }))),

  resolveShowdown: (players: Player[], pot: number) => {
    let finalPlayers = players.map(p => {
      if (p.status === 'folded') return { ...p };
      const revealedCards = p.cards.map((c): CardType => ({ ...c, isHidden: false }));
      const score = evaluateFlushedUpHand(revealedCards);
      return { ...p, cards: revealedCards, score };
    });

    const activePlayers = finalPlayers.filter(p => p.status !== 'folded');
    const messages: string[] = [];

    // Detroit 2026-10-16: use sidePotsForShowdown so rollover carry-in is included.
    const sidePots: SidePot[] = sidePotsForShowdown(finalPlayers, pot, activePlayers.map(p => p.id));
    const totalAwardable = totalSidePotAmount(sidePots);

    if (activePlayers.length === 1) {
      const sole = activePlayers[0];
      // Sole survivor always wins — no flush requirement (Detroit 2026-10-13).
      // Best hand by flush hierarchy takes it; pot never rolls over on a single winner.
      // Detroit 2026-10-16: award the FULL pot. The old code only awarded side pots
      // the survivor was eligible for; when a folded opponent had bet MORE than the
      // survivor, the excess silently rolled over — contradicting this comment and
      // shorting the winner. Last player standing takes everything, like real poker.
      const idx = finalPlayers.findIndex(p => p.id === sole.id);
      finalPlayers[idx] = { ...finalPlayers[idx], chips: finalPlayers[idx].chips + pot, isWinner: true };
      messages.push(`${finalPlayers[idx].name} wins $${pot} (last player standing)`);
      const soleEval = (finalPlayers[idx].score as FlushedUpEval | undefined) ?? evaluateFlushedUpHand(finalPlayers[idx].cards);
      return {
        players: finalPlayers, pot: 0, messages,
        summary: {
          modeId: 'flushed_up',
          headline: `${finalPlayers[idx].name} wins $${pot} — last player standing`,
          awards: [{ playerId: sole.id, amount: pot, part: 'SOLE', reason: 'Last player standing — every other player folded.' }],
          entries: [{ playerId: sole.id, description: soleEval.description }],
          comparisons: [],
          rollover: 0,
        },
      };
    }

    const deltas: Record<string, number> = {};
    const winnerSet = new Set<string>();
    let rolledOver = 0;

    for (const sp of sidePots) {
      const eligible = finalPlayers.filter(p => p.status !== 'folded' && sp.eligibleIds.includes(p.id));
      if (eligible.length === 0) { rolledOver += sp.amount; continue; }

      const evalMap = new Map<string, FlushedUpEval>();
      for (const p of eligible) {
        evalMap.set(
          p.id,
          (p.score as FlushedUpEval | undefined) ??
            evaluateFlushedUpHand(p.cards.map(c => ({ ...c, isHidden: false }))),
        );
      }

      // Best hand by flush hierarchy wins — no flush required (Detroit 2026-10-13).
      // compareFlushedUpHands ranks by suit count then high cards, so the
      // strongest flush-ish hand always takes the pot. No rollover.
      const qualifying = eligible;

      let bestEval: FlushedUpEval | null = null;
      for (const p of qualifying) {
        const e = evalMap.get(p.id)!;
        if (!bestEval || compareFlushedUpHands(e, bestEval) > 0) bestEval = e;
      }

      const winners = qualifying.filter(p => {
        const e = evalMap.get(p.id)!;
        return compareFlushedUpHands(e, bestEval!) === 0;
      });

      const share = Math.floor(sp.amount / winners.length);
      let rem = sp.amount - share * winners.length;
      for (const w of winners) {
        const award = share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
        deltas[w.id] = (deltas[w.id] ?? 0) + award;
        winnerSet.add(w.id);
      }
    }

    finalPlayers = finalPlayers.map(p => {
      if (winnerSet.has(p.id)) {
        return { ...p, chips: p.chips + (deltas[p.id] ?? 0), isWinner: true };
      }
      if (p.status !== 'folded') return { ...p, isLoser: true };
      return p;
    });

    if (winnerSet.size > 1) {
      const names = Array.from(winnerSet).map(id => finalPlayers.find(p => p.id === id)?.name ?? id).join(' & ');
      messages.push(`Split Pot — ${names}`);
    }

    for (const id of winnerSet) {
      const p = finalPlayers.find(x => x.id === id)!;
      const award = deltas[id];
      const desc = (p.score as FlushedUpEval | undefined)?.description ?? '';
      if (winnerSet.size > 1) {
        messages.push(`${p.name} splits $${award} (${desc})`);
      } else {
        messages.push(`${p.name} wins $${award} with ${desc}!`);
      }
    }

    if (rolledOver > 0) {
      messages.push(`No qualifying hands — $${rolledOver} rolls over!`);
    }

    // Structured summary (Detroit 2026-10-22) — from this settlement's
    // own deltas and the shared comparator; the decisive comparison is
    // spelled out when the top two hands share a category.
    const nameOf = (id: string) => finalPlayers.find(p => p.id === id)?.name ?? id;
    const evalOf = (p: Player) => (p.score as FlushedUpEval | undefined) ?? evaluateFlushedUpHand(p.cards);
    const entries = finalPlayers
      .filter(p => p.status !== 'folded')
      .map(p => ({ playerId: p.id, description: evalOf(p).description }));
    const comparisons: string[] = [];
    const winnerIds = [...winnerSet];
    if (winnerIds.length > 1) {
      const desc = evalOf(finalPlayers.find(p => p.id === winnerIds[0])!).description;
      comparisons.push(`Identical best hands (${desc}) — the pot is split.`);
    } else if (winnerIds.length === 1) {
      const w = evalOf(finalPlayers.find(p => p.id === winnerIds[0])!);
      const losers = finalPlayers.filter(p => p.status !== 'folded' && !winnerSet.has(p.id));
      if (losers.length > 0) {
        let bestLoser = losers[0];
        for (const p of losers) if (compareFlushedUpHands(evalOf(p), evalOf(bestLoser)) > 0) bestLoser = p;
        const l = evalOf(bestLoser);
        if (w.suitCount !== l.suitCount) {
          comparisons.push(`${w.description} beats ${l.description} — decided by suit count: ${w.suitCount} cards to ${l.suitCount}. More cards in the suit wins.`);
        } else {
          let i = 0;
          while (i < Math.min(w.rankValues.length, l.rankValues.length) && w.rankValues[i] === l.rankValues[i]) i++;
          comparisons.push(`${w.description} beats ${l.description} — same ${w.suitCount}-card suit, decided at card ${i + 1}: ${rankLabel(w.rankValues[i])} over ${rankLabel(l.rankValues[i])}.`);
        }
      }
    }
    if (rolledOver > 0) {
      comparisons.push(`No eligible hand for $${rolledOver} of the pot — it rolls over to the next hand.`);
    }
    const summary = {
      modeId: 'flushed_up',
      headline:
        winnerIds.length === 1
          ? `${nameOf(winnerIds[0])} wins $${deltas[winnerIds[0]]} with ${evalOf(finalPlayers.find(p => p.id === winnerIds[0])!).description}`
          : `Split pot — ${winnerIds.map(nameOf).join(' & ')}`,
      awards: winnerIds.map(id => ({
        playerId: id,
        amount: deltas[id],
        part: winnerIds.length > 1 ? 'SPLIT' : 'POT',
        reason: evalOf(finalPlayers.find(p => p.id === id)!).description,
      })),
      entries,
      comparisons,
      rollover: rolledOver,
    };
    return { players: finalPlayers, pot: rolledOver, messages, summary };
  },
};
