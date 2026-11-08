import { useState, useEffect, useRef, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { getPlayerName, setPlayerName, ensurePlayerIdentity, savePlayerIdentity } from "@/lib/persistence";
import { apiUrl } from "@/lib/apiConfig";
import { apiFetch, setSessionToken, clearSessionToken } from "@/lib/session";
import { useOptionalServerProfile } from "@/lib/useServerProfile";
import { BrandBackground } from "./BrandBackground";
import { ChainMark } from "./ChainMark";
import { Zap, Flame, Trophy } from "lucide-react";
import { track, setUserId, fire2 } from "@/lib/analytics";
import { clearSavedReferralCode, getSavedReferralCode } from "@/lib/referralAttribution";

const AGE_KEY = 'cgp_age_17_confirmed';

function getAgeConfirmed(): boolean {
  try { return localStorage.getItem(AGE_KEY) === '1'; } catch { return false; }
}
function setAgeConfirmed(): void {
  try { localStorage.setItem(AGE_KEY, '1'); } catch {}
}
function getGuestLockCode(): string | null {
  try { return localStorage.getItem('guest_locked'); } catch { return null; }
}

function getInitialPlayerName(): string {
  try {
    if (localStorage.getItem('just_logged_out') === '1') return '';
  } catch {}
  return getPlayerName() ?? '';
}

interface WelcomeGateProps {
  children: ReactNode;
}

const LEGAL_PATHS = ['/terms', '/privacy'];

export function WelcomeGate({ children }: WelcomeGateProps) {
  const [location] = useLocation();
  const autoDismissPending = useRef(false);
  const [ageOk, setAgeOk]   = useState(() => getAgeConfirmed());
  const [name,  setName]    = useState(getInitialPlayerName);
  const [welcomeBackOpen, setWelcomeBackOpen] = useState(() => {
    try {
      // Detroit 2026-10-12: only show once per session
      if (sessionStorage.getItem('cgp_welcome_back_shown') === '1') return false;
      if (sessionStorage.getItem('cgp_skip_welcome_back_once') === '1') {
        sessionStorage.removeItem('cgp_skip_welcome_back_once');
        autoDismissPending.current = Boolean(getInitialPlayerName());
        return false;
      }
    } catch {}
    return Boolean(getInitialPlayerName());
  });
  useEffect(() => {
    if (ageOk && name && autoDismissPending.current) {
      autoDismissPending.current = false;
      try { sessionStorage.setItem('cgp_welcome_back_shown', '1'); } catch {}
      fire2("welcome_back_dismissed", { via: "auto" });
    }
  }, [ageOk, name]);

  // Clear the just_logged_out flag once the welcome/login screen is showing.
  // DiamondBackground's useServerProfile effect fires first (sibling order) and
  // reads the flag to skip auto-guest-init; this effect fires after that.
  useEffect(() => {
    if (!name) {
      try { localStorage.removeItem('just_logged_out'); } catch {}
    }
  }, [name]);

  // GUEST-AUTH FIX (1.9): when the server refuses this device's guest (403
  // RECOVERY_REQUIRED / GUEST_PROOF_REQUIRED), useServerProfile leaves the
  // profile null and records the code in localStorage. Surface the recovery
  // path instead of landing the player in a profile-less app with no reason.
  const serverProfile = useOptionalServerProfile();
  const [recovering, setRecovering] = useState(false);
  const guestLockCode = serverProfile && !serverProfile.loading && !serverProfile.profile
    ? getGuestLockCode()
    : null;

  // A loaded profile means the lock resolved (e.g. after sign-in) — clear it.
  useEffect(() => {
    if (serverProfile?.profile) {
      try { localStorage.removeItem('guest_locked'); } catch {}
    }
  }, [serverProfile?.profile]);

  const startFreshGuest = () => {
    try {
      localStorage.removeItem('poker_table_identity');
      localStorage.removeItem('guest_locked');
      localStorage.removeItem('just_logged_out');
    } catch {}
    clearSessionToken();
    window.location.reload();
  };

  // Wouter location (reactive): client-side navigation to /terms or /privacy
  // must re-render the gate so the legal-page bypass engages — reading
  // window.location.pathname here would go stale after an SPA navigation.
  const onLegalPage = LEGAL_PATHS.includes(location);

  if (!ageOk && !onLegalPage) {
    return (
      <AgeGate onConfirm={() => { setAgeConfirmed(); setAgeOk(true); track({ name: 'age_gate_accepted' }); fire2("age_gate_accepted"); }} />
    );
  }
  if (onLegalPage) return <>{children}</>;
  if (guestLockCode && !recovering) {
    return <GuestRecoveryNotice code={guestLockCode} onSignIn={() => setRecovering(true)} onStartOver={startFreshGuest} />;
  }
  if (guestLockCode && recovering) {
    return <WelcomeScreen onComplete={(n, method) => {
      // On the recovery path, "guest" means a fresh start — the locked
      // identity can never load on this device, so wipe it and reload.
      if (method === 'guest') { startFreshGuest(); return; }
      try { localStorage.removeItem('guest_locked'); } catch {}
      setPlayerName(n); fire2("signup_completed", { method, name_length: n.length });
      void serverProfile?.refetch();
      setName(n);
    }} />;
  }
  if (name && welcomeBackOpen) {
    return <WelcomeBackScreen name={name} onPlay={() => { fire2("welcome_back_dismissed", { via: "play_now" }); try { sessionStorage.setItem('cgp_welcome_back_shown', '1'); } catch {} setWelcomeBackOpen(false); }} />;
  }
  if (name) return <>{children}</>;
  return <WelcomeScreen onComplete={(n, method) => { setPlayerName(n); fire2("signup_completed", { method, name_length: n.length }); setName(n); }} />;
}

// ── Guest Recovery Notice (GUEST-AUTH FIX, 1.9) ─────────────────────────────
// Shown when the server would not load this device's guest profile. The
// profile still exists server-side; recovery is sign-in, or support with a
// Google Play order ID for guests who purchased (see support playbook).
function GuestRecoveryNotice({ code, onSignIn, onStartOver }: { code: string; onSignIn: () => void; onStartOver: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <BrandBackground variant="welcome">
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-10">
        <div
          className="w-full max-w-sm rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center gap-5"
          style={{
            background: 'rgba(7,7,16,0.78)',
            border: '1px solid rgba(240,184,41,0.18)',
            boxShadow: '0 0 48px rgba(0,0,0,0.55), 0 0 1px rgba(240,184,41,0.12)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.94)' }}>This guest couldn&rsquo;t be verified</h1>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.62)' }}>
              To stop account theft, a guest profile now has to prove it belongs to this device.
              This device couldn&rsquo;t prove it owns the guest saved here, so the profile wasn&rsquo;t loaded.
              Nothing was deleted.
            </p>
            {code === 'RECOVERY_REQUIRED' ? (
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.62)' }}>
                That guest has purchases or a subscription on it. If you ever created an account,
                sign in and everything comes back. If you checked out as a guest, hold onto your
                Google Play order ID (it starts with GPA) — support can restore the profile with it.
              </p>
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.62)' }}>
                If you ever created an account, sign in and pick up right where you left off.
              </p>
            )}
          </div>
          <button
            onClick={onSignIn}
            className="w-full rounded-xl px-5 py-3 font-semibold"
            style={{ background: 'rgba(240,184,41,0.92)', color: '#14100a' }}
          >
            Sign in
          </button>
          <button
            onClick={() => { if (confirming) { onStartOver(); } else { setConfirming(true); } }}
            className="w-full rounded-xl px-5 py-3 font-semibold"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.85)' }}
          >
            {confirming
              ? 'Tap again to confirm — the old guest won\u2019t load on this device anymore'
              : 'Start over as a new guest'}
          </button>
        </div>
      </div>
    </BrandBackground>
  );
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
            background: 'rgba(7,7,16,0.78)',
            border: '1px solid rgba(240,184,41,0.18)',
            boxShadow: '0 0 48px rgba(0,0,0,0.55), 0 0 1px rgba(240,184,41,0.12)',
            backdropFilter: 'blur(8px)',
            transform: 'translateY(-35px)',
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
            <ChainMark width={32} color="rgba(240,184,41,0.95)" />
          </div>

          {/* Title */}
          <div>
            <h1
              className="text-xl font-bold font-sans mb-1"
              style={{ color: 'rgba(255,255,255,0.93)', textShadow: '0 2px 12px rgba(255,255,255,0.15)' }}
              data-testid="text-age-gate-title"
            >
              Welcome to Chain Gang Poker
            </h1>
            <p
              className="text-xs font-mono"
              style={{ color: 'rgba(255,255,255,0.38)' }}
              data-testid="text-age-gate-body"
            >
              You must be 17 or older to use this app.
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
            className="w-full h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-150 active:scale-[0.97] hover:scale-[1.02]"
            style={{
              backgroundColor: '#F0B829',
              color: '#05050A',
              boxShadow: '0 4px 28px rgba(240,184,41,0.32), 0 6px 20px rgba(255,200,80,0.35)',
              letterSpacing: '0.5px',
            }}
            data-testid="button-age-confirm"
          >
            I am 17 or older — Continue
          </button>

          {/* Legal links footer */}
          <p className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.22)' }}>
            By continuing, you confirm you meet the required age and agree to the{' '}
            <Link
              href="/terms"
              className="underline underline-offset-2 transition-colors"
              style={{ color: 'rgba(240,184,41,0.50)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(240,184,41,0.80)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,184,41,0.50)')}
            >
              Terms
            </Link>
            {' & '}
            <Link
              href="/privacy"
              className="underline underline-offset-2 transition-colors"
              style={{ color: 'rgba(240,184,41,0.50)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(240,184,41,0.80)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,184,41,0.50)')}
            >
              Privacy Policy
            </Link>
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

