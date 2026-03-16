import { useLocation } from "wouter";
import { getAllChips, getHandHistory, getPlayerName } from "@/lib/persistence";
import { HandHistory } from "@/components/game/HandHistory";
import { StatsView } from "@/components/game/StatsView";

const modes = [
  {
    id: "fifteen35",
    name: "15 / 35",
    tagline: "Hit & Split",
    difficulty: "Easy to Learn",
    difficultyColor: "bg-amber-500/10 text-amber-300/70 border-amber-500/15",
    description: "Like Blackjack with two targets. Hit toward 15 for Low or 35 for High. Simple card math, big decisions.",
    quickFacts: ["Hit or Stay", "J/Q/K = \u00BD", "Bust over 35"],
    path: "/fifteen35",
    accent: "from-[#1C1C20] to-[#141417]",
    border: "border-amber-500/15",
    hoverBorder: "hover:border-amber-400/30",
    iconBg: "bg-amber-500/10 text-amber-300/70 border-amber-500/15",
    icon: "15",
    chipColor: "text-amber-300/80",
  },
  {
    id: "badugi",
    name: "Badugi",
    tagline: "4-Card Draw",
    difficulty: "Classic Draw Strategy",
    difficultyColor: "bg-emerald-500/10 text-emerald-300/70 border-emerald-500/15",
    description: "Draw and discard to build four cards with all different suits and ranks. The purest Badugi wins.",
    quickFacts: ["4 cards", "3 draw rounds", "All unique wins"],
    path: "/badugi",
    accent: "from-[#1C1C20] to-[#141417]",
    border: "border-emerald-500/15",
    hoverBorder: "hover:border-emerald-400/30",
    iconBg: "bg-emerald-500/10 text-emerald-300/70 border-emerald-500/15",
    icon: "B",
    chipColor: "text-emerald-300/80",
  },
  {
    id: "dead7",
    name: "Dead 7",
    tagline: "High-Low Killer",
    difficulty: "Intermediate",
    difficultyColor: "bg-red-500/10 text-red-300/70 border-red-500/15",
    description: "Build a 4-card hand going all-high or all-low, but any 7 kills your hand instantly. Chase a flush to scoop the whole pot.",
    quickFacts: ["4 cards", "7s are dead", "Flush scoops"],
    path: "/dead7",
    accent: "from-[#1C1C20] to-[#141417]",
    border: "border-red-500/15",
    hoverBorder: "hover:border-red-400/30",
    iconBg: "bg-red-500/10 text-red-300/70 border-red-500/15",
    icon: "D7",
    chipColor: "text-red-300/80",
  },
  {
    id: "swing",
    name: "Mother Flusher",
    tagline: "Swing Poker",
    difficulty: "Signature Mode",
    difficultyColor: "bg-blue-500/10 text-blue-300/70 border-blue-500/15",
    description: "5 hole cards meet a 15-card community board. Declare High for poker rank, Low for suit total, or Swing for both.",
    quickFacts: ["5 hole cards", "15-card board", "High / Low / Swing"],
    path: "/swing",
    accent: "from-[#1C1C20] to-[#141417]",
    border: "border-blue-500/15",
    hoverBorder: "hover:border-blue-400/30",
    iconBg: "bg-blue-500/10 text-blue-300/70 border-blue-500/15",
    icon: "MF",
    chipColor: "text-blue-300/80",
  },
  {
    id: "suitspoker",
    name: "Suits & Poker",
    tagline: "Dual Board",
    difficulty: "Advanced",
    difficultyColor: "bg-cyan-500/10 text-cyan-300/70 border-cyan-500/15",
    description: "Pick a path through a forking board. Declare Poker for the best 5-card hand, Suits for highest flush total, or Swing for both.",
    quickFacts: ["5 hole cards", "Split board", "Poker / Suits / Swing"],
    path: "/suitspoker",
    accent: "from-[#1C1C20] to-[#141417]",
    border: "border-cyan-500/15",
    hoverBorder: "hover:border-cyan-400/30",
    iconBg: "bg-cyan-500/10 text-cyan-300/70 border-cyan-500/15",
    icon: "SP",
    chipColor: "text-cyan-300/80",
  },
];

