import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { apiUrl } from '@/lib/apiConfig';
import { ensurePlayerIdentity } from '@/lib/persistence';

const QUEEN_PORTRAITS: Record<string, string> = {
  spades:   '/ladyluck/queens/queen-spades.png',
  hearts:   '/ladyluck/queens/queen-hearts.png',
  diamonds: '/ladyluck/queens/queen-diamonds.png',
  clubs:    '/ladyluck/queens/queen-clubs.png',
};

const SUIT_SYMBOLS: Record<string, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};

const SUIT_COLORS: Record<string, string> = {
  spades: '#ffffff', hearts: '#e53935', diamonds: '#e53935', clubs: '#ffffff',
};

const QUEEN_NICKNAMES: Record<string, string> = {
  spades: 'Black Widow', hearts: 'Lady Red', diamonds: 'Diamond Dee', clubs: 'Club Ace',
};

const ROOM_COLORS: Record<string, string> = {
  pony: '#10b981', thoroughbred: '#f59e0b', champion: '#dc2626',
};

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'K'];
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];

interface PersonalRace {
  id:          number;
  tableId:     string;
  roomType:    string;
  winningSuit: string;
  playedAt:    string;
  myResult: {
    pickedSuit: string;
    wager:      number;
    won:        boolean;
    chipChange: number;
  } | null;
}

interface HistoryData {
  personal: PersonalRace[];
  stats: {
    queens:     Record<string, number>;
    totalRaces: number;
    cards:      Record<string, Record<string, number>>;
  };
}

