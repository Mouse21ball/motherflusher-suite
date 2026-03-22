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

const FEATURES = [
  { icon: '♦️', title: '5 Exclusive Game Modes', sub: 'Badugi · Dead 7 · 15/35 · Mother Flusher · Suits & Poker' },
  { icon: '⚡', title: 'Real Multiplayer', sub: 'Create a private table, share the link, play instantly' },
  { icon: '🏆', title: 'Rank Up & Earn', sub: 'XP system, 6 rank tiers, 12 achievements, daily prizes' },
  { icon: '🎁', title: 'Daily Streak Bonuses', sub: 'Log in daily for growing chip rewards — up to 7-day chains' },
];

function WelcomeScreen({ onComplete }: { onComplete: (name: string) => void }) {
  const [input,    setInput]    = useState("");
  const [shaking,  setShaking]  = useState(false);
  const [focused,  setFocused]  = useState(false);
  const trimmed = input.trim();
  const valid   = trimmed.length >= 2 && trimmed.length <= 16;

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
    <div className="min-h-[100dvh] bg-[#070709] flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Multi-layer ambient glow */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(240,184,41,0.22) 0%, transparent 70%)' }} />
      <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(0,200,150,0.12) 0%, transparent 70%)' }} />
      <div className="absolute bottom-20 left-0 w-56 h-56 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(155,93,229,0.10) 0%, transparent 70%)' }} />

      {/* Floating card suits */}
      <div className="absolute top-[15%] left-[8%] text-3xl opacity-[0.06] pointer-events-none select-none rotate-[-15deg]">♠</div>
      <div className="absolute top-[25%] right-[6%] text-4xl opacity-[0.05] pointer-events-none select-none rotate-[12deg]">♦</div>
      <div className="absolute bottom-[20%] left-[5%] text-3xl opacity-[0.05] pointer-events-none select-none rotate-[8deg]">♥</div>
      <div className="absolute bottom-[15%] right-[8%] text-3xl opacity-[0.06] pointer-events-none select-none rotate-[-10deg]">♣</div>

      <div className="w-full max-w-md flex flex-col items-center relative anim-slide-down">
        {/* Logo */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 relative"
          style={{
            background: 'linear-gradient(135deg, rgba(240,184,41,0.20) 0%, rgba(240,184,41,0.06) 100%)',
            border: '1.5px solid rgba(240,184,41,0.30)',
            boxShadow: '0 0 60px rgba(240,184,41,0.15), 0 0 120px rgba(240,184,41,0.06)',
          }}
        >
          <span className="text-3xl font-bold font-mono" style={{ color: '#F0B829' }}>PT</span>
        </div>

        {/* Headline */}
        <div className="text-center mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-white/90 tracking-tight font-sans" data-testid="text-welcome-title">
            Welcome to Poker Table
          </h1>
          <p className="text-white/40 text-sm leading-relaxed mt-2 max-w-sm">
            Premium poker games you won't find anywhere else.
            <span className="font-semibold" style={{ color: '#F0B829' }}> Free to play, forever.</span>
          </p>
        </div>

        {/* Micro live badge */}
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-6"
          style={{ backgroundColor: 'rgba(0,200,150,0.07)', border: '1px solid rgba(0,200,150,0.18)' }}
        >
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#00C896', boxShadow: '0 0 6px #00C896' }} />
          <span className="text-[11px] font-mono font-bold" style={{ color: '#00C896' }}>1,000+ players online right now</span>
        </div>

        {/* Feature cards */}
        <div
          className="w-full rounded-2xl p-4 mb-5 space-y-3"
          style={{ backgroundColor: '#0F0F13', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {FEATURES.map(f => (
            <div key={f.icon} className="flex items-start gap-3">
              <span className="text-lg leading-none shrink-0 mt-0.5">{f.icon}</span>
              <div>
                <div className="text-sm font-semibold text-white/75 font-sans">{f.title}</div>
                <div className="text-[11px] text-white/30 font-mono leading-snug mt-0.5">{f.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Name entry form */}
        <form onSubmit={handleSubmit} className="w-full">
          <label
            htmlFor="display-name"
            className="block text-[10px] font-mono text-white/25 uppercase tracking-[0.18em] mb-2.5 pl-1"
          >
            Choose your player name
          </label>
          <div className={`flex gap-2 ${shaking ? "animate-shake" : ""}`}>
            <input
              id="display-name"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="AceHunter, BluffKing…"
              maxLength={16}
              autoFocus
              autoComplete="off"
              className="flex-1 h-12 px-4 rounded-xl text-white/90 placeholder:text-white/15 font-mono text-sm focus:outline-none transition-all duration-200"
              style={{
                backgroundColor: '#17171C',
                border: `1.5px solid ${focused ? 'rgba(240,184,41,0.40)' : 'rgba(255,255,255,0.06)'}`,
                boxShadow: focused ? '0 0 0 3px rgba(240,184,41,0.08)' : 'none',
              }}
              data-testid="input-display-name"
            />
            <button
              type="submit"
              disabled={!valid}
              className="h-12 px-6 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.97] shrink-0"
              style={{
                backgroundColor: valid ? '#F0B829' : 'rgba(240,184,41,0.10)',
                color: valid ? '#070709' : 'rgba(240,184,41,0.30)',
                boxShadow: valid ? '0 4px 20px rgba(240,184,41,0.30)' : 'none',
                cursor: valid ? 'pointer' : 'not-allowed',
              }}
              data-testid="button-enter"
            >
              Play →
            </button>
          </div>
          {input.length > 0 && !valid && (
            <p className="text-red-400/45 text-xs font-mono mt-2 pl-1">
              Name must be 2–16 characters
            </p>
          )}
        </form>

        <p className="text-white/10 text-[9px] font-mono mt-5 text-center leading-relaxed tracking-wider">
          No account, email, or payment required. Progress saved locally on this device.
        </p>
      </div>
    </div>
  );
}
