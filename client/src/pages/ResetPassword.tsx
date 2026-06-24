import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { apiUrl } from '@/lib/apiConfig';

export default function ResetPassword() {
  const [, navigate] = useLocation();

  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy,            setBusy]            = useState(false);
  const [success,         setSuccess]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const inputCls = `
    w-full h-11 px-3.5 rounded-xl font-mono text-sm focus:outline-none transition-all duration-200
    bg-[#17171F] text-white/88 border border-white/[0.08]
    focus:border-[rgba(240,184,41,0.45)] focus:shadow-[0_0_0_3px_rgba(240,184,41,0.08)]
  `;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8)          { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!token)                          { setError('Missing reset token. Please request a new link.'); return; }

    setBusy(true);
    try {
      const res = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Something went wrong. Please try again.'); return; }
      setSuccess(true);
      setTimeout(() => navigate('/'), 2000);
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, #12102A 0%, #05050A 70%)' }}>
      <div className="w-full max-w-sm flex flex-col items-center gap-6">

        {/* Crown */}
        <div className="text-5xl" aria-hidden="true">♛</div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#F0B829' }}>
            Reset Password
          </h1>
          <p className="text-[12px] font-mono mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Choose a new password for your account
          </p>
        </div>

        {/* Card */}
        <div className="w-full rounded-2xl p-6 flex flex-col gap-4"
          style={{ backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.07)' }}>

          {success ? (
            <div className="text-center py-4 flex flex-col gap-3">
              <div className="text-3xl">✅</div>
              <p className="text-[13px] font-mono leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}
                data-testid="text-reset-success">
                Password reset successfully.<br />
                Redirecting to login…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {!token && (
                <p className="text-[11px] font-mono text-center" style={{ color: 'rgba(239,68,68,0.75)' }}>
                  No reset token found. Please request a new reset link.
                </p>
              )}

              <div>
                <label className="block text-[9px] font-mono uppercase tracking-widest mb-1.5"
                  style={{ color: 'rgba(255,255,255,0.25)' }}>
                  New Password <span style={{ color: 'rgba(255,255,255,0.15)' }}>(min 8 characters)</span>
                </label>
                <input
                  className={inputCls}
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  data-testid="input-reset-password"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono uppercase tracking-widest mb-1.5"
                  style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Confirm Password
                </label>
                <input
                  className={inputCls}
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  data-testid="input-reset-confirm"
                />
              </div>

              {error && (
                <p className="text-[11px] font-mono text-center" style={{ color: 'rgba(239,68,68,0.75)' }}
                  data-testid="text-reset-error">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || !token}
                className="h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.97]"
                style={{
                  backgroundColor: (busy || !token) ? 'rgba(240,184,41,0.25)' : '#F0B829',
                  color: (busy || !token) ? 'rgba(240,184,41,0.4)' : '#05050A',
                  boxShadow: (busy || !token) ? 'none' : '0 4px 20px rgba(240,184,41,0.30)',
                }}
                data-testid="button-reset-submit">
                {busy ? '…' : 'Reset Password'}
              </button>
            </form>
          )}

          <Link href="/"
            className="text-[11px] font-mono text-center transition-colors"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            data-testid="link-reset-back">
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
