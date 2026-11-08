// ─── Yard Legends — the Profile trophy cabinet ───────────────────────────────
// P6 (2026-11-08): the achievements tab rendered as a collectible-card album.
// Data source (unchanged from the list it replaces): the player's unlocked
// achievement IDs — server profile xpAchievements when available, else the
// local progression state — resolved by Profile.tsx against the real
// ACHIEVEMENTS catalog in lib/progression.ts. Earned cards show exactly the
// achievements the player has unlocked; every other catalog card renders as
// a locked silhouette. Nothing is pre-filled, estimated, or back-dated.

import { Lock } from 'lucide-react';
import { ACHIEVEMENTS, type Achievement } from '@/lib/progression';
import { SignatureTraceGlow } from '@/components/ui/SignatureTraceGlow';

const RARITY_COLORS: Record<string, string> = {
  common:    'text-white/50 border-white/10 bg-white/[0.03]',
  rare:      'text-blue-400/80 border-blue-500/20 bg-blue-500/[0.05]',
  epic:      'text-purple-400/80 border-purple-500/25 bg-purple-500/[0.07]',
  legendary: 'text-[#C9A227] border-[#C9A227]/30 bg-[#C9A227]/[0.07]',
};

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary',
};

export function YardLegendsAlbum({ unlocked, newIds }: { unlocked: Achievement[]; newIds: string[] }) {
  const unlockedIds = new Set(unlocked.map(a => a.id));
  return (
    <div
      style={{ background: 'rgba(15,10,25,0.55)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: 16, padding: 16 }}
      data-testid="yard-legends-album"
    >
      <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: 'rgba(240,184,41,0.9)', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Yard Legends
        </div>
        <div className="cgp-num" style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em' }}>
          {unlocked.length} / {ACHIEVEMENTS.length} EARNED
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>
        Every card here was earned at the tables. Locked cards stay dark until you take them.
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ACHIEVEMENTS.map((ach) => {
          const earned = unlockedIds.has(ach.id);
          if (!earned) {
            return (
              <div
                key={ach.id}
                data-testid={`achievement-locked-${ach.id}`}
                className="relative rounded-xl px-3 py-3 overflow-hidden"
                style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.012)' }}
              >
                <div className="flex items-start justify-between">
                  <span className="text-2xl leading-none grayscale" style={{ opacity: 0.28 }}>{ach.icon}</span>
                  <Lock size={12} style={{ color: 'rgba(255,255,255,0.30)' }} />
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.42)', marginTop: 8 }}>{ach.name}</div>
                <div style={{ fontSize: 10.5, marginTop: 2, color: 'rgba(255,255,255,0.30)', lineHeight: 1.35 }}>{ach.description}</div>
                <div style={{ fontSize: 8.5, fontFamily: 'monospace', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 7, color: 'rgba(255,255,255,0.28)' }}>
                  {RARITY_LABEL[ach.rarity]} · +{ach.xpReward} XP
                </div>
              </div>
            );
          }
          const card = (
            <div
              data-testid={`achievement-${ach.id}`}
              className={`relative rounded-xl px-3 py-3 border overflow-hidden ${RARITY_COLORS[ach.rarity]}`}
              style={{ minHeight: '100%' }}
            >
              <div className="flex items-start justify-between">
                <span className="text-2xl leading-none">{ach.icon}</span>
                <span style={{ fontSize: 8.5, fontFamily: 'monospace', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7 }}>
                  {RARITY_LABEL[ach.rarity]}
                </span>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.88)', marginTop: 8 }}>{ach.name}</div>
              <div style={{ fontSize: 10.5, marginTop: 2, color: 'rgba(255,255,255,0.45)', lineHeight: 1.35 }}>{ach.description}</div>
              <div className="cgp-num" style={{ fontSize: 10, fontFamily: 'monospace', flexShrink: 0, color: 'rgba(64,200,120,0.75)', marginTop: 7 }}>
                +{ach.xpReward} XP
              </div>
            </div>
          );
          return newIds.includes(ach.id)
            ? <SignatureTraceGlow key={ach.id} variant="trace" durationMs={1600} className="w-full">{card}</SignatureTraceGlow>
            : <div key={ach.id}>{card}</div>;
        })}
      </div>
    </div>
  );
}
