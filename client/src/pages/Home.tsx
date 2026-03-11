import { useLocation } from "wouter";
import { getAllChips, getHandHistory } from "@/lib/persistence";
import { HandHistory } from "@/components/game/HandHistory";

const modes = [
  {
    id: "swing",
    name: "Mother Flusher",
    tagline: "Swing Poker",
    description: "5 hole cards with a 15-card community board revealed in stages. Draw, bet, and declare High, Low, or Swing. Swing scoops — or loses it all.",
    quickFacts: ["5 hole cards", "15-card board", "High / Low / Swing"],
    path: "/swing",
    accent: "from-blue-600/90 to-indigo-800/90",
    border: "border-blue-500/30",
    hoverBorder: "hover:border-blue-400/60",
    iconBg: "bg-blue-500/20 text-blue-300 border-blue-400/30",
    icon: "MF",
    chipColor: "text-blue-300",
  },
  {
    id: "badugi",
    name: "Badugi",
    tagline: "Draw Lowball",
    description: "4 cards, 3 draw rounds. Build a valid Badugi — four cards with all different ranks and all different suits. Declare High or Low.",
    quickFacts: ["4 cards", "3 draws", "Unique ranks + suits"],
    path: "/badugi",
    accent: "from-emerald-600/90 to-teal-800/90",
    border: "border-emerald-500/30",
    hoverBorder: "hover:border-emerald-400/60",
    iconBg: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
    icon: "B",
    chipColor: "text-emerald-300",
  },
  {
    id: "dead7",
    name: "Dead 7",
    tagline: "High-Low Killer",
    description: "4-card draw where any 7 kills your hand. High needs all cards 8+, Low needs all 6 or under. Flushes and Badugis scoop the pot.",
    quickFacts: ["4 cards", "7s are dead", "Flush scoops"],
    path: "/dead7",
    accent: "from-red-600/90 to-rose-900/90",
    border: "border-red-500/30",
    hoverBorder: "hover:border-red-400/60",
    iconBg: "bg-red-500/20 text-red-300 border-red-400/30",
    icon: "D7",
    chipColor: "text-red-300",
  },
  {
    id: "fifteen35",
    name: "15 / 35",
    tagline: "Hit & Split",
    description: "2-card deal, then hit or stay. Low qualifies at 13-15, High at 33-35. Face cards are half, Aces flex. Over 35 and you bust.",
    quickFacts: ["J/Q/K = \u00BD", "Ace = 1 or 11", "Bust over 35"],
    path: "/fifteen35",
    accent: "from-amber-600/90 to-orange-800/90",
    border: "border-amber-500/30",
    hoverBorder: "hover:border-amber-400/60",
    iconBg: "bg-amber-500/20 text-amber-300 border-amber-400/30",
    icon: "15",
    chipColor: "text-amber-300",
  },
  {
    id: "suitspoker",
    name: "Suits & Poker",
    tagline: "Path Split",
    description: "5 hole cards with a 12-card board split into Side A, Center, and Side B. Declare Poker (best hand), Suits (highest flush total), or Swing.",
    quickFacts: ["5 hole cards", "12-card board", "Poker / Suits / Swing"],
    path: "/suitspoker",
    accent: "from-cyan-600/90 to-teal-900/90",
    border: "border-cyan-500/30",
    hoverBorder: "hover:border-cyan-400/60",
    iconBg: "bg-cyan-500/20 text-cyan-300 border-cyan-400/30",
    icon: "SP",
    chipColor: "text-cyan-300",
  },
];

export default function Home() {
  const [, navigate] = useLocation();
  const chipMap = getAllChips();
  const history = getHandHistory();
  const totalHands = history.length;
  const totalNet = history.reduce((sum, h) => sum + h.chipChange, 0);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-start px-4 pt-10 sm:pt-14 pb-8">
        <div className="w-full max-w-lg flex flex-col items-center">
          <div className="text-center mb-8 sm:mb-10">
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                <span className="text-primary font-bold text-lg sm:text-xl font-mono">PT</span>
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight" data-testid="text-app-title">
              Poker Table
            </h1>
            <p className="text-white/40 text-sm mt-1.5 font-mono tracking-wide" data-testid="text-app-subtitle">
              Five custom poker variants
            </p>
          </div>

          {totalHands > 0 && (
            <div className="w-full flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-white/30 font-mono uppercase tracking-wider">
                  {totalHands} hands played
                </span>
                <span className={`text-xs font-mono font-bold ${totalNet > 0 ? "text-emerald-400" : totalNet < 0 ? "text-red-400" : "text-white/40"}`}>
                  {totalNet > 0 ? "+" : ""}{totalNet === 0 ? "Even" : `$${totalNet}`}
                </span>
              </div>
              <HandHistory />
            </div>
          )}

          <div className="w-full flex flex-col gap-3">
            {modes.map((mode) => {
              const chips = chipMap[mode.id] ?? 1000;
              const isDefault = chips === 1000 && !chipMap[mode.id];

              return (
                <button
                  key={mode.id}
                  onClick={() => navigate(mode.path)}
                  className={`w-full text-left rounded-xl border ${mode.border} ${mode.hoverBorder} bg-gradient-to-r ${mode.accent} p-4 sm:p-5 transition-all duration-200 active:scale-[0.98] shadow-lg hover:shadow-xl group`}
                  data-testid={`button-mode-${mode.id}`}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg ${mode.iconBg} border flex items-center justify-center font-bold font-mono text-xs sm:text-sm shrink-0 shadow-sm`}>
                      {mode.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-base sm:text-lg font-bold text-white leading-tight" data-testid={`text-mode-name-${mode.id}`}>
                          {mode.name}
                        </span>
                        <span className="text-white/35 text-[10px] font-mono uppercase tracking-wider shrink-0">
                          {mode.tagline}
                        </span>
                      </div>
                      <p className="text-white/55 text-xs sm:text-sm mt-1 leading-relaxed line-clamp-2">
                        {mode.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {mode.quickFacts.map((fact, i) => (
                          <span key={i} className="text-[10px] font-mono text-white/40 bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/[0.06]">
                            {fact}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 self-center">
                      <div className={`font-mono font-bold text-sm ${isDefault ? "text-white/30" : mode.chipColor}`} data-testid={`text-chips-${mode.id}`}>
                        ${chips}
                      </div>
                      <div className="text-white/25 group-hover:text-white/60 transition-colors text-lg">
                        ›
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="text-center mt-8 space-y-1.5">
            <p className="text-white/20 text-[11px] font-mono">
              4 bot opponents at each table · chips persist between sessions
            </p>
            <p className="text-white/15 text-[10px] font-mono">
              Tap any game to see full rules inside
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