export default function LadyLuckHistory() {
  const [, navigate] = useLocation();
  const [data, setData]     = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const identity = ensurePlayerIdentity();

  useEffect(() => {
    fetch(apiUrl(`/api/ladyluck/history?playerId=${encodeURIComponent(identity.id)}`))
      .then(r => r.json())
      .then((d: HistoryData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [identity.id]);

  const totalRaces = data?.stats.totalRaces ?? 0;
  const queensData = data?.stats.queens     ?? {};
  const cardsData  = data?.stats.cards      ?? {};

  let maxCardCount = 1;
  for (const rankData of Object.values(cardsData)) {
    for (const count of Object.values(rankData)) {
      if (count > maxCardCount) maxCardCount = count;
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#120c08', backgroundImage: "url('/ladyluck/ladyluck-bg.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed', color: '#fff', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', position: 'relative', overflowX: 'hidden' }}>
      <style>{`
        @keyframes ll-fade-up { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(201,162,39,0.15)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate('/ladyluck')} data-testid="button-back-lobby"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '5px 10px', color: 'rgba(255,255,255,0.7)', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1, flexShrink: 0 }}>
          ← LOBBY
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#C9A227', letterSpacing: 3 }}>RACE HISTORY</span>
        </div>
        <div style={{ width: 72 }} />
      </div>

      <div style={{ flex: 1, padding: '12px 12px 24px', display: 'flex', flexDirection: 'column', gap: 14, animation: 'll-fade-up 0.4s ease-out' }}>

        {/* ── QUEEN WIN STATS ── */}
        <div style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(14px)', border: '1px solid rgba(201,162,39,0.2)', borderRadius: 14, padding: '14px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <img src="/crews/icon-crown.png" alt="" style={{ width: 18, height: 18, objectFit: 'contain', filter: 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.3)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227', letterSpacing: 2 }}>QUEEN WIN STATS</span>
            {totalRaces > 0 && (
              <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>{totalRaces} RACES</span>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Loading…</div>
          ) : totalRaces === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
              No races yet — play to see queen stats
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {SUITS.map(suit => {
                const wins = queensData[suit] ?? 0;
                const pct  = totalRaces > 0 ? Math.round((wins / totalRaces) * 100) : 0;
                const col  = SUIT_COLORS[suit];
                return (
                  <div key={suit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: '100%', aspectRatio: '2/3', borderRadius: 8, overflow: 'hidden', position: 'relative', border: `1px solid ${col}33`, background: '#0d0d1e' }}>
                      <img src={QUEEN_PORTRAITS[suit]} alt={QUEEN_NICKNAMES[suit]}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', filter: 'brightness(0.75)' }} />
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 40%,rgba(0,0,0,0.85) 100%)' }} />
                      <div style={{ position: 'absolute', top: 4, left: 5, fontSize: 11, color: col, fontWeight: 900, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{SUIT_SYMBOLS[suit]}</div>
                      <div style={{ position: 'absolute', bottom: 5, left: 0, right: 0, textAlign: 'center' }}>
                        <span style={{ fontFamily: 'Anton, Impact, sans-serif', fontSize: 18, color: '#C9A227', lineHeight: 1 }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.45)', textAlign: 'center', letterSpacing: 0.5 }}>{wins} WIN{wins !== 1 ? 'S' : ''}</div>
                    <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#C9A227', borderRadius: 2, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── CARD FLIP FREQUENCY HEATMAP ── */}
        <div style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(14px)', border: '1px solid rgba(201,162,39,0.2)', borderRadius: 14, padding: '14px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 14 }}>🃏</span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227', letterSpacing: 2 }}>CARD FLIP FREQUENCY</span>
          </div>

          {!loading && Object.keys(cardsData).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
              No data yet — flip some cards!
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 300 }}>
                {/* Rank headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '18px repeat(12, 1fr)', gap: 2, marginBottom: 4 }}>
                  <div />
                  {RANKS.map(r => (
                    <div key={r} style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 7, color: '#C9A227', letterSpacing: 0.2 }}>{r}</div>
                  ))}
                </div>
                {/* Suit rows */}
                {SUITS.map(suit => (
                  <div key={suit} style={{ display: 'grid', gridTemplateColumns: '18px repeat(12, 1fr)', gap: 2, marginBottom: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: SUIT_COLORS[suit] }}>
                      {SUIT_SYMBOLS[suit]}
                    </div>
                    {RANKS.map(rank => {
                      const count     = cardsData[rank]?.[suit] ?? 0;
                      const intensity = count / maxCardCount;
                      const bg        = count === 0 ? 'rgba(255,255,255,0.04)' : `rgba(201,162,39,${(0.15 + intensity * 0.8).toFixed(2)})`;
                      const textColor = count === 0 ? 'transparent' : intensity > 0.6 ? '#000' : '#C9A227';
                      return (
                        <div key={rank} title={`${SUIT_SYMBOLS[suit]}${rank}: ${count}`}
                          style={{ aspectRatio: '1', borderRadius: 3, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, color: textColor, fontWeight: 700, fontFamily: 'monospace' }}>
                          {count > 0 ? count : ''}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {/* Legend */}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.3)' }}>COLD</span>
                  {[0.15, 0.35, 0.55, 0.75, 0.95].map(v => (
                    <div key={v} style={{ width: 12, height: 8, borderRadius: 2, background: `rgba(201,162,39,${v})` }} />
                  ))}
                  <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.3)' }}>HOT</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── YOUR RACE HISTORY ── */}
        <div style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(14px)', border: '1px solid rgba(201,162,39,0.2)', borderRadius: 14, padding: '14px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 14 }}>🏆</span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#C9A227', letterSpacing: 2 }}>YOUR RACE HISTORY</span>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Loading…</div>
          )}

          {!loading && (!data?.personal || data.personal.length === 0) && (
            <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
              No races yet — join a table to start playing!
            </div>
          )}

          {!loading && data?.personal && data.personal.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.personal.map(race => {
                const r         = race.myResult;
                const won       = r?.won ?? false;
                const delta     = r?.chipChange ?? 0;
                const roomColor = ROOM_COLORS[race.roomType] ?? '#C9A227';
                const pickedCol = r?.pickedSuit ? SUIT_COLORS[r.pickedSuit] : '#fff';
                return (
                  <div key={race.id} data-testid={`card-race-${race.id}`}
                    style={{ background: won ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${won ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Queen portrait */}
                    <div style={{ width: 34, height: 46, borderRadius: 6, overflow: 'hidden', flexShrink: 0, border: `1px solid ${pickedCol}33`, background: '#0d0d1e' }}>
                      {r?.pickedSuit && (
                        <img src={QUEEN_PORTRAITS[r.pickedSuit]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', filter: 'brightness(0.8)' }} />
                      )}
                    </div>
                    {/* Race info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 8, color: roomColor, letterSpacing: 1, background: `${roomColor}22`, border: `1px solid ${roomColor}44`, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                          {race.roomType.toUpperCase()}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap' }}>
                          {new Date(race.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                          {new Date(race.playedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 8, color: r?.pickedSuit ? pickedCol : 'rgba(255,255,255,0.4)' }}>
                          {r?.pickedSuit ? `${SUIT_SYMBOLS[r.pickedSuit]} ${QUEEN_NICKNAMES[r.pickedSuit]}` : 'No pick'}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.28)' }}>→</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 8, color: SUIT_COLORS[race.winningSuit] }}>
                          {SUIT_SYMBOLS[race.winningSuit]} won
                        </span>
                      </div>
                    </div>
                    {/* P&L */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {r && (
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: won ? '#10b981' : '#e53935' }}>
                          {won ? '+' : ''}{delta.toLocaleString()}
                        </div>
                      )}
                      <div style={{ fontFamily: 'monospace', fontSize: 7, color: won ? '#10b981' : '#e53935', marginTop: 2, letterSpacing: 1 }}>
                        {r ? (won ? 'WIN' : 'LOSS') : '—'}
                      </div>
                      {r?.wager ? (
                        <div style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>BET {r.wager.toLocaleString()}</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM NAV ── */}
      <div style={{ background: 'rgba(8,6,4,0.97)', borderTop: '1px solid rgba(201,162,39,0.18)', display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {([
          { label: 'HOME',    icon: '⌂',  path: '/',                 active: false },
          { label: 'LOBBY',   icon: '☆',  path: '/ladyluck',         active: false },
          { label: 'HISTORY', icon: '🏆', path: '/ladyluck/history', active: true  },
        ] as { label: string; icon: string; path: string; active: boolean }[]).map(item => (
          <button key={item.label}
            data-testid={`button-nav-${item.label.toLowerCase()}`}
            onClick={() => navigate(item.path)}
            style={{ flex: 1, padding: '10px 4px 8px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 16, color: item.active ? '#C9A227' : 'rgba(255,255,255,0.28)' }}>{item.icon}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, color: item.active ? '#C9A227' : 'rgba(255,255,255,0.28)' }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
