import { useState, type ReactNode } from "react";
import { getPlayerName, setPlayerName, ensurePlayerIdentity, savePlayerIdentity } from "@/lib/persistence";
import { apiUrl } from "@/lib/apiConfig";
import { BrandBackground } from "./BrandBackground";

const AGE_KEY = 'cgp_age_confirmed';

function getAgeConfirmed(): boolean {
  try { return localStorage.getItem(AGE_KEY) === '1'; } catch { return false; }
}
function setAgeConfirmed(): void {
  try { localStorage.setItem(AGE_KEY, '1'); } catch {}
}

interface WelcomeGateProps {
  children: ReactNode;
}

const LEGAL_PATHS = ['/terms', '/privacy'];

export function WelcomeGate({ children }: WelcomeGateProps) {
  const [ageOk, setAgeOk]   = useState(() => getAgeConfirmed());
  const [name,  setName]    = useState(() => getPlayerName());

  const onLegalPage = LEGAL_PATHS.includes(window.location.pathname);

  if (!ageOk && !onLegalPage) {
    return (
      <AgeGate onConfirm={() => { setAgeConfirmed(); setAgeOk(true); }} />
    );
  }
  if (onLegalPage) return <>{children}</>;
  if (name) return <>{children}</>;
  return <WelcomeScreen onComplete={(n) => { setPlayerName(n); setName(n); }} />;
}

// ── Age Gate ─────────────────────────────────────────────────────────────────
function AgeGate({ onConfirm }: { onConfirm: () => void }) {
  return (
    <BrandBackground variant="welcome">
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-10">

        {/* DGM publisher badge */}
        <div className="mb-8 flex flex-col items-center gap-1">
          <div
            className="flex items-center gap-2 px-3 py-1 rounded-full"
            style={{ background: 'rgba(240,184,41,0.07)', border: '1px solid rgba(240,184,41,0.16)' }}
          >
            <span style={{ color: 'rgba(240,184,41,0.65)', fontSize: '9px' }}>◆</span>
            <span
              className="font-mono uppercase font-semibold"
              style={{ fontSize: '8px', color: 'rgba(240,184,41,0.65)', letterSpacing: '0.20em' }}
            >
              DGM Entertainment
            </span>
            <span style={{ color: 'rgba(240,184,41,0.65)', fontSize: '9px' }}>◆</span>
          </div>
          <p
            className="font-mono"
            style={{ fontSize: '8px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.12em', textTransform: 'uppercase' }}
          >
            A DGM Entertainment Game
          </p>
        </div>

        {/* Main confirmation card */}
        <div
          className="w-full max-w-sm rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center gap-5"
          style={{
            background: 'rgba(7,7,16,0.88)',
            border: '1px solid rgba(240,184,41,0.18)',
            boxShadow: '0 0 48px rgba(0,0,0,0.70), 0 0 1px rgba(240,184,41,0.12)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Chain icon */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
            style={{
              background: 'radial-gradient(circle at 40% 35%, rgba(240,184,41,0.18), rgba(240,184,41,0.06))',
              border: '1.5px solid rgba(240,184,41,0.28)',
              boxShadow: '0 0 20px rgba(240,184,41,0.10)',
            }}
          >
            ⛓️
          </div>

          {/* Title */}
          <div>
            <h1
              className="text-xl font-bold font-sans mb-1"
              style={{ color: 'rgba(255,255,255,0.93)' }}
              data-testid="text-age-gate-title"
            >
              Welcome to Chain Gang Poker
            </h1>
            <p
              className="text-xs font-mono"
              style={{ color: 'rgba(255,255,255,0.38)' }}
              data-testid="text-age-gate-body"
            >
              You must be 13 or older to use this app.
            </p>
          </div>

          {/* Gold divider */}
          <div
            className="w-12 h-[1px]"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(240,184,41,0.45), transparent)' }}
          />

          {/* Chips disclaimer */}
          <div
            className="w-full rounded-xl p-3 text-left"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[11px] font-mono leading-relaxed" style={{ color: 'rgba(255,255,255,0.36)' }}>
              Virtual chips are for entertainment only. They have no cash value, cannot be redeemed, and cannot be withdrawn. This app involves no real-money gambling.
            </p>
          </div>

          {/* Confirm button */}
          <button
            onClick={onConfirm}
            className="w-full h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-150 active:scale-[0.97]"
            style={{
              backgroundColor: '#F0B829',
              color: '#05050A',
              boxShadow: '0 4px 28px rgba(240,184,41,0.32)',
            }}
            data-testid="button-age-confirm"
          >
            I am 13 or older — Continue
          </button>

          {/* Legal links footer */}
          <p className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.22)' }}>
            By continuing, you confirm you meet the required age and agree to the{' '}
            <a
              href="/terms"
              className="underline underline-offset-2 transition-colors"
              style={{ color: 'rgba(240,184,41,0.50)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(240,184,41,0.80)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,184,41,0.50)')}
            >
              Terms
            </a>
            {' & '}
            <a
              href="/privacy"
              className="underline underline-offset-2 transition-colors"
              style={{ color: 'rgba(240,184,41,0.50)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(240,184,41,0.80)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,184,41,0.50)')}
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>

        {/* Bottom signature */}
        <div className="mt-8 flex flex-col items-center gap-1">
          <p className="font-mono italic" style={{ fontSize: '9px', color: 'rgba(240,184,41,0.25)' }}>
            Built for the table. Backed by DGM Entertainment.
          </p>
          <p className="font-mono" style={{ fontSize: '8px', color: 'rgba(255,255,255,0.12)' }}>
            © 2026 DGM Entertainment LLC
          </p>
        </div>

      </div>
    </BrandBackground>
  );
}

