import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '@shared/gameTypes';
import { getAvatarForSeat } from '@shared/engine/avatarMap';
import '@/yard-reskin.css';

interface OpponentStripProps {
  opponents: Player[];
  activePlayerId?: string;
}

/**
 * Hero-centric Badugi opponent strip.
 * Shows: who's in, chip stacks, current bets, card counts with draw/discard animations.
 * Detroit 2026-10-10: "The only hand you care about is yourself."
 */
export function OpponentStrip({ opponents, activePlayerId }: OpponentStripProps) {
  return (
    <div className="opp-strip" aria-label="Opponents">
      {opponents.map((opp, i) => (
        <OpponentCell key={opp.id} player={opp} seatNum={i + 1} isActive={opp.id === activePlayerId} />
      ))}
    </div>
  );
}

function OpponentCell({ player, seatNum, isActive }: { player: Player; seatNum: number; isActive: boolean }) {
  const [drawFlash, setDrawFlash] = useState<number | null>(null);
  const prevDrawCount = useRef<number | undefined>(undefined);

  // Trigger draw/discard animation when lastDrawCount changes
  useEffect(() => {
    if (player.lastDrawCount !== undefined && player.lastDrawCount !== prevDrawCount.current) {
      prevDrawCount.current = player.lastDrawCount;
      if (player.lastDrawCount > 0) {
        setDrawFlash(player.lastDrawCount);
        const t = setTimeout(() => setDrawFlash(null), 1500);
        return () => clearTimeout(t);
      }
    }
  }, [player.lastDrawCount]);

  const isFolded = player.status === 'folded';
  const cardCount = player.cards.length || 4; // Default to 4 if not revealed

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

      {/* Current bet */}
      {player.bet > 0 && <div className="opp-bet">BET {player.bet.toLocaleString()}</div>}

      {/* Card backs with draw animation */}
      <div className="opp-cards">
        {Array.from({ length: cardCount }).map((_, i) => (
          <motion.i
            key={`${i}-${drawFlash !== null ? 'anim' : 'static'}`}
            className="opp-card-back"
            initial={drawFlash !== null ? { scale: 0.5, opacity: 0, y: -10 } : false}
            animate={{ scale: 1, opacity: isFolded ? 0.3 : 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
          />
        ))}
      </div>

      {/* Draw count flash */}
      <AnimatePresence>
        {drawFlash !== null && drawFlash > 0 && (
          <motion.div
            className="opp-draw-flash"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            Drew {drawFlash}
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
