import { useReducer } from "react";
import type { CardType, Declaration, GamePhase, GameState, Player } from "@shared/gameTypes";
import { BadugiMode, evaluateBadugi } from "@shared/modes/badugi";
import { takeAnte } from "@shared/engine/botUtils";

export const PRACTICE_PHASES: GamePhase[] = [
  "WAITING", "ANTE", "DEAL", "DRAW_1", "BET_1", "DRAW_2", "BET_2",
  "DRAW_3", "DECLARE", "BET_3", "SHOWDOWN",
];

const HUMAN_ID = "p1";
const CHIP_STACK = 10_000;
const suits: CardType["suit"][] = ["hearts", "diamonds", "clubs", "spades"];
const ranks: CardType["rank"][] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function practiceDeck(): CardType[] {
  // Every seat starts with a real four-card Badugi. Guided replacement draws
  // are also restricted to cards that retain the hero's qualifying hand.
  const opening: CardType[] = [
    { rank: "A", suit: "hearts" }, { rank: "2", suit: "diamonds" },
    { rank: "3", suit: "clubs" }, { rank: "4", suit: "spades" },
    { rank: "5", suit: "hearts" }, { rank: "6", suit: "diamonds" },
    { rank: "7", suit: "clubs" }, { rank: "8", suit: "spades" },
    { rank: "9", suit: "hearts" }, { rank: "10", suit: "diamonds" },
    { rank: "J", suit: "clubs" }, { rank: "Q", suit: "spades" },
    { rank: "K", suit: "hearts" }, { rank: "A", suit: "diamonds" },
    { rank: "2", suit: "clubs" }, { rank: "3", suit: "spades" },
  ];
  const used = new Set(opening.map(card => `${card.rank}:${card.suit}`));
  const remainder = suits.flatMap(suit => ranks
    .filter(rank => !used.has(`${rank}:${suit}`))
    .map(rank => ({ rank, suit })));
  return [...opening, ...remainder];
}

function player(id: string, name: string, presence: Player["presence"], isDealer = false): Player {
  return {
    id, name, presence, chips: CHIP_STACK, bet: 0, totalBet: 0, cards: [],
    status: "active", isDealer, declaration: null, hasActed: false,
  };
}

export interface PracticeBadugiState {
  game: GameState;
  selectedCardIndices: number[];
  error: string | null;
  handComplete: boolean;
}

export type PracticeBadugiAction =
  | { type: "START" }
  | { type: "ANTE" }
  | { type: "DEAL" }
  | { type: "SELECT_CARD"; index: number }
  | { type: "DRAW" }
  | { type: "BET"; amount: number }
  | { type: "DECLARE"; declaration: Exclude<Declaration, null | "FOLD" | "SWING" | "STAY" | "BUST" | "POKER" | "SUITS"> }
  | { type: "RESTART" };

export function createInitialPracticeBadugiState(): PracticeBadugiState {
  const players = [
    player(HUMAN_ID, "You", "human", true),
    player("bot-1", "Maya", "bot"),
    player("bot-2", "Theo", "bot"),
    player("bot-3", "Jules", "bot"),
  ];
  return {
    game: {
      tableId: "practice-badugi", phase: "WAITING", pot: 0, currentBet: 0, minBet: 25,
      activePlayerId: null, players, communityCards: [], messages: [], chatMessages: [],
      deck: [], discardPile: [], raisesThisRound: 0,
    },
    selectedCardIndices: [], error: null, handComplete: false,
  };
}

const appendMessage = (game: GameState, text: string): GameState => ({
  ...game,
  messages: [...game.messages, { id: `practice-${game.messages.length}`, text, time: Date.now() }],
});

function resetRound(game: GameState, phase: GamePhase): GameState {
  return {
    ...game, phase, activePlayerId: HUMAN_ID, currentBet: 0, raisesThisRound: 0,
    players: game.players.map(p => ({ ...p, bet: 0, hasActed: false })),
  };
}

function nextPhase(phase: GamePhase): GamePhase {
  const index = PRACTICE_PHASES.indexOf(phase);
  return PRACTICE_PHASES[Math.min(index + 1, PRACTICE_PHASES.length - 1)];
}

