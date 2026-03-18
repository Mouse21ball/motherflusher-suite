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
    description: "Like Blackjack with two targets. Hit toward 15 or 35.",
    quickFacts: ["Hit or Stay", "J/Q/K = ½", "Bust over 35"],
    path: "/fifteen35",
    icon: "15",
    accentHue: "amber",
  },
  {
    id: "badugi",
    name: "Badugi",
    tagline: "4-Card Draw",
    difficulty: "Classic Draw",
    description: "Draw and discard to build four unique suits and ranks.",
    quickFacts: ["4 cards", "3 draws", "All unique wins"],
    path: "/badugi",
    icon: "B",
    accentHue: "emerald",
  },
  {
    id: "dead7",
    name: "Dead 7",
    tagline: "High-Low Killer",
    difficulty: "Intermediate",
    description: "Build high or low, but any 7 kills your hand instantly.",
    quickFacts: ["4 cards", "7s are dead", "Flush scoops"],
    path: "/dead7",
    icon: "D7",
    accentHue: "red",
  },
  {
    id: "swing",
    name: "Mother Flusher",
    tagline: "Swing Poker",
    difficulty: "Signature",
    description: "5 hole cards, 15-card board. Declare High, Low, or Swing.",
    quickFacts: ["5 hole cards", "15 board cards", "High / Low / Swing"],
    path: "/swing",
    icon: "MF",
    accentHue: "blue",
  },
  {
    id: "suitspoker",
    name: "Suits & Poker",
    tagline: "Dual Board",
    difficulty: "Advanced",
    description: "Pick a path through a forking board. Poker, Suits, or Swing.",
    quickFacts: ["5 hole cards", "Split board", "3 declarations"],
    path: "/suitspoker",
    icon: "SP",
    accentHue: "cyan",
  },
];

const hueConfig: Record<string, { badge: string; icon: string; chips: string; border: string; hoverBorder: string }> = {
  amber: {
    badge: "bg-amber-500/8 text-amber-300/60 border-amber-500/12",
    icon: "bg-amber-500/8 text-amber-400/70 border-amber-500/12",
    chips: "text-amber-300/70",
    border: "border-amber-500/10",
    hoverBorder: "hover:border-amber-400/25",
  },
  emerald: {
    badge: "bg-emerald-500/8 text-emerald-300/60 border-emerald-500/12",
    icon: "bg-emerald-500/8 text-emerald-400/70 border-emerald-500/12",
    chips: "text-emerald-300/70",
    border: "border-emerald-500/10",
    hoverBorder: "hover:border-emerald-400/25",
  },
  red: {
    badge: "bg-red-500/8 text-red-300/60 border-red-500/12",
    icon: "bg-red-500/8 text-red-400/70 border-red-500/12",
    chips: "text-red-300/70",
    border: "border-red-500/10",
    hoverBorder: "hover:border-red-400/25",
  },
  blue: {
    badge: "bg-blue-500/8 text-blue-300/60 border-blue-500/12",
    icon: "bg-blue-500/8 text-blue-400/70 border-blue-500/12",
    chips: "text-blue-300/70",
    border: "border-blue-500/10",
    hoverBorder: "hover:border-blue-400/25",
  },
  cyan: {
    badge: "bg-cyan-500/8 text-cyan-300/60 border-cyan-500/12",
    icon: "bg-cyan-500/8 text-cyan-400/70 border-cyan-500/12",
    chips: "text-cyan-300/70",
    border: "border-cyan-500/10",
    hoverBorder: "hover:border-cyan-400/25",
  },
};

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
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-[#C9A227]/15 to-[#C9A227]/5 border border-[#C9A227]/12 flex items-center justify-center shadow-[0_0_20px_rgba(201,162,39,0.06)]">
                <span className="text-[#C9A227] font-bold text-xl sm:text-2xl font-mono tracking-tight">PT</span>
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white/90 tracking-tight font-sans" data-testid="text-app-title">
              Poker Table
            </h1>
            {playerName && (
              <p className="text-[#C9A227]/50 text-xs font-mono mt-1.5 tracking-widest uppercase" data-testid="text-player-greeting">
                {playerName}
              </p>
            )}
            <p className="text-white/25 text-xs mt-2 font-mono tracking-wider" data-testid="text-app-subtitle">
              Five unique poker modes
            </p>
          </div>

          {totalHands > 0 && (
            <div className="w-full flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-white/20 font-mono uppercase tracking-widest">
                  {totalHands} {totalHands === 1 ? "hand" : "hands"}
                </span>
                <span className={`text-xs font-mono font-bold ${totalNet > 0 ? "text-emerald-400/60" : totalNet < 0 ? "text-red-400/60" : "text-white/20"}`}>
                  {totalNet > 0 ? "+" : ""}{totalNet === 0 ? "Even" : `$${totalNet}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <StatsView />
                <HandHistory />
              </div>
            </div>
          )}

          <div className="w-full flex flex-col gap-2">
            {modes.map((mode) => {
              const chips = chipMap[mode.id] ?? 1000;
              const isDefault = chips === 1000 && !chipMap[mode.id];
              const hue = hueConfig[mode.accentHue];

              return (
                <button
                  key={mode.id}
                  onClick={() => navigate(mode.path)}
                  className={`w-full text-left rounded-xl border ${hue.border} ${hue.hoverBorder} bg-[#141417]/60 hover:bg-[#141417]/90 p-4 sm:p-5 transition-all duration-200 active:scale-[0.99] group`}
                  data-testid={`button-mode-${mode.id}`}
                >
                  <div className="flex items-center gap-3.5 sm:gap-4">
                    <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${hue.icon} border flex items-center justify-center font-bold font-mono text-xs sm:text-sm shrink-0`}>
                      {mode.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base sm:text-lg font-semibold text-white/85 leading-tight font-sans" data-testid={`text-mode-name-${mode.id}`}>
                          {mode.name}
                        </span>
                        <span className={`text-[9px] font-mono font-medium uppercase tracking-widest px-1.5 py-0.5 rounded border ${hue.badge} shrink-0`} data-testid={`badge-difficulty-${mode.id}`}>
                          {mode.difficulty}
                        </span>
                      </div>
                      <p className="text-white/35 text-xs sm:text-sm mt-1 leading-relaxed line-clamp-1">
                        {mode.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {mode.quickFacts.map((fact, i) => (
                          <span key={i} className="text-[9px] font-mono text-white/25 bg-white/[0.02] px-1.5 py-0.5 rounded border border-white/[0.03]">
                            {fact}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0 self-center">
                      <div className={`font-mono font-bold text-sm tabular-nums ${isDefault ? "text-white/20" : hue.chips}`} data-testid={`text-chips-${mode.id}`}>
                        ${chips}
                      </div>
                      <div className="text-white/15 group-hover:text-white/35 transition-colors duration-200 text-base leading-none">
                        ›
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="text-center mt-8 space-y-2.5">
            <p className="text-white/15 text-[10px] font-mono tracking-wider">
              $1 ante · 4 bot opponents · chips persist locally
            </p>
            <a href="/terms" className="text-white/10 hover:text-white/25 text-[10px] font-mono transition-colors duration-200 tracking-wider" data-testid="link-terms">
              Beta Info & Terms
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
