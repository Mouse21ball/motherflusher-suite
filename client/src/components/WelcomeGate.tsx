import { useState, type ReactNode } from "react";
import { getPlayerName, setPlayerName } from "@/lib/persistence";

interface WelcomeGateProps {
  children: ReactNode;
}

export function WelcomeGate({ children }: WelcomeGateProps) {
  const [name, setName] = useState(() => getPlayerName());

  if (name) return <>{children}</>;

  return <WelcomeScreen onComplete={(n) => { setPlayerName(n); setName(n); }} />;
}

function WelcomeScreen({ onComplete }: { onComplete: (name: string) => void }) {
  const [input, setInput] = useState("");
  const [shaking, setShaking] = useState(false);
  const trimmed = input.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 16;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      return;
    }
    onComplete(trimmed);
  };

  return (
    <div className="min-h-[100dvh] bg-[#0B0B0D] flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-[400px] rounded-full bg-[#C9A227]/[0.04] blur-3xl pointer-events-none" />

      <div className="w-full max-w-md flex flex-col items-center relative">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#C9A227]/15 to-[#C9A227]/5 border border-[#C9A227]/15 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(201,162,39,0.10)]">
          <span className="text-[#C9A227] font-bold text-2xl font-mono tracking-tight">PT</span>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white/90 tracking-tight mb-3 font-sans" data-testid="text-welcome-title">
            Welcome to Poker Table
          </h1>
          <p className="text-white/35 text-sm leading-relaxed max-w-sm">
            Five premium poker games you won't find anywhere else. Free to play, forever.
          </p>
        </div>

        {/* Value props */}
        <div className="w-full rounded-2xl bg-[#141417]/80 border border-white/[0.05] p-5 mb-6 space-y-3">
          {[
            { icon: '🎯', text: '5 unique game modes — Badugi, Dead 7, 15/35, Mother Flusher, Suits & Poker' },
            { icon: '🏆', text: 'Level up, earn achievements, and climb the ranks as you play' },
            { icon: '🎁', text: 'Daily bonuses with streak rewards — come back every day' },
            { icon: '🔒', text: 'No account required. Your progress is saved to this device.' },
          ].map(({ icon, text }) => (
            <div key={icon} className="flex items-start gap-3">
              <span className="text-base leading-none shrink-0 mt-0.5">{icon}</span>
              <span className="text-white/45 text-sm leading-relaxed">{text}</span>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="w-full">
          <label htmlFor="display-name" className="block text-[10px] font-mono text-white/25 uppercase tracking-[0.15em] mb-2.5 pl-1">
            Choose your display name
          </label>
          <div className={`flex gap-2 ${shaking ? "animate-shake" : ""}`}>
            <input
              id="display-name"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="2–16 characters"
              maxLength={16}
              autoFocus
              autoComplete="off"
              className="flex-1 h-12 px-4 rounded-xl bg-[#1C1C20] border border-white/[0.06] text-white/90 placeholder:text-white/15 font-mono text-sm focus:outline-none focus:border-[#C9A227]/30 focus:ring-1 focus:ring-[#C9A227]/10 transition-all duration-200"
              data-testid="input-display-name"
            />
            <button
              type="submit"
              disabled={!valid}
              className="h-12 px-6 rounded-xl bg-[#C9A227] text-[#0B0B0D] font-bold text-sm uppercase tracking-wider disabled:opacity-25 disabled:cursor-not-allowed hover:bg-[#D4B44A] active:scale-[0.98] transition-all duration-200 shadow-[0_2px_12px_rgba(201,162,39,0.25)]"
              data-testid="button-enter"
            >
              Enter
            </button>
          </div>
          {input.length > 0 && !valid && (
            <p className="text-red-400/40 text-xs font-mono mt-2 pl-1">Name must be 2–16 characters</p>
          )}
        </form>

        <p className="text-white/10 text-[9px] font-mono mt-6 text-center leading-relaxed max-w-xs tracking-wider">
          No account required. Progress saved locally on this device only.
        </p>
      </div>
    </div>
  );
}
