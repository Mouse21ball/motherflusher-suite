import { useState } from 'react';
import { claimStarterPack, isStarterPackClaimed, STARTER_PACK_CHIPS, STARTER_PACK_EMOTES, DISCLAIMER } from '@/lib/retention';
import { saveChips, getChips, ensurePlayerIdentity } from '@/lib/persistence';
import { apiUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';

interface StarterPackModalProps {
  open: boolean;
  onClose: (claimed?: boolean) => void;
}

const PACK_CONTENTS = [
  {
    icon: '🪙',
    label: `${STARTER_PACK_CHIPS.toLocaleString()} Virtual Chips`,
    sub: 'Loaded across all game modes instantly',
    highlight: true,
  },
  {
    icon: '💜',
    label: '250 Stripes',
    sub: 'Your starter premium currency — spend on cosmetics and Crews',
    highlight: false,
  },
];

const MODES = ['badugi', 'dead7', 'fifteen35', 'suitspoker'];

export function StarterPackModal({ open, onClose }: StarterPackModalProps) {
  const [claimed,   setClaimed]   = useState(isStarterPackClaimed);
  const [animating, setAnimating] = useState(false);

  if (!open) return null;

  const handleClaim = () => {
    if (animating || claimed) return;
    setAnimating(true);
    const { chips } = claimStarterPack();
    for (const modeId of MODES) {
      saveChips(modeId, getChips(modeId) + chips);
    }

    // Persist to DB so balance survives refresh/login on any device
    const identity = ensurePlayerIdentity();
    apiFetch(apiUrl(`/api/players/${identity.id}/bonus-chips`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chips }),
    }).catch(() => {});

    // Mark welcome kit claimed in DB — persists across devices/browsers
    apiFetch(apiUrl(`/api/players/${identity.id}/claim-welcome-kit`), {
      method: 'POST',
    }).catch(() => {});

    // T09: Signal the ReactionBar to show its one-time "Emotes unlocked" badge
    // the next time the game table renders.
    try { localStorage.setItem('cgp_emotes_just_unlocked', '1'); } catch {}

    setTimeout(() => {
      setClaimed(true);
      setAnimating(false);
    }, 600);
  };

  const emoteCount = STARTER_PACK_EMOTES;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={() => onClose(claimed)}
      />
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          backgroundColor: '#141417',
          border: '1px solid rgba(240,184,41,0.22)',
          boxShadow: '0 0 60px rgba(240,184,41,0.12)',
        }}
      >
        {/* Gold ambient glow */}
        <div
          className="absolute -top-14 left-1/2 -translate-x-1/2 w-52 h-52 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(240,184,41,0.18) 0%, transparent 70%)' }}
        />

        <div className="relative p-6 flex flex-col items-center gap-4">

          {/* Header */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-4xl leading-none">{claimed ? '🎉' : '🎁'}</div>
            <div
              className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: 'rgba(240,184,41,0.12)',
                color: 'rgba(240,184,41,0.75)',
                border: '1px solid rgba(240,184,41,0.20)',
              }}
            >
              New Player Exclusive
            </div>
            <h2
              className="text-xl font-bold text-white/90 font-sans text-center mt-0.5"
              data-testid="text-starter-title"
            >
              New Player Advantage Kit
            </h2>
            {!claimed && (
              <p className="text-xs text-white/40 font-mono text-center">
                One-time claim · all virtual chips — no purchase needed
              </p>
            )}
          </div>

          {/* Pack contents */}
          <div className="w-full flex flex-col gap-2">
            {PACK_CONTENTS.map((item, i) => (
              <div
                key={i}
                className={[
                  'w-full rounded-xl p-3 flex items-center gap-3',
                  item.highlight
                    ? 'border'
                    : 'border',
                ].join(' ')}
                style={{
                  backgroundColor: item.highlight ? 'rgba(240,184,41,0.07)' : 'rgba(255,255,255,0.025)',
                  borderColor: item.highlight ? 'rgba(240,184,41,0.18)' : 'rgba(255,255,255,0.05)',
                }}
                data-testid={`starter-item-${i}`}
              >
                <div className="text-xl leading-none shrink-0">{item.icon}</div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-bold font-sans"
                    style={{ color: item.highlight ? '#F0B829' : 'rgba(255,255,255,0.75)' }}
                  >
                    {item.label}
                  </div>
                  <div className="text-[10px] font-mono text-white/30 mt-0.5 leading-tight">{item.sub}</div>
                </div>
                {claimed && <span className="text-sm shrink-0 text-emerald-400">✓</span>}
              </div>
            ))}
          </div>

          {/* CTA */}
          {!claimed ? (
            <button
              onClick={handleClaim}
              disabled={animating}
              className={[
                'w-full h-12 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200',
                animating ? 'opacity-70 cursor-not-allowed' : 'hover:scale-[1.01] active:scale-[0.98]',
              ].join(' ')}
              style={{
                backgroundColor: '#F0B829',
                color: '#05050A',
                boxShadow: '0 4px 24px rgba(240,184,41,0.40)',
                letterSpacing: '0.5px',
              }}
              data-testid="button-claim-starter"
            >
              {animating ? 'Claiming Kit…' : 'Claim Free Starter Kit'}
            </button>
          ) : (
            <div className="w-full flex flex-col items-center gap-2.5">
              <div
                className="w-full rounded-xl py-3 px-4 text-center"
                style={{ backgroundColor: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.20)' }}
                data-testid="text-starter-claimed"
              >
                <div className="text-sm font-bold text-emerald-400">
                  Kit Claimed! +${STARTER_PACK_CHIPS.toLocaleString()} chips added
                </div>
                <div className="text-[10px] font-mono text-emerald-400/55 mt-0.5">
                  {emoteCount} reaction emotes unlocked · Bronze badge active
                </div>
                <div className="text-[10px] font-mono text-emerald-400/55 mt-0.5">
                  +250 Stripes added · spend in Style &amp; Crews
                </div>
              </div>
              <button
                onClick={() => onClose(true)}
                className="w-full h-11 rounded-xl bg-white/[0.04] border border-white/[0.06] font-semibold text-sm text-white/60 hover:text-white/80 transition-all"
                data-testid="button-close-starter"
              >
                Let's Play →
              </button>
            </div>
          )}

          {/* Compliance disclaimer */}
          <p
            className="text-[9px] font-mono text-white/20 text-center leading-relaxed"
            data-testid="text-starter-disclaimer"
          >
            {DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  );
}
