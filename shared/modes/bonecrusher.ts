import { GameMode, GameState, Player, CardType, GamePhase, Declaration } from '../gameTypes';
import { getNextActivePlayerIndex } from '../engine/core';
import { decideBet, applyBetDecision, getBotThinkDelay, botTier, botPersonality } from '../engine/botUtils';

// ── Rank tables ───────────────────────────────────────────────────────────────

const HIGH_RV: Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
const LOW_RV:  Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':1  };

function hv(rank: string): number { return HIGH_RV[rank] ?? 2; }
function lv(rank: string): number { return LOW_RV[rank]  ?? 2; }

function rankLabel(v: number): string {
  if (v === 1 || v === 14) return 'A';
  if (v === 13) return 'K'; if (v === 12) return 'Q'; if (v === 11) return 'J';
  return String(v);
}

// ── Standard 5-card poker evaluator ──────────────────────────────────────────

function eval5Cards(cards: CardType[]): { value: number; name: string } {
  const ranks = cards.map(c => hv(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = new Set(suits).size === 1;
  const isAceLow = ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2;
  const isStraight = (new Set(ranks).size === 5 && ranks[0] - ranks[4] === 4) || isAceLow;
  const rc = ranks.reduce((a, r) => { a[r] = (a[r] || 0) + 1; return a; }, {} as Record<number,number>);
  const counts = Object.values(rc).sort((a, b) => b - a);
  const byCount = Object.entries(rc).sort((a, b) => b[1] !== a[1] ? b[1] - a[1] : +b[0] - +a[0]).map(([r]) => +r);
  const kicker = byCount.reduce((s, r, i) => s + r * Math.pow(15, 4 - i), 0);
  if (isStraight && isFlush) { if (!isAceLow && ranks[0] === 14 && ranks[1] === 13) return { value: 9_000_000 + kicker, name: 'Royal Flush' }; return { value: 8_000_000 + kicker, name: 'Straight Flush' }; }
  if (counts[0] === 4) return { value: 7_000_000 + kicker, name: 'Four of a Kind' };
  if (counts[0] === 3 && counts[1] === 2) return { value: 6_000_000 + kicker, name: 'Full House' };
  if (isFlush) return { value: 5_000_000 + kicker, name: 'Flush' };
  if (isStraight) return { value: 4_000_000 + kicker, name: 'Straight' };
  if (counts[0] === 3) return { value: 3_000_000 + kicker, name: 'Three of a Kind' };
  if (counts[0] === 2 && counts[1] === 2) return { value: 2_000_000 + kicker, name: 'Two Pair' };
  if (counts[0] === 2) return { value: 1_000_000 + kicker, name: 'Pair' };
  return { value: kicker, name: 'High Card' };
}

function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  return arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map(rest => [x, ...rest]));
}

function bestHighHand(cards: CardType[]): { value: number; name: string } {
  if (cards.length < 5) return { value: 0, name: '< 5 cards' };
  if (cards.length === 5) return eval5Cards(cards);
  return combos(cards, 5).reduce<{ value: number; name: string }>(
    (best, c) => { const r = eval5Cards(c); return r.value > best.value ? r : best; },
    { value: 0, name: 'No Hand' }
  );
}

// ── Lowball evaluator (ace-to-five California; lower value = better) ──────────

function scoreLow5(cards: CardType[]): { value: number; desc: string } {
  const ranks = cards.map(c => lv(c.rank)).sort((a, b) => a - b);
  const rc: Record<number, number> = {};
  for (const r of ranks) rc[r] = (rc[r] ?? 0) + 1;
  const maxCount = Math.max(...Object.values(rc));
  const penalty = maxCount >= 4 ? 30_000_000 : maxCount >= 3 ? 10_000_000 : maxCount >= 2 ? 3_000_000 : 0;
  const unique = [...new Set(ranks)].sort((a, b) => a - b).slice(0, 5);
  const encoded = unique.reduce((acc, r, i) => acc + r * Math.pow(15, i), 0);
  return { value: penalty + encoded, desc: unique.map(rankLabel).join('-') };
}

