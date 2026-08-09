/**
 * MyMusic — Manage which unlocked track plays in each game context.
 * Rendered below the MusicStore inside the Music tab.
 */

import { MUSIC_CATALOG, trackById } from '@/lib/musicTracks';

export type MusicContext = 'lobby' | 'game' | 'ladyluck';

interface MyMusicProps {
  ownedIds:  Set<string>;
  equipped:  { lobby: string | null; game: string | null; ladyluck: string | null };
  onEquip:   (context: MusicContext, trackId: string | null) => void;
  equipping: boolean;
}

const CONTEXTS: { key: MusicContext; label: string; icon: string; hint: string }[] = [
  { key: 'lobby',    label: 'Lobby',         icon: '🏠', hint: 'Home screen & menus' },
  { key: 'game',     label: 'Game Table',    icon: '🃏', hint: 'During active hands' },
  { key: 'ladyluck', label: 'Lady Luck Race', icon: '🎲', hint: 'Lady Luck race screen' },
];

export function MyMusic({ ownedIds, equipped, onEquip, equipping }: MyMusicProps) {
  const ownedTracks = MUSIC_CATALOG.filter(t => ownedIds.has(t.id));
  const hasAny = ownedTracks.length > 0;

  if (!hasAny) {
    return (
      <div style={{
        textAlign: 'center', padding: '24px 16px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14,
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🎵</div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', lineHeight: 1.5, margin: 0 }}>
          Purchase a track above to assign it<br />to your lobby, game, or Lady Luck screen.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {CONTEXTS.map(ctx => {
        const equippedId = equipped[ctx.key];
        const equippedTrack = equippedId ? trackById(equippedId) : null;

        return (
          <div
            key={ctx.key}
            style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.09)',
              background: 'rgba(255,255,255,0.03)',
              overflow: 'hidden',
            }}
          >
            {/* Context header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px 8px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontSize: 14 }}>{ctx.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.80)' }}>
                  {ctx.label}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', fontFamily: 'monospace' }}>
                  {ctx.hint}
                </div>
              </div>
              {equippedTrack && (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#4ade80', fontFamily: 'monospace' }}>
                    ♪ {equippedTrack.title}
                  </span>
                  <button
                    onClick={() => onEquip(ctx.key, null)}
                    disabled={equipping}
                    title="Remove track"
                    style={{
                      fontSize: 10, color: 'rgba(255,255,255,0.30)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Track selector */}
            <div style={{
              display: 'flex', gap: 6,
              padding: '8px 12px',
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}>
              {ownedTracks.map(track => {
                const isActive = equippedId === track.id;
                return (
                  <button
                    key={track.id}
                    onClick={() => onEquip(ctx.key, isActive ? null : track.id)}
                    disabled={equipping}
                    style={{
                      padding:        '5px 10px',
                      borderRadius:   20,
                      border:         isActive
                        ? '1px solid rgba(74,222,128,0.60)'
                        : '1px solid rgba(255,255,255,0.12)',
                      background:     isActive
                        ? 'rgba(74,222,128,0.15)'
                        : 'rgba(255,255,255,0.05)',
                      color:          isActive ? '#4ade80' : 'rgba(255,255,255,0.55)',
                      fontSize:       11, fontWeight: isActive ? 700 : 400,
                      whiteSpace:     'nowrap', cursor: 'pointer', flexShrink: 0,
                      transition:     'all 0.15s',
                    }}
                  >
                    {isActive && '♪ '}{track.title}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
