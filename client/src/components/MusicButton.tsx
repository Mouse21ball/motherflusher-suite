import { useEffect, useState } from 'react';
import { music } from '@/lib/music';

interface MusicButtonProps {
  /** Extra CSS classes */
  className?: string;
  /** Button diameter in px (default 36) */
  size?: number;
}

/**
 * Small circular mute/unmute button that stays in sync with the global
 * music singleton.  Drop it anywhere in the UI.
 */
export function MusicButton({ className = '', size = 36 }: MusicButtonProps) {
  const [muted, setMuted] = useState(() => music.muted);

  useEffect(() => music.subscribe(() => setMuted(music.muted)), []);

  const iconSize = Math.round(size * 0.44);

  return (
    <button
      onClick={() => music.toggleMute()}
      aria-label={muted ? 'Unmute music' : 'Mute music'}
      title={muted ? 'Unmute music' : 'Mute music'}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(0,0,0,0.40)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
      className={className}
    >
      {muted ? (
        /* Volume off */
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        /* Volume on */
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      )}
    </button>
  );
}
