import { useLocation } from 'wouter';

export default function CheckoutCancel() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-[#070709] flex flex-col items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(248,113,113,0.08) 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-sm w-full text-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
          style={{ backgroundColor: 'rgba(248,113,113,0.10)', border: '2px solid rgba(248,113,113,0.25)' }}
          data-testid="icon-cancel"
        >
          ✕
        </div>

        <div>
          <h1 className="text-2xl font-bold font-sans text-white/90 mb-2" data-testid="text-cancel-title">
            Purchase Canceled
          </h1>
          <p className="text-white/45 text-sm font-mono leading-relaxed" data-testid="text-cancel-body">
            No charge was made to your card.
            <br />
            You can try again any time.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 w-full">
          <button
            onClick={() => navigate('/shop')}
            className="w-full h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 active:scale-[0.98] hover:opacity-90"
            style={{ backgroundColor: '#C9A227', color: '#0B0B0D' }}
            data-testid="button-try-again"
          >
            Try Again
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full h-10 rounded-xl text-sm font-mono text-white/35 hover:text-white/60 transition-colors border border-white/[0.06]"
            data-testid="button-go-lobby"
          >
            Go to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
