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
    <div className="min-h-[100dvh] bg-[#0B0B0D] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#C9A227]/15 to-[#C9A227]/5 border border-[#C9A227]/12 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(201,162,39,0.08)]">
          <span className="text-[#C9A227] font-bold text-2xl font-mono tracking-tight">PT</span>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white/90 tracking-tight mb-2 font-sans" data-testid="text-welcome-title">
            Welcome to Poker Table
          </h1>
          <div className="inline-block px-3 py-1 rounded-full bg-[#C9A227]/6 border border-[#C9A227]/10 mb-6">
            <span className="text-[#C9A227]/60 text-[10px] font-mono uppercase tracking-[0.2em] font-medium" data-testid="text-alpha-badge">Closed Alpha</span>
          </div>
        </div>

        <div className="w-full rounded-xl bg-[#141417]/80 border border-white/[0.04] p-5 sm:p-6 mb-6">
          <p className="text-white/50 text-sm leading-relaxed mb-4">
            Thank you for being selected as an early tester. You are part of a small group helping shape this game before anyone else sees it.
          </p>
          <p className="text-white/30 text-sm leading-relaxed mb-4">
            Our goal is to build the best card game experience possible — grounded in psychology, fairness, and strong design. Every decision you see here is intentional.
          </p>
          <p className="text-white/30 text-sm leading-relaxed">
            If anything feels wrong, broken, or unfair — please say so. Honest feedback is exactly what we need right now.
          </p>
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
              placeholder="2-16 characters"
              maxLength={16}
              autoFocus
              autoComplete="off"
              className="flex-1 h-12 px-4 rounded-xl bg-[#1C1C20] border border-white/[0.06] text-white/90 placeholder:text-white/15 font-mono text-sm focus:outline-none focus:border-[#C9A227]/25 focus:ring-1 focus:ring-[#C9A227]/10 transition-all duration-200"
              data-testid="input-display-name"
            />
            <button
              type="submit"
              disabled={!valid}
              className="h-12 px-6 rounded-xl bg-[#C9A227] text-[#0B0B0D] font-bold text-sm uppercase tracking-wider disabled:opacity-25 disabled:cursor-not-allowed hover:bg-[#D4B44A] active:scale-[0.98] transition-all duration-200 shadow-[0_2px_8px_rgba(201,162,39,0.2)]"
              data-testid="button-enter"
            >
              Enter
            </button>
          </div>
          {input.length > 0 && !valid && (
            <p className="text-red-400/40 text-xs font-mono mt-2 pl-1">Name must be 2-16 characters</p>
          )}
        </form>

        <p className="text-white/10 text-[9px] font-mono mt-8 text-center leading-relaxed max-w-xs tracking-wider">
          Your name and progress are saved locally on this device only. No account required.
        </p>
      </div>
    </div>
  );
}
