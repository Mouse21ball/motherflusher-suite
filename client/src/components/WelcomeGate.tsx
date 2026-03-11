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
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.15)] mb-6">
          <span className="text-primary font-bold text-2xl font-mono">PT</span>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2" data-testid="text-welcome-title">
            Welcome to Poker Table
          </h1>
          <div className="inline-block px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-5">
            <span className="text-primary text-xs font-mono uppercase tracking-widest font-bold" data-testid="text-alpha-badge">Closed Alpha</span>
          </div>
        </div>

        <div className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] p-5 sm:p-6 mb-6">
          <p className="text-white/80 text-sm leading-relaxed mb-4">
            Thank you for being selected as an early tester. You are part of a small group helping shape this game before anyone else sees it.
          </p>
          <p className="text-white/65 text-sm leading-relaxed mb-4">
            Our goal is to build the best card game experience possible — grounded in psychology, fairness, and strong design. Every decision you see here is intentional, and your perspective matters.
          </p>
          <p className="text-white/65 text-sm leading-relaxed">
            If anything feels wrong, broken, or unfair — please say so. Honest feedback and bug reports are exactly what we need right now.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full">
          <label htmlFor="display-name" className="block text-xs font-mono text-white/50 uppercase tracking-wider mb-2 pl-1">
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
              className="flex-1 h-12 px-4 rounded-xl bg-white/[0.06] border border-white/[0.12] text-white placeholder:text-white/30 font-mono text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all"
              data-testid="input-display-name"
            />
            <button
              type="submit"
              disabled={!valid}
              className="h-12 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 active:scale-[0.97] transition-all"
              data-testid="button-enter"
            >
              Enter
            </button>
          </div>
          {input.length > 0 && !valid && (
            <p className="text-red-400/70 text-xs font-mono mt-2 pl-1">Name must be 2–16 characters</p>
          )}
        </form>

        <p className="text-white/30 text-[10px] font-mono mt-8 text-center leading-relaxed max-w-xs">
          Your name and progress are saved locally on this device only. No account or login required.
        </p>
      </div>
    </div>
  );
}
