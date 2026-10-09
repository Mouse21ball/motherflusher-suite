import { Crown } from 'lucide-react';
import { AvatarWithFrame } from '@/components/ui/AvatarWithFrame';
import { getAvatarInitials } from '@/lib/persistence';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import type { GameState } from '@/lib/poker/types';
import { TableTurnTimer } from './FiveSeatPokerTable';

export function YardHeroIdentity({ state, myId, accent }: { state: GameState; myId: string; accent: string }) {
  const me = state.players.find(player => player.id === myId);
  if (!me) return null;
  return <div className="yard-hero-identity">
    <div className="yard-hero-avatar">
      <AvatarWithFrame size={56} avatarSrc={getAvatarForSeat(state.players.findIndex(player => player.id === myId))}
        initials={getAvatarInitials(me.name)} initialsColor="#FDE68A" />
      {state.activePlayerId === myId && state.turnDeadline && state.phase !== 'WAITING' && state.phase !== 'SHOWDOWN' &&
        <TableTurnTimer deadline={state.turnDeadline} playerName={me.name} accent={accent} variant="ring" />}
    </div>
    <span className="yard-hero-you"><Crown size={16} fill="currentColor" />YOU</span>
    <span className="yard-hero-name">{me.name}<strong>{me.chips.toLocaleString()}</strong></span>
  </div>;
}