function dealCards(game: GameState): GameState {
  const dealt = BadugiMode.deal(practiceDeck(), game.players, HUMAN_ID);
  return {
    ...game, phase: "DRAW_1", deck: dealt.deck,
    communityCards: dealt.communityCards, discardPile: [], activePlayerId: HUMAN_ID,
    players: dealt.players.map(p => ({ ...p, bet: 0, hasActed: false })),
  };
}

function applyAnte(game: GameState): GameState {
  const ante = 25;
  const players = game.players.map(p => {
    const paid = takeAnte(p.chips, ante);
    return { ...p, chips: paid.chips, totalBet: paid.contribution, hasActed: true };
  });
  const collected = players.reduce((sum, p) => sum + (p.totalBet ?? 0), 0);
  return appendMessage({
    ...game, phase: "DEAL", players, pot: collected, activePlayerId: null,
  }, "Everyone posts a 25 practice-chip ante.");
}

function advanceAfterRound(game: GameState): GameState {
  const phase = nextPhase(game.phase);
  if (phase === "SHOWDOWN") {
    const resolved = BadugiMode.resolveShowdown!(game.players, game.pot, HUMAN_ID);
    return {
      ...game, phase, players: resolved.players, pot: resolved.pot, activePlayerId: null,
      messages: [...game.messages, ...resolved.messages.map((text, i) => ({
        id: `showdown-${i}`, text, time: Date.now(), isResolution: true,
      }))],
    };
  }
  return resetRound(game, phase);
}

function roundIsComplete(game: GameState): boolean {
  const active = game.players.filter(p => p.status === "active");
  if (game.phase.startsWith("DRAW") || game.phase === "DECLARE") {
    return active.every(p => p.hasActed);
  }
  return active.every(p => p.hasActed && (p.bet === game.currentBet || p.chips === 0));
}

function nextNeedingAction(game: GameState, afterIndex: number): string | null {
  const betting = game.phase.startsWith("BET");
  for (let offset = 1; offset <= game.players.length; offset++) {
    const p = game.players[(afterIndex + offset) % game.players.length];
    if (p.status !== "active") continue;
    if (betting && p.chips === 0) continue;
    if (!p.hasActed || (betting && p.bet < game.currentBet)) return p.id;
  }
  return null;
}

export interface PracticeBotActionResult {
  stateUpdates: Partial<GameState>;
  message?: string;
}

/** Convert a training-hand betting fold into the legal check/call faced. */
export function normalizePracticeBotAction(
  game: GameState,
  botId: string,
  action: PracticeBotActionResult,
): PracticeBotActionResult {
  const previous = game.players.find(p => p.id === botId);
  const updated = action.stateUpdates.players?.find(p => p.id === botId);
  if (!previous || !updated || !game.phase.startsWith("BET") || updated.status !== "folded") return action;

  const call = Math.max(0, game.currentBet - previous.bet);
  const paid = Math.min(call, previous.chips);
  const players = (action.stateUpdates.players ?? game.players).map(p => p.id === botId
    ? { ...previous, chips: previous.chips - paid, bet: previous.bet + paid, status: "active" as const, hasActed: true }
    : p);
  return {
    stateUpdates: { ...action.stateUpdates, players, pot: game.pot + paid, currentBet: game.currentBet },
    message: paid > 0
      ? `${previous.name} calls ${paid} practice chips to stay in.`
      : `${previous.name} checks to stay in.`,
  };
}

