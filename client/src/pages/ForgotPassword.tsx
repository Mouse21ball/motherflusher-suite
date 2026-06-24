import { useState } from 'react';
import { Link } from 'wouter';
import { apiUrl } from '@/lib/apiConfig';

export default function ForgotPassword() {
  const [email,     setEmail]     = useState('');
  const [busy,      setBusy]      = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const inputCls = `
    w-full h-11 px-3.5 rounded-xl font-mono text-sm focus:outline-none transition-all duration-200
    bg-[#17171F] text-white/88 border border-white/[0.08]
    focus:border-[rgba(240,184,41,0.45)] focus:shadow-[0_0_0_3px_rgba(240,184,41,0.08)]
  `;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) { setError('Enter a valid email address.'); return; }
    setBusy(true);
    try {
      const res = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Something went wrong. Please try again.'); return; }
      setSuccess(true);
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
            Forgot Password
          </h1>
          <p className="text-[12px] font-mono mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Enter your email to receive a reset link
          </p>
        </div>

        {/* Card */}
        <div className="w-full rounded-2xl p-6 flex flex-col gap-4"
          style={{ backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.07)' }}>

          {success ? (
            <div className="text-center py-4 flex flex-col gap-3">
              <div className="text-3xl">📬</div>
              <p className="text-[13px] font-mono leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}
                data-testid="text-forgot-success">
                Check your email for a reset link.<br />
                It expires in 1 hour.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[9px] font-mono uppercase tracking-widest mb-1.5"
                  style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Email
                </label>
                <input
                  className={inputCls}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  data-testid="input-forgot-email"
                />
              </div>

              {error && (
                <p className="text-[11px] font-mono text-center" style={{ color: 'rgba(239,68,68,0.75)' }}
                  data-testid="text-forgot-error">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.97]"
                style={{
                  backgroundColor: busy ? 'rgba(240,184,41,0.25)' : '#F0B829',
                  color: busy ? 'rgba(240,184,41,0.4)' : '#05050A',
                  boxShadow: busy ? 'none' : '0 4px 20px rgba(240,184,41,0.30)',
                }}
                data-testid="button-forgot-submit">
                {busy ? '…' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <Link href="/"
            className="text-[11px] font-mono text-center transition-colors"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            data-testid="link-forgot-back">
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