// ── Welcome Back ──────────────────────────────────────────────────────────────
function WelcomeBackScreen({ onPlay }: { name: string; onPlay: () => void }) {
  return (
    <div className="w-full h-[100dvh] overflow-hidden bg-black grid place-items-center">
      {/* The poster is 941×1672. Keep the art and its hit target in the SAME
          uncropped frame. Screen-relative percentages over object-cover miss
          the painted button on iPad and can crop it out in landscape. */}
      <div
        className="relative"
        style={{ width: 'min(100%, calc(100dvh * 941 / 1672))', aspectRatio: '941 / 1672' }}
      >
        <img
          src="/welcome-back-chain-gang.webp"
          alt="Chain Gang Poker — Welcome Back"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          draggable={false}
        />
        <button
          type="button"
          onClick={onPlay}
          aria-label="Play now"
          className="absolute z-10 appearance-none border-0 bg-transparent p-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F0B829]"
          style={{
            left: '15.8%',
            top: '71.9%',
            width: '68.3%',
            height: '9.8%',
          }}
          data-testid="button-welcome-back-play"
        />
      </div>
    </div>
  );
}

// ── Feature list ──────────────────────────────────────────────────────────────
// P4: feature icons are brand/vector marks, not OS emoji — the chain is
// the shared ChainMark, the rest are Lucide in brand gold.
const FEATURES: { icon: ReactNode; title: string; sub: string }[] = [
  { icon: <ChainMark width={19} color="rgba(240,184,41,0.9)" />, title: '4 Games You Won’t Find Anywhere Else', sub: 'Badugi · Flushed Up · Box Chevy · Lady Luck' },
  { icon: <Zap size={16} color="rgba(240,184,41,0.9)" />, title: 'Real Multiplayer', sub: 'Create a private table, share the link, run it with your crew' },
  { icon: <Flame size={16} color="rgba(240,184,41,0.9)" />, title: 'Streak Bonuses Every Day', sub: 'Come back daily for growing chip rewards — up to 7 days deep' },
  { icon: <Trophy size={16} color="rgba(240,184,41,0.9)" />, title: 'Rank Up from Bronze to Master', sub: 'XP system, 6 rank tiers, 12 achievements to unlock' },
];