function runBotsAndTransitions(input: GameState): GameState {
  let game = input;
  // A bounded loop makes progression robust even if a future mode change has
  // an unexpected action edge; this client-only engine never persists state.
  for (let guard = 0; guard < 80; guard++) {
    if (game.phase === "SHOWDOWN" || game.phase === "WAITING") return game;
    if (game.phase === "DEAL") {
      game = dealCards(game);
      continue;
    }
    if (roundIsComplete(game)) {
      game = advanceAfterRound(game);
      continue;
    }
    const actorId = game.activePlayerId ?? nextNeedingAction(game, -1);
    if (!actorId) {
      game = advanceAfterRound(game);
      continue;
    }
    if (actorId === HUMAN_ID) {
      const hero = game.players.find(p => p.id === HUMAN_ID)!;
      if (game.phase.startsWith("BET") && hero.chips === 0) {
        game = {
          ...game, activePlayerId: null,
          players: game.players.map(p => p.id === HUMAN_ID ? { ...p, hasActed: true } : p),
        };
        continue;
      }
      return { ...game, activePlayerId: HUMAN_ID };
    }

    const botAction = BadugiMode.botAction(game, actorId);
    if (!botAction) return game;
    const action = normalizePracticeBotAction(game, actorId, botAction);
    const update = action.stateUpdates;
    const previousActor = game.players.find(p => p.id === actorId);
    let players = (update.players ?? game.players).map(p => {
      if (p.id !== actorId || !previousActor || !game.phase.startsWith("BET")) return p;
      const committedNow = Math.max(0, p.bet - previousActor.bet);
      return { ...p, totalBet: (previousActor.totalBet ?? 0) + committedNow };
    });
    game = appendMessage({
      ...game, ...update, players, activePlayerId: null,
      pot: update.pot ?? game.pot, currentBet: update.currentBet ?? game.currentBet,
      deck: update.deck ?? game.deck, discardPile: update.discardPile ?? game.discardPile,
      raisesThisRound: update.raisesThisRound ?? game.raisesThisRound,
    }, action.message ?? "Bot acted.");
    if (roundIsComplete(game)) {
      game = advanceAfterRound(game);
      continue;
    }
    const botIndex = game.players.findIndex(p => p.id === actorId);
    game = { ...game, activePlayerId: nextNeedingAction(game, botIndex) };
  }
  return game;
}

function applyHumanBet(game: GameState, amount: number): { game: GameState; error?: string } {
  const hero = game.players.find(p => p.id === HUMAN_ID)!;
  const callAmount = game.currentBet - hero.bet;
  if (!Number.isSafeInteger(amount) || amount < 0) return { game, error: "Enter a valid practice-chip amount." };
  if (amount === 0 && callAmount > 0) return { game, error: "There is a bet to call; enter a call or raise amount." };
  if (amount > hero.chips) return { game, error: "That exceeds your 10,000 practice-chip stack." };
  if (amount < callAmount && amount !== hero.chips) return { game, error: "Call the full amount or commit your remaining stack." };
  const newTotalBet = hero.bet + amount;
  if (amount > callAmount && newTotalBet - game.currentBet < game.minBet) {
    return { game, error: `A raise must be at least ${game.minBet} practice chips.` };
  }
  const raised = newTotalBet > game.currentBet;
  const players = game.players.map(p => p.id === HUMAN_ID
    ? { ...p, chips: p.chips - amount, bet: newTotalBet, totalBet: (p.totalBet ?? 0) + amount, hasActed: true }
    : raised && p.bet < newTotalBet ? { ...p, hasActed: false } : p);
  const actedGame = appendMessage({
    ...game, players, pot: game.pot + amount,
    currentBet: Math.max(game.currentBet, newTotalBet),
    raisesThisRound: (game.raisesThisRound ?? 0) + (raised && amount > callAmount ? 1 : 0),
    activePlayerId: null,
  }, amount === 0 ? "You check." : amount === callAmount ? `You call ${amount} practice chips.` : `You bet ${amount} practice chips.`);
  return { game: actedGame };
}

