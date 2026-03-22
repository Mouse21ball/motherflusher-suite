import { useState } from 'react';
import { useLocation } from 'wouter';
import { ensurePlayerIdentity, getAvatarInitials, getAvatarColor } from '@/lib/persistence';
import { getProgression, getLevelInfo, getRankForLevel } from '@/lib/progression';
import { getSimulatedPlayerCount } from '@/lib/dailyReward';

// ─── Simulated leaderboard data ───────────────────────────────────────────────
// Deterministic per day (changes daily for freshness).
// Psychology: shows player their position, creates aspiration to climb.

const NAMES = [
  'AceHunter', 'BluffKing', 'CardShark', 'DeckMaster', 'EchoAce',
  'FlushQueen', 'GoldStrike', 'HandReader', 'IronSuit', 'JackWild',
  'KingBluff', 'LowBaller', 'MidStack', 'NightRider', 'OddBall',
  'PotSweeper', 'QuadAces', 'RiverRat', 'SilkHand', 'TiltKing',
  'UltBadugi', 'VegasGhost', 'WildFold', 'XtraWin', 'YardBird',
];

function getSimulatedLeaderboard(dayKey: number): { name: string; xp: number; level: number; rank: string; handsPlayed: number; color: string }[] {
  const seed = dayKey;
  const result = [];

  for (let i = 0; i < 25; i++) {
    const nameIdx = (seed * 17 + i * 31) % NAMES.length;
    const xpBase = Math.max(50, 12000 - i * 450 - ((seed * 13 + i) % 200));
    const xp = xpBase;
    const levelInfo = getLevelInfo(xp);
    const rank = getRankForLevel(levelInfo.level);

    // Deterministic hash for avatar color
    const colorSeed = (nameIdx * 7 + seed) % 10;
    const colors = ['#C9A227', '#7B61FF', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];

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

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const identity = ensurePlayerIdentity();
  const progression = getProgression();
  const levelInfo = getLevelInfo(progression.xp);
  const rank = getRankForLevel(levelInfo.level);
  const playerCount = getSimulatedPlayerCount();

  const [tab, setTab] = useState<'xp' | 'hands'>('xp');

  const board = getSimulatedLeaderboard(dayKey);
  // Insert actual player into correct position
  const playerEntry = {
    name: identity.name,
    xp: progression.xp,
    level: levelInfo.level,
    rank: rank.name,
    handsPlayed: progression.handsPlayed,
    color: getAvatarColor(identity.avatarSeed),
    isMe: true,
  };

  // Sort and find player position
  const sorted = tab === 'xp'
    ? [...board.map(e => ({ ...e, isMe: false })), playerEntry].sort((a, b) => b.xp - a.xp)
    : [...board.map(e => ({ ...e, isMe: false })), playerEntry].sort((a, b) => b.handsPlayed - a.handsPlayed);

  const top25 = sorted.slice(0, 25);
  const myPosition = sorted.findIndex(e => e.isMe) + 1;
  const totalPlayers = sorted.length;
  const topPct = Math.round((myPosition / totalPlayers) * 100);

  return (
    <div className="min-h-[100dvh] bg-[#070709] flex flex-col">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(240,184,41,0.10) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(0,200,150,0.07) 0%, transparent 70%)' }} />
      </div>
      {/* Header */}
      <header
        className="sticky top-0 z-40 w-full px-4 py-3 flex items-center gap-3 border-b"
        style={{ backgroundColor: 'rgba(7,7,9,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="text-[10px] font-mono text-white/30 hover:text-white/60 uppercase tracking-widest transition-colors"
          data-testid="link-back-home"
        >
          ‹ Lobby
        </button>
        <span className="text-white/10">·</span>
        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">⛓️ CGP Leaderboard</span>
        <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-xl"
          style={{ backgroundColor: 'rgba(0,200,150,0.07)', border: '1px solid rgba(0,200,150,0.15)' }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#00C896' }} />
          <span className="text-[10px] font-mono font-bold" style={{ color: '#00C896' }}>{playerCount.toLocaleString()} live</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 py-5 gap-4 max-w-lg mx-auto w-full">
        {/* Player rank card */}
        <div
          className="w-full rounded-2xl p-4 border flex items-center gap-4"
          style={{ backgroundColor: rank.bg, borderColor: rank.border }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg font-mono text-white shrink-0"
            style={{ backgroundColor: playerEntry.color + '22', border: `1.5px solid ${rank.color}40` }}
          >
            {getAvatarInitials(identity.name)}
          </div>
          <div className="flex-1">
            <div className="font-bold text-white/85 font-sans">{identity.name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-mono" style={{ color: rank.color }}>
                Lv {levelInfo.level} · {rank.name}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold font-mono" style={{ color: rank.color }}>#{myPosition}</div>
            <div className="text-[10px] font-mono text-white/30">Top {topPct}%</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="w-full flex rounded-xl bg-[#141417]/60 border border-white/[0.04] p-1 gap-1">
          {(['xp', 'hands'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all ${
                tab === t ? 'bg-white/[0.06] text-white/70' : 'text-white/25 hover:text-white/40'
              }`}
              data-testid={`tab-${t}`}
            >
              {t === 'xp' ? 'By XP' : 'By Hands'}
            </button>
          ))}
        </div>

        {/* Leaderboard list */}
        <div className="w-full rounded-2xl bg-[#141417]/80 border border-white/[0.05] overflow-hidden">
          <div className="divide-y divide-white/[0.03]">
            {top25.map((entry, i) => {
              const pos = i + 1;
              const isTop3 = pos <= 3;
              const entryRank = getRankForLevel(entry.level);
              const trophy = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : null;

              return (
                <div
                  key={`${entry.name}-${i}`}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                    (entry as any).isMe
                      ? 'bg-white/[0.04] border-l-2 border-[#C9A227]/40'
                      : isTop3
                      ? 'bg-white/[0.015]'
                      : ''
                  }`}
                  data-testid={(entry as any).isMe ? 'leaderboard-me' : `leaderboard-row-${pos}`}
                >
                  {/* Position */}
                  <div className="w-7 text-center shrink-0">
                    {trophy ? (
                      <span className="text-base leading-none">{trophy}</span>
                    ) : (
                      <span className="text-[11px] font-mono text-white/25">#{pos}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono text-white shrink-0"
                    style={{ backgroundColor: entry.color + '25', border: `1px solid ${entryRank.color}30` }}
                  >
                    {getAvatarInitials(entry.name)}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-semibold font-sans truncate ${(entry as any).isMe ? 'text-[#C9A227]' : 'text-white/75'}`}>
                        {entry.name}
                        {(entry as any).isMe && <span className="text-[9px] ml-1 text-[#C9A227]/50">(you)</span>}
                      </span>
                      <span className="text-[8px] font-mono shrink-0" style={{ color: entryRank.color }}>
                        Lv{entry.level}
                      </span>
                    </div>
                  </div>

                  {/* Stat */}
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold font-mono text-white/70 tabular-nums">
                      {tab === 'xp'
                        ? `${(entry.xp / 1000).toFixed(1)}k XP`
                        : `${entry.handsPlayed} hands`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[10px] text-white/15 font-mono text-center tracking-wide">
          Rankings reset daily · Play more to climb
        </p>
      </div>
    </div>
  );
}
