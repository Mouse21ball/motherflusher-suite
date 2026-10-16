import React from 'react';

// Detroit 2026-10-16: Chain Links — 7-day streak visualized as a forging chain.
// Purple and gold, loss aversion: miss a day, the chain breaks.

const CHAIN_REWARDS = [
  { day: 1, chips: 500 },
  { day: 2, chips: 750 },
  { day: 3, chips: 1_000 },
  { day: 4, chips: 1_500 },
  { day: 5, chips: 2_000 },
  { day: 6, chips: 3_000 },
  { day: 7, chips: 5_000 },
];

interface ChainLinksProps {
  currentDay: number; // 1-7, the day they're on (or just completed)
  canClaim: boolean;
  onClaim: () => void;
}

function ChainLink({ day, chips, state }: { day: number; chips: number; state: 'forged' | 'current' | 'locked' }) {
  const isForged = state === 'forged';
  const isCurrent = state === 'current';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
      {/* The link itself */}
      <div
        style={{
          width: 40, height: 40, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace', fontWeight: 900, fontSize: 14,
          border: isForged ? '3px solid #F0B829' : isCurrent ? '3px solid #F0B829' : '2px solid rgba(255,255,255,0.15)',
          background: isForged
            ? 'linear-gradient(135deg, rgba(240,184,41,0.35), rgba(88,40,180,0.35))'
            : isCurrent
              ? 'linear-gradient(135deg, rgba(240,184,41,0.15), rgba(88,40,180,0.15))'
              : 'rgba(255,255,255,0.03)',
          color: isForged || isCurrent ? '#F0B829' : 'rgba(255,255,255,0.25)',
          boxShadow: isForged ? '0 0 16px rgba(240,184,41,0.4)' : isCurrent ? '0 0 12px rgba(240,184,41,0.25)' : 'none',
          animation: isCurrent ? 'chainPulse 1.5s ease-in-out infinite' : 'none',
        }}
      >
        {isForged ? '✓' : day}
      </div>
      {/* Reward */}
      <div style={{
        fontFamily: 'monospace', fontSize: 9, marginTop: 4,
        color: isForged || isCurrent ? 'rgba(240,184,41,0.9)' : 'rgba(255,255,255,0.25)',
        fontWeight: isCurrent ? 900 : 400, whiteSpace: 'nowrap',
      }}>
        {chips >= 1000 ? `${chips / 1000}K` : chips}
      </div>
      {/* Day 7 anchor label */}
      {day === 7 && (
        <div style={{
          fontFamily: 'monospace', fontSize: 8, marginTop: 2,
          color: '#F0B829', fontWeight: 900, letterSpacing: '0.05em',
        }}>
          ANCHOR
        </div>
      )}
      <style>{`
        @keyframes chainPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}

export function ChainLinks({ currentDay, canClaim, onClaim }: ChainLinksProps) {
  const completedDay = canClaim ? currentDay - 1 : currentDay;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(88,40,180,0.15), rgba(10,10,16,0.6))',
      border: '1px solid rgba(201,162,39,0.25)', borderRadius: 14,
      padding: '14px 12px', backdropFilter: 'blur(16px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontFamily: 'Oswald, Impact, sans-serif', fontWeight: 900, fontSize: 14, color: '#F0B829', letterSpacing: '1px' }}>
          ⛓ CHAIN LINKS
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
          Day {currentDay} of 7
        </div>
      </div>

      {/* The chain */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2, marginBottom: 12 }}>
        {CHAIN_REWARDS.map((r, i) => (
          <React.Fragment key={r.day}>
            <ChainLink
              day={r.day}
              chips={r.chips}
              state={r.day <= completedDay ? 'forged' : r.day === currentDay ? 'current' : 'locked'}
            />
            {i < CHAIN_REWARDS.length - 1 && (
              <div style={{
                flex: '0 0 4px', height: 2, marginTop: 19,
                background: r.day < completedDay ? '#F0B829' : 'rgba(255,255,255,0.1)',
              }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Loss aversion message */}
      <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 10, lineHeight: 1.4 }}>
        {canClaim
          ? `Forge link ${currentDay} — miss a day and the chain breaks.`
          : completedDay >= 7
            ? 'Chain complete. It holds as long as you return.'
            : `Link ${completedDay} forged. ${7 - completedDay} to the anchor.`}
      </div>

      <button
        onClick={onClaim}
        disabled={!canClaim}
        style={{
          width: '100%', padding: '10px 0', borderRadius: 10,
          border: canClaim ? 'none' : '1px solid rgba(255,255,255,0.12)',
          background: canClaim ? 'linear-gradient(135deg,#F0B829,#C9A227)' : 'rgba(255,255,255,0.06)',
          color: canClaim ? '#0c0b08' : 'rgba(255,255,255,0.35)',
          fontFamily: 'monospace', fontWeight: 900, fontSize: 11,
          letterSpacing: '0.06em', textTransform: 'uppercase', cursor: canClaim ? 'pointer' : 'default',
          boxShadow: canClaim ? '0 4px 18px rgba(240,184,41,0.45)' : 'none',
        }}
      >
        {canClaim ? `FORGE LINK ${currentDay}` : 'CHAIN HOLDING'}
      </button>
    </div>
  );
}