export function practiceBadugiReducer(state: PracticeBadugiState, action: PracticeBadugiAction): PracticeBadugiState {
  if (action.type === "RESTART") return createInitialPracticeBadugiState();
  if (action.type === "START") {
    if (state.game.phase !== "WAITING") return state;
    return { ...state, game: { ...state.game, phase: "ANTE", activePlayerId: HUMAN_ID }, error: null };
  }
  if (action.type === "ANTE") {
    if (state.game.phase !== "ANTE") return state;
    return { ...state, game: { ...applyAnte(state.game), phase: "DEAL", activePlayerId: HUMAN_ID }, error: null };
  }
  if (action.type === "DEAL") {
    if (state.game.phase !== "DEAL") return state;
    return { ...state, game: dealCards(state.game), error: null };
  }
  if (state.handComplete || state.game.activePlayerId !== HUMAN_ID) return state;
  if (action.type === "SELECT_CARD") {
    if (!state.game.phase.startsWith("DRAW") || action.index < 0 || action.index > 3) return state;
    const selected = state.selectedCardIndices.includes(action.index)
      ? state.selectedCardIndices.filter(index => index !== action.index)
      : [...state.selectedCardIndices, action.index];
    const drawMax = state.game.phase === "DRAW_1" ? 3 : state.game.phase === "DRAW_2" ? 2 : 1;
    if (selected.length > drawMax) return { ...state, error: `Select up to ${drawMax} card${drawMax === 1 ? "" : "s"} this draw.` };
    return { ...state, selectedCardIndices: selected, error: null };
  }
  if (action.type === "DRAW") {
    if (!state.game.phase.startsWith("DRAW")) return state;
    const drawMax = state.game.phase === "DRAW_1" ? 3 : state.game.phase === "DRAW_2" ? 2 : 1;
    const unique = new Set(state.selectedCardIndices);
    if (unique.size !== state.selectedCardIndices.length || state.selectedCardIndices.some(i => !Number.isInteger(i) || i < 0 || i > 3) || unique.size > drawMax) {
      return { ...state, error: `Choose no more than ${drawMax} distinct cards.` };
    }
    let game = { ...state.game };
    const deck = [...game.deck];
    const discards = [...game.discardPile];
    const hero = game.players.find(p => p.id === HUMAN_ID)!;
    const cards = [...hero.cards];
    for (const index of state.selectedCardIndices) {
      const keptCards = cards.filter((_, cardIndex) => cardIndex !== index);
      let replacementIndex = deck.findIndex(candidate =>
        keptCards.every(kept => kept.rank !== candidate.rank && kept.suit !== candidate.suit),
      );
      if (replacementIndex < 0 && discards.length) {
        deck.push(...discards.splice(0));
        replacementIndex = deck.findIndex(candidate =>
          keptCards.every(kept => kept.rank !== candidate.rank && kept.suit !== candidate.suit),
        );
      }
      if (replacementIndex < 0) return { ...state, error: "No qualifying replacement remains in the practice deck." };
      discards.push(cards[index]);
      const [replacement] = deck.splice(replacementIndex, 1);
      cards[index] = { ...replacement, isHidden: false };
      if (!evaluateBadugi(cards)?.isValidBadugi) {
        return { ...state, error: "That draw would break the qualifying Badugi; choose another card." };
      }
    }
    game = {
      ...game, deck, discardPile: discards,
      players: game.players.map(p => p.id === HUMAN_ID ? { ...p, cards, hasActed: true } : p),
      activePlayerId: null,
    };
    game = appendMessage(game, state.selectedCardIndices.length ? `You draw ${state.selectedCardIndices.length} card${state.selectedCardIndices.length === 1 ? "" : "s"}.` : "You stand pat.");
    game = runBotsAndTransitions(game);
    return { ...state, game, selectedCardIndices: [], error: null, handComplete: game.phase === "SHOWDOWN" };
  }
  if (action.type === "BET") {
    if (!state.game.phase.startsWith("BET")) return state;
    const result = applyHumanBet(state.game, action.amount);
    if (result.error) return { ...state, error: result.error };
    const game = runBotsAndTransitions(result.game);
    return { ...state, game, error: null, handComplete: game.phase === "SHOWDOWN" };
  }
  if (action.type === "DECLARE") {
    if (state.game.phase !== "DECLARE") return state;
    const hero = state.game.players.find(p => p.id === HUMAN_ID)!;
    if (!evaluateBadugi(hero.cards)?.isValidBadugi) {
      return { ...state, error: "You need a qualifying four-card Badugi to declare." };
    }
    const game = appendMessage({
      ...state.game,
      players: state.game.players.map(p => p.id === HUMAN_ID
        ? { ...p, declaration: action.declaration, hasActed: true }
        : p),
      activePlayerId: null,
    }, `You declare ${action.declaration}.`);
    const progressed = runBotsAndTransitions(game);
    return { ...state, game: progressed, error: null, handComplete: progressed.phase === "SHOWDOWN" };
  }
  return state;
}

export function usePracticeBadugi() {
  const [state, dispatch] = useReducer(practiceBadugiReducer, undefined, createInitialPracticeBadugiState);
  return { state, dispatch };
}