// ── Feature list ──────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '⛓️', title: '4 Games Nobody Else Has', sub: 'Badugi · Dead 7 · 15/35 · Suits & Poker' },
  { icon: '⚡', title: 'Real Multiplayer', sub: 'Create a private table, share the link, run it with your crew' },
  { icon: '🔥', title: 'Streak Bonuses Every Day', sub: 'Come back daily for growing chip rewards — up to 7 days deep' },
  { icon: '🏆', title: 'Rank Up from Bronze to Master', sub: 'XP system, 6 rank tiers, 12 achievements to unlock' },
];

type Mode = 'choose' | 'guest' | 'login' | 'register';

function WelcomeScreen({ onComplete }: { onComplete: (name: string) => void }) {
  const [mode,      setMode]      = useState<Mode>('choose');
  const [input,     setInput]     = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [shaking,   setShaking]   = useState(false);
  const [focused,   setFocused]   = useState<string | null>(null);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const trimName = input.trim();
  const validGuest = trimName.length >= 2 && trimName.length <= 16;

  const handleGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validGuest) { setShaking(true); setTimeout(() => setShaking(false), 500); return; }
    onComplete(trimName);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Login failed. Check your credentials.'); return; }
      savePlayerIdentity({
        id: data.profileId, name: data.displayName,
        avatarSeed: data.profileId.slice(0, 8), createdAt: Date.now(),
      });
      onComplete(data.displayName);
    } catch { setError('Could not reach the server. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const dn = input.trim();
    if (dn.length < 2 || dn.length > 32)        { setError('Handle must be 2–32 characters.'); return; }
    if (!email.trim().includes('@'))              { setError('Enter a valid email address.'); return; }
    if (password.length < 8)                     { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPw)                  { setError('Passwords do not match.'); return; }
    const guest = ensurePlayerIdentity();
    setBusy(true);
    try {
      const res = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId: guest.id, email: email.trim().toLowerCase(), password, displayName: dn }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Registration failed. Try again.'); return; }
      savePlayerIdentity({
        id: data.profileId, name: data.displayName,
        avatarSeed: data.profileId.slice(0, 8), createdAt: guest.createdAt,
      });
      onComplete(data.displayName);
    } catch { setError('Could not reach the server. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  const inputStyle = (field: string) => ({
    backgroundColor: '#17171F',
    color: 'rgba(255,255,255,0.88)',
    border: `1.5px solid ${focused === field ? 'rgba(240,184,41,0.45)' : 'rgba(255,255,255,0.07)'}`,
    boxShadow: focused === field ? '0 0 0 3px rgba(240,184,41,0.08)' : 'none',
  });

  const inputCls = "w-full h-12 px-4 rounded-xl font-mono text-sm focus:outline-none transition-all duration-200";

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-8 relative overflow-hidden" style={{ backgroundColor: '#05050A' }}>
      {/* Ambient glows */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(240,184,41,0.20) 0%, transparent 70%)' }} />
      <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(255,107,0,0.10) 0%, transparent 70%)' }} />
      <div className="absolute bottom-20 left-0 w-56 h-56 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(0,200,150,0.08) 0%, transparent 70%)' }} />

      {/* Suit watermarks */}
      <div className="absolute top-[12%] left-[6%]  text-5xl opacity-[0.04] pointer-events-none select-none rotate-[-15deg]">♠</div>
      <div className="absolute top-[20%] right-[5%] text-6xl opacity-[0.04] pointer-events-none select-none rotate-[12deg]">♦</div>
      <div className="absolute bottom-[18%] left-[4%]  text-4xl opacity-[0.04] pointer-events-none select-none rotate-[8deg]">♥</div>
      <div className="absolute bottom-[12%] right-[7%] text-5xl opacity-[0.04] pointer-events-none select-none rotate-[-10deg]">♣</div>

      <div className="w-full max-w-md flex flex-col items-center relative anim-slide-down">
        {/* Logo */}
        <div className="w-20 h-20 rounded-3xl flex flex-col items-center justify-center mb-6"
          style={{
            background: 'linear-gradient(135deg, rgba(240,184,41,0.18) 0%, rgba(255,107,0,0.10) 100%)',
            border: '1.5px solid rgba(240,184,41,0.28)',
            boxShadow: '0 0 60px rgba(240,184,41,0.14), 0 0 120px rgba(255,107,0,0.06)',
          }}>
          <span className="text-3xl leading-none">⛓️</span>
        </div>

        <div className="text-center mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-sans" style={{ color: 'rgba(255,255,255,0.90)' }} data-testid="text-welcome-title">
            Chain Gang Poker
          </h1>
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] mt-1.5" style={{ color: 'rgba(240,184,41,0.55)' }}>
            Prison rules. No mercy.
          </p>
          <p className="text-sm mt-3 max-w-sm" style={{ color: 'rgba(255,255,255,0.38)', lineHeight: '1.6' }}>
            Four games nobody else runs. Real multiplayer, virtual chips, <span className="font-semibold" style={{ color: '#F0B829' }}>free forever.</span>
          </p>
        </div>

        {/* Live badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-6"
          style={{ backgroundColor: 'rgba(0,200,150,0.07)', border: '1px solid rgba(0,200,150,0.18)' }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#00C896', boxShadow: '0 0 6px #00C896' }} />
          <span className="text-[11px] font-mono font-bold" style={{ color: '#00C896' }}>1,000+ players running right now</span>
        </div>

        {/* Feature list — only on choose screen */}
        {mode === 'choose' && (
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
        )}

        {/* ── CHOOSE ─────────────────────────────────────────────────────────── */}
        {mode === 'choose' && (
          <div className="w-full flex flex-col gap-2.5">
            <button
              onClick={() => setMode('login')}
              className="w-full h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.97]"
              style={{ backgroundColor: '#F0B829', color: '#05050A', boxShadow: '0 4px 24px rgba(240,184,41,0.30)' }}
              data-testid="button-goto-login"
            >
              Log In
            </button>
            <button
              onClick={() => setMode('register')}
              className="w-full h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.97]"
              style={{ backgroundColor: 'rgba(240,184,41,0.10)', color: 'rgba(240,184,41,0.75)', border: '1.5px solid rgba(240,184,41,0.25)' }}
              data-testid="button-goto-register"
            >
              Create Account
            </button>
            <button
              onClick={() => setMode('guest')}
              className="w-full h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.97] text-white/30 hover:text-white/50"
              data-testid="button-goto-guest"
            >
              Play as Guest
            </button>
            <p className="text-[10px] font-mono mt-1 text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.30)' }}>
              Virtual chips are for entertainment only. They have no cash value, cannot be redeemed, and cannot be withdrawn.
            </p>
            <p className="text-[9px] font-mono text-center" style={{ color: 'rgba(255,255,255,0.15)' }}>
              <a href="/terms" className="underline hover:text-white/35 transition-colors">Terms</a>
              {' · '}
              <a href="/privacy" className="underline hover:text-white/35 transition-colors">Privacy Policy</a>
              {' · '}13+
            </p>
          </div>
        )}

        {/* ── BACK button (non-choose screens) ─────────────────────────────── */}
        {mode !== 'choose' && (
          <button
            onClick={() => { setMode('choose'); setError(null); }}
            className="text-[10px] font-mono text-white/25 hover:text-white/45 uppercase tracking-widest mb-4 self-start"
            data-testid="button-auth-back"
          >
            ‹ Back
          </button>
        )}

        {/* ── GUEST ──────────────────────────────────────────────────────────── */}
        {mode === 'guest' && (
          <form onSubmit={handleGuest} className="w-full">
            <p className="text-sm font-mono mb-4 leading-relaxed" style={{ color: 'rgba(255,255,255,0.50)' }} data-testid="text-guest-description">
              Play as guest now. Account features can be added later.
            </p>
            <label htmlFor="display-name" className="block text-[10px] font-mono uppercase tracking-[0.18em] mb-2.5 pl-1"
              style={{ color: 'rgba(255,255,255,0.22)' }}>
              Pick your handle
            </label>
            <div className={`flex gap-2 ${shaking ? 'animate-shake' : ''}`}>
              <input
                id="display-name"
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
                placeholder="AceHunter, BluffKing…"
                maxLength={16}
                autoFocus
                autoComplete="off"
                className={inputCls}
                style={inputStyle('name')}
                data-testid="input-display-name"
              />
              <button
                type="submit"
                disabled={!validGuest}
                className="h-12 px-6 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.97] shrink-0"
                style={{
                  backgroundColor: validGuest ? '#F0B829' : 'rgba(240,184,41,0.08)',
                  color: validGuest ? '#05050A' : 'rgba(240,184,41,0.25)',
                  boxShadow: validGuest ? '0 4px 24px rgba(240,184,41,0.30)' : 'none',
                }}
                data-testid="button-enter"
              >
                Run It →
              </button>
            </div>
            {input.length > 0 && !validGuest && (
              <p className="text-[11px] font-mono mt-2 pl-1" style={{ color: 'rgba(220,38,38,0.55)' }}>
                Handle must be 2–16 characters
              </p>
            )}
            <p className="text-[10px] font-mono mt-4 text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.22)' }}>
              Guest progress saved on this device only. Create an account any time to save across devices.
            </p>
          </form>
        )}

        {/* ── LOG IN ─────────────────────────────────────────────────────────── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-[0.18em] mb-2 pl-1" style={{ color: 'rgba(255,255,255,0.22)' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                placeholder="you@example.com" autoComplete="email" className={inputCls} style={inputStyle('email')}
                data-testid="input-login-email" />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-[0.18em] mb-2 pl-1" style={{ color: 'rgba(255,255,255,0.22)' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                placeholder="••••••••" autoComplete="current-password" className={inputCls} style={inputStyle('password')}
                data-testid="input-login-password" />
            </div>
            {error && <p className="text-[11px] font-mono text-red-400/70 text-center" data-testid="text-login-error">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.97] mt-1"
              style={{
                backgroundColor: busy ? 'rgba(240,184,41,0.25)' : '#F0B829',
                color: busy ? 'rgba(240,184,41,0.4)' : '#05050A',
                boxShadow: busy ? 'none' : '0 4px 24px rgba(240,184,41,0.30)',
              }}
              data-testid="button-login-submit">
              {busy ? '…' : 'Log In'}
            </button>
            <button type="button" onClick={() => { setMode('register'); setError(null); }}
              className="text-[11px] font-mono text-white/25 hover:text-white/45 text-center transition-colors"
              data-testid="button-switch-to-register">
              No account? Create one →
            </button>
          </form>
        )}

        {/* ── REGISTER ───────────────────────────────────────────────────────── */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="w-full flex flex-col gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-[0.18em] mb-2 pl-1" style={{ color: 'rgba(255,255,255,0.22)' }}>Display Name</label>
              <input type="text" value={input} onChange={e => setInput(e.target.value)}
                onFocus={() => setFocused('name')} onBlur={() => setFocused(null)}
                placeholder="AceHunter" maxLength={32} autoComplete="nickname" className={inputCls} style={inputStyle('name')}
                data-testid="input-register-name" />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-[0.18em] mb-2 pl-1" style={{ color: 'rgba(255,255,255,0.22)' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                placeholder="you@example.com" autoComplete="email" className={inputCls} style={inputStyle('email')}
                data-testid="input-register-email" />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-[0.18em] mb-2 pl-1" style={{ color: 'rgba(255,255,255,0.22)' }}>Password <span style={{ color: 'rgba(255,255,255,0.12)' }}>(min 8 chars)</span></label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                placeholder="••••••••" autoComplete="new-password" className={inputCls} style={inputStyle('password')}
                data-testid="input-register-password" />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-[0.18em] mb-2 pl-1" style={{ color: 'rgba(255,255,255,0.22)' }}>Confirm Password</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                onFocus={() => setFocused('confirm')} onBlur={() => setFocused(null)}
                placeholder="••••••••" autoComplete="new-password" className={inputCls} style={inputStyle('confirm')}
                data-testid="input-register-confirm" />
            </div>
            {error && <p className="text-[11px] font-mono text-red-400/70 text-center" data-testid="text-register-error">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.97] mt-1"
              style={{
                backgroundColor: busy ? 'rgba(240,184,41,0.25)' : '#F0B829',
                color: busy ? 'rgba(240,184,41,0.4)' : '#05050A',
                boxShadow: busy ? 'none' : '0 4px 24px rgba(240,184,41,0.30)',
              }}
              data-testid="button-register-submit">
              {busy ? '…' : 'Create Account'}
            </button>
            <button type="button" onClick={() => { setMode('login'); setError(null); }}
              className="text-[11px] font-mono text-white/25 hover:text-white/45 text-center transition-colors"
              data-testid="button-switch-to-login">
              Already have an account? Log in →
            </button>
            <p className="text-[10px] font-mono text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.28)' }}>
              By creating an account you agree to our{' '}
              <a href="/terms" className="underline hover:text-white/50 transition-colors">Terms</a>
              {' & '}
              <a href="/privacy" className="underline hover:text-white/50 transition-colors">Privacy Policy</a>.
              {' '}Virtual chips only · No cash value · 13+
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
