import { describe, expect, it } from "vitest";
import { PokerHandObserver, LadyLuckHandObserver, bustAnalyticsTier, type PokerAnalyticsFrame } from "../client/src/lib/handAnalytics";
import type { LadyLuckState } from "../shared/modes/ladyluck";

function frame(phase = "DEAL", handId = 1): PokerAnalyticsFrame {
  return {
    phase, handId, players: [
      { id: "hero", chips: 900, status: "active", cards: [{}, {}] },
      { id: "bot", chips: 900, status: "active", cards: [{}, {}] },
    ],
  };
}
describe.each(["badugi", "flushed_up", "box_chevy"] as const)("%s hand observation", mode => {
  it("emits once per hand and player, including when the transient DEAL is skipped", () => {
    const observer = new PokerHandObserver();
    expect(observer.observe(frame("ANTE"), "hero", "TABLE1", mode)).toEqual([]);
    expect(observer.observe(frame("BET_1"), "hero", "TABLE1", mode).map(e => e.type)).toEqual(["hand_started"]);
    expect(observer.observe(frame("BET_1"), "hero", "TABLE1", mode)).toEqual([]);
    expect(observer.observe(frame("DEAL", 2), "hero", "TABLE1", mode)[0].props.hand_id).toBe("2");
    expect(observer.observe(frame("DEAL", 2), "bot", "TABLE1", mode)).toHaveLength(1);
  });
  it("uses authoritative winner flags, and suppresses duplicate showdown frames", () => {
    const observer = new PokerHandObserver();
    observer.observe(frame(), "hero", "TABLE1", mode);
    const showdown = frame("SHOWDOWN");
    showdown.players[0].isWinner = true;
    expect(observer.observe(showdown, "hero", "TABLE1", mode)[0]).toMatchObject({ type: "hand_completed", props: { mode, outcome: "win" } });
    expect(observer.observe(showdown, "hero", "TABLE1", mode)).toEqual([]);
  });
  it("logs a fold immediately without requiring showdown, then does not log it twice", () => {
    const observer = new PokerHandObserver();
    observer.observe(frame(), "hero", "TABLE1", mode);
    const folded = frame("BET_2");
    folded.players[0].status = "folded";
    expect(observer.observe(folded, "hero", "TABLE1", mode)[0].props.outcome).toBe("fold");
    folded.phase = "SHOWDOWN";
    expect(observer.observe(folded, "hero", "TABLE1", mode)).toEqual([]);
  });
  it("excludes watchers and undealt or sitting-out players, but includes all-in players", () => {
    const observer = new PokerHandObserver();
    expect(observer.observe(frame(), "__spectator__", "TABLE1", mode)).toEqual([]);
    const waiting = frame();
    waiting.players[0].cards = [];
    expect(observer.observe(waiting, "hero", "TABLE1", mode)).toEqual([]);
    waiting.players[0].cards = [{}];
    waiting.players[0].status = "sitting_out";
    expect(observer.observe(waiting, "hero", "TABLE1", mode)).toEqual([]);
    waiting.players[0].status = "active"; waiting.players[0].chips = 0;
    expect(observer.observe(waiting, "hero", "TABLE1", mode)).toHaveLength(1);
  });
  it("labels a non-winning completed hand as loss and retains rollover metadata", () => {
    const observer = new PokerHandObserver();
    const showdown = frame("SHOWDOWN");
    showdown.isRollover = true;
    expect(observer.observe(showdown, "hero", "TABLE1", mode)[0].props).toMatchObject({ outcome: "loss", rollover: true });
  });
});
it("classifies all five bust analytics tiers without changing offer UI", () => {
  expect(bustAnalyticsTier(1, 1, true)).toBe(1);
  expect(bustAnalyticsTier(5, 2, false)).toBe(2);
  expect(bustAnalyticsTier(5, 2, true)).toBe(3);
  expect(bustAnalyticsTier(5, 1, true)).toBe(4);
  expect(bustAnalyticsTier(5, 3, false)).toBe(5);
});

function race(): LadyLuckState {
  return {
    raceId: "race-1", phase: "RACE", roomType: "pony",
    players: [{ id: "hero", name: "Test", presence: "human", chips: 900, suit: "spades", wager: 100, wagered: true, seatIndex: 0 }],
    positions: { spades: 0, hearts: 0, diamonds: 0, clubs: 0 },
    flippedCards: [], currentCard: null, winner: null, pot: 100, sideBets: [],
    dealerIndex: 0, currentPickIndex: 0, claimedSuits: ["spades"],
    startingIn: null, resultsTimeLeft: null, betTimeLeft: null, spectatorCount: 0,
  };
}
describe("Lady Luck observations", () => {
  it("joins once, records an actual paid race, and retains the selected suit after settlement resets wagers", () => {
    const observer = new LadyLuckHandObserver();
    const state = race();
    expect(observer.observe(state, "hero", "LLTEST")).toMatchObject({ joined: true, events: [{ type: "hand_started" }] });
    expect(observer.observe(state, "hero", "LLTEST").joined).toBe(false);
    state.phase = "RESULTS"; state.winner = "spades";
    state.players[0].wager = 0; state.players[0].wagered = false; state.players[0].suit = null;
    expect(observer.observe(state, "hero", "LLTEST").events[0]).toMatchObject({ type: "hand_completed", props: { outcome: "win", mode: "lady_luck", hand_id: "race-1" } });
  });
  it("excludes spectators, bots and zero wagers from activation", () => {
    const observer = new LadyLuckHandObserver();
    const state = race();
    expect(observer.observe(state, "spectator", "LLTEST")).toEqual({ joined: false, events: [] });
    state.players[0].presence = "bot";
    expect(observer.observe(state, "hero", "LLTEST")).toEqual({ joined: false, events: [] });
    state.players[0].presence = "human"; state.players[0].wager = 0;
    expect(observer.observe(state, "hero", "LLTEST").events).toEqual([]);
  });
  it("records a losing race and a real table rejoin", () => {
    const observer = new LadyLuckHandObserver();
    const state = race();
    observer.observe(state, "hero", "LLTEST");
    state.phase = "RESULTS"; state.winner = "hearts";
    expect(observer.observe(state, "hero", "LLTEST").events[0].props.outcome).toBe("loss");
    observer.observe(null, "hero", null);
    expect(observer.observe(state, "hero", "LLTEST").joined).toBe(true);
  });
});
