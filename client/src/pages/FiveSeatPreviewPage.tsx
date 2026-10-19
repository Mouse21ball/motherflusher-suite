import { useState } from "react";
import { BadugiTable } from "@/components/badugi/BadugiTable";
import { BadugiActionBar } from "@/components/badugi/BadugiActionBar";
import type { GameState } from "@/lib/poker/types";

/**
 * Detroit 2026-10-19: Dev-only 5-seat Badugi layout preview.
 *
 * Renders the ACTUAL BadugiTable component with mock 5-player state.
 * No WebSocket, no database, no real game — pure visual verification.
 *
 * Access: /dev/5seat?phase=draw2 (draw2, bet2, showdown supported)
 * This route is gated by import.meta.env.DEV and never ships to production.
 */

function mkCard(rank: string, suit: string, hidden = false) {
  return { rank, suit, isHidden: hidden } as any;
}

function buildMockState(phase: string): GameState {
  const isShowdown = phase === "showdown";
  return {
    phase: phase.toUpperCase(),
    pot: isShowdown ? 5200 : 2450,
    currentBet: 100,
    minBet: 50,
    activePlayerId: isShowdown ? "" : "p3",
    dealerSeat: 1,
    activeSeat: 3,
    players: [
      {
        id: "hero1", name: "OG PLAYER", isHero: true,
        chips: 125430, bet: isShowdown ? 0 : 100,
        folded: false, isWinner: isShowdown,
        drewCount: null,
        cards: [
          mkCard("A", "spades"), mkCard("4", "hearts"),
          mkCard("7", "clubs"), mkCard("9", "diamonds"),
        ],
      },
      {
        id: "p2", name: "Razor", isHero: false,
        chips: 3420, bet: isShowdown ? 0 : 100,
        folded: false, isWinner: false,
        drewCount: 1,
        cards: [
          mkCard("2", "spades", !isShowdown), mkCard("5", "hearts", !isShowdown),
          mkCard("8", "clubs", !isShowdown), mkCard("J", "diamonds", !isShowdown),
        ],
      },
      {
        id: "p3", name: "Ghost", isHero: false,
        chips: 2180, bet: isShowdown ? 0 : 100,
        folded: false, isWinner: false,
        drewCount: 2,
        cards: [
          mkCard("3", "spades", !isShowdown), mkCard("6", "hearts", !isShowdown),
          mkCard("9", "clubs", !isShowdown), mkCard("K", "diamonds", !isShowdown),
        ],
      },
      {
        id: "p4", name: "QueenB", isHero: false,
        chips: 5720, bet: isShowdown ? 0 : 100,
        folded: false, isWinner: false,
        drewCount: 0,
        cards: [
          mkCard("A", "hearts", !isShowdown), mkCard("2", "diamonds", !isShowdown),
          mkCard("4", "clubs", !isShowdown), mkCard("7", "spades", !isShowdown),
        ],
      },
      {
        // Long username to test truncation/wrapping
        id: "p5", name: "SlimShadyFromTheWestSide", isHero: false,
        chips: 3960, bet: 0,
        folded: true, isWinner: false,
        drewCount: null,
        cards: [
          mkCard("5", "spades", true), mkCard("8", "hearts", true),
          mkCard("Q", "clubs", true), mkCard("K", "spades", true),
        ],
      },
    ],
    celebration: { active: false, winnerName: "", amount: 0, cards: [], handLabel: "" },
    rake: { active: false, winnerIndex: -1, amount: 0 },
  } as unknown as GameState;
}

export default function FiveSeatPreviewPage() {
  const params = new URLSearchParams(window.location.search);
  const phase = params.get("phase") || "draw2";
  const [selected, setSelected] = useState<number[]>([1, 3]);

  const state = buildMockState(phase);
  const isDrawPhase = phase.startsWith("draw");
  const isShowdown = phase === "showdown";
  const noop = () => {};

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#1a0f2e", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Dev banner — only visible in preview */}
      <div style={{
        background: "rgba(255,180,0,0.9)", color: "#000",
        textAlign: "center", fontSize: 12, padding: "4px",
        fontWeight: 700, flexShrink: 0,
      }}>
        DEV PREVIEW — 5-seat layout ({phase}) — not a real game
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <BadugiTable
          state={state}
          myId="hero1"
          selectedCardIndices={isDrawPhase ? selected : []}
          onCardClick={(i) => setSelected(s =>
            s.includes(i) ? s.filter(x => x !== i) : [...s, i]
          )}
          isDrawPhase={isDrawPhase}
          heroAvatarSrc={null}
          heroFrameSrc={null}
        />
      </div>
      {/* Detroit 2026-10-19: actual phase-specific action bar — verify complete screen */}
      {!isShowdown && (
        <div style={{ flexShrink: 0 }}>
          <BadugiActionBar
            phase={phase.toUpperCase()}
            isDrawPhase={isDrawPhase}
            selectedCount={isDrawPhase ? selected.length : 0}
            drawLimit={3}
            isMyTurn={true}
            chips={125430}
            currentBet={100}
            myBet={100}
            pot={2450}
            minBet={50}
            ante={25}
            humanCount={5}
            openSeatsCount={0}
            activeCount={4}
            isClubTable={false}
            locked={false}
            myDeclaration={null}
            myHasActed={false}
            onStandPat={noop}
            onDraw={noop}
            onAction={noop}
            onRebuy={noop}
          />
        </div>
      )}
    </div>
  );
}
