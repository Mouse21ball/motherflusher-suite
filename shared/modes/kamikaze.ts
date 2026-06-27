import { GameMode, GameState, Player, CardType, Declaration } from '../gameTypes';
import { decideBet, applyBetDecision } from '../engine/botUtils';

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

function rv(rank: string): number { return RANK_VALUES[rank] ?? 0; }
function lowRv(rank: string): number { return rank === 'A' ? 1 : (RANK_VALUES[rank] ?? 0); }

function rankLabel(v: number): string {
  if (v === 1 || v === 14) return 'A';
  if (v === 13) return 'K';
  if (v === 12) return 'Q';
  if (v === 11) return 'J';
  return String(v);
}

const SUIT_SYM: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};

export interface KamikazeEval {
  isValid: boolean;
  suitCounts: number[];
  highValue: number;
  lowValue: number;
  highRanks: number[];
  lowRanks: number[];
  threeSuit: string;
  description: string;
}

export function evaluateKamikaze(cards: CardType[]): KamikazeEval {
  const empty: KamikazeEval = {
    isValid: false, suitCounts: [], highValue: 0, lowValue: 0,
    highRanks: [], lowRanks: [], threeSuit: '', description: 'No Cards',
  };
  if (!cards || cards.length === 0) return empty;

  const suitIdxs: Record<string, CardType[]> = {};
  for (const c of cards) {
    if (!suitIdxs[c.suit]) suitIdxs[c.suit] = [];
    suitIdxs[c.suit].push(c);
  }

  const suitCounts = Object.values(suitIdxs).map(cs => cs.length).sort((a, b) => b - a);

  const is321 =
    suitCounts.length === 3 &&
    suitCounts[0] === 3 &&
    suitCounts[1] === 2 &&
    suitCounts[2] === 1;

  const ranks = cards.map(c => c.rank);
  const noPairs = new Set(ranks).size === ranks.length;

  const isValid = is321 && noPairs;

  if (!isValid) {
    const reason = !is321 ? `${suitCounts.join('+')} suits` : 'paired ranks';
    return { ...empty, suitCounts, description: `Not Kamikaze (${reason})` };
  }

  const threeSuitEntry = Object.entries(suitIdxs).find(([, cs]) => cs.length === 3)!;
  const threeCards = threeSuitEntry[1];
  const sym = SUIT_SYM[threeSuitEntry[0]] ?? '';

  const highRanks = threeCards.map(c => rv(c.rank)).sort((a, b) => b - a);
  const lowRanks  = threeCards.map(c => lowRv(c.rank)).sort((a, b) => a - b);
  const highValue = highRanks[0];
  const lowValue  = lowRanks[0];

  const desc = `3+2+1 ${sym} HI:${rankLabel(highValue)} LO:${rankLabel(lowValue)}`;
  return { isValid, suitCounts, highValue, lowValue, highRanks, lowRanks, threeSuit: threeSuitEntry[0], description: desc };
}

export function compareKamikazeHigh(a: KamikazeEval, b: KamikazeEval): number {
  for (let i = 0; i < Math.min(a.highRanks.length, b.highRanks.length); i++) {
    if (a.highRanks[i] !== b.highRanks[i]) return a.highRanks[i] - b.highRanks[i];
  }
  return 0;
}

export function compareKamikazeLow(a: KamikazeEval, b: KamikazeEval): number {
  for (let i = 0; i < Math.min(a.lowRanks.length, b.lowRanks.length); i++) {
    if (a.lowRanks[i] !== b.lowRanks[i]) return b.lowRanks[i] - a.lowRanks[i];
  }
  return 0;
}

function discardLimitForPhase(phase: string): number {
  if (phase === 'DRAW_1') return 3;
  if (phase === 'DRAW_2') return 2;
  if (phase === 'DRAW_3') return 1;
  return 0;
}

function drawsRemainingForBet(phase: string): number {
  if (phase === 'BET_1') return 3;
  if (phase === 'BET_2') return 2;
  if (phase === 'BET_3') return 1;
  return 0;
}

function botDiscardKamikaze(cards: CardType[], maxDiscard: number): number[] {
  if (maxDiscard === 0) return [];
  const visible = cards.map(c => ({ ...c, isHidden: false }));
  if (evaluateKamikaze(visible).isValid) return [];

  const candidates = new Set<number>();

  const seenRanks: Record<string, number> = {};
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].rank;
    if (r in seenRanks) {
      candidates.add(i);
    } else {
      seenRanks[r] = i;
    }
  }

  const suitIdxs: Record<string, number[]> = {};
  for (let i = 0; i < cards.length; i++) {
    const s = cards[i].suit;
    if (!suitIdxs[s]) suitIdxs[s] = [];
    suitIdxs[s].push(i);
  }
  const sortedSuits = Object.entries(suitIdxs).sort((a, b) => b[1].length - a[1].length);
  const targets = [3, 2, 1];

  for (let si = 3; si < sortedSuits.length; si++) {
    for (const idx of sortedSuits[si][1]) candidates.add(idx);
  }

  for (let si = 0; si < Math.min(3, sortedSuits.length); si++) {
    const idxs = sortedSuits[si][1];
    const tgt = targets[si];
    if (idxs.length > tgt) {
      const sorted = [...idxs].sort((a, b) => rv(cards[a].rank) - rv(cards[b].rank));
      for (const idx of sorted.slice(0, idxs.length - tgt)) candidates.add(idx);
    }
  }

  return [...candidates].slice(0, maxDiscard);
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

