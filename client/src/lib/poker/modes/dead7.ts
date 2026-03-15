import { GameMode } from '../engine/types';
import { GameState, Player, CardType, GamePhase, Declaration } from '../types';
import { decideBet, applyBetDecision } from '../engine/botUtils';

const rankValue = (rank: string): number => {
  if (rank === 'A') return 1;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  return parseInt(rank, 10);
};

const rankName = (v: number): string => {
  if (v === 1) return 'A';
  if (v === 11) return 'J';
  if (v === 12) return 'Q';
  if (v === 13) return 'K';
  return v.toString();
};

export interface Dead7Eval {
  description: string;
  isValidBadugi: boolean;
  badugiRankValues: number[];
  isDead: boolean;
  isValidHigh: boolean;
  isValidLow: boolean;
  isFlush: boolean;
  isBadugi: boolean;
  handType: string;
}

export const evaluateDead7 = (cards: CardType[]): Dead7Eval | undefined => {
  if (cards.length !== 4) return undefined;

  const values = cards.map(c => rankValue(c.rank));
  const sortedDesc = [...values].sort((a, b) => b - a);

  if (values.some(v => v === 7)) {
    return {
      description: "Dead (has 7)",
      isValidBadugi: false,
      badugiRankValues: sortedDesc,
      isDead: true,
      isValidHigh: false,
      isValidLow: false,
      isFlush: false,
      isBadugi: false,
      handType: 'DEAD'
    };
  }

  const ranks = new Set(cards.map(c => c.rank));
  if (ranks.size !== 4) {
    return {
      description: "Duplicate Rank",
      isValidBadugi: false,
      badugiRankValues: sortedDesc,
      isDead: false,
      isValidHigh: false,
      isValidLow: false,
      isFlush: false,
      isBadugi: false,
      handType: 'INVALID'
    };
  }

  const suits = new Set(cards.map(c => c.suit));
  const isFlush = suits.size === 1;
  const isBadugi = suits.size === 4;
  const isHighQualifying = values.every(v => v >= 8);
  const isLowQualifying = values.every(v => v <= 6);

  let description = '';
  let handType = 'NONE';

  if (isHighQualifying && isLowQualifying) {
    description = 'No Qualifier';
    handType = 'NONE';
  } else if (isHighQualifying) {
    if (isFlush) { handType = 'HIGH_FLUSH'; description = 'High Flush'; }
    else if (isBadugi) { handType = 'HIGH_BADUGI'; description = 'High Badugi'; }
    else { handType = 'HIGH_BALL'; description = `High Ball ${sortedDesc.map(v => rankName(v)).join('-')}`; }
  } else if (isLowQualifying) {
    if (isFlush) { handType = 'LOW_FLUSH'; description = 'Low Flush'; }
    else if (isBadugi) { handType = 'LOW_BADUGI'; description = 'Low Badugi'; }
    else { handType = 'LOW_BALL'; description = `Low Ball ${sortedDesc.map(v => rankName(v)).join('-')}`; }
  } else {
    description = 'No Qualifier';
    handType = 'NONE';
  }

  const isQualifying = isHighQualifying || isLowQualifying;

  return {
    description,
    isValidBadugi: isQualifying,
    badugiRankValues: sortedDesc,
    isDead: false,
    isValidHigh: isHighQualifying,
    isValidLow: isLowQualifying,
    isFlush,
    isBadugi,
    handType
  };
};

const compareHighHands = (a: number[], b: number[]): number => {
  const aDesc = [...a].sort((x, y) => y - x);
  const bDesc = [...b].sort((x, y) => y - x);
  for (let i = 0; i < 4; i++) {
    if (aDesc[i] !== bDesc[i]) return bDesc[i] - aDesc[i];
  }
  return 0;
};

const compareLowHands = (a: number[], b: number[]): number => {
  const aAsc = [...a].sort((x, y) => x - y);
  const bAsc = [...b].sort((x, y) => x - y);
  for (let i = 3; i >= 0; i--) {
    if (aAsc[i] !== bAsc[i]) return aAsc[i] - bAsc[i];
  }
  return 0;
};

