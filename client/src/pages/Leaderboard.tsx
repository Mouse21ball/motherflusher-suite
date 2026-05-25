// ─── Leaderboard ──────────────────────────────────────────────────────────────
// Prison-vault redesign matching the CGP aesthetic mockup.
// All existing logic (simulated board, sorting, player position) preserved unchanged.

import { useState } from 'react';
import { useLocation } from 'wouter';
import { ensurePlayerIdentity, getAvatarInitials, getAvatarColor } from '@/lib/persistence';
import { getProgression, getLevelInfo, getRankForLevel } from '@/lib/progression';
import { getSimulatedPlayerCount } from '@/lib/dailyReward';

// ── Simulated leaderboard data ────────────────────────────────────────────────

const NAMES = [
  'AceHunter', 'BluffKing', 'CardShark', 'DeckMaster', 'EchoAce',
  'FlushQueen', 'GoldStrike', 'HandReader', 'IronSuit', 'JackWild',
  'KingBluff', 'LowBaller', 'MidStack', 'NightRider', 'OddBall',
  'PotSweeper', 'QuadAces', 'RiverRat', 'SilkHand', 'TiltKing',
  'UltBadugi', 'VegasGhost', 'WildFold', 'XtraWin', 'YardBird',
  'StonePoker',
];

function getSimulatedLeaderboard(dayKey: number): {
  name: string; xp: number; level: number; rank: string; handsPlayed: number; color: string;
}[] {
  const seed = dayKey;
  const result = [];
  for (let i = 0; i < 25; i++) {
    const nameIdx = (seed * 17 + i * 31) % NAMES.length;
    const xpBase = Math.max(50, 12000 - i * 450 - ((seed * 13 + i) % 200));
    const xp = xpBase;
    const levelInfo = getLevelInfo(xp);
    const rank = getRankForLevel(levelInfo.level);
    const colorSeed = (nameIdx * 7 + seed) % 10;
    const colors = ['#C9A227','#7B61FF','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#84CC16'];
    result.push({
      name: NAMES[nameIdx],
      xp,
      level: levelInfo.level,
      rank: rank.name,
      handsPlayed: Math.round(xp / 12 + ((seed * 3 + i) % 30)),
      color: colors[colorSeed],
    });
  }
  return result;
}

const dayKey = Math.floor(Date.now() / (1000 * 60 * 60 * 24));

// Avatar plate background colours keyed by player colour
const AVATAR_PLATE: Record<string, string> = {
  '#C9A227': '#2a1e06',
  '#7B61FF': '#1e1540',
  '#3B82F6': '#0c1e38',
  '#10B981': '#0a2218',
  '#F59E0B': '#2a1e06',
  '#EF4444': '#2a0c0c',
  '#8B5CF6': '#1e1235',
  '#06B6D4': '#071e28',
  '#EC4899': '#2a0c1e',
  '#84CC16': '#162008',
};

// Top-3 always use the purple prison plate look
const TOP3_PLATE = '#1d1240';
const TOP3_BORDER = '#7B61FF';

