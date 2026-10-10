import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CardType, GameState } from '@/lib/poker/types';
import { getHeroHandValidity } from '@shared/modes/heroHandValidity';
import { PlayingCard } from '@/components/game/Card';
import { HeroHandValidityBadge } from '@/components/game/HeroHandValidityBadge';
import { TableBoard } from '@/components/game/TableBoard';
import { OpponentStrip } from '@/components/game/OpponentStrip';
import { YardOpponentSeat } from '@/components/game/YardOpponentSeat';
import { Crown } from 'lucide-react';
import type { ReactNode } from 'react';

const ACT  = '#F97316';
const nvA  = (a: number) => `rgba(45,27,105,${a})`;
const blA  = (a: number) => `rgba(249,115,22,${a})`;

function PipRow({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          width: 13, height: 19, borderRadius: 3,
          background: nvA(0.7), border: `1px solid ${nvA(0.9)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 6, color: blA(0.3) }}>◈</div>
        </div>
      ))}
    </div>
  );
}

interface OpponentPanelProps {
  player: GameState['players'][0];
  phase: string;
}

function OpponentPanel({ player, phase }: OpponentPanelProps) {
  const isActive   = player.status === 'active';
  const folded     = player.status === 'folded';
  const isShowdown = phase === 'SHOWDOWN';
  return <YardOpponentSeat name={player.name} chips={player.chips} seat={parseInt(player.id.replace('p', ''),10) || 1}
    active={isActive} folded={folded} winner={!!player.isWinner} dealer={!!player.isDealer}>
      {player.declaration && (
        <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', fontFamily: 'monospace', color: player.declaration === 'SWING' ? '#FDE68A' : player.declaration === 'HIGH' ? ACT : '#86efac', borderRadius: 4, padding: '1px 4px' }}>
          {player.declaration}
        </span>
      )}
      {!folded && (isShowdown && player.cards.some(c => !c.isHidden) ? (
        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          {player.cards.map((c, i) => (
            <div key={i} data-celebration-card style={{ width: 26, height: 38, flexShrink: 0 }}>
              <PlayingCard card={c} className="!w-[26px] !h-[38px]" />
            </div>
          ))}
        </div>
      ) : <PipRow count={player.cards.length || 5} />)}
  </YardOpponentSeat>;
}

interface BoxChevyTableProps {
  state: GameState;
  myId: string;
  phase: string;
  isDrawPhase: boolean;
  heroCards?: ReactNode;
}

export function BoxChevyTable({ state, myId, phase, heroCards }: BoxChevyTableProps) {
  const me          = state.players.find(p => p.id === myId);
  const opponents   = state.players.filter(p => p.id !== myId);
  const communityCards: CardType[] = (state.communityCards ?? []).map(c => ({ ...c, isHidden: false }));

  const heroValidity = getHeroHandValidity('boxchevy', phase, me?.cards ?? [], state.communityCards ?? []);

  const pot = state.pot;
  const opponentSeats = [
    ...opponents.map(player => <div key={player.id} data-deal-seat={player.id} data-player-seat={player.id}>
      {player.presence === 'reserved' || player.presence === 'open' ? <YardOpponentSeat name="OPEN" chips={0} seat={0} open /> : <OpponentPanel player={player} phase={phase} />}
    </div>),
    ...Array.from({length:Math.max(0,4-opponents.length)},(_,index)=><div key={`open-${index}`}><YardOpponentSeat name="OPEN" chips={0} seat={0} open /></div>),
  ];

  /* ── Staggered deal animation ─────────────────────────────────────────── */
  // visibleCount tracks how many community cards have animated in.
  // When communityCards transitions from 0→5 we stagger the reveal.
  // Joining mid-hand (cards already present) shows all immediately.
  const [visibleCount, setVisibleCount] = useState(communityCards.length);
  const prevLenRef = useRef(communityCards.length);
  const timersRef  = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const newLen = communityCards.length;
    const oldLen = prevLenRef.current;
    prevLenRef.current = newLen;

    if (newLen === 0) {
      // New hand reset — clear count so next deal animates
      setVisibleCount(0);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }

    if (oldLen === 0 && newLen > 0) {
      // Cards just dealt — stagger reveal: 200ms first card, +280ms each subsequent
      setVisibleCount(0);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      for (let i = 0; i < newLen; i++) {
        const t = setTimeout(() => setVisibleCount(i + 1), 200 + i * 300);
        timersRef.current.push(t);
      }
      return () => { timersRef.current.forEach(clearTimeout); };
    }

    // Mid-hand join or phase change — show all immediately
    if (newLen > oldLen) setVisibleCount(newLen);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityCards.length]);

  // Community cards — free-floating center (Detroit 2026-10-10), no box
  const communityCardsEl = (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'flex-end' }}>
      {communityCards.length > 0 ? (
        communityCards.map((c, i) => (
          <div key={i} style={{ flexShrink: 0, width: 58, height: 84 }}>
            <AnimatePresence>
              {i < visibleCount && (
                <motion.div
                  key={`comm-${i}`}
                  data-celebration-card
                  initial={{ opacity: 0, y: -22, rotateY: 90, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0,   rotateY: 0,  scale: 1    }}
                  transition={{ duration: 0.32, ease: 'easeOut' }}
                  style={{ transformOrigin: 'top center' }}
                >
                  <PlayingCard card={c} className="!w-[58px] !h-[84px] sm:!w-[68px] sm:!h-[96px]" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))
      ) : (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            width: 58, height: 84, borderRadius: 8,
            border: `1px dashed ${nvA(0.5)}`,
            background: nvA(0.25),
            flexShrink: 0,
          }} />
        ))
      )}
    </div>
  );

  return (<>
    <OpponentStrip opponents={opponents} activePlayerId={state.activePlayerId ?? undefined} totalCards={5} phase={state.phase} />
    <TableBoard gameAccent="#F97316" title="BOX CHEVY" subtitle="10-CARD LOWBALL" phase={phase} heroPlayerId={myId}
      heroCards={heroCards}
      communityCards={communityCardsEl}
      centerReadout={<div className="yard-table-readout">{heroValidity ? <HeroHandValidityBadge validity={heroValidity} phase={phase} /> : `${me?.cards.length ?? 0} HOLE CARDS · ${communityCards.length}/5 COMMUNITY`}</div>}
      pot={<div data-pot-anchor className="yard-box-pot"><span>POT</span><strong>{pot.toLocaleString()}</strong></div>}>
    <div className="yard-box-table-content">
      <div data-deal-anchor="deck" style={{ position: 'absolute', left: '50%', top: '50%', width: 44, height: 44, transform: 'translate(-50%,-50%)', opacity: 0, pointerEvents: 'none' }} />

    </div>
    </TableBoard>
  </>);
}
