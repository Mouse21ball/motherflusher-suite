// ─── Shared Badugi mode ───────────────────────────────────────────────────────
// Pure game logic — no browser APIs, no Node-only APIs.
// Imported by both the client engine and the server-authoritative engine.
// Client:  import { BadugiMode } from '@shared/modes/badugi'  (via shim)
// Server:  import { BadugiMode } from '../shared/modes/badugi'

import type { GameMode, GameState, Player, CardType, Declaration } from '../gameTypes';
import { decideBet, applyBetDecision } from '../engine/botUtils';

const rankValue = (rank: string): number => {
  if (rank === 'A') return 1;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  return parseInt(rank, 10);
};

export const evaluateBadugi = (cards: CardType[]) => {
  if (cards.length !== 4) return undefined;

  const ranks = new Set(cards.map(c => c.rank));
  const suits = new Set(cards.map(c => c.suit));

  const isValidBadugi = ranks.size === 4 && suits.size === 4;

  let description = 'Invalid Badugi';
  if (!isValidBadugi) {
    const dupRank = ranks.size < 4;
    const dupSuit = suits.size < 4;
    if (dupRank && dupSuit) description = 'Duplicate Rank & Suit';
    else if (dupRank) description = 'Duplicate Rank';
    else if (dupSuit) description = 'Duplicate Suit';
  } else {
    const sortedRanks = cards.map(c => rankValue(c.rank)).sort((a, b) => b - a);
    const highestCard = sortedRanks[0];
    const rankNames: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
    const highestName = rankNames[highestCard] || highestCard.toString();
    description = `${highestName}-High Badugi`;
  }

  return {
    description,
    isValidBadugi,
    badugiRankValues: cards.map(c => rankValue(c.rank)).sort((a, b) => b - a),
  };
};

