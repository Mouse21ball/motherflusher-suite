// ─── The Yard Map — Home navigation as the yard itself ───────────────────────
// P6 (2026-11-08): the four modes presented as places on a yard map instead
// of only a card list. Pure presentation/navigation: every pin routes
// through the SAME mode-entry path as the mode cards (Home's selectMode).
// The only number shown — "N inside now" — is the real human count summed
// from the live GET /api/tables feed (public tables only) that Home already
// polls; when nobody is inside, the pin shows no count at all. Zone names
// are presentation flavor, not data.

export interface YardMapEntry {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  bg: string;
  zone: string;
  humans: number;
}

export function YardMap({ entries, onSelect }: { entries: YardMapEntry[]; onSelect: (id: string) => void }) {
  return (
    <div style={{ padding: '14px 12px 0' }} data-testid="yard-map">
      <div
        className="relative overflow-hidden"
        style={{
          borderRadius: 18,
          border: '1px solid rgba(240,184,41,0.22)',
          background: 'linear-gradient(170deg, rgba(24,12,48,0.92) 0%, rgba(13,7,30,0.94) 60%, rgba(20,10,40,0.92) 100%)',
          padding: '14px 14px 16px',
        }}
      >
        {/* fence line */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 8, opacity: 0.5,
            background: 'repeating-linear-gradient(90deg, rgba(240,184,41,0.5) 0 2px, transparent 2px 14px)',
          }}
        />
        <div className="flex items-baseline justify-between" style={{ marginBottom: 2 }}>
          <div style={{ fontFamily: 'Oswald, Impact, sans-serif', fontWeight: 900, fontSize: 17, letterSpacing: '1.5px', color: '#F0B829' }}>
            THE YARD MAP
          </div>
          <div style={{ fontSize: 9.5, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase' }}>
            Four games · Four corners
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>
          Pick your corner of the yard. Same tables as the cards above — this is just the map.
        </div>

        <div className="relative">
          {/* dashed path through the yard */}
          <svg aria-hidden="true" className="absolute inset-0 w-full h-full" style={{ opacity: 0.35 }} preserveAspectRatio="none" viewBox="0 0 100 100">
            <path d="M 25 18 L 75 18 L 75 82 L 25 82 L 25 18" fill="none" stroke="rgba(240,184,41,0.6)" strokeWidth="0.7" strokeDasharray="3 3" />
          </svg>
          <div className="grid grid-cols-2 gap-3 relative">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                data-testid={`yard-map-pin-${e.id}`}
                onClick={() => onSelect(e.id)}
                className="text-left rounded-2xl overflow-hidden transition-transform active:scale-[0.97]"
                style={{
                  minHeight: 118,
                  border: `1px solid ${e.color}55`,
                  background: 'rgba(10,5,25,0.72)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <div className="relative" style={{ height: 52 }}>
                  <img src={e.bg} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(10,5,25,0.88) 100%)' }} />
                  <span
                    style={{
                      position: 'absolute', left: 8, bottom: 6, fontSize: 9, fontWeight: 800,
                      letterSpacing: '0.16em', color: e.color, textTransform: 'uppercase',
                      textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                    }}
                  >
                    {e.zone}
                  </span>
                </div>
                <div style={{ padding: '7px 10px 10px' }}>
                  <div style={{ fontFamily: 'Oswald, Impact, sans-serif', fontWeight: 900, fontSize: 15.5, letterSpacing: '0.6px', color: '#F5F0E6', lineHeight: 1.05 }}>
                    {e.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>
                    {e.subtitle}
                  </div>
                  {e.humans > 0 && (
                    <div
                      className="cgp-num inline-flex items-center gap-1"
                      style={{ marginTop: 7, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', color: '#4ADE80', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 999, padding: '2px 7px' }}
                    >
                      ● {e.humans} INSIDE NOW
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
