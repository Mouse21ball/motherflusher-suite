import { GameMode, GameState, Player, CardType, Declaration } from '../gameTypes';
import { decideBet, applyBetDecision } from '../engine/botUtils';
import { computeSidePots, totalSidePotAmount, type SidePot } from '../engine/sidePots';

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
    return { description: 'Dead (has 7)', isValidBadugi: false, badugiRankValues: sortedDesc, isDead: true, isValidHigh: false, isValidLow: false, isFlush: false, isBadugi: false, handType: 'DEAD' };
  }
  const ranks = new Set(cards.map(c => c.rank));
  if (ranks.size !== 4) {
    return { description: 'Duplicate Rank', isValidBadugi: false, badugiRankValues: sortedDesc, isDead: false, isValidHigh: false, isValidLow: false, isFlush: false, isBadugi: false, handType: 'INVALID' };
  }
  const suits = new Set(cards.map(c => c.suit));
  const isFlush = suits.size === 1;
  const isBadugi = suits.size === 4;
  const isHighQualifying = values.every(v => v >= 8);
  const isLowQualifying = values.every(v => v <= 6);
  let description = '', handType = 'NONE';
  if (isHighQualifying && isLowQualifying) { description = 'No Qualifier'; handType = 'NONE'; }
  else if (isHighQualifying) {
    if (isFlush) { handType = 'HIGH_FLUSH'; description = 'High Flush'; }
    else if (isBadugi) { handType = 'HIGH_BADUGI'; description = 'High Badugi'; }
    else { handType = 'HIGH_BALL'; description = `High Ball ${sortedDesc.map(v => rankName(v)).join('-')}`; }
  } else if (isLowQualifying) {
    if (isFlush) { handType = 'LOW_FLUSH'; description = 'Low Flush'; }
    else if (isBadugi) { handType = 'LOW_BADUGI'; description = 'Low Badugi'; }
    else { handType = 'LOW_BALL'; description = `Low Ball ${sortedDesc.map(v => rankName(v)).join('-')}`; }
  } else { description = 'No Qualifier'; handType = 'NONE'; }
  const isQualifying = isHighQualifying || isLowQualifying;
  return { description, isValidBadugi: isQualifying, badugiRankValues: sortedDesc, isDead: false, isValidHigh: isHighQualifying, isValidLow: isLowQualifying, isFlush, isBadugi, handType };
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
  phases: ['WAITING','ANTE','DEAL','DRAW_1','BET_1','DRAW_2','BET_2','DRAW_3','DECLARE','BET_3','SHOWDOWN'],

  deal: (deck: CardType[], players: Player[], myId: string) => {
    const freshDeck = [...deck];
    const newPlayers = players.map(p => {
      if (p.status !== 'active') return { ...p, cards: [] };
      const cards = freshDeck.splice(0, 4).map(c => ({ ...c, isHidden: p.id !== myId }));
      if (p.id === myId) cards.sort((a, b) => rankValue(b.rank) - rankValue(a.rank));
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

    if (state.phase === 'ANTE') {
      newPlayers[bIdx] = { ...bot, chips: Math.max(0, bot.chips - 1), hasActed: true };
      newPot += 1;
      message = `${bot.name} paid $1 Ante`;
    } else if (state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3') {
      let maxDraws = 1;
      if (state.phase === 'DRAW_1') maxDraws = 3;
      if (state.phase === 'DRAW_2') maxDraws = 2;
      const botCards = [...bot.cards];
      const indicesToDiscard: number[] = [];
      for (let i = 0; i < botCards.length && indicesToDiscard.length < maxDraws; i++) {
        if (rankValue(botCards[i].rank) === 7) indicesToDiscard.push(i);
      }
      if (indicesToDiscard.length < maxDraws) {
        const ranksSeen = new Set<string>();
        botCards.forEach((c, i) => {
          if (!indicesToDiscard.includes(i)) {
            if (ranksSeen.has(c.rank)) { if (indicesToDiscard.length < maxDraws) indicesToDiscard.push(i); }
            else ranksSeen.add(c.rank);
          }
        });
      }
      if (indicesToDiscard.length < maxDraws) {
        const remaining = botCards.map((c, i) => ({ i, v: rankValue(c.rank), s: c.suit })).filter(x => !indicesToDiscard.includes(x.i));
        const highCount = remaining.filter(x => x.v >= 8).length;
        const lowCount = remaining.filter(x => x.v <= 6).length;
        const isHighTarget = highCount >= lowCount;
        remaining.forEach(x => {
          if (indicesToDiscard.length < maxDraws) {
            if (isHighTarget && x.v <= 6) indicesToDiscard.push(x.i);
            else if (!isHighTarget && x.v >= 8) indicesToDiscard.push(x.i);
          }
        });
      }
      if (indicesToDiscard.length > 0) {
        const newDiscard = [...(state.discardPile || [])];
        const newCards = [...botCards];
        for (const idx of indicesToDiscard) {
          newDiscard.push(newCards[idx]);
          if (newDeck.length === 0 && newDiscard.length > 0) {
            const reshuffled = [...newDiscard];
            newDiscard.length = 0;
            for (let ri = reshuffled.length - 1; ri > 0; ri--) { const rj = Math.floor(Math.random() * (ri + 1)); [reshuffled[ri], reshuffled[rj]] = [reshuffled[rj], reshuffled[ri]]; }
            newDeck.push(...reshuffled);
          }
          newCards[idx] = { ...newDeck.shift()!, isHidden: true };
        }
        newPlayers[bIdx] = { ...bot, cards: newCards, hasActed: true };
        discardPile = newDiscard;
        message = `${bot.name} discarded ${indicesToDiscard.length} card${indicesToDiscard.length > 1 ? 's' : ''}`;
      } else {
        newPlayers[bIdx] = { ...bot, hasActed: true };
        message = `${bot.name} stood pat`;
      }
    } else if (state.phase === 'DECLARE') {
      const eval7 = evaluateDead7(bot.cards.map(c => ({ ...c, isHidden: false })));
      let dec: Declaration = 'FOLD';
      if (eval7 && !eval7.isDead) {
        if (eval7.isValidHigh) dec = 'HIGH';
        else if (eval7.isValidLow) dec = 'LOW';
        else dec = 'FOLD';
      }
      if (dec === 'FOLD') { newPlayers[bIdx] = { ...bot, status: 'folded', declaration: null, hasActed: true }; message = `${bot.name} declared FOLD`; }
      else { newPlayers[bIdx] = { ...bot, declaration: dec, hasActed: true }; message = `${bot.name} declared ${dec}`; }
    } else {
      const eval7 = evaluateDead7(bot.cards.map(c => ({ ...c, isHidden: false })));
      let strength = 0.08;
      if (eval7) {
        if (eval7.isDead) strength = 0.02;
        else if (eval7.handType === 'INVALID') strength = (state.phase === 'BET_1' || state.phase === 'BET_2') ? 0.12 : 0.05;
        else if (eval7.handType === 'NONE') {
          const vals = eval7.badugiRankValues;
          const highCount = vals.filter(v => v >= 8).length;
          const lowCount = vals.filter(v => v <= 6).length;
          const bestSideCount = Math.max(highCount, lowCount);
          const hasDrawsLeft = state.phase === 'BET_1' || state.phase === 'BET_2';
          if (bestSideCount >= 3 && hasDrawsLeft) strength = 0.40;
          else if (bestSideCount >= 3) strength = 0.28;
          else if (hasDrawsLeft) strength = 0.20;
          else strength = 0.12;
        } else if (eval7.isFlush) strength = 0.95;
        else if (eval7.isBadugi) strength = 0.85;
        else if (eval7.isValidHigh || eval7.isValidLow) {
          const best = Math.max(...eval7.badugiRankValues);
          const worst = Math.min(...eval7.badugiRankValues);
          if (eval7.isValidHigh) strength = 0.35 + (best - 8) * 0.06;
          else strength = 0.35 + (6 - worst) * 0.08;
        }
      }
      const heroPlayer = state.players.find(p => p.presence === 'human');
      const heroEval   = heroPlayer?.cards.length === 4 ? evaluateDead7(heroPlayer.cards) : null;
      const heroWeak   = heroEval ? !heroEval.isValidBadugi : false;
      const largePot   = state.pot >= 20;
      const raisesSoFar = state.raisesThisRound ?? 0;
      const activeOpponents = state.players.filter(p => p.id !== botId && p.status === 'active').length;
      const raiseCap = activeOpponents <= 1 ? 4 : 3;
      const decision = decideBet(strength, state.pot, state.currentBet, bot.bet, bot.chips, { heroWeak, largePot, raisesThisRound: raisesSoFar, raiseCap });
      const result = applyBetDecision(decision, bot, state.currentBet, state.pot, raisesSoFar);
      newPlayers[bIdx] = { ...bot, chips: result.chips, bet: result.bet, status: result.status as any, hasActed: true };
      newPot = result.pot; newCurrentBet = result.currentBet; newRaisesThisRound = result.raisesThisRound; message = result.message;
    }

    const isDrawRound = ['DRAW_1','DRAW_2','DRAW_3'].includes(state.phase);
    const isDeclareOrDraw = state.phase === 'DECLARE' || isDrawRound;
    const activePlayers = isDeclareOrDraw ? newPlayers.filter(p => p.status === 'active') : newPlayers.filter(p => p.status === 'active' && p.chips > 0);
    const allActed = activePlayers.every(p => p.hasActed);
    const allBetsMatch = activePlayers.every(p => p.bet === newCurrentBet || p.chips === 0);
    const roundOver = isDeclareOrDraw ? allActed : (allActed && allBetsMatch);
    let nextPlayerId = undefined;
    if (!roundOver) {
      let nextIdx = (bIdx + 1) % newPlayers.length;
      let count = 0;
      while (count < newPlayers.length) {
        const p = newPlayers[nextIdx];
        if (p.status === 'active' && (isDeclareOrDraw || p.chips > 0) && (!p.hasActed || (!isDeclareOrDraw && p.bet < newCurrentBet))) break;
        nextIdx = (nextIdx + 1) % newPlayers.length; count++;
      }
      nextPlayerId = newPlayers[nextIdx].id;
    }
    return { stateUpdates: { players: newPlayers, deck: newDeck, pot: newPot, currentBet: newCurrentBet, raisesThisRound: newRaisesThisRound, discardPile }, message, roundOver, nextPlayerId };
  },

  getAutoTransition: () => null,
  evaluateHand: (player: Player) => evaluateDead7(player.cards),

  resolveShowdown: (players: Player[], pot: number, myId: string) => {
    let finalPlayers = players.map(p => {
      if (p.id === myId || p.status === 'folded') return { ...p };
      const newCards = p.cards.map((c): CardType => ({ ...c, isHidden: false }));
      return { ...p, cards: newCards, score: evaluateDead7(newCards) };
    });
    const myIndex = finalPlayers.findIndex(p => p.id === myId);
    if (myIndex !== -1 && finalPlayers[myIndex].status !== 'folded') {
      finalPlayers[myIndex] = { ...finalPlayers[myIndex], score: evaluateDead7(finalPlayers[myIndex].cards) };
    }
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
      const idx = finalPlayers.findIndex(p => p.id === sole.id);
      finalPlayers[idx] = { ...finalPlayers[idx], chips: finalPlayers[idx].chips + award, isWinner: true };
      messages.push(`${finalPlayers[idx].name} wins $${award} (last player standing)`);
      return { players: finalPlayers, pot: totalAwardable - award, messages };
    }

    type QualifiedPlayer = Player & { eval7: Dead7Eval };
    const qualifyOf = (p: Player): QualifiedPlayer | null => {
      const e = p.score as Dead7Eval | undefined;
      if (!e || e.isDead || e.handType === 'INVALID' || e.handType === 'NONE') return null;
      if (p.declaration === 'HIGH' && e.isValidHigh) return { ...p, eval7: e };
      if (p.declaration === 'LOW' && e.isValidLow) return { ...p, eval7: e };
      return null;
    };

    const deltas: Record<string, number> = {};
    const flagWinner = new Set<string>();
    const flushIds = new Set<string>();
    const badugiIds = new Set<string>();
    const highIds = new Set<string>();
    const lowIds = new Set<string>();
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
        flagWinner.add(id);
      }
    };

    for (const sp of sidePots) {
      const eligible = activePlayers.filter(p => sp.eligibleIds.includes(p.id));
      const qualified = eligible.map(qualifyOf).filter((q): q is QualifiedPlayer => q !== null);
      if (qualified.length === 0) { rolledOver += sp.amount; continue; }

      const flushes = qualified.filter(q => q.eval7.handType === 'HIGH_FLUSH' || q.eval7.handType === 'LOW_FLUSH');
      if (flushes.length > 0) {
        const ids = flushes.map(q => q.id);
        distribute(ids, sp.amount);
        ids.forEach(i => flushIds.add(i));
        anyWinner = true;
        continue;
      }
      const badugis = qualified.filter(q => q.eval7.handType === 'HIGH_BADUGI' || q.eval7.handType === 'LOW_BADUGI');
      if (badugis.length > 0) {
        const ids = badugis.map(q => q.id);
        distribute(ids, sp.amount);
        ids.forEach(i => badugiIds.add(i));
        anyWinner = true;
        continue;
      }
      const hQ = qualified.filter(q => q.declaration === 'HIGH');
      const lQ = qualified.filter(q => q.declaration === 'LOW');
      let hWinIds: string[] = [];
      let lWinIds: string[] = [];
      if (hQ.length > 0) {
        hQ.sort((a, b) => compareHighHands(a.eval7.badugiRankValues, b.eval7.badugiRankValues));
        const top = hQ[0].eval7.badugiRankValues;
        hWinIds = hQ.filter(q => compareHighHands(q.eval7.badugiRankValues, top) === 0).map(q => q.id);
      }
      if (lQ.length > 0) {
        lQ.sort((a, b) => compareLowHands(a.eval7.badugiRankValues, b.eval7.badugiRankValues));
        const top = lQ[0].eval7.badugiRankValues;
        lWinIds = lQ.filter(q => compareLowHands(q.eval7.badugiRankValues, top) === 0).map(q => q.id);
      }
      if (hWinIds.length === 0 && lWinIds.length === 0) { rolledOver += sp.amount; continue; }
      let highShare = Math.floor(sp.amount / 2);
      let lowShare = Math.floor(sp.amount / 2);
      if (sp.amount % 2 !== 0) highShare += 1;
      if (hWinIds.length === 0) { lowShare += highShare; highShare = 0; }
      else if (lWinIds.length === 0) { highShare += lowShare; lowShare = 0; }
      distribute(hWinIds, highShare);
      distribute(lWinIds, lowShare);
      hWinIds.forEach(i => highIds.add(i));
      lWinIds.forEach(i => lowIds.add(i));
      anyWinner = true;
    }

    if (!anyWinner) {
      messages.push(`No qualifying hands. $${rolledOver} rolls over!`);
      finalPlayers = finalPlayers.map(p => p.status !== 'folded' ? { ...p, isLoser: true } : p);
      return { players: finalPlayers, pot: rolledOver, messages };
    }

    if (flushIds.size > 1) messages.push(`Split Pot — ${flushIds.size} flushes split`);
    else if (badugiIds.size > 1) messages.push(`Split Pot — ${badugiIds.size} badugis split`);
    else if (highIds.size > 0 && lowIds.size > 0) messages.push(`Split Pot — HIGH/LOW split $${totalAwardable - rolledOver}`);

    for (const id of Object.keys(deltas)) {
      const idx = finalPlayers.findIndex(p => p.id === id);
      if (idx === -1) continue;
      const award = deltas[id];
      finalPlayers[idx] = { ...finalPlayers[idx], chips: finalPlayers[idx].chips + award, isWinner: true };
      const desc = (finalPlayers[idx].score as Dead7Eval | undefined)?.description || '';
      if (flushIds.has(id)) messages.push(`${finalPlayers[idx].name} scoops $${award} with ${desc}!`);
      else if (badugiIds.has(id)) messages.push(`${finalPlayers[idx].name} scoops $${award} with ${desc}!`);
      else if (highIds.has(id)) messages.push(`${finalPlayers[idx].name} wins HIGH — $${award} (${desc})`);
      else if (lowIds.has(id)) messages.push(`${finalPlayers[idx].name} wins LOW — $${award} (${desc})`);
    }
    finalPlayers = finalPlayers.map(p => p.status !== 'folded' && !p.isWinner ? { ...p, isLoser: true } : p);
    return { players: finalPlayers, pot: rolledOver, messages };
  }
};
