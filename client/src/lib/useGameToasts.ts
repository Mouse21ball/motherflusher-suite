import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import type { GamePhase } from "./poker/types";

interface ToastPlayer {
  id: string;
  name: string;
  chips: number;
  status: string;
  isWinner?: boolean;
  declaration?: string | null;
}

interface ToastState {
  phase: GamePhase;
  pot: number;
  players: ToastPlayer[];
}

export function useGameToasts(
  state: ToastState,
  myId: string,
  modeName: string
) {
  const { toast } = useToast();
  const prevPhaseRef = useRef<GamePhase>(state.phase);
  const prevChipsRef = useRef<number | null>(null);
  const handCountRef = useRef(0);

  const me = state.players.find(p => p.id === myId);
  const myChips = me?.chips ?? 0;

  useEffect(() => {
    if (prevChipsRef.current === null) {
      prevChipsRef.current = myChips;
    }
  }, [myChips]);

  useEffect(() => {
    const prevChips = prevChipsRef.current;
    if (prevChips !== null && prevChips === 0 && myChips === 1000) {
      toast({
        title: "Rebuy complete",
        description: "Back in with $1,000.",
        duration: 3000,
      });
    }
    prevChipsRef.current = myChips;
  }, [myChips, toast]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    const curr = state.phase;
    prevPhaseRef.current = curr;

    if (prev === curr) return;

    if (prev === "SHOWDOWN" && curr === "ANTE") {
      handCountRef.current++;

      const count = handCountRef.current;
      if (count === 10 || count === 25 || count === 50) {
        toast({
          title: `${count} hands played`,
          description: `${modeName} session.`,
          duration: 3000,
        });
      }
    }

    
  }, [state.phase, state.pot, myChips, me, toast, modeName]);
}
