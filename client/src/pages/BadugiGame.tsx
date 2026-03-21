import { useState, useEffect } from "react";
import { useGameEngine } from "@/lib/poker/engine/useGameEngine";
import { useServerBadugi } from "@/lib/poker/engine/useServerGame";
import { BadugiMode } from "@/lib/poker/modes/badugi";
import { FEATURES } from "@/lib/featureFlags";
import { generateTableCode } from "@/lib/tableSession";
import { BadugiTable } from "@/components/game/BadugiTable";
import { ActionControls } from "@/components/game/Controls";
import { ChatBox } from "@/components/game/ChatBox";
import { GameHeader, MODE_INFO } from "@/components/game/GameHeader";
import { ModeIntro, MODE_INTROS } from "@/components/game/ModeIntro";
import { usePhaseSounds } from "@/lib/usePhaseSounds";
import { getPhaseHint } from "@/lib/phaseHints";
import { useGameToasts } from "@/lib/useGameToasts";
import { saveChips } from "@/lib/persistence";
import { trackModePlay } from "@/lib/analytics";
import type { GameState } from "@/lib/poker/types";

// ─── Shared UI layer ──────────────────────────────────────────────────────────
// Accepts state + handleAction from either engine. All rendering lives here.

interface BadugiUIProps {
  state: GameState;
  handleAction: (action: string, payload?: unknown) => void;
  myId: string;
}

function BadugiUI({ state, handleAction, myId }: BadugiUIProps) {
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);

  const me = state.players.find(p => p.id === myId);
  usePhaseSounds(state.phase);
  useGameToasts(state, myId, "Badugi");

  useEffect(() => {
    setSelectedCardIndices([]);
  }, [state.phase]);

  const isDrawPhase = state.phase === 'DRAW_1' || state.phase === 'DRAW_2' || state.phase === 'DRAW_3';

  const handleCardClick = (index: number) => {
    if (!isDrawPhase) return;
    setSelectedCardIndices(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      let maxCards = 1;
      if (state.phase === 'DRAW_1') maxCards = 3;
      if (state.phase === 'DRAW_2') maxCards = 2;
      if (prev.length < maxCards) return [...prev, index];
      return prev;
    });
  };

  const handleControlAction = (action: string, amount?: number | unknown) => {
    if (action === 'draw') {
      handleAction(action, selectedCardIndices);
    } else {
      handleAction(action, amount);
    }
  };

  const handleSendMessage = (text: string) => {
    handleAction('chat', text);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      <ModeIntro modeId="badugi" {...MODE_INTROS.badugi} />
      <GameHeader
        mode={MODE_INFO.badugi}
        modeId="badugi"
        chips={me?.chips || 0}
        phase={state.phase}
        pot={state.pot}
        onForfeit={() => { if (me) saveChips('badugi', me.chips); }}
      />

      <main className="flex-1 relative flex flex-col justify-center items-center overflow-hidden pb-44">
        <BadugiTable
          gameState={state}
          myId={myId}
          selectedCardIndices={selectedCardIndices}
          onCardClick={handleCardClick}
          selectableCards={isDrawPhase}
          heroCardClassName="w-[60px] h-20 sm:w-20 sm:h-[120px]"
        />
      </main>

      <div className="fixed bottom-0 left-0 w-full z-40 pointer-events-none pb-4 sm:pb-6 flex flex-col items-center justify-end">
        <div className="pointer-events-auto w-full max-w-md px-2">
          <ActionControls
            phase={state.phase}
            currentBet={state.currentBet}
            myBet={me?.bet || 0}
            pot={state.pot}
            chips={me?.chips || 0}
            onAction={handleControlAction}
            isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'}
            selectedCardsCount={selectedCardIndices.length}
            phaseHint={getPhaseHint('badugi', state.phase)}
          />
        </div>
      </div>

      <ChatBox
        messages={state.chatMessages}
        myId={myId}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}

// ─── Engine-specific wrappers ─────────────────────────────────────────────────
// Each calls exactly one hook so neither path carries unused hook state or
// opens spurious WebSocket connections when the other path is active.

const MY_ID = 'p1';

function BadugiClientGame() {
  useEffect(() => { trackModePlay("badugi"); }, []);
  const { state, handleAction } = useGameEngine(BadugiMode, MY_ID);
  return <BadugiUI state={state} handleAction={handleAction} myId={MY_ID} />;
}

function BadugiServerGame() {
  // Resolve tableId once on mount:
  //   - If URL has ?t=XXXXXX, use it (player arrived via share link or /join/:code redirect).
  //   - Otherwise generate a fresh 6-char code and write it into the address bar so
  //     the creator can share the URL directly — no extra UI needed.
  const [tableId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('t')?.toUpperCase() ?? '';
    if (/^[A-Z0-9]{6}$/.test(fromUrl)) return fromUrl;
    const newCode = generateTableCode();
    window.history.replaceState(null, '', `/badugi?t=${newCode}`);
    return newCode;
  });

  useEffect(() => { trackModePlay("badugi"); }, []);
  const { state, handleAction } = useServerBadugi(MY_ID, tableId);
  return <BadugiUI state={state} handleAction={handleAction} myId={MY_ID} />;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────
// Two ways to activate the server-authoritative path:
//   1. Compile-time: FEATURES.SERVER_AUTHORITATIVE_BADUGI = true  (broad rollout)
//   2. Runtime env:  VITE_BADUGI_ALPHA=true  (zero-code alpha enable via .env.local)
//
// ROLLBACK: remove VITE_BADUGI_ALPHA from .env.local and restart — instant.

const isServerAuthoritative =
  FEATURES.SERVER_AUTHORITATIVE_BADUGI ||
  import.meta.env.VITE_BADUGI_ALPHA === 'true';

export default function BadugiGame() {
  return isServerAuthoritative
    ? <BadugiServerGame />
    : <BadugiClientGame />;
}