export const Dead7Mode: GameMode = {
  id: 'dead7',
  name: 'Dead 7',
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
    'SHOWDOWN'
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

    const bIdx = newPlayers.findIndex(p => p.id === botId);
    const bot = newPlayers[bIdx];

    if (state.phase === 'ANTE') {
      newPlayers[bIdx] = { ...bot, chips: bot.chips - 1, hasActed: true };
      newPot += 1;
      message = `${bot.name} paid $1 Ante`;
    }
    else if (state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3') {
      let maxDraws = 1;
      if (state.phase === 'DRAW_1') maxDraws = 3;
      if (state.phase === 'DRAW_2') maxDraws = 2;

      const botCards = [...bot.cards];
      const indicesToDiscard: number[] = [];

      // 1. Always discard 7s
      for (let i = 0; i < botCards.length && indicesToDiscard.length < maxDraws; i++) {
        if (rankValue(botCards[i].rank) === 7) {
          indicesToDiscard.push(i);
        }
      }

      // 2. Discard duplicate ranks (Dead 7 requires 4 unique ranks)
      if (indicesToDiscard.length < maxDraws) {
        const ranksSeen = new Set<string>();
        botCards.forEach((c, i) => {
          if (!indicesToDiscard.includes(i)) {
            if (ranksSeen.has(c.rank)) {
              if (indicesToDiscard.length < maxDraws) indicesToDiscard.push(i);
            } else {
              ranksSeen.add(c.rank);
            }
          }
        });
      }

      // 3. Determine if we should chase High or Low
      if (indicesToDiscard.length < maxDraws) {
        const remaining = botCards
          .map((c, i) => ({ i, v: rankValue(c.rank), s: c.suit }))
          .filter(x => !indicesToDiscard.includes(x.i));

        const highCount = remaining.filter(x => x.v >= 8).length;
        const lowCount = remaining.filter(x => x.v <= 6).length;
        
        // Target high or low based on what we have more of
        const isHighTarget = highCount >= lowCount;

        // Discard cards that don't fit the target
        remaining.forEach(x => {
          if (indicesToDiscard.length < maxDraws) {
            if (isHighTarget && x.v <= 6) {
              indicesToDiscard.push(x.i);
            } else if (!isHighTarget && x.v >= 8) {
              indicesToDiscard.push(x.i);
            }
          }
        });
      }

      // 4. Flush coherence: if we have multiple cards of the same suit, try to keep them if they fit the target
      // Or if we have a mix of suits but want to move towards Flush or Badugi.
      // For now, let's just ensure we discard cards that are "wrong" for our high/low target first.

      if (indicesToDiscard.length > 0 && newDeck.length >= indicesToDiscard.length) {
        const newCards = [...botCards];
        for (const idx of indicesToDiscard) {
          newCards[idx] = { ...newDeck.shift()!, isHidden: true };
        }
        newPlayers[bIdx] = { ...bot, cards: newCards, hasActed: true };
        message = `${bot.name} discarded ${indicesToDiscard.length} card${indicesToDiscard.length > 1 ? 's' : ''}`;
      } else {
        newPlayers[bIdx] = { ...bot, hasActed: true };
        message = `${bot.name} stood pat`;
      }
    }
    else if (state.phase === 'DECLARE') {
      const eval7 = evaluateDead7(bot.cards.map(c => ({ ...c, isHidden: false })));
      let dec: Declaration = 'FOLD';

      if (eval7 && !eval7.isDead) {
        if (eval7.isValidHigh) dec = 'HIGH';
        else if (eval7.isValidLow) dec = 'LOW';
        // If not qualifying, fold (smarter than random high/low)
        else dec = 'FOLD';
      }

      if (dec === 'FOLD') {
        newPlayers[bIdx] = { ...bot, status: 'folded', declaration: null, hasActed: true };
        message = `${bot.name} declared FOLD`;
      } else {
        newPlayers[bIdx] = { ...bot, declaration: dec, hasActed: true };
        message = `${bot.name} declared ${dec}`;
      }
    }
    else {
      const eval7 = evaluateDead7(bot.cards.map(c => ({ ...c, isHidden: false })));

      let strength = 0.08;
      if (eval7) {
        if (eval7.isDead) {
          strength = 0.02;
        } else if (eval7.handType === 'INVALID') {
          const hasDrawsLeft = state.phase === 'BET_1' || state.phase === 'BET_2';
          strength = hasDrawsLeft ? 0.12 : 0.05;
        } else if (eval7.handType === 'NONE') {
          const vals = eval7.badugiRankValues;
          const highCount = vals.filter(v => v >= 8).length;
          const lowCount = vals.filter(v => v <= 6).length;
          const bestSideCount = Math.max(highCount, lowCount);
          const hasDrawsLeft = state.phase === 'BET_1' || state.phase === 'BET_2';
          if (bestSideCount >= 3 && hasDrawsLeft) {
            strength = 0.24;
          } else if (bestSideCount >= 3) {
            strength = 0.15;
          } else if (hasDrawsLeft) {
            strength = 0.10;
          } else {
            strength = 0.08;
          }
        } else if (eval7.isFlush) {
          strength = 0.95;
        } else if (eval7.isBadugi) {
          strength = 0.85;
        } else if (eval7.isValidHigh || eval7.isValidLow) {
          const best = Math.max(...eval7.badugiRankValues);
          const worst = Math.min(...eval7.badugiRankValues);
          if (eval7.isValidHigh) {
            strength = 0.35 + (best - 8) * 0.06;
          } else {
            strength = 0.35 + (6 - worst) * 0.08;
          }
        }
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

    let nextPlayerId = undefined;
    if (!roundOver) {
      let nextIdx = (bIdx + 1) % newPlayers.length;
      let count = 0;
      while (count < newPlayers.length) {
        const p = newPlayers[nextIdx];
        if (p.status === 'active' && (isDeclareOrDraw || p.chips > 0) && (!p.hasActed || (!isDeclareOrDraw && p.bet < newCurrentBet))) {
          break;
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

  evaluateHand: (player: Player, _communityCards: CardType[]) => {
    return evaluateDead7(player.cards);
  },

  resolveShowdown: (players: Player[], pot: number, myId: string) => {
    const finalPlayers = players.map(p => {
      if (p.id === myId || p.status === 'folded') return p;
      const newCards = p.cards.map((c): CardType => ({ ...c, isHidden: false }));
      return { ...p, cards: newCards, score: evaluateDead7(newCards) };
    });

    const myIndex = finalPlayers.findIndex(p => p.id === myId);
    if (myIndex !== -1 && finalPlayers[myIndex].status !== 'folded') {
      finalPlayers[myIndex] = {
        ...finalPlayers[myIndex],
        score: evaluateDead7(finalPlayers[myIndex].cards)
      };
    }

    const activePlayers = finalPlayers.filter(p => p.status !== 'folded');
    let messages: string[] = [];

    if (activePlayers.length === 1) {
      const sole = finalPlayers.find(p => p.id === activePlayers[0].id)!;
      sole.chips += pot;
      sole.isWinner = true;
      messages.push(`${sole.name} wins $${pot} (last player standing)`);
      return { players: finalPlayers, pot: 0, messages };
    }

    type QualifiedPlayer = Player & { eval7: Dead7Eval };
    const qualified: QualifiedPlayer[] = activePlayers
      .filter(p => {
        const e = p.score as Dead7Eval | undefined;
        if (!e || e.isDead || e.handType === 'INVALID' || e.handType === 'NONE') return false;
        if (p.declaration === 'HIGH' && e.isValidHigh) return true;
        if (p.declaration === 'LOW' && e.isValidLow) return true;
        return false;
      })
      .map(p => ({ ...p, eval7: p.score as Dead7Eval }));

    if (qualified.length === 0) {
      messages.push(`No qualifying hands. $${pot} rolls over!`);
      finalPlayers.forEach(p => { if (p.status !== 'folded') p.isLoser = true; });
      return { players: finalPlayers, pot, messages };
    }

    const highFlushes = qualified.filter(q => q.declaration === 'HIGH' && q.eval7.handType === 'HIGH_FLUSH');
    const lowFlushes = qualified.filter(q => q.declaration === 'LOW' && q.eval7.handType === 'LOW_FLUSH');
    const allFlushes = [...highFlushes, ...lowFlushes];

    if (allFlushes.length === 1) {
      const winner = finalPlayers.find(p => p.id === allFlushes[0].id)!;
      winner.chips += pot;
      winner.isWinner = true;
      messages.push(`${winner.name} scoops $${pot} with ${allFlushes[0].eval7.description}!`);
      finalPlayers.forEach(p => { if (p.status !== 'folded' && !p.isWinner) p.isLoser = true; });
      return { players: finalPlayers, pot: 0, messages };
    }

    if (allFlushes.length > 1) {
      const flushShare = Math.floor(pot / allFlushes.length);
      const flushRemainder = pot % allFlushes.length;
      messages.push(`Split Pot — ${allFlushes.length} flushes split $${pot}`);
      allFlushes.forEach((q, idx) => {
        const p = finalPlayers.find(p => p.id === q.id)!;
        const award = flushShare + (idx === 0 ? flushRemainder : 0);
        p.chips += award;
        p.isWinner = true;
        messages.push(`${p.name} receives $${award} (${q.eval7.description})`);
      });
      finalPlayers.forEach(p => { if (p.status !== 'folded' && !p.isWinner) p.isLoser = true; });
      return { players: finalPlayers, pot: 0, messages };
    }

    const highBadugis = qualified.filter(q => q.declaration === 'HIGH' && q.eval7.handType === 'HIGH_BADUGI');
    const lowBadugis = qualified.filter(q => q.declaration === 'LOW' && q.eval7.handType === 'LOW_BADUGI');
    const allBadugis = [...highBadugis, ...lowBadugis];

    if (allBadugis.length === 1) {
      const winner = finalPlayers.find(p => p.id === allBadugis[0].id)!;
      winner.chips += pot;
      winner.isWinner = true;
      messages.push(`${winner.name} scoops $${pot} with ${allBadugis[0].eval7.description}!`);
      finalPlayers.forEach(p => { if (p.status !== 'folded' && !p.isWinner) p.isLoser = true; });
      return { players: finalPlayers, pot: 0, messages };
    }

    if (allBadugis.length > 1) {
      const badugiShare = Math.floor(pot / allBadugis.length);
      const badugiRemainder = pot % allBadugis.length;
      messages.push(`Split Pot — ${allBadugis.length} badugis split $${pot}`);
      allBadugis.forEach((q, idx) => {
        const p = finalPlayers.find(p => p.id === q.id)!;
        const award = badugiShare + (idx === 0 ? badugiRemainder : 0);
        p.chips += award;
        p.isWinner = true;
        messages.push(`${p.name} receives $${award} (${q.eval7.description})`);
      });
      finalPlayers.forEach(p => { if (p.status !== 'folded' && !p.isWinner) p.isLoser = true; });
      return { players: finalPlayers, pot: 0, messages };
    }

    const highQualified = qualified.filter(q => q.declaration === 'HIGH');
    const lowQualified = qualified.filter(q => q.declaration === 'LOW');

    let highWinner: QualifiedPlayer | null = null;
    let lowWinner: QualifiedPlayer | null = null;

    if (highQualified.length > 0) {
      highQualified.sort((a, b) => compareHighHands(a.eval7.badugiRankValues, b.eval7.badugiRankValues));
      highWinner = highQualified[0];
    }

    if (lowQualified.length > 0) {
      lowQualified.sort((a, b) => compareLowHands(a.eval7.badugiRankValues, b.eval7.badugiRankValues));
      lowWinner = lowQualified[0];
    }

    if (!highWinner && !lowWinner) {
      messages.push(`No qualifying hands. $${pot} rolls over!`);
      return { players: finalPlayers, pot, messages };
    }

    const halfPot = Math.floor(pot / 2);
    let highPot = halfPot;
    let lowPot = halfPot;
    if (pot % 2 !== 0) highPot += 1;

    if (!highWinner) { lowPot += highPot; highPot = 0; }
    if (!lowWinner) { highPot += lowPot; lowPot = 0; }

    if (highWinner && lowWinner && highWinner.id !== lowWinner.id) {
      messages.push(`Split Pot — HIGH/LOW split $${pot}`);
    }

    if (highWinner) {
      const p = finalPlayers.find(p => p.id === highWinner!.id)!;
      p.chips += highPot;
      p.isWinner = true;
      messages.push(`${p.name} wins HIGH — $${highPot} (${highWinner.eval7.description})`);
    }

    if (lowWinner) {
      const p = finalPlayers.find(p => p.id === lowWinner!.id)!;
      p.chips += lowPot;
      p.isWinner = true;
      messages.push(`${p.name} wins LOW — $${lowPot} (${lowWinner.eval7.description})`);
    }

    finalPlayers.forEach(p => {
      if (p.status !== 'folded' && !p.isWinner) p.isLoser = true;
    });

    return { players: finalPlayers, pot: 0, messages };
  }
};