type Mode = 'choose' | 'guest' | 'login' | 'register';

function WelcomeScreen({ onComplete }: { onComplete: (name: string, method: "guest" | "login" | "create_account") => void }) {
  const [mode,      setMode]      = useState<Mode>('choose');
  const [input,     setInput]     = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [referralCode, setReferralCode] = useState(getSavedReferralCode);
  const [shaking,   setShaking]   = useState(false);
  const [focused,   setFocused]   = useState<string | null>(null);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const trimName = input.trim();
  const validGuest = trimName.length >= 2 && trimName.length <= 16;

  const handleGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validGuest) { setShaking(true); setTimeout(() => setShaking(false), 500); return; }
    onComplete(trimName, "guest");
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
      if (data.sessionToken) setSessionToken(data.sessionToken);
      clearSavedReferralCode();
      onComplete(data.displayName, "login");
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
      // GUEST-AUTH FIX: apiFetch sends this device's session, which is what the server registers.
      const res = await apiFetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          displayName: dn,
          referralCode: referralCode.trim().toUpperCase() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Registration failed. Try again.'); return; }
      savePlayerIdentity({
        id: data.profileId, name: data.displayName,
        avatarSeed: data.profileId.slice(0, 8), createdAt: guest.createdAt,
      });
      if (data.sessionToken) setSessionToken(data.sessionToken);
      clearSavedReferralCode();
      track({ name: 'account_created', from: 'guest' });
      setUserId(data.profileId);
      onComplete(data.displayName, "create_account");
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
          <ChainMark width={42} color="rgba(240,184,41,0.95)" />
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

        <div className="mb-6" />

        {/* Feature list — only on choose screen */}
        {mode === 'choose' && (
          <div className="w-full rounded-2xl p-4 mb-5 space-y-3"
            style={{ backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.06)' }}>
            {FEATURES.map(f => (
              <div key={f.title} className="flex items-start gap-3">
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
              <Link href="/terms" className="underline hover:text-white/35 transition-colors">Terms</Link>
              {' · '}
              <Link href="/privacy" className="underline hover:text-white/35 transition-colors">Privacy Policy</Link>
              {' · '}17+
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
              <p className="text-[11px] font-mono mt-2 pl-1" style={{ color: 'rgba(220,38,38,0.60)' }}>
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
            <Link href="/forgot-password"
              className="text-[11px] font-mono text-center transition-colors"
              style={{ color: 'rgba(255,255,255,0.22)' }}
              data-testid="link-forgot-password">
              Forgot password?
            </Link>
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
              <label className="block text-[10px] font-mono uppercase tracking-[0.18em] mb-2 pl-1" style={{ color: 'rgba(255,255,255,0.22)' }}>Invite Code (Optional)</label>
              <input type="text" value={referralCode}
                onChange={e => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16))}
                onFocus={() => setFocused('referral')} onBlur={() => setFocused(null)}
                placeholder="From a friend or crew" autoComplete="off" className={inputCls} style={inputStyle('referral')}
                data-testid="input-welcome-referral-code" />
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
              <Link href="/terms" className="underline hover:text-white/50 transition-colors">Terms</Link>
              {' & '}
              <Link href="/privacy" className="underline hover:text-white/50 transition-colors">Privacy Policy</Link>.
              {' '}Virtual chips only · No cash value · 17+
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
