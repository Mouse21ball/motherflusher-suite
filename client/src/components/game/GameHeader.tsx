import { useState } from "react";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { BookOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { HandHistory } from "./HandHistory";
import { StatsView } from "./StatsView";
import type { GamePhase } from "@/lib/poker/types";

export interface ModeInfo {
  abbrev: string;
  name: string;
  accentClass: string;
  borderClass: string;
  rules: RulesSection[];
}

interface RulesSection {
  heading: string;
  items: string[];
}

interface GameHeaderProps {
  mode: ModeInfo;
  modeId: string;
  chips: number;
  phase?: GamePhase;
  pot?: number;
  onForfeit?: () => void;
}

const MID_HAND_PHASES = new Set<GamePhase>([
  'ANTE', 'DEAL',
  'DRAW', 'DRAW_1', 'DRAW_2', 'DRAW_3',
  'BET_1', 'BET_2', 'BET_3', 'BET_4', 'BET_5', 'BET_6', 'BET_7', 'BET_8',
  'HIT_1', 'HIT_2', 'HIT_3', 'HIT_4', 'HIT_5', 'HIT_6', 'HIT_7', 'HIT_8',
  'DECLARE', 'DECLARE_AND_BET',
  'REVEAL_TOP_ROW', 'REVEAL_SECOND_ROW', 'REVEAL_LOWER_CENTER', 'REVEAL_FACTOR_CARD',
]);

export const MODE_INFO: Record<string, ModeInfo> = {
  swing: {
    abbrev: "MF",
    name: "Mother Flusher",
    accentClass: "text-blue-400",
    borderClass: "border-blue-500/30",
    rules: [
      {
        heading: "Setup",
        items: [
          "5 hole cards dealt to each player",
          "15-card community board: 5 pairs across two sides + 5 center cards revealed in stages",
        ],
      },
      {
        heading: "Play",
        items: [
          "Draw phase: discard up to 2 cards and replace them",
          "Community cards reveal in stages with a betting round after each",
          "After final reveal, declare HIGH, LOW, or SWING",
        ],
      },
      {
        heading: "Showdown",
        items: [
          "HIGH wins with the best 5-card poker hand",
          "LOW wins with the best low suits score (highest same-suit total)",
          "SWING must win BOTH sides to scoop the entire pot; failure forfeits",
          "If both HIGH and LOW qualify, pot splits (odd chip to HIGH)",
          "If no qualifiers on a side, that share rolls over",
        ],
      },
    ],
  },
  badugi: {
    abbrev: "B",
    name: "Badugi",
    accentClass: "text-emerald-400",
    borderClass: "border-emerald-500/30",
    rules: [
      {
        heading: "Goal",
        items: [
          "Make a valid Badugi: 4 cards that are ALL different ranks AND ALL different suits",
          "Ace is low (best for LOW)",
        ],
      },
      {
        heading: "Play",
        items: [
          "4 cards dealt face-down",
          "3 draw rounds: discard up to 3 / 2 / 1 cards",
          "After draws, declare HIGH (highest badugi), LOW (lowest badugi), or FOLD",
          "One final betting round after declarations",
        ],
      },
      {
        heading: "Showdown",
        items: [
          "Only valid badugis qualify (4 unique ranks + 4 unique suits)",
          "HIGH wins: K-high beats Q-high, etc.",
          "LOW wins: A-2-3-4 is the best possible low",
          "Pot splits between HIGH and LOW winners; odd chip to HIGH",
          "If no valid badugi exists on either side, pot rolls over",
        ],
      },
    ],
  },
  dead7: {
    abbrev: "D7",
    name: "Dead 7",
    accentClass: "text-red-400",
    borderClass: "border-red-500/30",
    rules: [
      {
        heading: "The Twist",
        items: [
          "Any 7 in your hand kills it instantly (\"dead\")",
          "You MUST discard all 7s when you can",
        ],
      },
      {
        heading: "Play",
        items: [
          "4 cards dealt face-down",
          "3 draw rounds: discard up to 3 / 2 / 1 cards",
          "After draws, declare HIGH, LOW, or FOLD",
          "HIGH needs all 4 cards valued 8 or higher (best: K-Q-J-10)",
          "LOW needs all 4 cards valued 6 or lower (best: A-2-3-4)",
        ],
      },
      {
        heading: "Scoops",
        items: [
          "A flush (all same suit) scoops the entire pot",
          "If no flush, a badugi (all different suits) scoops",
          "If neither, normal hi-lo split",
          "No qualifier on either side means pot rolls over",
        ],
      },
    ],
  },
  fifteen35: {
    abbrev: "15",
    name: "15 / 35",
    accentClass: "text-amber-400",
    borderClass: "border-amber-500/30",
    rules: [
      {
        heading: "Card Values",
        items: [
          "J, Q, K = 0.5 each",
          "Ace = 1 or 11 (whichever is best for you)",
          "2 through 10 = face value",
        ],
      },
      {
        heading: "Play",
        items: [
          "2 cards dealt: 1 face-up, 1 face-down",
          "Each round: Hit (get another face-up card), Stay, or Fold",
          "Over 35 = BUST (you're out)",
          "Betting rounds between each hit round",
        ],
      },
      {
        heading: "Qualifying & Payout",
        items: [
          "LOW qualifies at 13-15 (15 is best)",
          "HIGH qualifies at 33-35 (35 is best)",
          "No declaration needed — hand auto-reads at showdown",
          "Both sides qualify: pot splits. One side only: that side wins all",
          "No qualifiers on either side: pot rolls over",
        ],
      },
    ],
  },
  suitspoker: {
    abbrev: "SP",
    name: "Suits & Poker",
    accentClass: "text-cyan-400",
    borderClass: "border-cyan-500/30",
    rules: [
      {
        heading: "Board Layout",
        items: [
          "5 hole cards dealt to each player",
          "12-card community board: Side A (3 cards), Side B (3 cards), Center column (3 + 2 + 1)",
          "Legal paths: Side A + Center, or Side B + Center (never A + B together)",
        ],
      },
      {
        heading: "Play",
        items: [
          "Board reveals in stages (top row, center, lower, final) with betting after each",
          "Draw phase: discard up to 2 hole cards and replace",
          "Declare POKER (best 5-card hand), SUITS (highest same-suit total), or SWING",
        ],
      },
      {
        heading: "Showdown",
        items: [
          "POKER wins with the best 5-card poker hand on your path",
          "SUITS wins with the highest same-suit card total (top 5 cards of one suit on your path)",
          "SWING must win BOTH poker AND suits on the SAME legal path to scoop",
          "Failed SWING forfeits everything",
          "Pot splits between POKER and SUITS winners; odd chip to POKER",
        ],
      },
    ],
  },
};

export function GameHeader({ mode, modeId, chips, phase, pot, onForfeit }: GameHeaderProps) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [, navigate] = useLocation();

  const isMidHand = phase ? MID_HAND_PHASES.has(phase) : false;
  const currentPot = pot ?? 0;

  const handleLobbyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isMidHand) {
      setExitDialogOpen(true);
    } else {
      navigate("/");
    }
  };

  const handleConfirmExit = () => {
    if (onForfeit) onForfeit();
    setExitDialogOpen(false);
    navigate("/");
  };

  return (
    <>
      <header className="w-full px-3 py-2.5 sm:px-4 sm:py-3 flex justify-between items-center bg-card/95 backdrop-blur-sm border-b border-white/5 z-50">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center ${mode.accentClass} font-bold font-mono text-xs ${mode.borderClass} border shadow-sm`}>
            {mode.abbrev}
          </div>
          <span className={`font-semibold tracking-wide text-sm text-foreground/80 hidden sm:inline`}>
            {mode.name}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Sheet open={rulesOpen} onOpenChange={setRulesOpen}>
            <SheetTrigger asChild>
              <button
                className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider px-2.5 py-2 min-h-[36px] rounded-lg border border-white/10 text-white/50 hover:text-white/80 active:text-white/80 hover:border-white/25 hover:bg-white/5 transition-all touch-manipulation"
                data-testid="button-rules"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Rules</span>
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[320px] sm:w-[380px] bg-slate-950 border-slate-800 p-0" aria-describedby={undefined}>
              <SheetTitle className="sr-only">Rules</SheetTitle>
              <ScrollArea className="h-full">
                <div className="p-5 sm:p-6 pt-10">
                  <div className="flex items-center gap-2 mb-5">
                    <div className={`w-7 h-7 rounded-md bg-white/5 flex items-center justify-center ${mode.accentClass} font-bold font-mono text-xs border ${mode.borderClass}`}>
                      {mode.abbrev}
                    </div>
                    <h2 className="text-lg font-bold text-white">{mode.name}</h2>
                  </div>
                  <div className="space-y-5">
                    {mode.rules.map((section, i) => (
                      <div key={i}>
                        <h3 className={`text-xs font-mono uppercase tracking-widest ${mode.accentClass} mb-2 font-bold`}>
                          {section.heading}
                        </h3>
                        <ul className="space-y-1.5">
                          {section.items.map((item, j) => (
                            <li key={j} className="text-sm text-white/70 leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-1 before:h-1 before:rounded-full before:bg-white/25">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 pt-4 border-t border-white/10">
                    <p className="text-[11px] text-white/30 font-mono leading-relaxed">
                      5 players max per table. $1 ante each hand. Rollover carries the pot forward when no one qualifies. Odd chips go to HIGH / POKER side.
                    </p>
                  </div>
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>

          <HandHistory modeId={modeId} />

          <StatsView modeId={modeId} />

          <button
            onClick={handleLobbyClick}
            className="text-[11px] font-mono uppercase tracking-wider px-2.5 py-2 min-h-[36px] rounded-lg border border-white/10 text-white/50 hover:text-white/80 active:text-white/80 hover:border-white/25 hover:bg-white/5 transition-all cursor-pointer touch-manipulation"
            data-testid="link-lobby"
          >
            Lobby
          </button>

          <div className="text-right pl-1">
            <div className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider leading-none">Stack</div>
            <div className="font-mono text-primary font-bold text-base leading-tight" data-testid="text-my-chips">${chips}</div>
          </div>
        </div>
      </header>

      <AlertDialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
        <AlertDialogContent className="max-w-[340px] sm:max-w-md bg-slate-950 border-slate-800 rounded-xl mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-base">Leave this hand?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60 text-sm leading-relaxed">
              You're in the middle of a hand. Leaving now will forfeit your current hand
              {currentPot > 0 && <> and your claim to the <span className="font-mono font-bold text-amber-400">${currentPot}</span> pot</>}.
              Your chips will be saved but you'll lose anything you've put in this round.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white mt-0">
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmExit}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
              data-testid="button-confirm-leave"
            >
              Leave & Forfeit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
