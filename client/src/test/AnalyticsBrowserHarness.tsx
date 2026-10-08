import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { initAnalytics } from "@/lib/analytics";
import { useHandAnalytics, useLadyLuckAnalytics } from "@/lib/useHandAnalytics";
import type { PokerAnalyticsFrame } from "@/lib/handAnalytics";
import type { LadyLuckState } from "@shared/modes/ladyluck";
import { ServerProfileProvider } from "@/lib/useServerProfile";
import { DailyBonusCalendarModal } from "@/components/DailyBonusCalendarModal";
import { HourlyBonusModal } from "@/components/HourlyBonusModal";
import { StarterPackModal } from "@/components/StarterPackModal";
import "@/index.css";

function Harness() {
  const [mode, setMode] = useState("badugi");
  const [heroId, setHeroId] = useState("hero");
  const [poker, setPoker] = useState<PokerAnalyticsFrame>({
    handId: 1, phase: "WAITING", players: [{ id: "hero", chips: 1000, status: "active", cards: [] }],
  });
  const [race, setRace] = useState<LadyLuckState>({
    raceId: "fixture-race", phase: "LOBBY", roomType: "pony",
    players: [{ id: "hero", name: "Fixture", presence: "human", chips: 1000, suit: null, wager: 0, wagered: false, seatIndex: 0 }],
    positions: { spades: 0, hearts: 0, diamonds: 0, clubs: 0 },
    flippedCards: [], currentCard: null, winner: null, pot: 0, sideBets: [],
    dealerIndex: 0, currentPickIndex: 0, claimedSuits: [],
    startingIn: null, resultsTimeLeft: null, betTimeLeft: null, spectatorCount: 0,
  });
  useHandAnalytics(poker, heroId, "POKER-FIXTURE", mode);
  useLadyLuckAnalytics(race, heroId, "RACE-FIXTURE");
  useEffect(() => initAnalytics(), []);
  return <main>
    <h1>Authoritative snapshot analytics fixture</h1>
    <select aria-label="Poker mode" value={mode} onChange={e => setMode(e.target.value)}>
      {["badugi", "flushed_up", "box_chevy"].map(m => <option key={m}>{m}</option>)}
    </select>
    <button onClick={() => setPoker(s => ({ ...s, phase: "BET_1", players: [{ ...s.players[0], cards: [{}, {}, {}, {}] }] }))}>Deal</button>
    <button onClick={() => setPoker(s => ({ ...s, players: [...s.players] }))}>Repeat snapshot</button>
    <button onClick={() => setPoker(s => ({ ...s, players: [{ ...s.players[0], status: "folded" }] }))}>Fold</button>
    <button onClick={() => setPoker(s => ({ ...s, phase: "SHOWDOWN", players: [{ ...s.players[0], isWinner: s.players[0].status !== "folded" }] }))}>Showdown</button>
    <button onClick={() => setPoker(s => ({ ...s, handId: (s.handId ?? 0) + 1, phase: "DEAL", players: [{ ...s.players[0], status: "active", isWinner: false, cards: [{}, {}, {}, {}] }] }))}>Next hand</button>
    <button onClick={() => setHeroId("viewer")}>Spectate</button>
    <button onClick={() => setRace(s => ({ ...s, phase: "RACE", players: [{ ...s.players[0], wagered: true, wager: 100, suit: "spades" }] }))}>Race start</button>
    <button onClick={() => setRace(s => ({ ...s, phase: "RESULTS", winner: "spades", players: [{ ...s.players[0], wagered: false, wager: 0, suit: null }] }))}>Race result</button>
    <button onClick={() => setRace(s => ({ ...s }))}>Repeat race</button>
  </main>;
}
function RewardsHarness() {
  const [modal, setModal] = useState("");
  useEffect(() => initAnalytics(), []);
  return <main>
    <button onClick={() => setModal("daily")}>Open daily</button>
    <button onClick={() => setModal("hourly")}>Open hourly</button>
    <button onClick={() => setModal("starter")}>Open starter</button>
    <DailyBonusCalendarModal open={modal === "daily"} onClose={() => setModal("")} onClaimed={() => {}} />
    <HourlyBonusModal open={modal === "hourly"} onClose={() => setModal("")} />
    <StarterPackModal open={modal === "starter"} onClose={() => setModal("")} />
  </main>;
}
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("bonus")
    ? <ServerProfileProvider><RewardsHarness /></ServerProfileProvider>
    : <Harness />,
);
