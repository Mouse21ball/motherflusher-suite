import { useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { ensurePlayerIdentity, getAvatarInitials, getAvatarColor } from '@/lib/persistence';
import { getProgression, getLevelInfo, getRankForLevel } from '@/lib/progression';
import { getSimulatedPlayerCount } from '@/lib/dailyReward';

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

const AVATAR_COLORS: Record<string, string> = {
  '#C9A227': '#3a2e0a',
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

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const identity = ensurePlayerIdentity();
  const progression = getProgression();
  const levelInfo = getLevelInfo(progression.xp);
  const rank = getRankForLevel(levelInfo.level);
  const playerCount = getSimulatedPlayerCount();

  const [tab, setTab] = useState<'xp' | 'hands'>('xp');

  const board = getSimulatedLeaderboard(dayKey);
  const playerEntry = {
    name: identity.name,
    xp: progression.xp,
    level: levelInfo.level,
    rank: rank.name,
    handsPlayed: progression.handsPlayed,
    color: getAvatarColor(identity.avatarSeed),
    isMe: true,
  };

  const sorted = tab === 'xp'
    ? [...board.map(e => ({ ...e, isMe: false })), playerEntry].sort((a, b) => b.xp - a.xp)
    : [...board.map(e => ({ ...e, isMe: false })), playerEntry].sort((a, b) => b.handsPlayed - a.handsPlayed);

  const top25 = sorted.slice(0, 25);
  const myPosition = sorted.findIndex(e => e.isMe) + 1;
  const totalPlayers = sorted.length;
  const topPct = Math.round((myPosition / totalPlayers) * 100);

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: '#080608' }}>

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-40 w-full px-4 py-3 flex items-center gap-3"
        style={{ backgroundColor: 'rgba(8,6,8,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={() => navigate('/')}
          aria-label="Back to lobby"
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
          data-testid="link-back-home"
        >
          <ArrowLeft className="w-4 h-4 text-white/70" />
        </button>
        <span className="text-[11px] font-mono text-white/40 uppercase tracking-widest">Lobby</span>

        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-[10px] font-mono text-white/30 tracking-wider">⛓</span>
          <span className="text-[13px] font-bold font-mono text-white/80 uppercase tracking-widest">CGP Leaderboard</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
          style={{ background: 'rgba(0,200,150,0.08)', border: '1px solid rgba(0,200,150,0.22)' }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#00C896' }} />
          <span className="text-[10px] font-bold font-mono" style={{ color: '#00C896' }}>{playerCount.toLocaleString()} LIVE</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 py-4 gap-4 max-w-md mx-auto w-full">

        {/* ── Player rank card ── */}
        <div
          className="w-full rounded-2xl p-4 overflow-hidden relative"
          style={{
            background: 'linear-gradient(135deg, #1c1408 0%, #241a06 50%, #1a1206 100%)',
            border: `1.5px solid ${rank.border}`,
            boxShadow: `0 0 28px ${rank.color}22, inset 0 0 40px rgba(0,0,0,0.4)`,
          }}
        >
          {/* chain texture overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.12]"
            style={{ backgroundImage: 'url(/assets/backgrounds/chain-pattern.png)', backgroundSize: 'cover' }} />
          {/* subtle radial gold glow */}
          <div className="absolute right-0 top-0 w-40 h-40 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at 80% 20%, ${rank.color}18 0%, transparent 70%)` }} />

          <div className="relative flex items-center gap-4">
            <div
              className="w-[52px] h-[52px] rounded-xl flex items-center justify-center font-bold text-xl font-mono shrink-0"
              style={{ background: AVATAR_COLORS[playerEntry.color] ?? '#1c1408', border: `2px solid ${rank.color}60`, color: rank.color }}
            >
              {getAvatarInitials(identity.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white/90 font-sans text-base leading-tight truncate">{identity.name}</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] font-mono font-semibold" style={{ color: rank.color }}>Lvl {levelInfo.level}</span>
                <span className="text-white/20 text-[10px]">•</span>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider" style={{ color: rank.color }}>{rank.name}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-black font-mono text-3xl leading-none" style={{ color: rank.color }}>#{myPosition}</div>
              <div className="text-[10px] font-mono text-white/35 mt-1 uppercase tracking-wider">Top {topPct}%</div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="w-full flex rounded-xl p-1 gap-0.5"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {(['xp', 'hands'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 rounded-lg text-[12px] font-bold font-mono uppercase tracking-widest transition-all duration-200"
              style={tab === t
                ? { background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.90)', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }
                : { color: 'rgba(255,255,255,0.28)' }}
              data-testid={`tab-${t}`}
            >
              {t === 'xp' ? 'By XP' : 'By Hands'}
            </button>
          ))}
        </div>

        {/* ── Leaderboard list ── */}
        <div className="w-full rounded-2xl overflow-hidden"
          style={{ background: 'rgba(18,14,10,0.90)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {top25.map((entry, i) => {
            const pos = i + 1;
            const isTop3 = pos <= 3;
            const entryRank = getRankForLevel(entry.level);
            const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : null;
            const isMe = (entry as any).isMe;
            const avatarBg = AVATAR_COLORS[entry.color] ?? '#1a1408';

            return (
              <div
                key={`${entry.name}-${i}`}
                className="flex items-center gap-3 px-4"
                style={{
                  paddingTop: '11px',
                  paddingBottom: '11px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: isMe
                    ? 'rgba(201,162,39,0.06)'
                    : isTop3
                    ? 'rgba(255,255,255,0.015)'
                    : 'transparent',
                  borderLeft: isMe ? '2px solid rgba(201,162,39,0.50)' : '2px solid transparent',
                }}
                data-testid={isMe ? 'leaderboard-me' : `leaderboard-row-${pos}`}
              >
                {/* Medal / position */}
                <div className="w-6 flex items-center justify-center shrink-0">
                  {medal
                    ? <span className="text-lg leading-none">{medal}</span>
                    : <span className="text-[12px] font-bold font-mono" style={{ color: isMe ? '#C9A227' : 'rgba(255,255,255,0.28)' }}>{pos}</span>
                  }
                </div>

                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold font-mono shrink-0"
                  style={{ background: avatarBg, border: `1.5px solid ${entryRank.color}50`, color: entryRank.color }}
                >
                  {getAvatarInitials(entry.name)}
                </div>

                {/* Name + level */}
                <div className="flex-1 min-w-0 flex items-baseline gap-2">
                  <span className="font-bold font-sans text-[15px] truncate leading-tight"
                    style={{ color: isMe ? '#C9A227' : 'rgba(255,255,255,0.88)' }}>
                    {entry.name}
                    {isMe && <span className="text-[9px] font-mono ml-1" style={{ color: 'rgba(201,162,39,0.45)' }}>(you)</span>}
                  </span>
                  <span className="text-[10px] font-mono font-semibold shrink-0" style={{ color: entryRank.color }}>
                    Lvl {entry.level}
                  </span>
                </div>

                {/* Stat */}
                <div className="text-right shrink-0">
                  <span className="text-[14px] font-black font-mono tabular-nums" style={{ color: isMe ? '#C9A227' : '#C9A227CC' }}>
                    {tab === 'xp'
                      ? `${(entry.xp / 1000).toFixed(1)}K XP`
                      : `${entry.handsPlayed} hands`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <p className="text-[10px] font-mono text-center tracking-widest pb-4"
          style={{ color: 'rgba(255,255,255,0.18)' }}>
          VIRTUAL CHIPS • FOR ENTERTAINMENT ONLY • NO CASH VALUE
        </p>
      </div>
    </div>
  );
}
