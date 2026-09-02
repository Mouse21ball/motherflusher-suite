// ─── PrivateTableSetup ────────────────────────────────────────────────────────
// Visual rebuild matching the "HOST A TABLE" prison-cell mockup design.
// All logic (state, POST /api/tables, navigation) is unchanged from the
// previous version — only JSX/CSS has been updated.

import { useState } from 'react';
import { useLocation } from 'wouter';
import { generateTableCode } from '@/lib/tableSession';
import { apiUrl } from '@/lib/apiConfig';
import { ensurePlayerIdentity } from '@/lib/persistence';
import { track } from '@/lib/analytics';

// ─── Mode definitions ─────────────────────────────────────────────────────────

const MODES = [
  {
    id: 'badugi',
    name: 'BADUGI',
    tagline: 'THE OG DRAW GAME',
    path: '/badugi',
    icon: '/mode-icon-badugi.png',
  },
  {
    id: 'dead7',
    name: 'DEAD 7',
    tagline: 'SNITCHES GET STITCHES',
    path: '/dead7',
    icon: '/mode-icon-dead7.png',
  },
  {
    id: 'fifteen35',
    name: '15 / 35',
    tagline: 'HIT OR GO HOME',
    path: '/fifteen35',
    icon: '/mode-icon-fifteen35.png',
  },
  {
    id: 'suitspoker',
    name: 'SUITS & POKER',
    tagline: 'TWO PATHS. ONE WINNER.',
    path: '/suitspoker',
    icon: '/mode-icon-suits.png',
  },
] as const;

type ModeId = typeof MODES[number]['id'];

interface Props {
  open: boolean;
  onClose: () => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ num, label, aside }: { num: number; label: string; aside?: string }) {
  return (
    <div className="flex items-center justify-between mb-2 mt-1">
      <div className="flex items-center gap-2">
        <div
          className="w-px flex-shrink-0 self-stretch"
          style={{ background: 'rgba(180,120,30,0.35)' }}
        />
        <span
          style={{
            fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
            fontSize: '0.62rem',
            letterSpacing: '0.18em',
            color: 'rgba(200,145,40,0.75)',
            textTransform: 'uppercase',
          }}
        >
          {num}. {label}
        </span>
      </div>
      {aside && (
        <span
          style={{
            fontSize: '0.5rem',
            letterSpacing: '0.12em',
            color: 'rgba(160,110,30,0.50)',
            textTransform: 'uppercase',
            fontFamily: 'monospace',
          }}
        >
          {aside}
        </span>
      )}
    </div>
  );
}

