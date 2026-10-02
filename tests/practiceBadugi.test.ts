import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardType, GameState } from "@shared/gameTypes";
import { BadugiMode, evaluateBadugi } from "@shared/modes/badugi";
import {
  createInitialPracticeBadugiState,
  normalizePracticeBotAction,
  PRACTICE_PHASES,
  practiceBadugiReducer,
} from "../client/src/lib/practice/usePracticeBadugi";

afterEach(() => vi.restoreAllMocks());

// Phase-progression tests use explicit qualifying fixtures, not lucky random
// deals. Production practice always uses the normal shuffled deck.
function qualifyingFixture() {
  const state = createInitialPracticeBadugiState();
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
  const keys = new Set(opening.map(c => `${c.rank}:${c.suit}`));
  state.game.deck = [...opening, ...state.game.deck.filter(c => !keys.has(`${c.rank}:${c.suit}`))];
  return state;
}

describe("client-only Badugi practice hand", () => {
  it("progresses through every canonical phase with bot decisions to showdown", () => {
    let state = qualifyingFixture();
    const visited = new Set([state.game.phase]);
    state = practiceBadugiReducer(state, { type: "START" });
    visited.add(state.game.phase);
    state = practiceBadugiReducer(state, { type: "ANTE" });
    visited.add(state.game.phase);
    state = practiceBadugiReducer(state, { type: "DEAL" });
    visited.add(state.game.phase);

    for (let step = 0; step < 600 && state.game.phase !== "SHOWDOWN"; step++) {
      const phase = state.game.phase;
      if (phase.startsWith("DRAW")) {
        // Stand pat with this explicitly qualifying fixture.
        state = practiceBadugiReducer(state, { type: "DRAW" });
        expect(evaluateBadugi(state.game.players[0].cards)?.isValidBadugi).toBe(true);
      } else if (phase === "DECLARE") {
        state = practiceBadugiReducer(state, { type: "DECLARE", declaration: "LOW" });
      } else if (phase.startsWith("BET")) {
        const hero = state.game.players.find(p => p.id === "p1")!;
        const call = Math.max(0, state.game.currentBet - hero.bet);
        state = practiceBadugiReducer(state, { type: "BET", amount: call });
      }
      visited.add(state.game.phase);
    }

    expect(state.game.phase).toBe("SHOWDOWN");
    expect([...visited]).toEqual(PRACTICE_PHASES);
    expect(state.handComplete).toBe(true);
    expect(state.game.players.filter(p => p.id !== "p1").every(p => p.status === "active")).toBe(true);
    expect(state.game.players.every(p => (p.chips ?? 0) >= 0)).toBe(true);
    expect(state.game.players.every(p => p.cards.length === 4)).toBe(true);
    expect(state.game.players.every(p => evaluateBadugi(p.cards)?.isValidBadugi)).toBe(true);
    expect(state.game.players.reduce((sum, p) => sum + p.chips, state.game.pot)).toBe(40_000);
  });

  it("rejects oversized draws and invalid wagers without changing the hand", () => {
    let state = createInitialPracticeBadugiState();
    state = practiceBadugiReducer(state, { type: "START" });
    state = practiceBadugiReducer(state, { type: "ANTE" });
    state = practiceBadugiReducer(state, { type: "DEAL" });
    const before = state.game;
    state = practiceBadugiReducer(state, { type: "SELECT_CARD", index: 0 });
    state = practiceBadugiReducer(state, { type: "SELECT_CARD", index: 1 });
    state = practiceBadugiReducer(state, { type: "SELECT_CARD", index: 2 });
    state = practiceBadugiReducer(state, { type: "SELECT_CARD", index: 3 });
    expect(state.selectedCardIndices).toHaveLength(3);
    expect(state.error).toContain("up to 3");
    expect(state.game.deck).toBe(before.deck);

    state = practiceBadugiReducer(state, { type: "RESTART" });
    state = practiceBadugiReducer(state, { type: "START" });
    state = practiceBadugiReducer(state, { type: "ANTE" });
    state = practiceBadugiReducer(state, { type: "DEAL" });
    state = practiceBadugiReducer(state, { type: "DRAW" });
    expect(state.game.phase).toBe("BET_1");
    const chipsBefore = state.game.players[0].chips;
    state = practiceBadugiReducer(state, { type: "BET", amount: chipsBefore + 1 });
    expect(state.game.players[0].chips).toBe(chipsBefore);
    expect(state.error).toContain("exceeds");
  });

  it("contains no account, persistence, websocket, or server effects", () => {
    const sources = [
      readFileSync("client/src/lib/practice/usePracticeBadugi.ts", "utf8"),
      readFileSync("client/src/pages/PracticeBadugiPage.tsx", "utf8"),
    ].join("\n");
    expect(sources).not.toMatch(/localStorage|sessionStorage|WebSocket|useTableRoom|tableSession|fetch\s*\(/);
    expect(sources).not.toMatch(/from\s+["'][^"']*(?:server|\/storage|\/persistence)[^"']*["']/);
  });

  it("substitutes a legal call for a bot fold without reviving an unpaid bet", () => {
    let state = createInitialPracticeBadugiState();
    state = practiceBadugiReducer(state, { type: "START" });
    state = practiceBadugiReducer(state, { type: "ANTE" });
    state = practiceBadugiReducer(state, { type: "DEAL" });
    const game: GameState = {
      ...state.game, phase: "BET_1", pot: 200, currentBet: 100,
      players: state.game.players.map(p => p.id === "bot-1"
        ? { ...p, bet: 20, chips: 100, totalBet: 45 }
        : p),
    };
    const attemptedFold: GameState = {
      ...game,
      players: game.players.map(p => p.id === "bot-1" ? { ...p, status: "folded", hasActed: true } : p),
    };
    const adjusted = normalizePracticeBotAction(game, "bot-1", {
      stateUpdates: { players: attemptedFold.players, pot: game.pot, currentBet: game.currentBet },
      message: "Maya folded",
    });
    const bot = adjusted.stateUpdates.players!.find(p => p.id === "bot-1")!;
    expect(bot.status).toBe("active");
    expect(bot.bet).toBe(100);
    expect(bot.chips).toBe(20);
    expect(bot.totalBet).toBe(45);
    expect(adjusted.stateUpdates.pot).toBe(280);
    expect(adjusted.message).toContain("calls 80");
  });

  it("auto-skips later betting for an all-in player, qualifies, and settles chips", () => {
    let state = qualifyingFixture();
    state = {
      ...state,
      game: {
        ...state.game,
        players: state.game.players.map(p => ({ ...p, chips: p.id === "p1" ? 35 : 1_000 })),
      },
    };
    state = practiceBadugiReducer(state, { type: "START" });
    state = practiceBadugiReducer(state, { type: "ANTE" });
    state = practiceBadugiReducer(state, { type: "DEAL" });
    state = practiceBadugiReducer(state, { type: "DRAW" });

    // Put the hero all-in facing a raise, while charging the corresponding
    // virtual chips to each bot so table stacks + pot remain conserved.
    const chargedBots = state.game.players.map(p => p.id === "p1"
      ? p
      : { ...p, chips: p.chips - 100, bet: 100, totalBet: (p.totalBet ?? 0) + 100 });
    state = {
      ...state,
      game: { ...state.game, phase: "BET_1", currentBet: 100, pot: state.game.pot + 300, players: chargedBots },
    };
    state = practiceBadugiReducer(state, { type: "BET", amount: state.game.players[0].chips });
    expect(state.game.players[0].chips).toBe(0);
    expect(state.game.phase).toBe("DRAW_2");

    for (let step = 0; step < 100 && state.game.phase !== "SHOWDOWN"; step++) {
      if (state.game.phase.startsWith("DRAW")) {
        state = practiceBadugiReducer(state, { type: "DRAW" });
      } else if (state.game.phase === "DECLARE") {
        expect(evaluateBadugi(state.game.players[0].cards)?.isValidBadugi).toBe(true);
        state = practiceBadugiReducer(state, { type: "DECLARE", declaration: "LOW" });
      } else if (state.game.phase.startsWith("BET")) {
        expect(state.game.activePlayerId).not.toBe("p1");
      }
      expect(evaluateBadugi(state.game.players[0].cards)?.isValidBadugi).toBe(true);
    }

    expect(state.game.phase).toBe("SHOWDOWN");
    expect(state.handComplete).toBe(true);
    expect(state.game.players.reduce((sum, p) => sum + p.chips, state.game.pot)).toBe(3_035);
  });

  it("deals a reproducible varied sample using the real shuffle and evaluator, with all 52 cards conserved", () => {
    let seed = 0x1bad091;
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(array => {
      const values = array as unknown as Uint32Array;
      for (let i = 0; i < values.length; i++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        values[i] = seed >>> 0;
      }
      return array;
    });
    const hands = new Set<string>();
    const suitCounts = new Set<number>();
    const qualifyingStrengths = new Set<string>();
    let repeatedRanks = 0;
    for (let i = 0; i < 1024; i++) {
      const initial = createInitialPracticeBadugiState();
      const state = practiceBadugiReducer({ ...initial, game: { ...initial.game, phase: "DEAL" } }, { type: "DEAL" });
      const allCards = [...state.game.deck, ...state.game.players.flatMap(p => p.cards)];
      expect(allCards).toHaveLength(52);
      expect(new Set(allCards.map(c => `${c.rank}:${c.suit}`)).size).toBe(52);
      const hero = state.game.players[0];
      const direct = BadugiMode.deal(initial.game.deck, initial.game.players, "p1");
      expect(hero.cards).toEqual(direct.players[0].cards);
      expect(hero.cards.every(c => !c.isHidden)).toBe(true);
      expect(state.game.players.slice(1).every(p => p.cards.every(c => c.isHidden))).toBe(true);
      hands.add(hero.cards.map(c => `${c.rank}:${c.suit}`).join(","));
      suitCounts.add(new Set(hero.cards.map(c => c.suit)).size);
      if (new Set(hero.cards.map(c => c.rank)).size < 4) repeatedRanks++;
      const score = evaluateBadugi(hero.cards);
      if (score?.isValidBadugi) qualifyingStrengths.add(score.badugiRankValues![0] <= 8 ? "low" : "high");
    }
    expect(hands.size).toBeGreaterThan(1000);
    expect([...suitCounts].sort()).toEqual([1, 2, 3, 4]);
    expect([...qualifyingStrengths].sort()).toEqual(["high", "low"]);
    expect(repeatedRanks).toBeGreaterThan(0);
  });

  it("draws the next real card even when it breaks qualification, without duplicating cards", () => {
    let state = qualifyingFixture();
    state = practiceBadugiReducer(state, { type: "START" });
    state = practiceBadugiReducer(state, { type: "ANTE" });
    state = practiceBadugiReducer(state, { type: "DEAL" });
    // Hero is sorted 4 spades, 3 clubs, 2 diamonds, A hearts. Drawing a
    // spade over the ace must be allowed, not filtered for a perfect Badugi.
    const index = state.game.deck.findIndex(c => c.suit === "spades");
    state.game.deck = [state.game.deck[index], ...state.game.deck.filter((_, i) => i !== index)];
    const nextCard = state.game.deck[0];
    state = practiceBadugiReducer(state, { type: "SELECT_CARD", index: 3 });
    state = practiceBadugiReducer(state, { type: "DRAW" });
    expect(state.error).toBeNull();
    expect(state.game.players[0].cards[3]).toEqual({ ...nextCard, isHidden: false });
    expect(evaluateBadugi(state.game.players[0].cards)?.isValidBadugi).toBe(false);
    const cards = [...state.game.deck, ...state.game.discardPile, ...state.game.players.flatMap(p => p.cards)];
    expect(cards).toHaveLength(52);
    expect(new Set(cards.map(c => `${c.rank}:${c.suit}`)).size).toBe(52);
  });

  it("rejects an invalid declaration but allows an unqualified hand to fold and finish", () => {
    let state = qualifyingFixture();
    state = practiceBadugiReducer(state, { type: "START" });
    state = practiceBadugiReducer(state, { type: "ANTE" });
    state = practiceBadugiReducer(state, { type: "DEAL" });
    // Swap existing cards between seats; the complete deck remains intact.
    const hero = state.game.players[0];
    const bot = state.game.players[1];
    const replacement = bot.cards.findIndex(c => c.suit === hero.cards[0].suit);
    [hero.cards[3], bot.cards[replacement]] = [bot.cards[replacement], hero.cards[3]];
    state.game = { ...state.game, phase: "DECLARE", players: state.game.players.map(p => ({ ...p, hasActed: false })) };
    state = practiceBadugiReducer(state, { type: "DECLARE", declaration: "LOW" });
    expect(state.error).toContain("qualifying");
    expect(state.game.phase).toBe("DECLARE");
    state = practiceBadugiReducer(state, { type: "FOLD" });
    expect(state.error).toBeNull();
    expect(state.game.phase).toBe("SHOWDOWN");
    expect(state.handComplete).toBe(true);
    expect(state.game.players[0].status).toBe("folded");
    expect(state.game.players[0].isWinner).not.toBe(true);
    expect(state.game.players.reduce((sum, p) => sum + p.chips, state.game.pot)).toBe(40_000);
  });

  it("restarts with a newly shuffled complete deck and reset virtual stacks", () => {
    const before = createInitialPracticeBadugiState();
    const after = practiceBadugiReducer(before, { type: "RESTART" });
    expect(after.game.phase).toBe("WAITING");
    expect(after.game.players.every(p => p.chips === 10_000 && !p.cards.length)).toBe(true);
    expect(after.game.deck).toHaveLength(52);
    expect(after.game.deck).not.toEqual(before.game.deck);
  });
  it("routes practice around global profile, billing, and analytics providers", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    expect(app).toMatch(/const isStandalonePractice = isPracticeBadugiPath\(location\)/);
    expect(app).toMatch(/if \(isStandalonePractice\) return;/);
    const isolatedBranch = app.slice(app.indexOf("if (isStandalonePractice) {"), app.indexOf("return (\n    <QueryClientProvider"));
    expect(isolatedBranch).not.toMatch(/ServerProfileProvider|WelcomeGate|ProfileManager|initAnalytics\(\)|billing\s*\.\s*initialize/);
  });
});