export default function Home() {
  const [, navigate] = useLocation();
  const playerName = getPlayerName();
  const chipMap = getAllChips();
  const history = getHandHistory();
  const totalHands = history.length;
  const totalNet = history.reduce((sum, h) => sum + h.chipChange, 0);

  return (
    <div className="min-h-[100dvh] bg-[#0B0B0D] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-start px-4 pt-10 sm:pt-14 pb-8">
        <div className="w-full max-w-lg flex flex-col items-center">
          <div className="text-center mb-8 sm:mb-10">
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/15 flex items-center justify-center">
                <span className="text-[#C9A227] font-semibold text-lg sm:text-xl font-mono">PT</span>
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white/90 tracking-tight font-sans" data-testid="text-app-title">
              Poker Table
            </h1>
            {playerName && (
              <p className="text-[#C9A227]/60 text-xs font-mono mt-1 tracking-wide" data-testid="text-player-greeting">
                {playerName}
              </p>
            )}
            <p className="text-white/30 text-sm mt-1.5 font-mono tracking-wide" data-testid="text-app-subtitle">
              {totalHands === 0 ? "Five unique poker modes" : "Five unique poker modes"}
            </p>
          </div>

          {totalHands > 0 && (
            <div className="w-full flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-white/25 font-mono uppercase tracking-wider">
                  {totalHands} {totalHands === 1 ? "hand" : "hands"} played
                </span>
                <span className={`text-xs font-mono font-semibold ${totalNet > 0 ? "text-emerald-400/70" : totalNet < 0 ? "text-red-400/70" : "text-white/25"}`}>
                  {totalNet > 0 ? "+" : ""}{totalNet === 0 ? "Even" : `$${totalNet}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <StatsView />
                <HandHistory />
              </div>
            </div>
          )}

          <div className="w-full flex flex-col gap-2.5">
            {modes.map((mode) => {
              const chips = chipMap[mode.id] ?? 1000;
              const isDefault = chips === 1000 && !chipMap[mode.id];

              return (
                <button
                  key={mode.id}
                  onClick={() => navigate(mode.path)}
                  className={`w-full text-left rounded-xl border ${mode.border} ${mode.hoverBorder} bg-gradient-to-r ${mode.accent} p-4 sm:p-5 transition-all duration-200 active:scale-[0.99] group`}
                  data-testid={`button-mode-${mode.id}`}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg ${mode.iconBg} border flex items-center justify-center font-semibold font-mono text-xs sm:text-sm shrink-0`}>
                      {mode.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base sm:text-lg font-semibold text-white/85 leading-tight font-sans" data-testid={`text-mode-name-${mode.id}`}>
                          {mode.name}
                        </span>
                        <span className={`text-[9px] sm:text-[10px] font-mono font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border ${mode.difficultyColor} shrink-0`} data-testid={`badge-difficulty-${mode.id}`}>
                          {mode.difficulty}
                        </span>
                      </div>
                      <p className="text-white/40 text-xs sm:text-sm mt-1 leading-relaxed line-clamp-2">
                        {mode.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {mode.quickFacts.map((fact, i) => (
                          <span key={i} className="text-[10px] font-mono text-white/30 bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/[0.04]">
                            {fact}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 self-center">
                      <div className={`font-mono font-semibold text-sm ${isDefault ? "text-white/25" : mode.chipColor}`} data-testid={`text-chips-${mode.id}`}>
                        ${chips}
                      </div>
                      <div className="text-white/20 group-hover:text-white/40 transition-colors duration-200 text-lg">
                        ›
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="text-center mt-8 space-y-2">
            <p className="text-white/20 text-[11px] font-mono">
              $1 ante · 4 bot opponents · chips save between sessions
            </p>
            <a href="/terms" className="text-white/15 hover:text-white/30 text-[11px] font-mono transition-colors duration-200" data-testid="link-terms">
              Beta Info & Terms
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
