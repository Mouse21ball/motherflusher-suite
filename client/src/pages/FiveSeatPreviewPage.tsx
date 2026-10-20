import { useState } from "react";
import { BadugiTable } from "@/components/badugi/BadugiTable";
import { BadugiActionBar } from "@/components/badugi/BadugiActionBar";
import { evaluateBadugi } from "@shared/modes/badugi";
import type { GameState } from "@/lib/poker/types";
import type { CardType } from "@shared/gameTypes";

/**
 * Detroit 2026-10-19: Dev-only 5-seat Badugi layout preview.
 *
 * Renders the ACTUAL BadugiTable + BadugiActionBar with mock 5-player state.
 * No WebSocket, no database, no real game — pure visual verification.
 *
 * Privacy: folded players use status='folded' (matching production mapping).
 * Their cards stay isHidden=true and are excluded from the showdown overlay.
 *
 * Winner: computed via the real evaluateBadugi(), never hard-coded.
 *
 * Access: /dev/5seat?phase=draw2 (draw2, bet2, showdown supported)
 * This route is gated by import.meta.env.DEV and never ships to production.
 */

function mkCard(rank: string, suit: string, hidden = false) {
  return { rank, suit, isHidden: hidden } as any;
}

interface MockPlayer {
  id: string;
  name: string;
  isHero: boolean;
  chips: number;
  bet: number;
  status: string;
  drewCount: number | null;
  cards: any[];
}

function buildMockPlayers(isShowdown: boolean): MockPlayer[] {
  return [
    {
      id: "hero1", name: "OG PLAYER", isHero: true,
      chips: 125430, bet: isShowdown ? 0 : 100,
      status: "active", drewCount: null,
      cards: [
        mkCard("A", "spades"), mkCard("4", "hearts"),
        mkCard("7", "clubs"), mkCard("9", "diamonds"),
      ],
    },
    {
      id: "p2", name: "Razor", isHero: false,
      chips: 3420, bet: isShowdown ? 0 : 100,
      status: "active", drewCount: 1,
      cards: [
        mkCard("2", "spades", !isShowdown), mkCard("5", "hearts", !isShowdown),
        mkCard("8", "clubs", !isShowdown), mkCard("J", "diamonds", !isShowdown),
      ],
    },
    {
      id: "p3", name: "Ghost", isHero: false,
      chips: 2180, bet: isShowdown ? 0 : 100,
      status: "active", drewCount: 2,
      cards: [
        mkCard("3", "spades", !isShowdown), mkCard("6", "hearts", !isShowdown),
        mkCard("9", "clubs", !isShowdown), mkCard("K", "diamonds", !isShowdown),
      ],
    },
    {
      id: "p4", name: "QueenB", isHero: false,
      chips: 5720, bet: isShowdown ? 0 : 100,
      status: "active", drewCount: 0,
      cards: [
        mkCard("A", "hearts", !isShowdown), mkCard("2", "diamonds", !isShowdown),
        mkCard("4", "clubs", !isShowdown), mkCard("7", "spades", !isShowdown),
      ],
    },
    {
      // Detroit 2026-10-19: folded player — status='folded' (not boolean).
      // Cards stay hidden. Never revealed in overlay.
      id: "p5", name: "SlimShadyFromTheWestSide", isHero: false,
      chips: 3960, bet: 0,
      status: "folded", drewCount: null,
      cards: [
        mkCard("5", "spades", true), mkCard("8", "hearts", true),
        mkCard("Q", "clubs", true), mkCard("K", "spades", true),
      ],
    },
  ];
}

/**
 * Detroit 2026-10-19: compute winner via real Badugi rules.
 * Lowest badugi wins; compare highest card first, then next lowest.
 * Only active (non-folded) players are eligible.
 */
function computeWinner(players: MockPlayer[]): string | null {
  const active = players.filter(p => p.status === "active");
  let best: MockPlayer | null = null;
  let bestValues: number[] | null = null;

  for (const p of active) {
    const cards = p.cards as CardType[];
    const evalResult = evaluateBadugi(cards);
    if (!evalResult?.isValidBadugi) continue;
    // badugiRankValues is sorted desc; lower values win.
    // Compare from highest card down: first difference decides.
    const values = evalResult.badugiRankValues;
    if (!best || !bestValues) {
      best = p; bestValues = values;
      continue;
    }
    for (let i = 0; i < values.length; i++) {
      if (values[i] < bestValues[i]) { best = p; bestValues = values; break; }
      if (values[i] > bestValues[i]) break;
    }
  }
  return best?.id ?? null;
}

function buildMockState(phase: string): GameState {
  const isShowdown = phase === "showdown";
  const players = buildMockPlayers(isShowdown);
  const winnerId = isShowdown ? computeWinner(players) : null;
  // Detroit 2026-10-19: engine phase format (DRAW_2/BET_2) — the table's
  // mapPhase falls back to 'ante' for anything else, which made the status
  // text wrong ("Ante up" during draw/bet phases).
  const enginePhase = phase === "draw2" ? "DRAW_2" : phase === "bet2" ? "BET_2" : "SHOWDOWN";

  return {
    phase: enginePhase,
    pot: isShowdown ? 5200 : 2450,
    currentBet: 100,
    minBet: 50,
    activePlayerId: isShowdown ? "" : "p3",
    dealerSeat: 1,
    activeSeat: 3,
    players: players.map(p => ({
      ...p,
      // isWinner set from real evaluation, not hard-coded
      isWinner: p.id === winnerId,
    })),
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
  const barPhase = phase === "draw2" ? "DRAW_2" : phase === "bet2" ? "BET_2" : phase.toUpperCase();
  // ?beat=winner / ?beat=all pins the showdown beat for screenshots
  const beatParam = params.get("beat");
  const beatOverride = beatParam === "winner" || beatParam === "all" ? beatParam : undefined;

  return (
    <div style={{
      // Detroit 2026-10-19: dvh accounts for mobile browser chrome.
      // Action bar gets reserved space; table flexes into the remainder.
      width: "100vw", height: "100dvh",
      background: "#1a0f2e", overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      {/* Dev banner — only visible in preview */}
      <div style={{
        background: "rgba(255,180,0,0.9)", color: "#000",
        textAlign: "center", fontSize: 12, padding: "4px",
        fontWeight: 700, flexShrink: 0,
      }}>
        DEV PREVIEW — 5-seat layout ({phase}) — not a real game
      </div>
      <div style={{ flex: "1 1 0", position: "relative", minHeight: 0, overflow: "hidden" }}>
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
          showdownBeatOverride={beatOverride}
        />
      </div>
      {/* Detroit 2026-10-19: action bar reserved — flex-shrink 0, always visible */}
      {!isShowdown && (
        <div style={{ flexShrink: 0, minHeight: "110px" }}>
          <BadugiActionBar
            phase={barPhase}
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
