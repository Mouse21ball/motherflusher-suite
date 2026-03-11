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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" data-testid="overlay-mode-intro">
      <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className={`px-5 pt-5 pb-3 bg-gradient-to-r ${accentColor}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white" data-testid="text-intro-title">{title}</h2>
            <button onClick={dismiss} className="text-white/50 hover:text-white transition-colors" data-testid="button-intro-dismiss">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-white/80 text-sm mt-1.5 leading-relaxed">{objective}</p>
        </div>

        <div className="px-5 py-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-3">How it works</p>
          <ol className="space-y-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/60 shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-white/70 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="px-5 pb-5">
          <Button onClick={dismiss} className="w-full font-bold" size="lg" data-testid="button-intro-start">
            Got it, let's play
          </Button>
          <p className="text-center text-[10px] text-white/25 mt-2 font-mono">
            Tap Rules in the header anytime for full details
          </p>
        </div>
      </div>
    </div>
  );
}

export const MODE_INTROS: Record<string, Omit<ModeIntroProps, "modeId">> = {
  swing: {
    title: "Mother Flusher",
    objective: "Build the best poker hand (High) or highest same-suit total (Low) using your 5 hole cards and 15 community cards. Declare Swing to try to win both.",
    steps: [
      "Pay the ante, then receive 5 hole cards",
      "Discard up to 2 cards in the draw round",
      "Watch the community board reveal in stages, betting after each",
      "Declare High, Low, or Swing, then bet one final time",
    ],
    accentColor: "from-blue-700 to-indigo-800",
  },
  badugi: {
    title: "Badugi",
    objective: "Make a valid Badugi: 4 cards that all have different ranks AND different suits. Declare High (strongest) or Low (weakest Badugi wins).",
    steps: [
      "Receive 4 face-down cards",
      "3 draw rounds to swap out duplicates (suits or ranks)",
      "Declare High, Low, or Fold",
      "One final betting round, then showdown",
    ],
    accentColor: "from-emerald-700 to-teal-800",
  },
  dead7: {
    title: "Dead 7",
    objective: "Build a 4-card hand where every card qualifies High (8+) or Low (6 or under). Any 7 in your hand kills it instantly.",
    steps: [
      "Receive 4 cards and immediately ditch any 7s",
      "3 draw rounds to shape your hand High or Low",
      "Declare High, Low, or Fold (dead hands must fold)",
      "Flushes (same suit) or Badugis (all different suits) scoop the whole pot",
    ],
    accentColor: "from-red-700 to-rose-900",
  },
  fifteen35: {
    title: "15 / 35",
    objective: "Hit cards to reach exactly 13-15 (Low) or 33-35 (High). Face cards are worth half a point, Aces flex as 1 or 11. Over 35 is a bust.",
    steps: [
      "Start with 2 cards (one face-up, one hidden)",
      "Each round: Hit for another card, Stay to lock in, or Fold",
      "Bet between hit rounds",
      "At showdown, 13-15 wins Low and 33-35 wins High",
    ],
    accentColor: "from-amber-700 to-orange-800",
  },
  suitspoker: {
    title: "Suits & Poker",
    objective: "Use your 5 hole cards plus a 12-card split board to make the best poker hand (Poker side) or highest same-suit total (Suits side). Swing tries both.",
    steps: [
      "Receive 5 hole cards, board reveals in stages",
      "Draw phase: swap up to 2 cards",
      "Board has Side A, Side B, and Center — pick a legal path (A+Center or B+Center)",
      "Declare Poker, Suits, or Swing, then final bet and showdown",
    ],
    accentColor: "from-cyan-700 to-teal-900",
  },
};
