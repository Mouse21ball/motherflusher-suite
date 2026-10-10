import type { CSSProperties, ReactNode, Ref } from 'react';
import { Crown } from 'lucide-react';
import '@/yard-reskin.css';

export type YardGameAccent = '#8B5CF6' | '#D946EF' | '#F97316';

function phaseStatus(phase: string, index: number): 'done' | 'current' | 'upcoming' {
  const upper = phase.toUpperCase();
   const stage = upper === 'WAITING' || upper === 'ANTE' || upper === 'DEAL' || upper.startsWith('DRAW')
    ? 0
    : upper === 'SHOWDOWN'
      ? 2
      : 1;
  return index < stage ? 'done' : index === stage ? 'current' : 'upcoming';
}

export function TableBoard({
  gameAccent, title, subtitle, phase, phaseSteps, rootRef, centerReadout, heroCards, heroPlayerId, pot, communityCards, children,
}: {
  gameAccent: YardGameAccent;
  title: string;
  subtitle: string;
  phase: string;
  phaseSteps?: ReactNode;
  rootRef?: Ref<HTMLElement>;
  centerReadout?: ReactNode;
  heroCards?: ReactNode;
  heroPlayerId?: string;
  pot?: ReactNode;
  communityCards?: ReactNode;
  children: ReactNode;
}) {
  const style = { '--table-accent': gameAccent } as CSSProperties;
  return <section ref={rootRef} className="yard-table-board" style={style} aria-label={`${title} poker table`}>
    <div className="yard-table-heading">
       <span className="yard-mark" aria-hidden="true"><Crown size={17} fill="currentColor" /></span>
      <div><strong>{title}</strong><span>{subtitle}</span></div>
    </div>

    {/* Center info: free-floating, no table. Phase + pot + community cards. */}
    <div className="yard-center-info">
      <div className="yard-phase-slot" role="list" aria-label={`Hand phase: ${phase.replace(/_/g, ' ')}`}>
        {phaseSteps ?? ['DRAW', phase === 'DECLARE' ? 'DECLARE' : 'BET', 'SHOWDOWN'].map((label, index) => <div key={label} className={`yard-phase-step is-${phaseStatus(phase, index)}`} role="listitem">
          <span className="yard-phase-dot">{index + 1}</span><span>{label}</span>
        </div>)}
      </div>
      <div className="yard-pot-row">
        {pot && <div className="yard-pot-slot">{pot}</div>}
        {centerReadout && <div className="yard-readout-slot">{centerReadout}</div>}
      </div>
      {communityCards && <div className="yard-community">{communityCards}</div>}
    </div>

    {/* Hero zone: below, just for the player */}
    <div className="yard-hero-zone">
      <div className="yard-table-content">{children}</div>
      {heroCards && <div className="yard-hero-slot" data-deal-seat={heroPlayerId} data-player-seat={heroPlayerId}>{heroCards}</div>}
    </div>
  </section>;
}
