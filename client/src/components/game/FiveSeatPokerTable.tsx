import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
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
  isOpen?: boolean;
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
  activePlayerId?: string | null;
  turnDeadline?: number | null;
  effects?: (tableRoot: HTMLElement | null) => ReactNode;
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

function OpponentSeat({ opponent, accent, modeLabel }: { opponent: FiveSeatOpponent; accent: string; modeLabel: string }) {
  if (opponent.isOpen) {
    return (
      <div
        data-deal-seat={opponent.id}
        style={{
          width: 'clamp(104px, 28vw, 174px)',
          minHeight: 74,
          maxWidth: 'calc(100vw - 22px)',
          padding: '8px',
          borderRadius: 16,
          background: 'rgba(0,0,0,0.25)',
          border: '1px dashed rgba(255,255,255,0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.7)',
          font: '600 10px monospace',
          letterSpacing: '0.08em',
        }}
      >
        OPEN
      </div>
    );
  }

  const folded = opponent.status === 'folded';
  const avatar = getAvatarForSeat(opponent.seatNum);
  const avatarBg = getAvatarColor(opponent.name);
  const active = opponent.isActive && !folded;
  const isDead7 = modeLabel === 'dead7';
  const panelBackground = folded
    ? (isDead7 ? 'rgba(5,0,0,0.6)' : 'rgba(5,3,10,0.6)')
    : opponent.isWinner
      ? (isDead7 ? 'rgba(25,5,5,0.85)' : 'rgba(15,10,0,0.82)')
      : 'rgba(0,0,0,0.45)';

  return (
    <div
      data-deal-seat={opponent.id}
      style={{
        width: 'clamp(104px, 28vw, 174px)',
        maxWidth: 'calc(100vw - 22px)',
        padding: '7px 8px 6px',
        borderRadius: 16,
        background: panelBackground,
        border: opponent.isWinner
          ? `1.5px solid ${accent}bf`
          : active
            ? `1px solid ${accent}80`
            : '1px solid rgba(255,255,255,0.08)',
        boxShadow: opponent.isWinner
          ? `0 0 14px ${accent}4d`
          : active
            ? `0 0 8px ${accent}2e`
            : '0 2px 10px rgba(0,0,0,0.4)',
        opacity: folded ? 0.7 : 1,
        transition: 'border 0.3s, box-shadow 0.3s, opacity 0.3s',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
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
            border: active ? `1.5px solid ${accent}a6` : '1.5px solid rgba(255,255,255,0.1)',
            boxShadow: active ? `0 0 8px ${accent}66` : 'none',
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

function TableTurnTimer({
  deadline,
  playerName,
  accent,
}: {
  deadline: number;
  playerName: string;
  accent: string;
}) {
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, deadline - Date.now()));
  const durationRef = useRef(Math.max(1000, deadline - Date.now()));

  useEffect(() => {
    durationRef.current = Math.max(1000, deadline - Date.now());
    const update = () => setRemainingMs(Math.max(0, deadline - Date.now()));
    update();
    const timer = window.setInterval(update, 200);
    return () => window.clearInterval(timer);
  }, [deadline]);

  const seconds = Math.ceil(remainingMs / 1000);
  const progress = Math.max(0, Math.min(1, remainingMs / durationRef.current));
  const urgent = seconds <= 5;

  return (
    <div
      data-testid="badugi-turn-timer"
      role="timer"
      aria-label={`${playerName} has ${seconds} seconds remaining`}
      style={{
        position: 'absolute',
        zIndex: 35,
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(48%, 210px)',
        padding: '5px 8px 6px',
        borderRadius: 10,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${urgent ? '#ef6a5b' : `${accent}66`}`,
        boxShadow: urgent ? '0 0 14px rgba(239,106,91,0.28)' : `0 0 12px ${accent}20`,
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: urgent ? '#ff9b90' : 'rgba(255,255,255,0.78)', font: '700 9px monospace', letterSpacing: '0.08em' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerName}</span>
        <span>{seconds}s</span>
      </div>
      <div style={{ height: 3, marginTop: 4, overflow: 'hidden', borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
        <motion.div
          animate={{ scaleX: progress }}
          transition={{ duration: 0.18, ease: 'linear' }}
          style={{ width: '100%', height: '100%', transformOrigin: 'left center', background: urgent ? '#ef6a5b' : accent }}
        />
      </div>
    </div>
  );
}

export const FiveSeatPokerTable = forwardRef(function FiveSeatPokerTable(
  { players, phase, myId, opponents, hero, center, accent, modeLabel, activePlayerId, turnDeadline, effects }: FiveSeatPokerTableProps,
  ref: Ref<HTMLDivElement>,
) {
  const [tableRoot, setTableRoot] = useState<HTMLDivElement | null>(null);
  const rootRef = useCallback((node: HTMLDivElement | null) => {
    setTableRoot(previous => previous === node ? previous : node);
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      (ref as { current: HTMLDivElement | null }).current = node;
    }
  }, [ref]);

  return (
    <div
      ref={rootRef}
      data-five-seat-table={modeLabel}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        padding: '8px clamp(8px, 2vw, 18px)',
        isolation: 'isolate',
        background: 'transparent',
      }}
    >
      <div data-deal-anchor="deck" aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '48%', width: 44, height: 44, transform: 'translate(-50%, -50%)', opacity: 0, pointerEvents: 'none' }} />
      <div data-pot-anchor aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '48%', width: 2, height: 2, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
      <div data-muck-anchor aria-hidden="true" style={{ position: 'absolute', left: '38%', top: '55%', width: 2, height: 2, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />

      {turnDeadline && activePlayerId && phase !== 'WAITING' && phase !== 'SHOWDOWN' && (
        <TableTurnTimer
          deadline={turnDeadline}
          playerName={players.find(player => player.id === activePlayerId)?.name ?? 'Player'}
          accent={accent}
        />
      )}

      {opponents.map((opponent, index) => {
        const position = SLOT_STYLES[index];
        return (
          <div
            key={opponent.id}
            data-player-seat={opponent.id}
            style={{ position: 'absolute', zIndex: 10, ...position }}
          >
            <OpponentSeat opponent={opponent} accent={accent} modeLabel={modeLabel} />
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
          flexDirection: 'column',
          gap: 8,
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
        data-player-seat={myId}
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
          filter: activePlayerId === myId && phase !== 'WAITING' ? `drop-shadow(0 0 10px ${accent}55)` : 'none',
          transition: 'filter 220ms ease',
        }}
      >
        {hero}
      </div>

      <TableDealAnimator players={players} phase={phase} myId={myId} tableRoot={tableRoot} />
      {effects?.(tableRoot)}
    </div>
  );
});

FiveSeatPokerTable.displayName = 'FiveSeatPokerTable';