function bestLowHand(cards: CardType[]): { value: number; desc: string } {
  if (cards.length < 5) return { value: 999_999_999, desc: '< 5 cards' };
  if (cards.length === 5) return scoreLow5(cards);
  return combos(cards, 5).reduce<{ value: number; desc: string }>(
    (best, c) => { const r = scoreLow5(c); return r.value < best.value ? r : best; },
    { value: 999_999_999, desc: 'No Hand' }
  );
}

// ── Bot strategy helpers ──────────────────────────────────────────────────────

function scoreKeepSet(cards: CardType[]): number {
  const n = cards.length;
  if (n < 1) return 0;
  const uniqueRanks = new Set(cards.map(c => lv(c.rank))).size;
  const diverseScore = uniqueRanks / n;
  if (n < 5) return diverseScore;
  const high = bestHighHand(cards).value / 9_000_000;
  const low  = 1 - Math.min(bestLowHand(cards).value, 3_000_000) / 3_000_000;
  return high * 0.5 + low * 0.35 + diverseScore * 0.15;
}

function chooseDiscardIndices(cards: CardType[], numToDiscard: number): number[] {
  if (numToDiscard <= 0) return [];
  const n = cards.length;
  const numKeep = n - numToDiscard;
  if (numKeep <= 0) return cards.map((_, i) => i);
  const keepCombos = combos(cards.map((_, i) => i), numKeep);
  let best = -Infinity;
  let bestKeep: number[] = [];
  for (const ks of keepCombos) {
    const s = scoreKeepSet(ks.map(i => cards[i]));
    if (s > best) { best = s; bestKeep = ks; }
  }
  const keepSet = new Set(bestKeep);
  return cards.map((_, i) => i).filter(i => !keepSet.has(i));
}

// ── Public evaluation (used by client and engine DECLARE check) ───────────────

export interface BonecrusherEval {
  highValue: number;
  highName: string;
  lowValue: number;
  lowDesc: string;
}

export function evaluateBonecrusher(cards: CardType[]): BonecrusherEval {
  const all = cards.map(c => ({ ...c, isHidden: false }));
  const high = all.length >= 5 ? bestHighHand(all) : { value: 0, name: 'Incomplete' };
  const low  = all.length >= 5 ? bestLowHand(all)  : { value: 999_999_999, desc: 'Incomplete' };
  return { highValue: high.value, highName: high.name, lowValue: low.value, lowDesc: low.desc };
}

// ── Bot BET strength ──────────────────────────────────────────────────────────

function botHandStrength(cards: CardType[], phase: string): number {
  const visible = cards.map(c => ({ ...c, isHidden: false }));
  if (visible.length < 2) return 0.35;
  const high = bestHighHand(visible).value / 9_000_000;
  const low  = 1 - Math.min(bestLowHand(visible).value, 3_000_000) / 3_000_000;
  const phaseN = parseInt(phase.replace(/\D/g, '') || '1', 10);
  const combined = Math.max(high, low);
  return Math.min(0.95, combined * 0.85 + (phaseN / 8) * 0.05 + 0.1);
}

function drawsRemaining(phase: string): number {
  if (phase === 'BET_1') return 6;
  if (phase === 'BET_2') return 5;
  if (phase === 'BET_3') return 4;
  if (phase === 'BET_4') return 3;
  if (phase === 'BET_5') return 2;
  if (phase === 'BET_6') return 2;
  if (phase === 'BET_7') return 1;
  if (phase === 'BET_8') return 0;
  return 0;
}

// ── Game mode ─────────────────────────────────────────────────────────────────

