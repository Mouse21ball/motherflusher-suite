import { useLocation } from 'wouter';
import { Bell, Coins, Crown, Plus } from 'lucide-react';
import { ensurePlayerIdentity, getAvatarInitials, resolveAvatarSrc } from '@/lib/persistence';
import { getLevelInfo, getRankForLevel } from '@/lib/progression';
import { useServerProfile } from '@/lib/useServerProfile';
import { useYardMissionBadge } from '@/lib/yardMissionBadge';
import { AvatarWithFrame } from '@/components/ui/AvatarWithFrame';
import '@/yard-reskin.css';

export function YardPlayerHeader({ onBell, actions, notificationDot, readOnly = false }: {
  onBell?: () => void; actions?: React.ReactNode; notificationDot?: boolean; readOnly?: boolean;
}) {
  const [, navigate] = useLocation();
  const { profile } = useServerProfile();
  const cachedMissionDot = useYardMissionBadge(profile?.profileId);
  const identity = ensurePlayerIdentity();
  const name = profile?.displayName ?? identity.name;
  const levelInfo = getLevelInfo(profile?.xp ?? 0);
  const level = profile?.level ?? levelInfo.level;
  const rank = getRankForLevel(level);
  const frame = profile?.equippedFrameId ? `/cosmetics/frames/${profile.equippedFrameId.replace(/_/g, '-')}.png` : null;
  return <header className="yard-player-header">
    <button className="yard-player-avatar" type="button" disabled={readOnly} onClick={() => navigate('/profile')} aria-label="Open player profile">
      <AvatarWithFrame avatarSrc={resolveAvatarSrc(profile?.equippedAvatarId, profile?.avatarId)} frameSrc={frame}
        initials={getAvatarInitials(name)} initialsColor="#FDE68A" size={72} />
      <span className="yard-header-crown" aria-hidden="true"><Crown size={15} fill="currentColor" /></span>
    </button>
    <button className="yard-player-identity" type="button" disabled={readOnly} onClick={() => navigate('/profile')}>
      <strong>{name}</strong>
      <span>LV {level} <i>·</i> {rank.name}</span>
      <span className="yard-player-xp"><i style={{ width: `${Math.round(levelInfo.progress * 100)}%` }} /></span>
    </button>
    <div className="yard-player-wallet">
      <div className="yard-player-balance"><span><Coins size={16} />CHIPS</span><strong data-testid={profile?.chipBalance === 0 ? undefined : 'text-bankroll'}>${(profile?.chipBalance ?? 0).toLocaleString()}</strong><button type="button" disabled={readOnly} aria-label="Get chips" onClick={() => navigate('/shop')}><Plus size={16} /></button></div>
      <div className="yard-player-balance" data-yard-balance="stripes"><span><Crown size={16} />STRIPES</span><strong>{(profile?.stripes ?? 0).toLocaleString()}</strong><button type="button" disabled={readOnly} aria-label="Get Stripes" onClick={() => navigate('/shop')}><Plus size={16} /></button></div>
    </div>
    <div className="yard-player-actions">{actions}<button className="yard-header-bell" type="button" disabled={readOnly} aria-label="Open missions" onClick={onBell ?? (() => navigate('/missions'))}><Bell size={21} />{(notificationDot ?? cachedMissionDot) && <i aria-label="Claimable missions" />}</button></div>
  </header>;
}