// Inmate silhouette cell for the seat stepper
function InmateCell({ lit }: { lit: boolean }) {
  return (
    <div
      className="relative flex items-end justify-center"
      style={{
        width: 34,
        height: 44,
        background: lit
          ? 'linear-gradient(180deg, rgba(180,90,0,0.25) 0%, rgba(120,55,0,0.40) 100%)'
          : 'rgba(25,18,8,0.70)',
        border: `1px solid ${lit ? 'rgba(200,120,20,0.55)' : 'rgba(80,60,30,0.30)'}`,
        borderRadius: 3,
        boxShadow: lit ? 'inset 0 0 8px rgba(200,100,0,0.25)' : 'none',
        overflow: 'hidden',
      }}
    >
      {/* Vertical cage bars */}
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${14 + i * 6}%`,
            width: 1,
            background: lit ? 'rgba(100,60,0,0.45)' : 'rgba(50,38,18,0.55)',
          }}
        />
      ))}
      {/* Horizontal bar */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '32%',
          height: 1,
          background: lit ? 'rgba(100,60,0,0.40)' : 'rgba(50,38,18,0.45)',
        }}
      />
      {/* Person silhouette */}
      <svg
        viewBox="0 0 20 28"
        style={{ width: 20, height: 28, position: 'relative', zIndex: 1, marginBottom: 2 }}
        fill={lit ? '#c47d14' : '#2e2414'}
      >
        <circle cx="10" cy="6" r="4.5" />
        <path d="M4 28 C4 18 16 18 16 28 Z" />
        <rect x="6" y="11" width="8" height="11" rx="1" />
      </svg>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PrivateTableSetup({ open, onClose }: Props) {
  const [, navigate] = useLocation();
  const [selectedMode, setSelectedMode] = useState<ModeId>('badugi');
  const [maxPlayers, setMaxPlayers] = useState(5);
  const [isInviteOnly, setIsInviteOnly] = useState(true);
  const [botsEnabled, setBotsEnabled] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const modeInfo = MODES.find(m => m.id === selectedMode)!;

  // ── Logic unchanged ────────────────────────────────────────────────────────
  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const code = generateTableCode();
      const identity = ensurePlayerIdentity();

      const res = await fetch(apiUrl('/api/tables'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId:      code,
          modeId:       selectedMode === 'suitspoker' ? 'suits_poker' : selectedMode,
          createdBy:    identity.id,
          maxPlayers,
          botsEnabled,
          isInviteOnly,
          hostId:       identity.id,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to create table');
      }

      track({ name: 'crew_private_created', mode: selectedMode });

      const params = new URLSearchParams({ t: code });
      if (isInviteOnly) params.set('private', '1');

      navigate(`${modeInfo.path}?${params.toString()}`);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.90)', padding: '16px 0' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Outer frame with chain side-borders ─────────────────────────── */}
      <div
        className="relative w-full flex-shrink-0"
        style={{ maxWidth: 400, margin: '0 auto' }}
      >
        {/* Left chain strip */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 38,
            backgroundImage: 'url(/assets/ui/chains.png)',
            backgroundRepeat: 'repeat-y',
            backgroundSize: '38px auto',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        />
        {/* Right chain strip (mirrored) */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 38,
            backgroundImage: 'url(/assets/ui/chains.png)',
            backgroundRepeat: 'repeat-y',
            backgroundSize: '38px auto',
            zIndex: 10,
            pointerEvents: 'none',
            transform: 'scaleX(-1)',
          }}
        />

        {/* ── Inner panel (inside the chains) ─────────────────────────── */}
        <div
          className="mx-9 relative overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #1a1006 0%, #0e0a02 40%, #080500 100%)',
            border: '1px solid rgba(160,100,20,0.30)',
            minHeight: 0,
          }}
        >
          {/* Prison-window overhead light */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '120%',
              height: 160,
              background:
                'radial-gradient(ellipse 55% 100% at 50% -5%, rgba(255,140,20,0.38) 0%, rgba(200,90,0,0.12) 40%, transparent 70%)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />

          {/* Top rivet strip */}
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              borderBottom: '1px solid rgba(140,90,15,0.35)',
              background: 'linear-gradient(180deg, rgba(60,38,8,0.70) 0%, rgba(30,18,4,0.80) 100%)',
              padding: '10px 12px 8px',
            }}
          >
            {/* Corner ornaments */}
            <div className="absolute top-2 left-2 flex flex-col items-start" style={{ gap: 0 }}>
              <span style={{ fontSize: '0.42rem', color: 'rgba(180,120,30,0.60)', fontFamily: 'monospace', letterSpacing: '0.08em', lineHeight: 1.4 }}>⛓ CG-17B</span>
              <span style={{ fontSize: '0.42rem', color: 'rgba(180,120,30,0.45)', fontFamily: 'monospace', letterSpacing: '0.08em', lineHeight: 1.4 }}>YARD B</span>
            </div>
            <div className="absolute top-2 right-2">
              <span style={{ fontSize: '1rem', filter: 'drop-shadow(0 0 4px rgba(255,80,0,0.70)) sepia(100%) saturate(600%) hue-rotate(-10deg)' }}>💀</span>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              data-testid="button-close-setup"
              style={{
                position: 'absolute',
                top: 6,
                right: 28,
                color: 'rgba(180,130,40,0.50)',
                fontSize: '1.1rem',
                lineHeight: 1,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                zIndex: 2,
              }}
            >
              ×
            </button>

            {/* Title */}
            <div className="text-center pt-1">
              <h1
                style={{
                  fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                  fontSize: 'clamp(1.6rem, 6vw, 2.2rem)',
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                  margin: 0,
                  background: 'linear-gradient(180deg, #ffe066 0%, #c47d14 35%, #8b4400 80%, #5a2800 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 10px rgba(255,100,0,0.65)) drop-shadow(0 0 3px rgba(255,60,0,0.40))',
                }}
              >
                HOST A TABLE
              </h1>
              <p
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.52rem',
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: 'rgba(190,135,40,0.55)',
                  marginTop: 4,
                  marginBottom: 0,
                }}
              >
                RUN YOUR GAME. YOUR RULES.
              </p>
            </div>
          </div>

          {/* ── Sections ──────────────────────────────────────────────── */}
          <div style={{ padding: '10px 12px 12px', position: 'relative', zIndex: 1 }}>

            {/* ── 1. GAME MODE ──────────────────────────────────────── */}
            <SectionLabel num={1} label="GAME MODE" />
            <div className="grid grid-cols-4 gap-1.5 mb-4">
              {MODES.map(m => {
                const sel = selectedMode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMode(m.id)}
                    data-testid={`button-mode-select-${m.id}`}
                    className="flex flex-col items-center active:scale-95 transition-transform"
                    style={{
                      background: sel
                        ? 'linear-gradient(180deg, rgba(180,90,0,0.35) 0%, rgba(100,45,0,0.50) 100%)'
                        : 'linear-gradient(180deg, rgba(40,28,8,0.80) 0%, rgba(20,12,2,0.90) 100%)',
                      border: sel
                        ? '1px solid rgba(220,140,20,0.75)'
                        : '1px solid rgba(80,55,15,0.40)',
                      borderRadius: 4,
                      padding: '7px 2px 5px',
                      boxShadow: sel
                        ? '0 0 14px rgba(220,120,0,0.45), inset 0 0 8px rgba(180,90,0,0.25)'
                        : 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <img
                      src={m.icon}
                      alt={m.name}
                      style={{
                        width: 44,
                        height: 44,
                        objectFit: 'contain',
                        filter: sel
                          ? 'drop-shadow(0 0 6px rgba(255,120,0,0.60)) brightness(1.1)'
                          : 'brightness(0.45) saturate(0.4)',
                        transition: 'filter 0.18s',
                      }}
                    />
                    <span
                      style={{
                        fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                        fontSize: '0.56rem',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: sel ? '#e8a020' : 'rgba(140,100,30,0.55)',
                        marginTop: 4,
                        textAlign: 'center',
                        lineHeight: 1.15,
                      }}
                    >
                      {m.name}
                    </span>
                    <span
                      style={{
                        fontSize: '0.38rem',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: sel ? 'rgba(200,140,40,0.70)' : 'rgba(90,65,20,0.45)',
                        textAlign: 'center',
                        lineHeight: 1.2,
                        marginTop: 2,
                        padding: '0 2px',
                      }}
                    >
                      {m.tagline}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Metal divider line */}
            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(130,85,15,0.35), transparent)', marginBottom: 8 }} />

            {/* ── 2. MAX PLAYERS ────────────────────────────────────── */}
            <SectionLabel num={2} label="MAX PLAYERS" aside="MORE INMATES = BIGGER POTS" />

            {/* Seat stepper row */}
            <div className="flex items-center justify-between mb-1" style={{ gap: 4 }}>
              {/* Minus */}
              <button
                onClick={() => setMaxPlayers(p => Math.max(2, p - 1))}
                disabled={maxPlayers <= 2}
                data-testid="button-max-players-dec"
                style={{
                  width: 34,
                  height: 44,
                  flexShrink: 0,
                  background: 'linear-gradient(180deg, rgba(50,32,8,0.90) 0%, rgba(25,15,3,0.95) 100%)',
                  border: '1px solid rgba(120,80,20,0.40)',
                  borderRadius: 3,
                  color: maxPlayers <= 2 ? 'rgba(80,55,15,0.35)' : 'rgba(200,140,40,0.75)',
                  fontFamily: 'Impact, Arial, sans-serif',
                  fontSize: '1.3rem',
                  lineHeight: 1,
                  cursor: maxPlayers <= 2 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s',
                }}
              >
                −
              </button>

              {/* Silhouette cells */}
              {[1, 2, 3, 4, 5].map(n => (
                <InmateCell key={n} lit={n <= maxPlayers} />
              ))}

              {/* Plus */}
              <button
                onClick={() => setMaxPlayers(p => Math.min(5, p + 1))}
                disabled={maxPlayers >= 5}
                data-testid="button-max-players-inc"
                style={{
                  width: 34,
                  height: 44,
                  flexShrink: 0,
                  background: 'linear-gradient(180deg, rgba(50,32,8,0.90) 0%, rgba(25,15,3,0.95) 100%)',
                  border: '1px solid rgba(120,80,20,0.40)',
                  borderRadius: 3,
                  color: maxPlayers >= 5 ? 'rgba(80,55,15,0.35)' : 'rgba(200,140,40,0.75)',
                  fontFamily: 'Impact, Arial, sans-serif',
                  fontSize: '1.3rem',
                  lineHeight: 1,
                  cursor: maxPlayers >= 5 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s',
                }}
              >
                +
              </button>
            </div>

            {/* Seat count label */}
            <p
              data-testid="text-max-players"
              style={{
                textAlign: 'center',
                fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                fontSize: '0.72rem',
                letterSpacing: '0.18em',
                color: 'rgba(200,140,40,0.65)',
                marginBottom: 10,
                marginTop: 3,
              }}
            >
              <span style={{ color: 'rgba(230,160,40,0.85)' }}>{maxPlayers}</span>
              {' / 5 SEATS'}
            </p>

            {/* Metal divider */}
            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(130,85,15,0.35), transparent)', marginBottom: 8 }} />

            {/* ── 3. ACCESS ─────────────────────────────────────────── */}
            <SectionLabel num={3} label="ACCESS" />
            <div className="grid grid-cols-2 gap-2 mb-4">
              {/* Invite Only */}
              <button
                onClick={() => setIsInviteOnly(true)}
                data-testid="button-access-private"
                className="active:scale-95 transition-transform"
                style={{
                  background: isInviteOnly
                    ? 'linear-gradient(180deg, rgba(100,40,180,0.28) 0%, rgba(60,20,120,0.38) 100%)'
                    : 'linear-gradient(180deg, rgba(30,18,4,0.80) 0%, rgba(15,8,2,0.90) 100%)',
                  border: isInviteOnly
                    ? '1px solid rgba(160,80,255,0.65)'
                    : '1px solid rgba(80,55,15,0.35)',
                  borderRadius: 4,
                  padding: '9px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  boxShadow: isInviteOnly
                    ? '0 0 12px rgba(140,60,255,0.30), inset 0 0 6px rgba(120,40,220,0.18)'
                    : 'none',
                  position: 'relative',
                }}
              >
                <span style={{ fontSize: '1.3rem', flexShrink: 0, filter: isInviteOnly ? 'drop-shadow(0 0 4px rgba(160,80,255,0.60))' : 'grayscale(80%) brightness(0.5)' }}>🔒</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif', fontSize: '0.65rem', letterSpacing: '0.08em', color: isInviteOnly ? '#c080ff' : 'rgba(120,90,30,0.55)', textTransform: 'uppercase' }}>INVITE ONLY</div>
                  <div style={{ fontSize: '0.42rem', letterSpacing: '0.1em', color: isInviteOnly ? 'rgba(180,120,255,0.65)' : 'rgba(80,60,20,0.40)', fontFamily: 'monospace', textTransform: 'uppercase', marginTop: 1 }}>CODE REQUIRED</div>
                </div>
                {isInviteOnly && (
                  <span style={{ position: 'absolute', bottom: 5, right: 6, color: '#c080ff', fontSize: '0.65rem' }}>✓</span>
                )}
              </button>

              {/* Public */}
              <button
                onClick={() => setIsInviteOnly(false)}
                data-testid="button-access-public"
                className="active:scale-95 transition-transform"
                style={{
                  background: !isInviteOnly
                    ? 'linear-gradient(180deg, rgba(20,80,20,0.28) 0%, rgba(10,50,10,0.38) 100%)'
                    : 'linear-gradient(180deg, rgba(30,18,4,0.80) 0%, rgba(15,8,2,0.90) 100%)',
                  border: !isInviteOnly
                    ? '1px solid rgba(80,160,80,0.55)'
                    : '1px solid rgba(80,55,15,0.35)',
                  borderRadius: 4,
                  padding: '9px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  boxShadow: !isInviteOnly
                    ? '0 0 10px rgba(60,160,60,0.25)'
                    : 'none',
                  position: 'relative',
                }}
              >
                <span style={{ fontSize: '1.3rem', flexShrink: 0, filter: !isInviteOnly ? 'drop-shadow(0 0 4px rgba(60,200,60,0.50))' : 'grayscale(80%) brightness(0.5)' }}>🌐</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif', fontSize: 11, letterSpacing: '0.08em', color: !isInviteOnly ? '#80d080' : 'rgba(120,90,30,0.60)', textTransform: 'uppercase' }}>PUBLIC</div>
                  <div style={{ fontSize: 11, letterSpacing: '0.1em', color: !isInviteOnly ? 'rgba(120,200,120,0.65)' : 'rgba(80,60,20,0.60)', fontFamily: 'monospace', textTransform: 'uppercase', marginTop: 1 }}>ANYONE CAN JOIN</div>
                </div>
                {!isInviteOnly && (
                  <span style={{ position: 'absolute', bottom: 5, right: 6, color: '#80d080', fontSize: '0.65rem' }}>✓</span>
                )}
              </button>
            </div>

            {/* Metal divider */}
            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(130,85,15,0.35), transparent)', marginBottom: 8 }} />

            {/* ── 4. BOTS ───────────────────────────────────────────── */}
            <SectionLabel num={4} label="BOTS" />
            <div className="grid grid-cols-2 gap-2 mb-4">
              {/* Bots ON */}
              <button
                onClick={() => setBotsEnabled(true)}
                data-testid="button-bots-on"
                className="active:scale-95 transition-transform"
                style={{
                  background: botsEnabled
                    ? 'linear-gradient(180deg, rgba(20,70,30,0.35) 0%, rgba(10,45,18,0.45) 100%)'
                    : 'linear-gradient(180deg, rgba(30,18,4,0.80) 0%, rgba(15,8,2,0.90) 100%)',
                  border: botsEnabled
                    ? '1px solid rgba(40,200,100,0.55)'
                    : '1px solid rgba(80,55,15,0.35)',
                  borderRadius: 4,
                  padding: '9px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  boxShadow: botsEnabled
                    ? '0 0 12px rgba(30,180,80,0.28), inset 0 0 5px rgba(20,160,70,0.15)'
                    : 'none',
                  position: 'relative',
                }}
              >
                <span style={{ fontSize: '1.25rem', flexShrink: 0, filter: botsEnabled ? 'drop-shadow(0 0 5px rgba(40,220,100,0.60))' : 'grayscale(80%) brightness(0.5) sepia(40%)' }}>🤖</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif', fontSize: 11, letterSpacing: '0.08em', color: botsEnabled ? '#40d878' : 'rgba(120,90,30,0.60)', textTransform: 'uppercase' }}>BOTS ON</div>
                  <div style={{ fontSize: 11, letterSpacing: '0.08em', color: botsEnabled ? 'rgba(80,220,130,0.65)' : 'rgba(80,60,20,0.60)', fontFamily: 'monospace', textTransform: 'uppercase', marginTop: 1, lineHeight: 1.5 }}>EMPTY CELLS{'\n'}AUTO-FILLED</div>
                </div>
                {botsEnabled && (
                  <span style={{ position: 'absolute', bottom: 5, right: 6, color: '#40d878', fontSize: '0.65rem' }}>✓</span>
                )}
              </button>

              {/* Bots OFF */}
              <button
                onClick={() => setBotsEnabled(false)}
                data-testid="button-bots-off"
                className="active:scale-95 transition-transform"
                style={{
                  background: !botsEnabled
                    ? 'linear-gradient(180deg, rgba(80,20,10,0.35) 0%, rgba(55,12,6,0.45) 100%)'
                    : 'linear-gradient(180deg, rgba(30,18,4,0.80) 0%, rgba(15,8,2,0.90) 100%)',
                  border: !botsEnabled
                    ? '1px solid rgba(220,60,40,0.55)'
                    : '1px solid rgba(80,55,15,0.35)',
                  borderRadius: 4,
                  padding: '9px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  boxShadow: !botsEnabled
                    ? '0 0 12px rgba(220,50,30,0.28)'
                    : 'none',
                  position: 'relative',
                }}
              >
                <span style={{ fontSize: '1.25rem', flexShrink: 0, filter: !botsEnabled ? 'drop-shadow(0 0 5px rgba(255,60,40,0.60)) sepia(100%) saturate(500%) hue-rotate(-10deg)' : 'grayscale(80%) brightness(0.5)' }}>💀</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif', fontSize: 11, letterSpacing: '0.08em', color: !botsEnabled ? '#f06050' : 'rgba(120,90,30,0.60)', textTransform: 'uppercase' }}>BOTS OFF</div>
                  <div style={{ fontSize: 11, letterSpacing: '0.08em', color: !botsEnabled ? 'rgba(240,130,110,0.65)' : 'rgba(80,60,20,0.60)', fontFamily: 'monospace', textTransform: 'uppercase', marginTop: 1, lineHeight: 1.5 }}>HUMAN INMATES{'\n'}ONLY</div>
                </div>
                {!botsEnabled && (
                  <span style={{ position: 'absolute', bottom: 5, right: 6, color: '#f06050', fontSize: '0.65rem' }}>✓</span>
                )}
              </button>
            </div>

            {/* Error message */}
            {error && (
              <p style={{ textAlign: 'center', color: '#f06050', fontSize: 11, fontFamily: 'monospace', marginBottom: 8 }}>
                {error}
              </p>
            )}

            {/* ── CREATE TABLE button ────────────────────────────────── */}
            <button
              onClick={handleCreate}
              disabled={creating}
              data-testid="button-create-private-table"
              className="w-full active:scale-[0.97] transition-transform"
              style={{
                position: 'relative',
                padding: '14px 12px 10px',
                background: creating
                  ? 'linear-gradient(180deg, rgba(80,45,5,0.80) 0%, rgba(50,28,3,0.90) 100%)'
                  : 'linear-gradient(180deg, rgba(200,120,15,0.95) 0%, rgba(160,85,5,0.95) 50%, rgba(110,55,2,1) 100%)',
                border: '2px solid',
                borderColor: creating ? 'rgba(140,80,10,0.40)' : 'rgba(255,170,40,0.70)',
                borderRadius: 3,
                cursor: creating ? 'not-allowed' : 'pointer',
                boxShadow: creating
                  ? 'none'
                  : '0 0 24px rgba(220,120,0,0.55), 0 0 50px rgba(200,80,0,0.25), inset 0 1px 0 rgba(255,200,80,0.30)',
                overflow: 'hidden',
              }}
            >
              {/* Inner top highlight */}
              {!creating && (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 1,
                    background: 'rgba(255,210,80,0.45)',
                    pointerEvents: 'none',
                  }}
                />
              )}

              <div
                style={{
                  fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                  fontSize: 'clamp(1.1rem, 4vw, 1.5rem)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: creating ? 'rgba(200,140,40,0.50)' : '#1a0a00',
                  textShadow: creating ? 'none' : '0 1px 0 rgba(255,200,80,0.30)',
                  lineHeight: 1,
                }}
              >
                {creating ? 'CREATING…' : 'CREATE TABLE'}
              </div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '0.20em',
                  textTransform: 'uppercase',
                  color: creating ? 'rgba(160,100,20,0.60)' : 'rgba(60,20,0,0.75)',
                  fontFamily: 'monospace',
                  marginTop: 4,
                }}
              >
                {creating ? '— LOCKING THE YARD —' : 'START THE GAME. LOCK THE YARD.'}
              </div>
            </button>

          </div>
          {/* End sections */}

          {/* Bottom rivet strip */}
          <div
            style={{
              height: 6,
              background: 'linear-gradient(180deg, rgba(100,60,10,0.50) 0%, rgba(40,22,4,0.90) 100%)',
              borderTop: '1px solid rgba(140,85,15,0.30)',
            }}
          />
        </div>
        {/* End inner panel */}
      </div>
      {/* End outer frame */}
    </div>
  );
}