export const KamikazeMode: GameMode = {
  id: 'kamikaze',
  name: 'Kamikaze',
  phases: [
    'WAITING', 'ANTE', 'DEAL',
    'BET_1', 'DRAW_1',
    'BET_2', 'DRAW_2',
    'BET_3', 'DRAW_3',
    'BET_4', 'DECLARE', 'SHOWDOWN',
  ],

  deal: (deck: CardType[], players: Player[], myId: string) => {
    const freshDeck = [...deck];
    const newPlayers = players.map(p => {
      if (p.status !== 'active') return { ...p, cards: [] };
      const cards = freshDeck.splice(0, 6).map(c => ({ ...c, isHidden: p.id !== myId }));
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
      newPlayers[bIdx] = { ...bot, chips: Math.max(0, bot.chips - 25), hasActed: true };
      newPot += 25;
      message = `${bot.name} paid $25 Ante`;

    } else if (state.phase === 'DECLARE') {
      const botCards = bot.cards.map(c => ({ ...c, isHidden: false }));
      const ev = evaluateKamikaze(botCards);
      if (!ev.isValid) {
        newPlayers[bIdx] = { ...bot, status: 'folded', declaration: null, hasActed: true };
        message = `${bot.name} folds (no qualifying hand)`;
      } else {
        const declaration: Declaration = Math.random() < 0.5 ? 'HIGH' : 'LOW';
        newPlayers[bIdx] = { ...bot, declaration, hasActed: true };
        message = `${bot.name} declares ${declaration}`;
      }
      const activePlayers = newPlayers.filter(p => p.status === 'active');
      const roundOver = activePlayers.every(p => p.hasActed);
      return { stateUpdates: { players: newPlayers }, message, roundOver, nextPlayerId: undefined };

    } else if (isDrawPhase) {
      const maxDiscard = discardLimitForPhase(state.phase);
      const botCards = bot.cards.map(c => ({ ...c, isHidden: false }));
      const indices = botDiscardKamikaze(botCards, maxDiscard);
      if (indices.length > 0) {
        const drawn = performBotDraw(botCards, indices, newDeck, discardPile);
        newPlayers[bIdx] = { ...bot, cards: drawn.cards, hasActed: true };
        newDeck = drawn.deck;
        discardPile = drawn.discard;
        message = `${bot.name} discarded ${indices.length}`;
      } else {
        newPlayers[bIdx] = { ...bot, hasActed: true };
        message = `${bot.name} stood pat`;
      }

    } else {
      const botCards = bot.cards.map(c => ({ ...c, isHidden: false }));
      const ev = evaluateKamikaze(botCards);
      const drawsLeft = drawsRemainingForBet(state.phase);

      let strength = 0.08;
      if (ev.isValid) {
        strength = 0.88;
      } else {
        const counts = ev.suitCounts;
        const is321ish = counts[0] === 3;
        const is32ish  = counts[0] === 3 && counts[1] === 2;
        if (is32ish)  strength = drawsLeft > 0 ? 0.65 : 0.40;
        else if (is321ish) strength = drawsLeft > 0 ? 0.40 : 0.22;
        else if (counts[0] === 2) strength = drawsLeft > 0 ? 0.20 : 0.08;
        else strength = 0.06;
      }

      const activeOpponents = state.players.filter(p => p.id !== botId && p.status === 'active').length;
      const raiseCap = activeOpponents <= 1 ? 4 : 3;
      const raisesSoFar = state.raisesThisRound ?? 0;
      const heroPlayer = state.players.find(p => p.presence === 'human');
      const heroEv = heroPlayer?.cards?.length === 6
        ? evaluateKamikaze(heroPlayer.cards.map(c => ({ ...c, isHidden: false })))
        : null;
      const heroWeak = heroEv ? !heroEv.isValid : false;

      const decision = decideBet(strength, state.pot, state.currentBet, bot.bet, bot.chips, {
        heroWeak, largePot: state.pot >= 200, raisesThisRound: raisesSoFar, raiseCap,
      });
      const result = applyBetDecision(decision, bot, state.currentBet, state.pot, raisesSoFar);
      newPlayers[bIdx] = { ...bot, chips: result.chips, bet: result.bet, status: result.status as Player['status'], hasActed: true };
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
        if (p.status === 'active' && (isDrawPhase || p.chips > 0) && (!p.hasActed || (!isDrawPhase && p.bet < newCurrentBet))) break;
        nextIdx = (nextIdx + 1) % newPlayers.length;
        count++;
      }
      nextPlayerId = newPlayers[nextIdx].id;
    }

    return {
      stateUpdates: { players: newPlayers, deck: newDeck, pot: newPot, currentBet: newCurrentBet, raisesThisRound: newRaisesThisRound, discardPile },
      message,
      roundOver,
      nextPlayerId,
    };
  },

  getAutoTransition: () => null,

  evaluateHand: (player: Player) =>
    evaluateKamikaze(player.cards.map(c => ({ ...c, isHidden: false }))),

  resolveShowdown: (players: Player[], pot: number) => {
    let finalPlayers = players.map(p => {
      if (p.status === 'folded') return { ...p };
      return { ...p, cards: p.cards.map((c): CardType => ({ ...c, isHidden: false })) };
    });

    const messages: string[] = [];
    const activePlayers = finalPlayers.filter(p => p.status !== 'folded' && p.declaration && p.declaration !== 'FOLD');

    if (activePlayers.length === 0) {
      messages.push(`No qualifying hands — $${pot} rolls over`);
      return { players: finalPlayers, pot, messages };
    }

    if (activePlayers.length === 1) {
      const sole = activePlayers[0];
      const idx = finalPlayers.findIndex(p => p.id === sole.id);
      finalPlayers[idx] = { ...finalPlayers[idx], chips: finalPlayers[idx].chips + pot, isWinner: true };
      messages.push(`${sole.name} wins $${pot} (last standing)`);
      return { players: finalPlayers, pot: 0, messages };
    }

    const evalMap = new Map<string, KamikazeEval>();
    for (const p of activePlayers) {
      evalMap.set(p.id, evaluateKamikaze(p.cards.map(c => ({ ...c, isHidden: false }))));
    }

    const highPool = activePlayers.filter(p => p.declaration === 'HIGH');
    const lowPool  = activePlayers.filter(p => p.declaration === 'LOW');

    function findHighWinners(pool: Player[]): Player[] {
      const valid = pool.filter(p => evalMap.get(p.id)?.isValid);
      if (!valid.length) return [];
      let best: KamikazeEval | null = null;
      for (const p of valid) {
        const ev = evalMap.get(p.id)!;
        if (!best || compareKamikazeHigh(ev, best) > 0) best = ev;
      }
      return valid.filter(p => compareKamikazeHigh(evalMap.get(p.id)!, best!) === 0);
    }

    function findLowWinners(pool: Player[]): Player[] {
      const valid = pool.filter(p => evalMap.get(p.id)?.isValid);
      if (!valid.length) return [];
      let best: KamikazeEval | null = null;
      for (const p of valid) {
        const ev = evalMap.get(p.id)!;
        if (!best || compareKamikazeLow(ev, best) > 0) best = ev;
      }
      return valid.filter(p => compareKamikazeLow(evalMap.get(p.id)!, best!) === 0);
    }

    const deltas: Record<string, number> = {};
    const winnerSet = new Set<string>();

    function award(winners: Player[], amount: number) {
      const share = Math.floor(amount / winners.length);
      let rem = amount - share * winners.length;
      for (const w of winners) {
        const give = share + (rem-- > 0 ? 1 : 0);
        deltas[w.id] = (deltas[w.id] ?? 0) + give;
        winnerSet.add(w.id);
      }
    }

    if (highPool.length > 0 && lowPool.length > 0) {
      const halfHigh = Math.floor(pot / 2);
      const halfLow  = pot - halfHigh;
      const hw = findHighWinners(highPool);
      const lw = findLowWinners(lowPool);
      if (hw.length > 0) { award(hw, halfHigh); messages.push(`HIGH: ${hw.map(p => p.name).join(' & ')} wins $${halfHigh}`); }
      if (lw.length > 0) { award(lw, halfLow);  messages.push(`LOW: ${lw.map(p => p.name).join(' & ')} wins $${halfLow}`); }
    } else if (highPool.length > 0) {
      const hw = findHighWinners(highPool);
      if (hw.length > 0) { award(hw, pot); messages.push(`HIGH: ${hw.map(p => p.name).join(' & ')} wins $${pot}`); }
    } else {
      const lw = findLowWinners(lowPool);
      if (lw.length > 0) { award(lw, pot); messages.push(`LOW: ${lw.map(p => p.name).join(' & ')} wins $${pot}`); }
    }

    finalPlayers = finalPlayers.map(p => {
      if (winnerSet.has(p.id)) return { ...p, chips: p.chips + (deltas[p.id] ?? 0), isWinner: true };
      if (p.status !== 'folded' && p.declaration) return { ...p, isLoser: true };
      return p;
    });

    return { players: finalPlayers, pot: 0, messages };
  },
};
