import { useState, useEffect, useRef } from 'react';
import { ensurePlayerIdentity } from '@/lib/persistence';
import { apiUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';
import { fire2 } from '@/lib/analytics';

// Detroit 2026-10-16: Commissary Wheel — the hourly drip as a spin ritual.
// Same backend, same chip cost. The spin is the psychology.

interface CommissaryWheelProps {
  open: boolean;
  onClose: (chipsClaimed?: number) => void;
}

const SEGMENTS = 8;
const COLORS = ['#F0B829', '#7C3AED', '#F0B829', '#7C3AED', '#F0B829', '#7C3AED', '#F0B829', '#7C3AED'];

export function CommissaryWheel({ open, onClose }: CommissaryWheelProps) {
  const [chips, setChips] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState('');
  const wheelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null); setError(''); setSpinning(false); setRotation(0);
    const identity = ensurePlayerIdentity();
    apiFetch(apiUrl(`/api/players/${identity.id}/rewards/status`))
      .then(r => r.json())
      .then(d => setChips(d.hourly?.chips ?? 0))
      .catch(() => setError('Unable to load'));
  }, [open]);

  if (!open) return null;

  const handleSpin = async () => {
    if (spinning || result !== null) return;
    setSpinning(true);
    setError('');

    // Random spin: 5-8 full rotations + random offset
    const spins = 5 + Math.random() * 3;
    const offset = Math.random() * 360;
    const newRotation = rotation + spins * 360 + offset;
    setRotation(newRotation);

    // Claim after spin animation (2.5s)
    setTimeout(async () => {
      try {
        const identity = ensurePlayerIdentity();
        const response = await apiFetch(apiUrl(`/api/players/${identity.id}/rewards/hourly/claim`), { method: 'POST' });
        if (!response.ok) throw new Error('On cooldown');
        const { chips: earned } = await response.json() as { chips: number };
        fire2("bonus_claimed", { type: "commissary_wheel", chips: earned, streak_day: 0 });
        setResult(earned);
      } catch {
        setError('Come back later');
        setSpinning(false);
      }
    }, 2600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" style={{ backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm rounded-2xl border-2 border-amber-300/40 bg-gradient-to-b from-purple-950 to-black p-6 text-center">
        <div className="text-xs font-bold uppercase tracking-widest text-amber-300/70 mb-1">The Yard Commissary</div>
        <h2 className="text-xl font-black text-white mb-4" style={{ fontFamily: 'Oswald, Impact, sans-serif' }}>
          SPIN FOR YOUR CUT
        </h2>

        {/* Wheel */}
        <div style={{ position: 'relative', width: 220, height: 220, margin: '0 auto 20px' }}>
          {/* Pointer */}
          <div style={{
            position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '12px solid transparent',
            borderRight: '12px solid transparent', borderTop: '20px solid #F0B829', zIndex: 10,
          }} />
          <div
            ref={wheelRef}
            style={{
              width: 220, height: 220, borderRadius: '50%',
              border: '4px solid #F0B829',
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 2.5s cubic-bezier(0.15, 0.85, 0.25, 1)' : 'none',
              background: `conic-gradient(${SEGMENTS === 8
                ? `${COLORS[0]} 0deg 45deg, ${COLORS[1]} 45deg 90deg, ${COLORS[2]} 90deg 135deg, ${COLORS[3]} 135deg 180deg, ${COLORS[4]} 180deg 225deg, ${COLORS[5]} 225deg 270deg, ${COLORS[6]} 270deg 315deg, ${COLORS[7]} 315deg 360deg`
                : '#F0B829'})`,
              boxShadow: '0 0 40px rgba(240,184,41,0.3)',
            }}
          >
            {/* Center hub */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: 60, height: 60, borderRadius: '50%', background: '#0A0A10',
              border: '3px solid #F0B829', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 24,
            }}>
              🃏
            </div>
          </div>
        </div>

        {error && <div className="text-rose-300 text-sm mb-3">{error}</div>}

        {result !== null ? (
          <div>
            <div className="text-3xl font-black text-amber-300 mb-2">+{result.toLocaleString()}</div>
            <div className="text-white/60 text-sm mb-4">Chips secured. See you in an hour.</div>
            <button
              className="w-full rounded-xl bg-gradient-to-r from-amber-300 to-yellow-400 px-6 py-3 font-black text-emerald-950"
              onClick={() => onClose(result)}>
              COLLECT →
            </button>
          </div>
        ) : (
          <button
            className="w-full rounded-xl px-6 py-4 font-black text-lg disabled:opacity-50"
            style={{
              background: spinning ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#F0B829,#C9A227)',
              color: spinning ? 'rgba(255,255,255,0.4)' : '#0A0A10',
            }}
            disabled={spinning || chips === 0}
            onClick={handleSpin}>
            {spinning ? 'SPINNING…' : `SPIN (${chips.toLocaleString()} CHIPS)`}
          </button>
        )}

        <button
          className="mt-3 text-white/40 text-xs underline"
          onClick={() => onClose()}>
          Close
        </button>
      </div>
    </div>
  );
}
