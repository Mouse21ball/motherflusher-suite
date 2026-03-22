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
  { icon: '⛓️', title: '5 Games Nobody Else Has', sub: 'Badugi · Dead 7 · 15/35 · Mother Flusher · Suits & Poker' },
  { icon: '⚡', title: 'Real Multiplayer', sub: 'Create a private table, share the link, run it with your crew' },
  { icon: '🔥', title: 'Streak Bonuses Every Day', sub: 'Come back daily for growing chip rewards — up to 7 days deep' },
  { icon: '🏆', title: 'Rank Up from Bronze to Master', sub: 'XP system, 6 rank tiers, 12 achievements to unlock' },
];

function WelcomeScreen({ onComplete }: { onComplete: (name: string) => void }) {
  const [input,   setInput]   = useState("");
  const [shaking, setShaking] = useState(false);
  const [focused, setFocused] = useState(false);
  const trimmed = input.trim();
  const valid   = trimmed.length >= 2 && trimmed.length <= 16;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) { setShaking(true); setTimeout(() => setShaking(false), 500); return; }
    onComplete(trimmed);
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-8 relative overflow-hidden" style={{ backgroundColor: '#05050A' }}>
      {/* Deep ambient glow */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(240,184,41,0.20) 0%, transparent 70%)' }} />
      <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(255,107,0,0.10) 0%, transparent 70%)' }} />
      <div className="absolute bottom-20 left-0 w-56 h-56 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(0,200,150,0.08) 0%, transparent 70%)' }} />

      {/* Faint card suit watermarks */}
      <div className="absolute top-[12%] left-[6%]  text-5xl opacity-[0.04] pointer-events-none select-none rotate-[-15deg]">♠</div>
      <div className="absolute top-[20%] right-[5%] text-6xl opacity-[0.04] pointer-events-none select-none rotate-[12deg]">♦</div>
      <div className="absolute bottom-[18%] left-[4%]  text-4xl opacity-[0.04] pointer-events-none select-none rotate-[8deg]">♥</div>
      <div className="absolute bottom-[12%] right-[7%] text-5xl opacity-[0.04] pointer-events-none select-none rotate-[-10deg]">♣</div>

      <div className="w-full max-w-md flex flex-col items-center relative anim-slide-down">
        {/* Logo mark */}
        <div
          className="w-20 h-20 rounded-3xl flex flex-col items-center justify-center mb-6"
          style={{
            background: 'linear-gradient(135deg, rgba(240,184,41,0.18) 0%, rgba(255,107,0,0.10) 100%)',
            border: '1.5px solid rgba(240,184,41,0.28)',
            boxShadow: '0 0 60px rgba(240,184,41,0.14), 0 0 120px rgba(255,107,0,0.06)',
          }}
        >
          <span className="text-3xl leading-none">⛓️</span>
        </div>

        {/* Headline */}
        <div className="text-center mb-2">
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight font-sans"
            style={{ color: 'rgba(255,255,255,0.90)' }}
            data-testid="text-welcome-title"
          >
            Chain Gang Poker
          </h1>
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] mt-1.5" style={{ color: 'rgba(240,184,41,0.55)' }}>
            Prison rules. No mercy.
          </p>
          <p className="text-sm mt-3 max-w-sm" style={{ color: 'rgba(255,255,255,0.38)', lineHeight: '1.6' }}>
            Five games nobody else runs. Real multiplayer, no account, no download.
            <span className="font-semibold" style={{ color: '#F0B829' }}> Free forever.</span>
          </p>
        </div>

        {/* Live badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-6"
          style={{ backgroundColor: 'rgba(0,200,150,0.07)', border: '1px solid rgba(0,200,150,0.18)' }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#00C896', boxShadow: '0 0 6px #00C896' }} />
          <span className="text-[11px] font-mono font-bold" style={{ color: '#00C896' }}>1,000+ players running right now</span>
        </div>

        {/* Feature list */}
        <div className="w-full rounded-2xl p-4 mb-5 space-y-3"
          style={{ backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.06)' }}>
          {FEATURES.map(f => (
            <div key={f.icon} className="flex items-start gap-3">
              <span className="text-base leading-none shrink-0 mt-0.5">{f.icon}</span>
              <div>
                <div className="text-sm font-semibold font-sans" style={{ color: 'rgba(255,255,255,0.75)' }}>{f.title}</div>
                <div className="text-[11px] font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>{f.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Name input */}
        <form onSubmit={handleSubmit} className="w-full">
          <label htmlFor="display-name"
            className="block text-[10px] font-mono uppercase tracking-[0.18em] mb-2.5 pl-1"
            style={{ color: 'rgba(255,255,255,0.22)' }}>
            Pick your handle
          </label>
          <div className={`flex gap-2 ${shaking ? "animate-shake" : ""}`}>
            <input
              id="display-name"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="AceHunter, BluffKing…"
              maxLength={16}
              autoFocus
              autoComplete="off"
              className="flex-1 h-12 px-4 rounded-xl font-mono text-sm focus:outline-none transition-all duration-200"
              style={{
                backgroundColor: '#17171F',
                color: 'rgba(255,255,255,0.88)',
                border: `1.5px solid ${focused ? 'rgba(240,184,41,0.45)' : 'rgba(255,255,255,0.07)'}`,
                boxShadow: focused ? '0 0 0 3px rgba(240,184,41,0.08)' : 'none',
              }}
              data-testid="input-display-name"
            />
            <button
              type="submit"
              disabled={!valid}
              className="h-12 px-6 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.97] shrink-0"
              style={{
                backgroundColor: valid ? '#F0B829' : 'rgba(240,184,41,0.08)',
                color: valid ? '#05050A' : 'rgba(240,184,41,0.25)',
                boxShadow: valid ? '0 4px 24px rgba(240,184,41,0.30)' : 'none',
              }}
              data-testid="button-enter"
            >
              Run It →
            </button>
          </div>
          {input.length > 0 && !valid && (
            <p className="text-[11px] font-mono mt-2 pl-1" style={{ color: 'rgba(220,38,38,0.55)' }}>
              Handle must be 2–16 characters
            </p>
          )}
        </form>

        <p className="text-[9px] font-mono mt-5 text-center leading-relaxed tracking-wider" style={{ color: 'rgba(255,255,255,0.10)' }}>
          No account. No email. No payment. Progress saved on this device only.
        </p>
      </div>
    </div>
  );
}
