// ─── AuthModal ─────────────────────────────────────────────────────────────────
// Slide-up modal for Log In / Create Account.
// On success, adopts the returned profileId as the localStorage identity UUID
// so all future API calls use the account profile (chips, hands, level restored).

import { useState } from 'react';
import { savePlayerIdentity } from '@/lib/persistence';
import { apiUrl } from '@/lib/apiConfig';

interface AuthModalProps {
  open:         boolean;
  defaultTab?:  'login' | 'register';
  onClose:      () => void;
  onSuccess:    (displayName: string) => void;
}

export function AuthModal({ open, defaultTab = 'login', onClose, onSuccess }: AuthModalProps) {
  const [tab,           setTab]         = useState<'login' | 'register'>(defaultTab);
  const [displayName,   setDisplayName] = useState('');
  const [email,         setEmail]       = useState('');
  const [password,      setPassword]    = useState('');
  const [confirmPw,     setConfirmPw]   = useState('');
  const [busy,          setBusy]        = useState(false);
  const [error,         setError]       = useState<string | null>(null);

  if (!open) return null;

  const clearForm = () => {
    setDisplayName(''); setEmail(''); setPassword(''); setConfirmPw(''); setError(null);
  };

  const switchTab = (t: 'login' | 'register') => { setTab(t); clearForm(); };

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
      // Adopt the account's profileId as our local identity UUID so chips restore
      savePlayerIdentity({
        id:         data.profileId,
        name:       data.displayName,
        avatarSeed: data.profileId.slice(0, 8),
        createdAt:  Date.now(),
      });
      onSuccess(data.displayName);
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimName = displayName.trim();
    const trimEmail = email.trim().toLowerCase();
    if (trimName.length < 2 || trimName.length > 32) { setError('Display name must be 2–32 characters.'); return; }
    if (!trimEmail.includes('@'))                      { setError('Enter a valid email address.'); return; }
    if (password.length < 8)                           { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPw)                        { setError('Passwords do not match.'); return; }

    // Grab the current guest identity UUID to link to this new account
    const { ensurePlayerIdentity } = await import('@/lib/persistence');
    const guestIdentity = ensurePlayerIdentity();

    setBusy(true);
    try {
      const res = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityId:  guestIdentity.id,
          email:       trimEmail,
          password,
          displayName: trimName,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Registration failed.'); return; }
      // The server just linked credentials to our current guestIdentity.id,
      // so the profileId is the same UUID — just update the name if changed.
      savePlayerIdentity({
        id:         data.profileId,
        name:       data.displayName,
        avatarSeed: data.profileId.slice(0, 8),
        createdAt:  guestIdentity.createdAt,
      });
      onSuccess(data.displayName);
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = `
    w-full h-11 px-3.5 rounded-xl font-mono text-sm focus:outline-none transition-all duration-200
    bg-[#17171F] text-white/88 border border-white/[0.08]
    focus:border-[rgba(240,184,41,0.45)] focus:shadow-[0_0_0_3px_rgba(240,184,41,0.08)]
  `;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-0 sm:pb-4"
      data-testid="modal-auth"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        data-testid="modal-auth-backdrop"
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-sm rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
        style={{ backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-white/10 mx-auto mt-3 mb-1 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">⛓️ CGP Account</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
            data-testid="button-auth-close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mx-5 mb-4 rounded-xl bg-white/[0.04] border border-white/[0.04] p-1">
          {(['login', 'register'] as const).map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={[
                'flex-1 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all duration-200',
                tab === t ? 'bg-white/[0.07] text-white/75' : 'text-white/25 hover:text-white/45',
              ].join(' ')}
              data-testid={`tab-auth-${t}`}
            >
              {t === 'login' ? 'Log In' : 'Create Account'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form
          onSubmit={tab === 'login' ? handleLogin : handleRegister}
          className="flex flex-col gap-3 px-5 pb-6"
        >
          {tab === 'register' && (
            <div>
              <label className="block text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1.5">
                Display Name
              </label>
              <input
                className={inputCls}
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="AceHunter"
                maxLength={32}
                autoComplete="nickname"
                data-testid="input-auth-name"
              />
            </div>
          )}

          <div>
            <label className="block text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1.5">
              Email
            </label>
            <input
              className={inputCls}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              data-testid="input-auth-email"
            />
          </div>

          <div>
            <label className="block text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1.5">
              Password {tab === 'register' && <span className="text-white/15">(min 8 characters)</span>}
            </label>
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              data-testid="input-auth-password"
            />
          </div>

          {tab === 'register' && (
            <div>
              <label className="block text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1.5">
                Confirm Password
              </label>
              <input
                className={inputCls}
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                data-testid="input-auth-confirm-password"
              />
            </div>
          )}

          {error && (
            <p className="text-[11px] font-mono text-red-400/70 text-center" data-testid="text-auth-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.97] mt-1"
            style={{
              backgroundColor: busy ? 'rgba(240,184,41,0.25)' : '#F0B829',
              color: busy ? 'rgba(240,184,41,0.4)' : '#05050A',
              boxShadow: busy ? 'none' : '0 4px 20px rgba(240,184,41,0.30)',
            }}
            data-testid="button-auth-submit"
          >
            {busy ? '…' : tab === 'login' ? 'Log In' : 'Create Account'}
          </button>

          {tab === 'register' && (
            <p className="text-[9px] font-mono text-white/15 text-center leading-relaxed">
              Virtual chips only · No cash value · For entertainment
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
