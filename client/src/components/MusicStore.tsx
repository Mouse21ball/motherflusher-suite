/**
 * MusicStore — Browse and purchase music tracks with Stripes.
 * Rendered inside the Cosmetics Store when the Music tab is active.
 *
 * Free tracks (chain-gang-poker, chain-gang-nights) show a FREE badge.
 * Paid tracks show a buy button or an owned checkmark.
 * Coming-soon tracks are display-only — greyed out, not interactive.
 */

import { useState, useEffect } from 'react';
import { MUSIC_CATALOG } from '@/lib/musicTracks';
import { music } from '@/lib/music';

interface MusicStoreProps {
  ownedIds:     Set<string>;
  stripes:      number;
  onBuy:        (trackId: string) => void;
  purchasing:   boolean;
  purchasingId: string | null;
}

export function MusicStore({ ownedIds, stripes, onBuy, purchasing, purchasingId }: MusicStoreProps) {
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // Stay in sync with the singleton's preview state (auto-stops after 15 s)
  useEffect(() => music.subscribe(() => {
    setPreviewingId(music.previewingId);
  }), []);

  function handlePreview(trackId: string, audioPath: string, previewPath: string) {
    if (previewingId === trackId) { music.stopPreview(); return; }
    const url = previewPath || audioPath;
    if (url) music.previewTrack(url, trackId, 15_000);
  }

  const COST = 500;

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ padding: '12px 0 10px', textAlign: 'center' }}>
        <p style={{
          fontSize: 11, color: 'rgba(255,255,255,0.35)',
          fontFamily: 'monospace', letterSpacing: '0.05em', margin: 0,
        }}>
          2 FREE tracks included • 7 tracks at ◆ {COST} Stripes each
        </p>
      </div>

      {/* Active track list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {MUSIC_CATALOG.map((track, i) => {
          const owned      = ownedIds.has(track.id);
          const isFree     = track.free === true;
          const isbuying   = purchasingId === track.id && purchasing;
          const previewing = previewingId === track.id;
          const canAfford  = stripes >= COST;

          return (
            <div
              key={track.id}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          10,
                padding:      '10px 12px',
                borderRadius: 12,
                background:   owned
                  ? 'rgba(74,222,128,0.06)'
                  : 'rgba(255,255,255,0.04)',
                border: owned
                  ? '1px solid rgba(74,222,128,0.20)'
                  : isFree
                    ? '1px solid rgba(74,222,128,0.10)'
                    : '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {/* Track number */}
              <span style={{
                fontSize: 10, fontFamily: 'monospace',
                color: 'rgba(255,255,255,0.25)',
                minWidth: 18, textAlign: 'right',
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* Owned / lock icon */}
              <span style={{ fontSize: 13, minWidth: 16, textAlign: 'center' }}>
                {owned ? '🎵' : '🔒'}
              </span>

              {/* Title + tag */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: owned ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.55)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {track.title}
                </div>
                {isFree && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                    color: '#4ade80', fontFamily: 'monospace', textTransform: 'uppercase',
                  }}>
                    Free
                  </span>
                )}
                {!isFree && owned && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                    color: '#4ade80', fontFamily: 'monospace', textTransform: 'uppercase',
                  }}>
                    Owned
                  </span>
                )}
              </div>

              {/* Preview button */}
              <button
                onClick={() => previewing
                  ? music.stopPreview()
                  : handlePreview(track.id, track.audioPath, track.previewPath)
                }
                title={previewing ? 'Stop preview' : 'Preview 15s'}
                style={{
                  width: 30, height: 30, borderRadius: '50%',
                  border: previewing
                    ? '1px solid rgba(251,191,36,0.60)'
                    : '1px solid rgba(255,255,255,0.14)',
                  background: previewing
                    ? 'rgba(251,191,36,0.15)'
                    : 'rgba(255,255,255,0.06)',
                  color: previewing ? '#fbbf24' : 'rgba(255,255,255,0.50)',
                  fontSize: 12, cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {previewing ? '■' : '▶'}
              </button>

              {/* Right badge: FREE / owned ✓ / buy button */}
              {isFree ? (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  color: '#4ade80', background: 'rgba(74,222,128,0.10)',
                  border: '1px solid rgba(74,222,128,0.30)',
                  padding: '2px 7px', borderRadius: 6,
                  fontFamily: 'monospace', textTransform: 'uppercase', flexShrink: 0,
                }}>
                  FREE
                </span>
              ) : owned ? (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  color: '#4ade80', background: 'rgba(74,222,128,0.12)',
                  border: '1px solid rgba(74,222,128,0.30)',
                  padding: '2px 7px', borderRadius: 6,
                  fontFamily: 'monospace', textTransform: 'uppercase', flexShrink: 0,
                }}>
                  ✓
                </span>
              ) : (
                <button
                  onClick={() => { music.stopPreview(); onBuy(track.id); }}
                  disabled={isbuying || !canAfford}
                  style={{
                    padding:     '4px 10px',
                    borderRadius: 8,
                    border:       canAfford
                      ? '1px solid rgba(201,162,39,0.45)'
                      : '1px solid rgba(255,255,255,0.10)',
                    background:   canAfford
                      ? 'rgba(201,162,39,0.15)'
                      : 'rgba(255,255,255,0.04)',
                    color:        canAfford ? '#C9A227' : 'rgba(255,255,255,0.25)',
                    fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
                    cursor:     canAfford ? 'pointer' : 'not-allowed',
                    flexShrink: 0, letterSpacing: '0.04em',
                    opacity:    isbuying ? 0.5 : 1,
                  }}
                >
                  {isbuying ? '…' : `◆ ${COST}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Insufficient Stripes hint */}
      {stripes < COST && (
        <p style={{
          textAlign: 'center', fontSize: 10, fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.25)', marginTop: 16,
        }}>
          You need ◆ {COST} Stripes to unlock a paid track.
        </p>
      )}
    </div>
  );
}
