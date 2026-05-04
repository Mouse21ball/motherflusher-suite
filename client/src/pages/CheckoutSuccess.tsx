import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

export default function CheckoutSuccess() {
  const [, navigate] = useLocation();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          navigate('/shop');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [navigate]);

  return (
    <div className="min-h-[100dvh] bg-[#070709] flex flex-col items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(45,189,110,0.14) 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-sm w-full text-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
          style={{ backgroundColor: 'rgba(45,189,110,0.12)', border: '2px solid rgba(45,189,110,0.35)' }}
          data-testid="icon-success"
        >
          ✓
        </div>

        <div>
          <h1 className="text-2xl font-bold font-sans text-white/90 mb-2" data-testid="text-success-title">
            Purchase Successful!
          </h1>
          <p className="text-white/45 text-sm font-mono leading-relaxed" data-testid="text-success-body">
            Your chips are being added to your bankroll.
            <br />
            It may take a few seconds to appear.
          </p>
        </div>

        <div
          className="w-full rounded-2xl p-4 border"
          style={{ backgroundColor: 'rgba(45,189,110,0.06)', borderColor: 'rgba(45,189,110,0.20)' }}
        >
          <p className="text-[11px] font-mono text-white/40 leading-relaxed">
            Chips are added server-side via secure Stripe webhook.
            <br />
            Test card: <strong className="text-white/60 font-bold">4242 4242 4242 4242</strong>
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 w-full">
          <button
            onClick={() => navigate('/shop')}
            className="w-full h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.98] hover:opacity-90"
            style={{ backgroundColor: '#2dbd6e', color: '#0B0B0D' }}
            data-testid="button-back-to-shop"
          >
            Back to Shop
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full h-10 rounded-xl text-sm font-mono text-white/35 hover:text-white/60 transition-colors border border-white/[0.06]"
            data-testid="button-go-lobby"
          >
            Go to Lobby
          </button>
        </div>

        <p className="text-[10px] font-mono text-white/20" data-testid="text-redirect-countdown">
          Redirecting to shop in {countdown}s…
        </p>
      </div>
    </div>
  );
}
