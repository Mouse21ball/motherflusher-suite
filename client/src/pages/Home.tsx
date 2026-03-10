import { useLocation } from "wouter";

const modes = [
  {
    id: "swing",
    name: "Mother Flusher",
    subtitle: "Swing Poker",
    description: "5-card draw with a 15-card community board. Declare high, low, or swing to claim the pot.",
    path: "/swing",
    color: "from-blue-600 to-indigo-700",
    border: "border-blue-500/40",
    hoverBorder: "hover:border-blue-400",
    icon: "♠",
  },
  {
    id: "badugi",
    name: "Badugi",
    subtitle: "Draw Lowball",
    description: "4-card lowball with 3 draw rounds. Make a valid badugi — four cards, all different ranks and suits.",
    path: "/badugi",
    color: "from-emerald-600 to-teal-700",
    border: "border-emerald-500/40",
    hoverBorder: "hover:border-emerald-400",
    icon: "♦",
  },
  {
    id: "dead7",
    name: "Dead 7",
    subtitle: "High-Low Draw",
    description: "4-card draw with 3 rounds. Any 7 kills your hand. Flushes and badugis scoop. High ball is K-Q-J-10, low ball is A-2-3-4.",
    path: "/dead7",
    color: "from-red-600 to-rose-800",
    border: "border-red-500/40",
    hoverBorder: "hover:border-red-400",
    icon: "7",
  },
  {
    id: "fifteen35",
    name: "15 / 35",
    subtitle: "Hit & Split",
    description: "2-card deal, hit for more. Low qualifies at 13-15, high at 33-35. J/Q/K = ½, Ace = 1 or 11. Bust over 35 and you're out.",
    path: "/fifteen35",
    color: "from-amber-600 to-orange-700",
    border: "border-amber-500/40",
    hoverBorder: "hover:border-amber-400",
    icon: "⅟",
  },
  {
    id: "suitspoker",
    name: "Suits & Poker",
    subtitle: "Community Split",
    description: "5 hole cards, 12-card board with Side A, Center, and Side B paths. Declare Poker, Suits, or Swing. Best flush scores vs best 5-card hand.",
    path: "/suitspoker",
    color: "from-cyan-600 to-teal-800",
    border: "border-cyan-500/40",
    hoverBorder: "hover:border-cyan-400",
    icon: "♣",
  },
];

export default function Home() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight" data-testid="text-app-title">
            Poker Table
          </h1>
          <p className="text-white/50 text-sm sm:text-base mt-2 font-mono" data-testid="text-app-subtitle">
            Choose your game
          </p>
        </div>

        <div className="w-full flex flex-col gap-4">
          {modes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => navigate(mode.path)}
              className={`w-full text-left rounded-2xl border ${mode.border} ${mode.hoverBorder} bg-gradient-to-br ${mode.color} p-5 sm:p-6 transition-all duration-200 active:scale-[0.98] shadow-lg hover:shadow-xl group`}
              data-testid={`button-mode-${mode.id}`}
            >
              <div className="flex items-start gap-4">
                <div className="text-4xl sm:text-5xl opacity-80 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                  {mode.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl sm:text-2xl font-bold text-white leading-tight" data-testid={`text-mode-name-${mode.id}`}>
                    {mode.name}
                  </div>
                  <div className="text-white/60 text-xs font-mono uppercase tracking-wider mt-0.5">
                    {mode.subtitle}
                  </div>
                  <p className="text-white/70 text-sm mt-2 leading-relaxed">
                    {mode.description}
                  </p>
                </div>
                <div className="text-white/40 group-hover:text-white/80 transition-colors text-2xl shrink-0 self-center">
                  ›
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="text-white/25 text-xs font-mono text-center mt-4">
          4 bot players at each table · max 5 seats
        </div>
      </div>
    </div>
  );
}
