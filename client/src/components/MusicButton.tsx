import { useEffect, useRef, useState } from 'react';
import { music } from '@/lib/music';

interface MusicButtonProps {
  /** Extra CSS classes */
  className?: string;
  /** Button diameter in px (default 36) */
  size?: number;
  /**
   * Which edge of the popover aligns with the button.
   * 'left'  → popover extends rightward  (safe when button is near left edge)
   * 'right' → popover extends leftward   (safe when button is near right edge)
   * Default: 'left'
   */
  popoverAlign?: 'left' | 'right';
}

/**
 * Circular music control button. Click to open a compact volume popover
 * with a mute toggle and volume slider. Click outside to dismiss.
 */
export function MusicButton({ className = '', size = 36, popoverAlign = 'left' }: MusicButtonProps) {
  const [muted,  setMuted]  = useState(() => music.muted);
  const [volume, setVolume] = useState(() => music.volume);
  const [open,   setOpen]   = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => music.subscribe(() => {
    setMuted(music.muted);
    setVolume(music.volume);
  }), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const iconSize = Math.round(size * 0.44);
  const speakerPolygon = <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />;

  // Position the popover flush with the requested edge of the button
  const popoverEdge: React.CSSProperties = popoverAlign === 'right'
    ? { right: 0 }
    : { left: 0 };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      {/* Main button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close music controls' : 'Open music controls'}
        title={open ? 'Close music controls' : 'Music controls'}
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: open
            ? '1px solid rgba(201,162,39,0.50)'
            : '1px solid rgba(255,255,255,0.18)',
          background: open ? 'rgba(201,162,39,0.12)' : 'rgba(0,0,0,0.40)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {muted ? (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.45)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {speakerPolygon}
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none"
            stroke={open ? '#C9A227' : 'rgba(255,255,255,0.75)'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {speakerPolygon}
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div style={{
          position: 'absolute',
          bottom: `calc(100% + 8px)`,
          ...popoverEdge,
          background: 'rgba(10,10,14,0.96)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 160,
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          zIndex: 9999,
          whiteSpace: 'nowrap',
        }}>
          {/* Mute toggle */}
          <button
            onClick={() => music.toggleMute()}
            title={muted ? 'Unmute' : 'Mute'}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: 15, lineHeight: 1, flexShrink: 0,
              color: muted ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.75)',
            }}
          >
            {muted ? '🔇' : volume < 0.35 ? '🔈' : '🔊'}
          </button>

          {/* Volume slider */}
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={muted ? 0 : volume}
            onChange={e => {
              const v = parseFloat(e.target.value);
              if (muted && v > 0) music.setMuted(false);
              music.setVolume(v);
            }}
            style={{ flex: 1, cursor: 'pointer', accentColor: '#C9A227', minWidth: 80 }}
          />

          {/* Percentage */}
          <span style={{
            fontSize: 10, fontFamily: 'monospace', minWidth: 28, textAlign: 'right',
            color: 'rgba(255,255,255,0.40)',
          }}>
            {muted ? '0%' : `${Math.round(volume * 100)}%`}
          </span>
        </div>
      )}
    </div>
  );
}
