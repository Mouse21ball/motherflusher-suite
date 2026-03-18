import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface ModeIntroProps {
  modeId: string;
  title: string;
  objective: string;
  steps: string[];
  accentColor: string;
}

const STORAGE_KEY = "poker_table_intro_seen";

function getSeenModes(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function markSeen(modeId: string) {
  const seen = getSeenModes();
  if (!seen.includes(modeId)) {
    seen.push(modeId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  }
}

export function ModeIntro({ modeId, title, objective, steps, accentColor }: ModeIntroProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = getSeenModes();
    if (!seen.includes(modeId)) {
      setVisible(true);
    }
  }, [modeId]);

  const dismiss = () => {
    markSeen(modeId);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B0B0D]/92 backdrop-blur-md p-4" role="dialog" aria-labelledby="mode-intro-title" data-testid="overlay-mode-intro">
      <div className="w-full max-w-sm bg-[#141417] border border-white/[0.04] rounded-2xl shadow-2xl overflow-hidden anim-slide-up">
        <div className={`px-5 pt-5 pb-3 bg-gradient-to-r ${accentColor}`}>
          <div className="flex items-center justify-between">
            <h2 id="mode-intro-title" className="text-lg font-semibold text-white/85 font-sans" data-testid="text-intro-title">{title}</h2>
            <button onClick={dismiss} aria-label="Close" className="p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/40 hover:text-white/70 active:text-white/70 transition-colors duration-200 rounded-lg touch-manipulation" data-testid="button-intro-dismiss">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-white/55 text-sm mt-1.5 leading-relaxed">{objective}</p>
        </div>

        <div className="px-5 py-5">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/20 mb-3 font-medium">How it works</p>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="w-5 h-5 rounded-full bg-white/[0.03] flex items-center justify-center text-[9px] font-bold text-white/35 shrink-0 mt-0.5 font-mono border border-white/[0.04]">
                  {i + 1}
                </span>
                <span className="text-sm text-white/45 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="px-5 pb-5">
          <Button onClick={dismiss} className="w-full font-bold uppercase tracking-wider bg-[#C9A227] hover:bg-[#D4B44A] text-[#0B0B0D] shadow-[0_2px_8px_rgba(201,162,39,0.15)]" size="lg" data-testid="button-intro-start">
            Got it
          </Button>
          <p className="text-center text-[9px] text-white/15 mt-2.5 font-mono tracking-wider">
            Tap Rules in the header anytime
          </p>
        </div>
      </div>
    </div>
  );
}

export const MODE_INTROS: Record<string, Omit<ModeIntroProps, "modeId">> = {
  swing: {
    title: "Mother Flusher",
    objective: "Declare High for the best poker hand, Low for the best suit total, or Swing to try winning both. A 15-card community board reveals in stages.",
    steps: [
      "Pay the $1 ante, then receive 5 hole cards",
      "Discard up to 2 cards in the draw round",
      "Board reveals in stages with betting after each",
      "Declare High, Low, or Swing, then one final bet",
    ],
    accentColor: "from-blue-800/60 to-[#141417]",
  },
  badugi: {
    title: "Badugi",
    objective: "Build a valid Badugi: four cards that all have different ranks and different suits. Declare High (strongest Badugi) or Low (weakest wins).",
    steps: [
      "Receive 4 face-down cards",
      "Swap duplicates across 3 draw rounds (3, 2, then 1 card max)",
      "Declare High, Low, or Fold",
      "One final betting round, then showdown",
    ],
    accentColor: "from-emerald-800/60 to-[#141417]",
  },
  dead7: {
    title: "Dead 7",
    objective: "Build a 4-card hand where every card qualifies High (8+) or Low (6 or below). Any 7 in your hand kills it.",
    steps: [
      "Receive 4 cards. Any 7s must go immediately",
      "3 draw rounds to shape your hand High or Low",
      "Declare High, Low, or Fold (dead hands must fold)",
      "A flush or Badugi (all different suits) scoops the whole pot",
    ],
    accentColor: "from-red-800/60 to-[#141417]",
  },
  fifteen35: {
    title: "15 / 35",
    objective: "Hit cards toward two targets: 13-15 qualifies Low, 33-35 qualifies High. Face cards count half a point, Aces flex as 1 or 11. Over 35 is a bust.",
    steps: [
      "Start with 2 cards (one face-up, one hidden)",
      "Each round: Hit for another card, Stay to lock in, or Fold",
      "Bet between each hit round",
      "At showdown, qualifying hands split the pot",
    ],
    accentColor: "from-amber-800/60 to-[#141417]",
  },
  suitspoker: {
    title: "Suits & Poker",
    objective: "A 12-card board splits into Side A, Center, and Side B. Declare Poker for the best 5-card hand, Suits for the highest flush total, or Swing for both.",
    steps: [
      "Receive 5 hole cards, then the board reveals in stages",
      "Draw phase: swap up to 2 cards",
      "Pick a legal path through the board (A+Center or B+Center)",
      "Declare Poker, Suits, or Swing, then final bet",
    ],
    accentColor: "from-cyan-800/60 to-[#141417]",
  },
};
