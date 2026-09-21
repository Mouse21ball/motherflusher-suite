import { forwardRef, type ReactNode, type Ref } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameState, Player } from '@/lib/poker/types';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import { getAvatarColor } from '@/lib/persistence';
import { TableDealAnimator } from '@/components/flushedUp/TableDealAnimator';

const CARD_BACK = '/ladyluck/card-back-cgp.png';

export interface FiveSeatOpponent {
  id: string;
  name: string;
  chips: number;
  cardCount: number;
  status: Player['status'];
  isActive: boolean;
  isWinner: boolean;
  isDealer: boolean;
  seatNum: number;
}

interface FiveSeatPokerTableProps {
  players: GameState['players'];
  phase: string;
  myId: string;
  opponents: FiveSeatOpponent[];
  hero: ReactNode;
  center: ReactNode;
  accent: string;
  modeLabel: string;
}

const SLOT_STYLES = [
  { left: '5%', top: '5%', transform: 'translateX(-8%)' },
  { right: '5%', top: '5%', transform: 'translateX(8%)' },
  { left: '0.5%', top: '47%', transform: 'translateY(-50%)' },
  { right: '0.5%', top: '47%', transform: 'translateY(-50%)' },
] as const;

function OpponentCardFan({ id, cardCount, folded }: { id: string; cardCount: number; folded: boolean }) {
  if (folded || cardCount <= 0) return null;
  const count = Math.min(4, cardCount);
  return (
    <div
      aria-label={`${count} face-down cards`}
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        height: 30,
        minWidth: 62,
        overflow: 'visible',
      }}
    >
      <AnimatePresence initial={false}>
        {Array.from({ length: count }).map((_, index) => (
          <motion.img
            key={`${id}-card-${index}`}
            src={CARD_BACK}
            alt=""
            initial={{ opacity: 0, y: -5, scale: 0.86 }}
            animate={{
              opacity: 1,
              y: Math.abs(index - (count - 1) / 2) * 1.5,
              rotate: (index - (count - 1) / 2) * 4,
            }}
            exit={{ opacity: 0, scale: 0.82, y: -4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{
              width: 'clamp(20px, 5.5vw, 28px)',
              height: 'auto',
              marginLeft: index === 0 ? 0 : 'clamp(-12px, -2.2vw, -5px)',
              borderRadius: 3,
              flexShrink: 0,
              transformOrigin: 'center bottom',
              boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function OpponentSeat({ opponent, accent }: { opponent: FiveSeatOpponent; accent: string }) {
  const folded = opponent.status === 'folded';
  const avatar = getAvatarForSeat(opponent.seatNum);
  const avatarBg = getAvatarColor(opponent.name);
  const active = opponent.isActive && !folded;

  return (
    <div
      data-deal-seat={opponent.id}
      style={{
        width: 'clamp(104px, 28vw, 174px)',
        maxWidth: 'calc(100vw - 22px)',
        padding: '7px 8px 6px',
        borderRadius: 14,
        background: folded ? 'rgba(4,7,6,0.68)' : 'rgba(3,8,7,0.88)',
        border: opponent.isWinner
          ? `1px solid ${accent}`
          : active
            ? `1px solid ${accent}aa`
            : '1px solid rgba(201,162,39,0.18)',
        boxShadow: opponent.isWinner
          ? `0 0 18px ${accent}55`
          : active
            ? `0 0 14px ${accent}30`
            : '0 5px 14px rgba(0,0,0,0.35)',
        opacity: folded ? 0.62 : 1,
        transition: 'border-color 220ms ease, box-shadow 220ms ease, opacity 220ms ease',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            overflow: 'hidden',
            flexShrink: 0,
            background: avatarBg,
            border: active ? `1.5px solid ${accent}` : '1.5px solid rgba(255,255,255,0.14)',
            boxShadow: active ? `0 0 12px ${accent}88` : 'none',
            transition: 'border-color 220ms ease, box-shadow 220ms ease',
          }}
        >
          <img
            src={avatar}
            alt={opponent.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={event => { event.currentTarget.style.display = 'none'; }}
          />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            {active && <span aria-label="active player" style={{ width: 6, height: 6, borderRadius: '50%', background: accent, boxShadow: `0 0 7px ${accent}`, flexShrink: 0 }} />}
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.9)', font: '600 11px monospace' }}>
              {opponent.name}
            </span>
            {opponent.isDealer && (
              <span aria-label="dealer" style={{ width: 14, height: 14, borderRadius: '50%', background: 'linear-gradient(135deg,#e4c45b,#9a7710)', color: '#10130d', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '700 7px monospace', flexShrink: 0 }}>
                D
              </span>
            )}
          </div>
          <div style={{ color: `${accent}cc`, font: '600 10px monospace', marginTop: 2 }}>
            {opponent.chips.toLocaleString()}
          </div>
        </div>
      </div>
      <div style={{ minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
        {folded ? (
          <span style={{ color: 'rgba(255,255,255,0.55)', font: '10px monospace', letterSpacing: '0.08em' }}>FOLDED</span>
        ) : (
          <OpponentCardFan id={opponent.id} cardCount={opponent.cardCount} folded={folded} />
        )}
      </div>
      {opponent.isWinner && <div style={{ color: accent, textAlign: 'center', font: '700 10px monospace', letterSpacing: '0.08em', marginTop: 2 }}>WINNER</div>}
    </div>
  );
}

export const FiveSeatPokerTable = forwardRef(function FiveSeatPokerTable(
  { players, phase, myId, opponents, hero, center, accent, modeLabel }: FiveSeatPokerTableProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <div
      ref={ref}
      data-five-seat-table={modeLabel}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        padding: '8px clamp(8px, 2vw, 18px)',
        isolation: 'isolate',
        background: [
          'radial-gradient(ellipse at 50% 43%, rgba(30,91,62,0.38) 0%, rgba(9,33,26,0.72) 48%, rgba(3,10,9,0.96) 100%)',
          'repeating-linear-gradient(115deg, rgba(255,255,255,0.018) 0 1px, transparent 1px 7px)',
          'linear-gradient(180deg, #0b1713 0%, #030807 100%)',
        ].join(','),
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 8,
          borderRadius: 'clamp(28px, 8vw, 88px)',
          border: '1px solid rgba(201,162,39,0.38)',
          boxShadow: 'inset 0 0 0 5px rgba(0,0,0,0.52), inset 0 0 34px rgba(0,0,0,0.72), 0 0 22px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: '72%',
          height: '46%',
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(86,153,103,0.08), transparent 68%)',
          pointerEvents: 'none',
        }}
      />

      <div data-deal-anchor="deck" aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '48%', width: 44, height: 44, transform: 'translate(-50%, -50%)', opacity: 0, pointerEvents: 'none' }} />

      {opponents.map((opponent, index) => {
        const position = SLOT_STYLES[index];
        return (
          <div
            key={opponent.id}
            style={{ position: 'absolute', zIndex: 10, ...position }}
          >
            <OpponentSeat opponent={opponent} accent={accent} />
          </div>
        );
      })}

      <div
        style={{
          position: 'absolute',
          zIndex: 4,
          left: '50%',
          top: '48%',
          width: 'min(46%, 250px)',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          textAlign: 'center',
        }}
      >
        {center}
      </div>

      <div
        data-deal-seat={myId}
        style={{
          position: 'absolute',
          zIndex: 20,
          left: '50%',
          bottom: 0,
          transform: 'translateX(-50%)',
          width: 'min(94%, 540px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          pointerEvents: 'auto',
        }}
      >
        {hero}
      </div>

      <TableDealAnimator players={players} phase={phase} myId={myId} tableRoot={(ref as { current?: HTMLDivElement } | null)?.current ?? null} />
    </div>
  );
});

FiveSeatPokerTable.displayName = 'FiveSeatPokerTable';