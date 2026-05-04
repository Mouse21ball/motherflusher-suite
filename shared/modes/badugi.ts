// ─── Shared Badugi mode ───────────────────────────────────────────────────────
// Pure game logic — no browser APIs, no Node-only APIs.
// Imported by both the client engine and the server-authoritative engine.
// Client:  import { BadugiMode } from '@shared/modes/badugi'  (via shim)
// Server:  import { BadugiMode } from '../shared/modes/badugi'

import type { GameMode, GameState, Player, CardType, Declaration } from '../gameTypes';
import { decideBet, applyBetDecision, botPersonality } from '../engine/botUtils';
import { computeSidePots, totalSidePotAmount, resolveSplitPots } from '../engine/sidePots';

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

      // ── Phase context (hoisted so accessible to all branches below) ──────
      const hasDrawsLeft  = state.phase === 'BET_1' || state.phase === 'BET_2';
      const isLastBet     = state.phase === 'BET_3';

      // ── Situational context ───────────────────────────────────────────────
      const livePlayers     = state.players.filter(p => p.status === 'active');
      const activeOpponents = Math.max(0, livePlayers.length - 1);
      const callAmount      = state.currentBet - bot.bet;
      const stackRisk       = bot.chips > 0 ? Math.min(callAmount / bot.chips, 1.0) : 0;

      if (evaluation?.isValidBadugi) {
        const h = evaluation.badugiRankValues![0];
        if (h <= 5) strength = 0.92;
        else if (h <= 7) strength = 0.75;
        else if (h <= 9) strength = 0.55;
        else if (h <= 11) strength = 0.42;
        else strength = hasDrawsLeft ? 0.37 : 0.30;
      } else {
        const cards = bot.cards;
        const usedR = new Set<string>();
        const usedS = new Set<string>();
        let goodCount = 0;
        let lowRankCount = 0; // cards with rank A-4 (rank value ≤ 4) — premium draw fuel
        const sorted = cards.map((_, i) => i).sort((a, b) => rankValue(cards[a].rank) - rankValue(cards[b].rank));
        for (const i of sorted) {
          const rv = rankValue(cards[i].rank);
          if (!usedR.has(cards[i].rank) && !usedS.has(cards[i].suit)) {
            goodCount++;
            usedR.add(cards[i].rank);
            usedS.add(cards[i].suit);
          }
          if (rv <= 4) lowRankCount++;
        }

        // Premium draw: 3-card draw where ≥2 cards are A-4 (a real wheel draw)
        const isPremiumDraw = goodCount >= 3 && lowRankCount >= 2;

        if (isPremiumDraw && hasDrawsLeft)        strength = 0.68; // premium draw — bet confidently early
        else if (goodCount >= 3 && hasDrawsLeft)  strength = 0.60; // solid draw early
        else if (goodCount >= 3 && !isLastBet)    strength = 0.38; // late draw, some pressure
        else if (goodCount >= 3 && isLastBet)     strength = 0.08; // last bet, no draw — fold hard
        else if (hasDrawsLeft)                    strength = 0.22; // weak draw, mostly check
        else                                      strength = 0.04; // no draw at all — fold
      }

      // ── Personality (stable per seat, derived from bot ID) ───────────────
      const personality = botPersonality(bot.id);

      // ── Momentum (chip count vs 1000 baseline — no new state needed) ──────
      // Winning bots get slightly bolder; losing bots tighten up.
      const momentum = bot.chips > 1080 ? 1 : bot.chips < 920 ? -1 : 0;

      // ── Hero profiling — decayed window for light session carryover ─────────
      // Recent 5 messages weight 1.0; older 6–15 weight 0.5 — natural decay
      // so bots don't completely forget between hands but don't obsess either.
      const heroPlayer    = state.players.find(p => p.presence === 'human');
      const heroName      = heroPlayer?.name ?? '';
      const msgs15  = state.messages.slice(-15);
      const msgs5   = state.messages.slice(-5);
      const msgs5Set = new Set(msgs5);
      let heroRaises = 0;
      let heroFolds  = 0;
      let heroActs   = 0;
      for (const msg of msgs15) {
        if (!heroName || !msg.text.includes(heroName)) continue;
        const w = msgs5Set.has(msg) ? 1.0 : 0.5;
        heroActs   += w;
        if (msg.text.includes('raised') || msg.text.includes('bet')) heroRaises += w;
        else if (msg.text.includes('folded')) heroFolds += w;
      }
      const heroAggression = heroActs >= 2 ? heroRaises / heroActs : 0.3;
      // Hero folds to pressure ≥2× this session → fold equity is real
      const heroFoldsOften = heroActs >= 2 && heroFolds >= 2;
      // Escalation: hero raised in 2+ rounds of THIS hand (last-bet round check)
      const heroEscalating = isLastBet && heroRaises >= 2;
      // Rivalry: hero raised 3+ times — aggressive bots push back harder
      const rivalryMode    = isLastBet && heroRaises >= 3;

      // ── Per-hand bluff-line commitment (deterministic, stable per hand) ───
      const cardSum  = bot.cards.reduce((acc, c) => acc + rankValue(c.rank), 0);
      const handHash = ((cardSum * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff;
      const bluffLine = handHash < 0.12 && !evaluation?.isValidBadugi && strength < 0.36;

      // ── Focus / hunting: bot decides to target the hero this hand ─────────
      // Uses a different hash than bluffLine to stay independent.
      const heroChipsApprox = heroPlayer?.chips ?? 1000;
      const focusSeed  = ((cardSum * 31337 + bot.id.charCodeAt(0) * 997
                           + (heroChipsApprox % 100)) * 1664525) & 0x7fffffff;
      const focusRng   = focusSeed / 0x7fffffff;
      // Only hunt an aggressive hero; fires on ~30% of those hands per bot seat
      const focusTarget = heroAggression > 0.45 && focusRng > 0.70;

      // ── Bot vs bot table awareness ────────────────────────────────────────
      // Scan all active opponents (excluding this bot) for stack dynamics.
      const opponents = state.players.filter(p => p.id !== bot.id && p.status !== 'folded');
      const oppChips  = opponents.map(p => p.chips);
      const tableMaxOpp = oppChips.length ? Math.max(...oppChips) : bot.chips;
      const tableMinOpp = oppChips.length ? Math.min(...oppChips) : bot.chips;
      // Avoid opening into a big stack; apply pressure when a short stack is present.
      const facingBigStack    = tableMaxOpp > bot.chips * 1.30;
      const shortStackPresent = tableMinOpp < 700 && bot.chips >= tableMinOpp;
      // Per-seat hot/cold permanent drift: stable over the entire session.
      // Range is -0.048 to +0.048 — one seat always slightly hotter, one colder.
      const botIdSum   = bot.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
      const tableDrift = ((botIdSum % 7) - 3) * 0.016;

      // ── Trap / bait: check BET_1 with a strong hand, fire in BET_2 ────────
      const trapThreshold = activeOpponents === 1 ? 0.35 : 0.22;
      const trapMode   = evaluation?.isValidBadugi && handHash < trapThreshold && state.pot < 14;
      const slowPlay   = trapMode && state.phase === 'BET_1';
      const trapFire   = trapMode && state.phase === 'BET_2';

      // ── Stack mode: chip position shapes aggression / survival instincts ──
      const stackMode = bot.chips > 1200 ? 'bully'
                      : bot.chips <  600 ? 'critical'
                      : bot.chips <  800 ? 'survival'
                      : 'normal';

      // ── Hand variance: ±0.08 shift per hand breaks structural repetition ──
      // Uses a third independent hash so it doesn't correlate with bluffLine or focusTarget.
      const varSeed     = ((cardSum * 2654435761 + bIdx * 1000) * 1664525) & 0x7fffffff;
      const handVariance = (varSeed / 0x7fffffff - 0.5) * 0.16;

      // ── Pot control: medium-strength hands keep pots small ────────────────
      const potControl = strength >= 0.30 && strength <= 0.52 && state.pot >= 6 && !trapFire;

      const heroWeak      = heroPlayer ? !evaluateBadugi(heroPlayer.cards)?.isValidBadugi : false;
      const largePot      = state.pot >= 20;
      const earlyPressure = (state.phase === 'BET_1' && !slowPlay) || trapFire;
      const passiveExtra  = (isLastBet && !evaluation?.isValidBadugi) ? 0.22 : 0;

      const raisesSoFar = state.raisesThisRound ?? 0;
      const raiseCap = activeOpponents <= 1 ? 4 : 3;
      const decision = decideBet(strength, state.pot, state.currentBet, bot.bet, bot.chips, {
        heroWeak, largePot, earlyPressure, passiveExtra,
        activeOpponents, stackRisk, slowPlay,
        heroAggression, bluffLine, potControl,
        personality, momentum,
        heroFoldsOften, focusTarget, heroEscalating, stackMode, handVariance,
        facingBigStack, shortStackPresent, tableDrift, rivalryMode,
        raisesThisRound: raisesSoFar, raiseCap,
      });
      const result = applyBetDecision(decision, bot, state.currentBet, state.pot, raisesSoFar);
      newPlayers[bIdx] = { ...bot, chips: result.chips, bet: result.bet, status: result.status as any, hasActed: true };
      newPot = result.pot;
      newCurrentBet = result.currentBet;
      newRaisesThisRound = result.raisesThisRound;
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
      stateUpdates: { players: newPlayers, deck: newDeck, pot: newPot, currentBet: newCurrentBet, raisesThisRound: newRaisesThisRound, discardPile },
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

    // ── Side-pot computation ──────────────────────────────────────────────
    let sidePots = computeSidePots(finalPlayers);
    if (sidePots.length === 0 && pot > 0) {
      // Legacy/fixture path — no totalBet metadata.
      sidePots = [{ amount: pot, eligibleIds: activePlayers.map(p => p.id) }];
    }
    const totalAwardable = totalSidePotAmount(sidePots);

    // Sole survivor — wins all pots they're eligible for; rest rolls over.
    if (activePlayers.length === 1) {
      const sole = activePlayers[0];
      const soleAward = sidePots
        .filter(sp => sp.eligibleIds.includes(sole.id))
        .reduce((s, sp) => s + sp.amount, 0);
      const remainder = totalAwardable - soleAward;
      const soleIdx = finalPlayers.findIndex(p => p.id === sole.id);
      finalPlayers[soleIdx] = { ...finalPlayers[soleIdx], chips: finalPlayers[soleIdx].chips + soleAward, isWinner: true };
      messages.push(`${finalPlayers[soleIdx].name} wins $${soleAward} (last player standing)`);
      return { players: finalPlayers, pot: remainder, messages };
    }

    // ── Awarders for split-pot resolver ───────────────────────────────────
    const findHigh = (eligible: Player[]): string[] => {
      const h = eligible.filter(p => p.declaration === 'HIGH' && p.score?.isValidBadugi);
      if (h.length === 0) return [];
      h.sort((a, b) => {
        const av = a.score!.badugiRankValues!, bv = b.score!.badugiRankValues!;
        for (let i = 0; i < 4; i++) if (av[i] !== bv[i]) return bv[i] - av[i];
        return 0;
      });
      const top = h[0].score!.badugiRankValues!;
      return h.filter(p => {
        const v = p.score!.badugiRankValues!;
        for (let i = 0; i < 4; i++) if (v[i] !== top[i]) return false;
        return true;
      }).map(p => p.id);
    };
    const findLow = (eligible: Player[]): string[] => {
      const l = eligible.filter(p => p.declaration === 'LOW' && p.score?.isValidBadugi);
      if (l.length === 0) return [];
      l.sort((a, b) => {
        const av = a.score!.badugiRankValues!, bv = b.score!.badugiRankValues!;
        for (let i = 0; i < 4; i++) if (av[i] !== bv[i]) return av[i] - bv[i];
        return 0;
      });
      const top = l[0].score!.badugiRankValues!;
      return l.filter(p => {
        const v = p.score!.badugiRankValues!;
        for (let i = 0; i < 4; i++) if (v[i] !== top[i]) return false;
        return true;
      }).map(p => p.id);
    };
    // Sole-valid-badugi-with-no-declaration fallback ⇒ scoop that pot.
    const findScoop = (eligible: Player[]): string[] => {
      const undecl = eligible.filter(p => !p.declaration && p.score?.isValidBadugi);
      const decl = eligible.filter(p =>
        (p.declaration === 'HIGH' || p.declaration === 'LOW') && p.score?.isValidBadugi
      );
      if (decl.length === 0 && undecl.length === 1) return [undecl[0].id];
      return [];
    };

    const resolution = resolveSplitPots(sidePots, finalPlayers, { findScoop, findHigh, findLow });

    if (!resolution.hadAnyWinner) {
      messages.push(`No qualifying hands. $${resolution.rolledOver} rolls over!`);
      return { players: finalPlayers, pot: resolution.rolledOver, messages };
    }

    if (resolution.highWinnerIds.size > 0 && resolution.lowWinnerIds.size > 0) {
      const intersect = [...resolution.highWinnerIds].some(id => resolution.lowWinnerIds.has(id));
      if (!intersect) messages.push(`Split Pot — HIGH/LOW split $${totalAwardable}`);
    }

    for (const id of Object.keys(resolution.deltas)) {
      const idx = finalPlayers.findIndex(p => p.id === id);
      if (idx !== -1) {
        const award = resolution.deltas[id];
        finalPlayers[idx] = { ...finalPlayers[idx], chips: finalPlayers[idx].chips + award, isWinner: true };
        const desc = finalPlayers[idx].score?.description || 'Badugi';
        if (resolution.scoopWinnerIds.has(id)) {
          messages.push(`${finalPlayers[idx].name} wins $${award} (only valid badugi)`);
        } else if (resolution.highWinnerIds.has(id)) {
          messages.push(`${finalPlayers[idx].name} wins HIGH — $${award} (${desc})`);
        } else if (resolution.lowWinnerIds.has(id)) {
          messages.push(`${finalPlayers[idx].name} wins LOW — $${award} (${desc})`);
        }
      }
    }

    finalPlayers = finalPlayers.map(p =>
      p.status !== 'folded' && !p.isWinner ? { ...p, isLoser: true } : p
    );

    if (resolution.rolledOver > 0) {
      messages.push(`$${resolution.rolledOver} rolls over`);
    }
    return { players: finalPlayers, pot: resolution.rolledOver, messages };
  },
};