// ── Medal badge component ─────────────────────────────────────────────────────
function MedalBadge({ pos }: { pos: number }) {
  if (pos === 1) {
    return (
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'radial-gradient(circle, #FFD700 0%, #B8860B 100%)',
        border: '2px solid #FFD700',
        boxShadow: '0 0 8px rgba(255,215,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 900, color: '#3a2000', fontFamily: 'monospace',
        flexShrink: 0,
      }}>1</div>
    );
  }
  if (pos === 2) {
    return (
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'radial-gradient(circle, #D0D0D0 0%, #888 100%)',
        border: '2px solid #C0C0C0',
        boxShadow: '0 0 6px rgba(192,192,192,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 900, color: '#1a1a1a', fontFamily: 'monospace',
        flexShrink: 0,
      }}>2</div>
    );
  }
  if (pos === 3) {
    return (
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'radial-gradient(circle, #CD7F32 0%, #7B4A15 100%)',
        border: '2px solid #CD7F32',
        boxShadow: '0 0 6px rgba(205,127,50,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 900, color: '#2a1200', fontFamily: 'monospace',
        flexShrink: 0,
      }}>3</div>
    );
  }
  return (
    <div style={{
      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace',
      flexShrink: 0,
    }}>{pos}</div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Leaderboard() {
  const [, navigate] = useLocation();
  const identity    = ensurePlayerIdentity();
  const progression = getProgression();
  const levelInfo   = getLevelInfo(progression.xp);
  const rank        = getRankForLevel(levelInfo.level);
  const playerCount = getSimulatedPlayerCount();

  const [tab, setTab] = useState<'xp' | 'hands'>('xp');

  const board = getSimulatedLeaderboard(dayKey);
  const playerEntry = {
    name:        identity.name,
    xp:          progression.xp,
    level:       levelInfo.level,
    rank:        rank.name,
    handsPlayed: progression.handsPlayed,
    color:       getAvatarColor(identity.avatarSeed),
    isMe:        true,
  };

  const sorted = tab === 'xp'
    ? [...board.map(e => ({ ...e, isMe: false })), playerEntry].sort((a, b) => b.xp - a.xp)
    : [...board.map(e => ({ ...e, isMe: false })), playerEntry].sort((a, b) => b.handsPlayed - a.handsPlayed);

  const top25        = sorted.slice(0, 25);
  const myPosition   = sorted.findIndex(e => e.isMe) + 1;
  const totalPlayers = sorted.length;
  const topPct       = Math.round((myPosition / totalPlayers) * 100);
  const initials     = getAvatarInitials(identity.name);

  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{
        background: '#09070f',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* ── Atmospheric background layers ──────────────────────────────── */}
      {/* Stone/concrete noise texture via CSS */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          backgroundImage: `
            radial-gradient(ellipse 80% 40% at 50% 0%, rgba(90,40,180,0.18) 0%, transparent 70%),
            radial-gradient(ellipse 60% 50% at 20% 80%, rgba(60,20,120,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 80% 60%, rgba(80,30,160,0.10) 0%, transparent 60%),
            repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 40px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.008) 0px, rgba(255,255,255,0.008) 1px, transparent 1px, transparent 40px)
          `,
        }}
      />
      {/* Chain shadow streaks */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          backgroundImage: `
            repeating-linear-gradient(
              -55deg,
              transparent 0px,
              transparent 60px,
              rgba(0,0,0,0.08) 60px,
              rgba(0,0,0,0.08) 62px
            )
          `,
        }}
      />
      {/* Faint CGP laurel watermark top-right */}
      <img
        src="/profile/cgp-laurel.png"
        alt=""
        aria-hidden
        style={{
          position: 'fixed', top: 48, right: -20, width: 220, height: 220,
          opacity: 0.07, zIndex: 0, pointerEvents: 'none', objectFit: 'contain',
        }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* HEADER                                                             */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <header
        className="sticky top-0 z-40 w-full"
        style={{
          background: 'rgba(9,7,15,0.92)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(120,70,220,0.20)',
          boxShadow: '0 2px 24px rgba(0,0,0,0.60)',
        }}
      >
        <div className="flex items-center px-4 py-3 gap-3 max-w-md mx-auto">
          {/* Back button — gold-rimmed circle */}
          <button
            onClick={() => navigate('/')}
            aria-label="Back to lobby"
            data-testid="link-back-home"
            style={{
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(15,10,25,0.80)',
              border: '2px solid rgba(201,162,39,0.50)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#C9A227', fontSize: 18, cursor: 'pointer',
            }}
          >
            ‹
          </button>

          {/* LOBBY label */}
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(201,162,39,0.55)', letterSpacing: '0.12em', fontWeight: 600, flexShrink: 0 }}>
            LOBBY
          </span>
          <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 10 }}>⛓</span>

          {/* Centered title */}
          <div className="flex-1 flex flex-col items-center">
            <div style={{ fontSize: 9, color: 'rgba(201,162,39,0.50)', fontFamily: 'monospace', letterSpacing: '0.28em', textTransform: 'uppercase', lineHeight: 1 }}>
              CGP
            </div>
            <div style={{
              fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
              fontSize: 20,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: '#fff',
              lineHeight: 1.1,
              textShadow: '0 0 20px rgba(120,70,220,0.40), 0 1px 3px rgba(0,0,0,0.80)',
            }}>
              LEADERBOARD
            </div>
          </div>

          {/* Live count — green glowing pill */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 20, flexShrink: 0,
              background: 'rgba(0,200,140,0.10)',
              border: '1px solid rgba(0,200,140,0.35)',
              boxShadow: '0 0 10px rgba(0,200,140,0.15)',
            }}
          >
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#00C896',
              boxShadow: '0 0 6px #00C896',
              animation: 'pulse 2s infinite',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'monospace', color: '#00C896', letterSpacing: '0.04em' }}>
              {playerCount.toLocaleString()} LIVE
            </span>
          </div>
        </div>
      </header>

      {/* ── Scrollable content ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center px-4 py-4 gap-4 max-w-md mx-auto w-full" style={{ position: 'relative', zIndex: 1 }}>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PLAYER RANK PLAQUE                                             */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div
          className="w-full relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #140e2a 0%, #1c1440 60%, #120c24 100%)',
            borderRadius: 16,
            padding: '1.5px',
            boxShadow: '0 0 32px rgba(120,60,220,0.30), 0 4px 16px rgba(0,0,0,0.60)',
          }}
        >
          {/* Metal border gradient wrapper */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(201,162,39,0.60) 0%, rgba(120,60,220,0.50) 40%, rgba(201,162,39,0.30) 80%, rgba(120,60,220,0.60) 100%)',
            zIndex: 0,
          }} />
          <div style={{
            position: 'relative', zIndex: 1,
            background: 'linear-gradient(135deg, #140e2a 0%, #1c1440 60%, #120c24 100%)',
            borderRadius: 14.5,
            padding: '16px',
          }}>
            {/* Purple edge glow inside */}
            <div aria-hidden style={{
              position: 'absolute', inset: 0, borderRadius: 14,
              background: 'radial-gradient(ellipse at 80% 20%, rgba(120,60,220,0.20) 0%, transparent 60%)',
              pointerEvents: 'none',
            }} />

            {/* CGP laurel watermark on right */}
            <img
              src="/profile/cgp-laurel.png"
              alt="" aria-hidden
              style={{
                position: 'absolute', right: -10, top: -10,
                width: 140, height: 140,
                opacity: 0.12, objectFit: 'contain', pointerEvents: 'none',
              }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />

            <div className="relative flex items-center gap-4">
              {/* Avatar — bolted prison ID plate */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {/* Bolt corners */}
                {[[-3,-3],[33,-3],[-3,33],[33,33]].map(([x,y],i) => (
                  <div key={i} style={{
                    position: 'absolute', left: x, top: y,
                    width: 7, height: 7, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #8a7040, #4a3a18)',
                    border: '1px solid rgba(201,162,39,0.30)',
                    zIndex: 2,
                  }} />
                ))}
                <div style={{
                  width: 58, height: 58, borderRadius: 10,
                  background: 'linear-gradient(135deg, #2a1e5a 0%, #1a1040 100%)',
                  border: '2px solid rgba(123,97,255,0.70)',
                  boxShadow: '0 0 14px rgba(123,97,255,0.40), inset 0 0 8px rgba(0,0,0,0.40)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontWeight: 900, fontSize: 22, fontFamily: 'monospace', color: '#C9A227', letterSpacing: '0.04em' }}>
                    {initials}
                  </span>
                </div>
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0">
                <div style={{ fontWeight: 800, fontSize: 22, color: '#C9A227', fontFamily: 'monospace', letterSpacing: '0.02em', lineHeight: 1.1, marginBottom: 4 }} data-testid="text-leaderboard-name">
                  {identity.name}
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.60)', fontWeight: 600 }}>
                    LVL {levelInfo.level}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.20)', fontSize: 10 }}>•</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#C9A227', fontWeight: 700, letterSpacing: '0.06em' }}>
                    {rank.name.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Rank display */}
              <div className="text-right shrink-0">
                <div style={{
                  fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                  fontSize: 42, lineHeight: 1, color: '#fff',
                  textShadow: '0 0 24px rgba(201,162,39,0.50)',
                  letterSpacing: '0.02em',
                }} data-testid="text-leaderboard-rank">
                  #{myPosition}
                </div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 2 }}>
                  TOP {topPct}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* METAL TOGGLE TABS                                              */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div
          className="w-full flex"
          style={{
            background: 'rgba(15,10,30,0.80)',
            border: '1px solid rgba(120,70,220,0.25)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {(['xp', 'hands'] as const).map((t, idx) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              data-testid={`tab-${t}`}
              style={{
                flex: 1,
                padding: '13px 0',
                fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                fontSize: 15,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                border: 'none',
                borderRight: idx === 0 ? '1px solid rgba(120,70,220,0.25)' : 'none',
                transition: 'all 0.2s ease',
                ...(tab === t ? {
                  background: 'linear-gradient(135deg, rgba(100,50,200,0.50) 0%, rgba(70,30,150,0.60) 100%)',
                  color: '#fff',
                  textShadow: '0 0 12px rgba(180,120,255,0.60)',
                  boxShadow: 'inset 0 0 20px rgba(120,60,220,0.20)',
                } : {
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.28)',
                }),
              }}
            >
              {t === 'xp' ? 'BY XP' : 'BY HANDS'}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* LEADERBOARD LIST — prison ledger strips                        */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div
          className="w-full overflow-hidden"
          style={{
            background: 'rgba(12,8,22,0.92)',
            border: '1px solid rgba(120,70,220,0.18)',
            borderRadius: 14,
            boxShadow: '0 4px 24px rgba(0,0,0,0.50)',
          }}
        >
          {top25.map((entry, i) => {
            const pos       = i + 1;
            const isTop3    = pos <= 3;
            const entryRank = getRankForLevel(entry.level);
            const isMe      = (entry as any).isMe;

            // Avatar plate color
            const plateBg     = isTop3 ? TOP3_PLATE : (AVATAR_PLATE[entry.color] ?? '#1a1230');
            const plateBorder = isTop3 ? TOP3_BORDER : (entry.color ?? entryRank.color);

            return (
              <div
                key={`${entry.name}-${i}`}
                data-testid={isMe ? 'leaderboard-me' : `leaderboard-row-${pos}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  borderBottom: i < top25.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  background: isMe
                    ? 'rgba(201,162,39,0.08)'
                    : isTop3
                    ? 'rgba(100,50,200,0.06)'
                    : 'transparent',
                  borderLeft: isMe ? '3px solid rgba(201,162,39,0.55)' : '3px solid transparent',
                  position: 'relative',
                }}
              >
                {/* Subtle row glow for top 3 */}
                {isTop3 && !isMe && (
                  <div aria-hidden style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: `radial-gradient(ellipse at 0% 50%, rgba(100,50,200,0.08) 0%, transparent 60%)`,
                  }} />
                )}

                {/* Medal / rank number */}
                <MedalBadge pos={pos} />

                {/* Avatar plate */}
                <div style={{
                  width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                  background: `linear-gradient(135deg, ${plateBg} 0%, rgba(0,0,0,0.30) 100%)`,
                  border: `1.5px solid ${plateBorder}60`,
                  boxShadow: isTop3 ? `0 0 8px ${plateBorder}30` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 900, fontFamily: 'monospace',
                    color: isTop3 ? '#C9A227' : (entryRank.color ?? '#fff'),
                    letterSpacing: '0.04em',
                  }}>
                    {getAvatarInitials(entry.name)}
                  </span>
                </div>

                {/* Name + level */}
                <div className="flex-1 min-w-0 flex items-baseline gap-2">
                  <span style={{
                    fontWeight: 700, fontSize: 15, fontFamily: 'sans-serif',
                    color: isMe ? '#C9A227' : isTop3 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.80)',
                    letterSpacing: '0.01em',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {entry.name}
                    {isMe && (
                      <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(201,162,39,0.45)', marginLeft: 4 }}>
                        (you)
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 600, flexShrink: 0, color: entryRank.color }}>
                    LVL {entry.level}
                  </span>
                </div>

                {/* Stat value */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{
                    fontSize: 14, fontWeight: 900, fontFamily: 'monospace',
                    color: isMe ? '#FFD700' : '#C9A227CC',
                    letterSpacing: '0.02em',
                    textShadow: isTop3 ? '0 0 8px rgba(201,162,39,0.40)' : 'none',
                  }}>
                    {tab === 'xp'
                      ? `${(entry.xp / 1000).toFixed(1)}K XP`
                      : `${entry.handsPlayed} hands`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* FOOTER                                                          */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <p
          className="text-center pb-6"
          style={{
            fontSize: 9,
            fontFamily: 'monospace',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'rgba(140,100,200,0.35)',
            lineHeight: 1.8,
          }}
        >
          VIRTUAL CHIPS • FOR ENTERTAINMENT ONLY • NO CASH VALUE
        </p>

      </div>
    </div>
  );
}
