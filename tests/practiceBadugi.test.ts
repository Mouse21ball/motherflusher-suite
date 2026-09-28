import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GameState } from "@shared/gameTypes";
import { evaluateBadugi } from "@shared/modes/badugi";
import {
  createInitialPracticeBadugiState,
  normalizePracticeBotAction,
  PRACTICE_PHASES,
  practiceBadugiReducer,
} from "../client/src/lib/practice/usePracticeBadugi";

describe("client-only Badugi practice hand", () => {
  it("progresses through every canonical phase with bot decisions to showdown", () => {
    let state = createInitialPracticeBadugiState();
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
        // Exercise real discard selections when available, while respecting
        // this draw's selection limit.
        const max = phase === "DRAW_1" ? 3 : phase === "DRAW_2" ? 2 : 1;
        const hero = state.game.players.find(p => p.id === "p1")!;
        const chosen = hero.cards.slice(0, max);
        for (const card of chosen) {
          const index = hero.cards.indexOf(card);
          state = practiceBadugiReducer(state, { type: "SELECT_CARD", index });
        }
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
    let state = createInitialPracticeBadugiState();
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

  it("routes practice around global profile, billing, and analytics providers", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    expect(app).toMatch(/const isStandalonePractice = isPracticeBadugiPath\(location\)/);
    expect(app).toMatch(/if \(isStandalonePractice\) return;/);
    const isolatedBranch = app.slice(app.indexOf("if (isStandalonePractice) {"), app.indexOf("return (\n    <QueryClientProvider"));
    expect(isolatedBranch).not.toMatch(/ServerProfileProvider|WelcomeGate|ProfileManager|initAnalytics\(\)|billing\s*\.\s*initialize/);
  });
});