export const BadugiMode: GameMode = {
  id: 'badugi',
  name: 'Badugi',
  phases: [
    'WAITING',
    'ANTE',
    'DEAL',
    'DRAW_1',
    'BET_1',
    'DRAW_2',
    'BET_2',
    'DRAW_3',
    'DECLARE',
    'BET_3',
    'SHOWDOWN',
  ],

  deal: (deck: CardType[], players: Player[], myId: string) => {
    const freshDeck = [...deck];
    const newPlayers = players.map(p => {
      if (p.status !== 'active') return { ...p, cards: [] };
      const cards = freshDeck.splice(0, 4).map(c => ({ ...c, isHidden: p.id !== myId }));
      if (p.id === myId) {
        cards.sort((a, b) => rankValue(b.rank) - rankValue(a.rank));
      }
      return { ...p, cards };
    });
    return { players: newPlayers, communityCards: [], deck: freshDeck };
  },

  botAction: (state: GameState, botId: string) => {
    let newPlayers = [...state.players];
    let newDeck = [...state.deck];
    let newPot = state.pot;
    let newCurrentBet = state.currentBet;
    let message = '';
    let discardPile = state.discardPile || [];

    const bIdx = newPlayers.findIndex(p => p.id === botId);
    const bot = newPlayers[bIdx];

    if (state.phase === 'ANTE') {
      newPlayers[bIdx] = { ...bot, chips: bot.chips - 1, hasActed: true };
      newPot += 1;
      message = `${bot.name} paid $1 Ante`;
    } else if (state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3') {
      const cards = bot.cards;
      const evaluation = evaluateBadugi(cards);

      if (evaluation?.isValidBadugi) {
        newPlayers[bIdx] = { ...bot, hasActed: true };
        message = `${bot.name} stood pat`;
      } else {
        let maxDraws = 3;
        if (state.phase === 'DRAW_2') maxDraws = 2;
        if (state.phase === 'DRAW_3') maxDraws = 1;

        const toKeep: number[] = [];
        const usedRanks = new Set<string>();
        const usedSuits = new Set<string>();

        const sortedIndices = cards
          .map((_, i) => i)
          .sort((a, b) => rankValue(cards[a].rank) - rankValue(cards[b].rank));

        for (const i of sortedIndices) {
          const card = cards[i];
          if (!usedRanks.has(card.rank) && !usedSuits.has(card.suit)) {
            toKeep.push(i);
            usedRanks.add(card.rank);
            usedSuits.add(card.suit);
          }
        }

        let toDiscard = cards.map((_, i) => i).filter(i => !toKeep.includes(i));
        toDiscard = toDiscard.slice(0, maxDraws);

        if (toDiscard.length > 0) {
          const newDiscard = [...(state.discardPile || [])];
          const newCards = [...bot.cards];
          toDiscard.forEach(idx => {
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
            newCards[idx] = { ...newDeck.shift()!, isHidden: true };
          });
          newPlayers[bIdx] = { ...bot, cards: newCards, hasActed: true };
          discardPile = newDiscard;
          message = `${bot.name} discarded ${toDiscard.length} card${toDiscard.length > 1 ? 's' : ''}`;
        } else {
          newPlayers[bIdx] = { ...bot, hasActed: true };
          message = `${bot.name} stood pat`;
        }
      }
    } else if (state.phase === 'DECLARE') {
      const evaluation = evaluateBadugi(bot.cards);
      let declaration: Declaration = 'FOLD';

      if (evaluation?.isValidBadugi) {
        const highest = evaluation.badugiRankValues![0];
        declaration = highest <= 8 ? 'LOW' : 'HIGH';
      }

      if (declaration === 'FOLD') {
        newPlayers[bIdx] = { ...bot, status: 'folded', declaration: null, hasActed: true };
        message = `${bot.name} declared FOLD`;
      } else {
        newPlayers[bIdx] = { ...bot, declaration, hasActed: true };
        message = `${bot.name} declared ${declaration}`;
      }
    } else {
      const evaluation = evaluateBadugi(bot.cards);
      let strength = 0.08;
      if (evaluation?.isValidBadugi) {
        const h = evaluation.badugiRankValues![0];
        if (h <= 5) strength = 0.92;
        else if (h <= 7) strength = 0.75;
        else if (h <= 9) strength = 0.55;
        else if (h <= 11) strength = 0.4;
        else strength = 0.3;
      } else {
        const cards = bot.cards;
        const usedR = new Set<string>();
        const usedS = new Set<string>();
        let goodCount = 0;
        const sorted = cards.map((_, i) => i).sort((a, b) => rankValue(cards[a].rank) - rankValue(cards[b].rank));
        for (const i of sorted) {
          if (!usedR.has(cards[i].rank) && !usedS.has(cards[i].suit)) {
            goodCount++;
            usedR.add(cards[i].rank);
            usedS.add(cards[i].suit);
          }
        }
        const hasDrawsLeft = state.phase === 'BET_1' || state.phase === 'BET_2';
        if (goodCount >= 3 && hasDrawsLeft) strength = 0.25;
        else if (goodCount >= 3) strength = 0.18;
        else if (hasDrawsLeft) strength = 0.10;
        else strength = 0.06;
      }

      const decision = decideBet(strength, state.pot, state.currentBet, bot.bet, bot.chips);
      const result = applyBetDecision(decision, bot, state.currentBet, state.pot);
      newPlayers[bIdx] = { ...bot, chips: result.chips, bet: result.bet, status: result.status as any, hasActed: true };
      newPot = result.pot;
      newCurrentBet = result.currentBet;
      message = result.message;
    }

    const isDrawRound = ['DRAW_1', 'DRAW_2', 'DRAW_3'].includes(state.phase);
    const isDeclareOrDraw = state.phase === 'DECLARE' || isDrawRound;
    const activePlayers = isDeclareOrDraw
      ? newPlayers.filter(p => p.status === 'active')
      : newPlayers.filter(p => p.status === 'active' && p.chips > 0);
    const allActed = activePlayers.every(p => p.hasActed);
    const allBetsMatch = activePlayers.every(p => p.bet === newCurrentBet || p.chips === 0);
    const roundOver = isDeclareOrDraw ? allActed : (allActed && allBetsMatch);

    let nextPlayerId: string | undefined = undefined;
    if (!roundOver) {
      let nextIdx = (bIdx + 1) % newPlayers.length;
      let count = 0;
      while (count < newPlayers.length) {
        const p = newPlayers[nextIdx];
        if (
          p.status === 'active' &&
          (isDeclareOrDraw || p.chips > 0) &&
          (!p.hasActed || (!isDeclareOrDraw && p.bet < newCurrentBet))
        ) break;
        nextIdx = (nextIdx + 1) % newPlayers.length;
        count++;
      }
      nextPlayerId = newPlayers[nextIdx].id;
    }

    return {
      stateUpdates: { players: newPlayers, deck: newDeck, pot: newPot, currentBet: newCurrentBet, discardPile },
      message,
      roundOver,
      nextPlayerId,
    };
  },

  getAutoTransition: () => null,

  evaluateHand: (player: Player, _communityCards: CardType[]) => {
    return evaluateBadugi(player.cards);
  },

  resolveShowdown: (players: Player[], pot: number, myId: string) => {
    let finalPlayers = players.map(p => {
      if (p.id === myId || p.status === 'folded') return { ...p };
      const newCards = p.cards.map((c): CardType => ({ ...c, isHidden: false }));
      return { ...p, cards: newCards, score: evaluateBadugi(newCards) };
    });

    const myIndex = finalPlayers.findIndex(p => p.id === myId);
    if (myIndex !== -1 && finalPlayers[myIndex].status !== 'folded') {
      finalPlayers[myIndex] = { ...finalPlayers[myIndex], score: evaluateBadugi(finalPlayers[myIndex].cards) };
    }

    const activePlayers = finalPlayers.filter(p => p.status !== 'folded');
    const messages: string[] = [];

    if (activePlayers.length === 1) {
      const soleIdx = finalPlayers.findIndex(p => p.id === activePlayers[0].id);
      finalPlayers[soleIdx] = { ...finalPlayers[soleIdx], chips: finalPlayers[soleIdx].chips + pot, isWinner: true };
      messages.push(`${finalPlayers[soleIdx].name} wins $${pot} (last player standing)`);
      return { players: finalPlayers, pot: 0, messages };
    }

    const highPlayers = activePlayers.filter(p => p.declaration === 'HIGH' && p.score?.isValidBadugi);
    const lowPlayers  = activePlayers.filter(p => p.declaration === 'LOW'  && p.score?.isValidBadugi);

    let highWinner: Player | null = null;
    let lowWinner:  Player | null = null;

    if (highPlayers.length > 0) {
      highPlayers.sort((a, b) => {
        const aVals = a.score!.badugiRankValues!;
        const bVals = b.score!.badugiRankValues!;
        for (let i = 0; i < 4; i++) {
          if (aVals[i] !== bVals[i]) return bVals[i] - aVals[i];
        }
        return 0;
      });
      highWinner = highPlayers[0];
    }

    if (lowPlayers.length > 0) {
      lowPlayers.sort((a, b) => {
        const aVals = a.score!.badugiRankValues!;
        const bVals = b.score!.badugiRankValues!;
        for (let i = 0; i < 4; i++) {
          if (aVals[i] !== bVals[i]) return aVals[i] - bVals[i];
        }
        return 0;
      });
      lowWinner = lowPlayers[0];
    }

    if (!highWinner && !lowWinner) {
      const activeWithValidBadugi = activePlayers.filter(p => p.score?.isValidBadugi);
      if (activeWithValidBadugi.length === 1) {
        const soleIdx = finalPlayers.findIndex(p => p.id === activeWithValidBadugi[0].id);
        finalPlayers[soleIdx] = { ...finalPlayers[soleIdx], chips: finalPlayers[soleIdx].chips + pot, isWinner: true };
        messages.push(`${finalPlayers[soleIdx].name} wins $${pot} (only valid badugi)`);
        finalPlayers = finalPlayers.map(p => p.status !== 'folded' && !p.isWinner ? { ...p, isLoser: true } : p);
        return { players: finalPlayers, pot: 0, messages };
      }
      messages.push(`No qualifying hands. $${pot} rolls over!`);
      return { players: finalPlayers, pot, messages };
    }

    const halfPot = Math.floor(pot / 2);
    let highPot = halfPot;
    let lowPot  = halfPot;
    if (pot % 2 !== 0) highPot += 1;

    if (!highWinner) { lowPot += highPot; highPot = 0; }
    if (!lowWinner)  { highPot += lowPot; lowPot  = 0; }

    if (highWinner && lowWinner && highWinner.id !== lowWinner.id) {
      messages.push(`Split Pot — HIGH/LOW split $${pot}`);
    }

    if (highWinner) {
      const idx = finalPlayers.findIndex(p => p.id === highWinner!.id);
      if (idx !== -1) {
        finalPlayers[idx] = { ...finalPlayers[idx], chips: finalPlayers[idx].chips + highPot, isWinner: true };
        messages.push(`${finalPlayers[idx].name} wins HIGH — $${highPot} (${finalPlayers[idx].score?.description || 'Badugi'})`);
      }
    }

    if (lowWinner) {
      const idx = finalPlayers.findIndex(p => p.id === lowWinner!.id);
      if (idx !== -1) {
        finalPlayers[idx] = { ...finalPlayers[idx], chips: finalPlayers[idx].chips + lowPot, isWinner: true };
        messages.push(`${finalPlayers[idx].name} wins LOW — $${lowPot} (${finalPlayers[idx].score?.description || 'Badugi'})`);
      }
    }

    finalPlayers = finalPlayers.map(p =>
      p.status !== 'folded' && !p.isWinner ? { ...p, isLoser: true } : p
    );

    return { players: finalPlayers, pot: 0, messages };
  },
};
