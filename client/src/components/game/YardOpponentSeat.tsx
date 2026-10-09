import type { ReactNode } from 'react';
import { Crown } from 'lucide-react';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import { getAvatarColor, getAvatarInitials } from '@/lib/persistence';
import '@/yard-reskin.css';

export function YardOpponentSeat({ name, chips, seat, active = false, folded = false, winner = false, dealer = false, chipLeader = false, open = false, children }: {
  name: string;
  chips: number;
  seat: number;
  active?: boolean;
  folded?: boolean;
  winner?: boolean;
  dealer?: boolean;
  chipLeader?: boolean;
  open?: boolean;
  children?: ReactNode;
}) {
  if (open) return <div className="yard-opponent-card is-open"><span className="yard-open-seat">OPEN SEAT</span></div>;
  const initials = getAvatarInitials(name);
  return <article className={`yard-opponent-card${active ? ' is-active' : ''}${folded ? ' is-folded' : ''}${winner ? ' is-winner' : ''}`}>
    {chipLeader && <span className="yard-opponent-crown" aria-label="Chip leader"><Crown size={14} fill="currentColor" /></span>}
    <div className="yard-opponent-head">
      <div className="yard-opponent-avatar" style={{ background: getAvatarColor(name) }}>
        <img src={getAvatarForSeat(seat)} alt="" onLoad={event => {
          const fallback = event.currentTarget.parentElement?.querySelector('span');
          if (fallback) fallback.style.display = 'none';
        }} onError={event => { event.currentTarget.style.display = 'none'; }} />
        <span>{initials}</span>
      </div>
      <div className="yard-opponent-info">
        <div className="yard-opponent-name">{active && <i aria-label="Active turn" />}{name}{dealer && <b aria-label="Dealer">D</b>}</div>
        <strong className="yard-opponent-chips">{chips.toLocaleString()}</strong>
      </div>
    </div>
    {children && <div className="yard-opponent-detail">{children}</div>}
    {folded && <span className="yard-opponent-status">FOLDED</span>}
    {winner && <span className="yard-opponent-status is-winner">WINNER</span>}
  </article>;
}