export const BonecrusherMode: GameMode = {
  id: 'bonecrusher',
  name: 'Bonecrusher',
  phases: [
    'WAITING', 'ANTE', 'DEAL',
    'DISCARD_2', 'REVEAL_1', 'BET_1',
    'STREET_1', 'BET_2',
    'STREET_2', 'BET_3',
    'STREET_3', 'BET_4',
    'SELECT_5',
    'FLIP_1', 'BET_5',
    'FLIP_2', 'BET_6',
    'FLIP_3', 'BET_7',
    'FLIP_4', 'BET_8',
    'DECLARE', 'SHOWDOWN',
  ],

  deal(deck, players, _myId) {
    const d = [...deck];
    const newPlayers = players.map(p => {
      if (p.status !== 'active') return { ...p, cards: [] as CardType[] };
      const cards = d.splice(0, 6).map(c => ({ ...c, isHidden: true }));
      return { ...p, cards };
    });
    return { players: newPlayers, communityCards: [], deck: d };
  },

  getAutoTransition(phase: GamePhase) {
    if (phase === 'STREET_1' || phase === 'STREET_2' || phase === 'STREET_3') {
      return {
        delay: 700,
        action: (state: GameState) => {
          const newDeck = [...state.deck];
          const newPlayers = state.players.map(p => {
            if (p.status === 'folded' || !newDeck.length) return p;
            const card = newDeck.shift()!;
            return { ...p, cards: [...p.cards, { ...card, isHidden: false }] };
          });
          return {
            stateUpdates: { players: newPlayers, deck: newDeck },
            message: `${phase.replace('_', ' ')} — street dealt`,
            advancePhase: true,
          };
        },
      };
    }
    return null;
  },

  botAction(state: GameState, botId: string) {
    const bIdx = state.players.findIndex(p => p.id === botId);
    if (bIdx === -1) return null;
    const bot = state.players[bIdx];
    if (bot.status !== 'active') return null;

    const { phase } = state;
    let newPlayers = state.players.map(p => ({ ...p }));
    let newPot = state.pot;
    let newCurrentBet = state.currentBet;
    let newRaisesThisRound = state.raisesThisRound ?? 0;
    let discardPile = [...(state.discardPile || [])];
    let message = '';
    let publicIndices: Record<string, number[]> | undefined;

    // ── ANTE ─────────────────────────────────────────────────────────────────
    if (phase === 'ANTE') {
      const ante = 25;
      newPlayers[bIdx] = { ...bot, chips: Math.max(0, bot.chips - ante), hasActed: true };
      newPot += ante;
      message = `${bot.name} paid $${ante} ante`;
    }

    // ── DISCARD_2 ────────────────────────────────────────────────────────────
    else if (phase === 'DISCARD_2') {
      const botCards = bot.cards.map(c => ({ ...c, isHidden: false }));
      const discIdx = chooseDiscardIndices(botCards, 2).sort((a, b) => b - a);
      const newCards = [...botCards];
      for (const i of discIdx) { discardPile.push(newCards[i]); newCards.splice(i, 1); }
      newPlayers[bIdx] = { ...bot, cards: newCards, hasActed: true };
      message = `${bot.name} discarded 2 cards`;
    }

    // ── REVEAL_1 ─────────────────────────────────────────────────────────────
    else if ((phase as string) === 'REVEAL_1') {
      const botCards = bot.cards.map(c => ({ ...c, isHidden: false }));
      const sorted = botCards.map((c, i) => ({ i, r: hv(c.rank) })).sort((a, b) => a.r - b.r);
      const revealIdx = sorted[Math.floor(sorted.length / 2)]?.i ?? 0;
      newPlayers[bIdx] = { ...bot, hasActed: true };
      publicIndices = { [botId]: [revealIdx] };
      message = `${bot.name} revealed a card`;

      const actives = newPlayers.filter(p => p.status === 'active');
      const roundOver = actives.every(p => p.hasActed);
      let nextPlayerId: string | undefined;
      if (!roundOver) {
        const next = newPlayers.find(p => p.status === 'active' && !p.hasActed);
        nextPlayerId = next?.id;
      }
      return { stateUpdates: { players: newPlayers }, message, roundOver, nextPlayerId, publicIndices };
    }

    // ── SELECT_5 ─────────────────────────────────────────────────────────────
    else if (phase === 'SELECT_5') {
      const botCards = bot.cards.map(c => ({ ...c, isHidden: false }));
      const discIdx = chooseDiscardIndices(botCards, 2).sort((a, b) => b - a);
      const newCards = [...botCards];
      for (const i of discIdx) { discardPile.push(newCards[i]); newCards.splice(i, 1); }
      newPlayers[bIdx] = { ...bot, cards: newCards, hasActed: true };
      message = `${bot.name} selected best 5`;
    }

    // ── FLIP_1 / FLIP_2 / FLIP_3 / FLIP_4 ───────────────────────────────────
    else if (phase.startsWith('FLIP_')) {
      const flipNum = parseInt(phase.split('_')[1], 10) - 1;
      const revealIdx = Math.min(flipNum, bot.cards.length - 1);
      newPlayers[bIdx] = { ...bot, hasActed: true };
      publicIndices = { [botId]: [revealIdx] };
      message = `${bot.name} flipped a card`;

      const actives = newPlayers.filter(p => p.status === 'active');
      const roundOver = actives.every(p => p.hasActed);
      let nextPlayerId: string | undefined;
      if (!roundOver) {
        const next = newPlayers.find(p => p.status === 'active' && !p.hasActed);
        nextPlayerId = next?.id;
      }
      return { stateUpdates: { players: newPlayers }, message, roundOver, nextPlayerId, publicIndices };
    }

    // ── DECLARE ──────────────────────────────────────────────────────────────
    else if (phase === 'DECLARE') {
      const botCards = bot.cards.map(c => ({ ...c, isHidden: false }));
      const high = bestHighHand(botCards);
      const low  = bestLowHand(botCards);
      const highTier = Math.floor(high.value / 1_000_000);
      const isGoodHigh = highTier >= 2;
      const isGoodLow  = low.value < 1_500_000;

      let declaration: Declaration;
      if (isGoodHigh && isGoodLow && Math.random() < 0.25) {
        declaration = 'SWING';
      } else if (isGoodHigh && !isGoodLow) {
        declaration = 'HIGH';
      } else if (!isGoodHigh && isGoodLow) {
        declaration = 'LOW';
      } else {
        declaration = Math.random() < 0.5 ? 'HIGH' : 'LOW';
      }

      newPlayers[bIdx] = { ...bot, declaration, hasActed: true };
      message = `${bot.name} declares ${declaration}`;

      const actives = newPlayers.filter(p => p.status === 'active');
      const roundOver = actives.every(p => p.hasActed);
      let nextPlayerId: string | undefined;
      if (!roundOver) {
        const next = newPlayers.find(p => p.status === 'active' && !p.hasActed);
        nextPlayerId = next?.id;
      }
      return { stateUpdates: { players: newPlayers }, message, roundOver, nextPlayerId };
    }

    // ── BET phases ────────────────────────────────────────────────────────────
    else if (phase.startsWith('BET')) {
      const strength = botHandStrength(bot.cards, phase);
      const draws = drawsRemaining(phase);
      void draws;
      const decision = decideBet(strength, state.pot, state.currentBet, bot.bet, bot.chips, {
        raisesThisRound: newRaisesThisRound,
        personality: botPersonality(botId),
      });
      const applied = applyBetDecision(decision, bot, newCurrentBet, newPot, newRaisesThisRound);
      newPlayers[bIdx] = {
        ...bot,
        chips: applied.chips,
        bet: applied.bet,
        status: applied.status as any,
        hasActed: true,
      };
      newPot = applied.pot;
      newCurrentBet = applied.currentBet;
      newRaisesThisRound = applied.raisesThisRound;
      message = applied.message;
      if (applied.status === 'folded') newPlayers[bIdx].declaration = null;
      if (applied.currentBet > (state.currentBet ?? 0)) {
        newPlayers = newPlayers.map((p, i) => i !== bIdx && p.status === 'active' ? { ...p, hasActed: false } : p);
      }
    }

    else {
      return null;
    }

    // ── Compute roundOver / nextPlayerId ──────────────────────────────────────
    const isDrawPhase = phase === 'DISCARD_2' || phase === 'SELECT_5' ||
                        phase === 'REVEAL_1' || phase.startsWith('FLIP_');
    const actives = isDrawPhase
      ? newPlayers.filter(p => p.status === 'active')
      : newPlayers.filter(p => p.status === 'active' && p.chips > 0);
    const allActed     = actives.every(p => p.hasActed);
    const allBetsMatch = actives.every(p => p.bet === newCurrentBet || p.chips === 0);
    const roundOver = isDrawPhase ? allActed : (allActed && allBetsMatch);

    let nextPlayerId: string | undefined;
    if (!roundOver) {
      const dealerIdx = state.players.findIndex(p => p.isDealer);
      const next = getNextActivePlayerIndex(newPlayers, dealerIdx >= 0 ? dealerIdx : 0, !isDrawPhase);
      const candidate = newPlayers[next];
      if (candidate && (isDrawPhase ? !candidate.hasActed : (!candidate.hasActed || candidate.bet < newCurrentBet))) {
        nextPlayerId = candidate.id;
      }
    }

    return {
      stateUpdates: {
        players: newPlayers,
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

  evaluateHand: (player: Player) => evaluateBonecrusher(player.cards),

  resolveShowdown(players: Player[], pot: number) {
    const messages: string[] = [];

    const finalPlayers: Player[] = players.map(p => ({
      ...p,
      cards: p.cards.map(c => ({ ...c, isHidden: false })),
    }));

    const active = finalPlayers.filter(p =>
      p.status !== 'folded' && p.declaration && p.declaration !== 'FOLD'
    );

    if (active.length === 0) {
      return { players: finalPlayers, pot, messages: ['No declarers — pot rolls over'] };
    }
    if (active.length === 1) {
      const sole = active[0];
      const idx = finalPlayers.findIndex(p => p.id === sole.id);
      finalPlayers[idx] = { ...finalPlayers[idx], chips: finalPlayers[idx].chips + pot, isWinner: true };
      messages.push(`${sole.name} wins $${pot} — last one standing`);
      return { players: finalPlayers, pot: 0, messages };
    }

    const evalMap = new Map<string, { high: { value: number; name: string }; low: { value: number; desc: string } }>();
    for (const p of active) {
      evalMap.set(p.id, { high: bestHighHand(p.cards), low: bestLowHand(p.cards) });
    }

    const highPool  = active.filter(p => p.declaration === 'HIGH' || p.declaration === 'SWING');
    const lowPool   = active.filter(p => p.declaration === 'LOW'  || p.declaration === 'SWING');
    const swingPool = active.filter(p => p.declaration === 'SWING');
    const hasHigh   = highPool.length > 0;
    const hasLow    = lowPool.length  > 0;

    const halfHigh = Math.floor(pot / 2);
    const halfLow  = pot - halfHigh;

    const deltas: Record<string, number> = {};
    const winnerSet = new Set<string>();

    function award(winners: Player[], amount: number): void {
      if (!winners.length || amount <= 0) return;
      const share = Math.floor(amount / winners.length);
      let rem = amount - share * winners.length;
      for (const w of winners) {
        deltas[w.id] = (deltas[w.id] ?? 0) + share + (rem-- > 0 ? 1 : 0);
        winnerSet.add(w.id);
      }
    }

    function findHighWinners(pool: Player[]): Player[] {
      if (!pool.length) return [];
      let best = -1;
      for (const p of pool) best = Math.max(best, evalMap.get(p.id)!.high.value);
      return pool.filter(p => evalMap.get(p.id)!.high.value === best);
    }

    function findLowWinners(pool: Player[]): Player[] {
      if (!pool.length) return [];
      let best = 999_999_999;
      for (const p of pool) best = Math.min(best, evalMap.get(p.id)!.low.value);
      return pool.filter(p => evalMap.get(p.id)!.low.value === best);
    }

    if (hasHigh && hasLow) {
      const highWinners = findHighWinners(highPool);
      const lowWinners  = findLowWinners(lowPool);

      const swingBothWinners = swingPool.filter(s =>
        highWinners.some(w => w.id === s.id) && lowWinners.some(w => w.id === s.id)
      );

      if (swingBothWinners.length > 0) {
        award(swingBothWinners, pot);
        const ev = evalMap.get(swingBothWinners[0].id)!;
        messages.push(`SWING: ${swingBothWinners.map(p => p.name).join(' & ')} takes the whole pot $${pot} — ${ev.high.name} HIGH / ${ev.low.desc} LOW!`);
      } else {
        const swingHighOnly = swingPool.filter(s =>
          highWinners.some(w => w.id === s.id) && !lowWinners.some(w => w.id === s.id)
        );
        const swingLowOnly = swingPool.filter(s =>
          !highWinners.some(w => w.id === s.id) && lowWinners.some(w => w.id === s.id)
        );

        if (swingHighOnly.length > 0) {
          messages.push(`${swingHighOnly.map(p => p.name).join(', ')} (SWING) loses LOW — forfeits HIGH`);
        }
        if (swingLowOnly.length > 0) {
          messages.push(`${swingLowOnly.map(p => p.name).join(', ')} (SWING) loses HIGH — forfeits LOW`);
        }

        const disqualifiedIds = new Set([...swingHighOnly, ...swingLowOnly].map(p => p.id));
        const eligHighWinners = highWinners.filter(w => !disqualifiedIds.has(w.id));
        const eligLowWinners  = lowWinners.filter(w  => !disqualifiedIds.has(w.id));

        const actualHigh = eligHighWinners.length > 0
          ? eligHighWinners
          : findHighWinners(highPool.filter(p => p.declaration === 'HIGH'));
        const actualLow = eligLowWinners.length > 0
          ? eligLowWinners
          : findLowWinners(lowPool.filter(p => p.declaration === 'LOW'));

        if (actualHigh.length > 0) {
          award(actualHigh, halfHigh);
          const ev = evalMap.get(actualHigh[0].id)!;
          messages.push(`HIGH: ${actualHigh.map(p => p.name).join(' & ')} wins $${halfHigh} — ${ev.high.name}`);
        } else {
          messages.push(`No HIGH winner — $${halfHigh} stays in pot`);
        }
        if (actualLow.length > 0) {
          award(actualLow, halfLow);
          const ev = evalMap.get(actualLow[0].id)!;
          messages.push(`LOW: ${actualLow.map(p => p.name).join(' & ')} wins $${halfLow} — ${ev.low.desc}`);
        } else {
          messages.push(`No LOW winner — $${halfLow} stays in pot`);
        }
      }
    } else if (hasHigh) {
      const winners = findHighWinners(highPool);
      award(winners, pot);
      if (winners.length > 0) {
        const ev = evalMap.get(winners[0].id)!;
        messages.push(`${winners.map(p => p.name).join(' & ')} wins $${pot} — ${ev.high.name}`);
      }
    } else {
      const winners = findLowWinners(lowPool);
      award(winners, pot);
      if (winners.length > 0) {
        const ev = evalMap.get(winners[0].id)!;
        messages.push(`${winners.map(p => p.name).join(' & ')} wins $${pot} — ${ev.low.desc}`);
      }
    }

    const result = finalPlayers.map(p => ({
      ...p,
      chips: p.chips + (deltas[p.id] ?? 0),
      isWinner: winnerSet.has(p.id) || undefined,
    }));

    return { players: result, pot: 0, messages };
  },

  getNextPhase: undefined,
  checkAutoStay: undefined,
};
