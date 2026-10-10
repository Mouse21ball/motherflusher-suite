import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '@shared/gameTypes';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import '@/yard-reskin.css';

interface OpponentStripProps {
  opponents: Player[];
  activePlayerId?: string;
  totalCards?: number; // Cards per hand: Badugi=4, FlushedUp=5, BoxChevy=5
  phase?: string; // Current game phase (for draw-round discard badges)
}

/**
 * Hero-centric opponent strip.
 * Shows: who's in, chip stacks, current bets, card counts with draw/discard animations.
 * Detroit 2026-10-10: "The only hand you care about is yourself."
 * Detroit 2026-10-10: Discarded cards go dark — you SEE how many they threw away.
 * Detroit 2026-10-10: Discard badge under each stack — WAITING before they act,
 *   DISCARDED N after, resets each draw round.
 */
export function OpponentStrip({ opponents, activePlayerId, totalCards = 4, phase = '' }: OpponentStripProps) {
  return (
    <div className="opp-strip" aria-label="Opponents">
      {opponents.map((opp, i) => (
        <OpponentCell key={opp.id} player={opp} seatNum={i + 1} isActive={opp.id === activePlayerId} totalCards={totalCards} phase={phase} />
      ))}
    </div>
  );
}

function OpponentCell({ player, seatNum, isActive, totalCards, phase }: { player: Player; seatNum: number; isActive: boolean; totalCards: number; phase: string }) {
  const [drawFlash, setDrawFlash] = useState<number | null>(null);
  // Discard badge: null = WAITING (hasn't acted this round), number = DISCARDED N
  const [discardBadge, setDiscardBadge] = useState<number | null>(null);
  const seenDrawCount = useRef<number | undefined>(undefined);
  const seenDrawPhase = useRef<string | null>(null);
  const prevDrawCount = useRef<number | undefined>(undefined);

  // Trigger draw/discard animation when lastDrawCount changes
  useEffect(() => {
    if (player.lastDrawCount !== undefined && player.lastDrawCount !== prevDrawCount.current) {
      prevDrawCount.current = player.lastDrawCount;
      setDrawFlash(player.lastDrawCount);
      const t = setTimeout(() => setDrawFlash(null), 2500);
      return () => clearTimeout(t);
    }
  }, [player.lastDrawCount]);

  const isFolded = player.status === 'folded';
  const isDrawPhase = phase.startsWith('DRAW_');
  // Discarded cards go dark (Detroit 2026-10-10): show how many they threw away
  const discarded = discardBadge ?? 0;
  const liveCards = totalCards - discarded;

  // Discard badge logic: reset to WAITING on new draw round, show count after they act
  useEffect(() => {
    if (isDrawPhase && seenDrawPhase.current !== phase) {
      // New draw round — back to WAITING
      setDiscardBadge(null);
      seenDrawCount.current = undefined;
      seenDrawPhase.current = phase;
    }
  }, [phase, isDrawPhase]);

  useEffect(() => {
    if (isDrawPhase && player.lastDrawCount !== undefined && player.lastDrawCount !== seenDrawCount.current) {
      seenDrawCount.current = player.lastDrawCount;
      seenDrawPhase.current = phase;
      setDiscardBadge(player.lastDrawCount);
    }
  }, [player.lastDrawCount, phase, isDrawPhase]);

  return (
    <div className={`opp-cell${isFolded ? ' is-folded' : ''}${isActive ? ' is-active' : ''}`}>
      {/* Avatar + turn ring */}
      <div className="opp-avatar">
        <img src={getAvatarForSeat(seatNum)} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
        {isActive && <span className="opp-turn-ring" />}
      </div>

      {/* Name + chips */}
      <div className="opp-name">{player.name}</div>
      <div className="opp-chips">{player.chips.toLocaleString()}</div>

      {/* Discard badge: WAITING or DISCARDED N (Detroit 2026-10-10) */}
      {isDrawPhase && !isFolded && (
        <div className={`opp-discard-badge${discardBadge === null ? ' is-waiting' : ''}`}>
          <span className="opp-discard-label">{discardBadge === null ? 'WAITING' : 'DISCARDED'}</span>
          <span className="opp-discard-count">{discardBadge === null ? '…' : discardBadge}</span>
        </div>
      )}

      {/* Current bet */}
      {player.bet > 0 && <div className="opp-bet">BET {player.bet.toLocaleString()}</div>}

      {/* Card backs with draw animation */}
      {/* Card backs: live cards bright, discarded go dark (Detroit 2026-10-10) */}
      <div className="opp-cards">
        {Array.from({ length: totalCards }).map((_, i) => {
          const isDiscarded = i >= liveCards;
          return (
            <motion.i
              key={`${i}-${drawFlash !== null ? 'anim' : 'static'}`}
              className={`opp-card-back${isDiscarded ? ' is-discarded' : ''}`}
              initial={drawFlash !== null && !isDiscarded ? { scale: 0.5, opacity: 0, y: -10 } : false}
              animate={{ scale: 1, opacity: isFolded ? 0.3 : isDiscarded ? 0.25 : 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
            />
          );
        })}
      </div>

      {/* Draw count: shows how many they threw away each round */}
      <AnimatePresence>
        {drawFlash !== null && drawFlash > 0 && (
          <motion.div
            className="opp-draw-flash"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            -{drawFlash}
          </motion.div>
        )}
        {drawFlash === 0 && (
          <motion.div
            className="opp-draw-flash is-pat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            Pat
          </motion.div>
        )}
      </AnimatePresence>

      {/* Declaration */}
      {player.declaration && (
        <div className="opp-declare">{player.declaration}</div>
      )}
    </div>
  );
}
