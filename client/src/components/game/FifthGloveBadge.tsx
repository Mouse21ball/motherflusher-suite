// ─── Fifth Glove ─────────────────────────────────────────────────────────────
// P6 (2026-11-08): a seat marker for a player on a real hot streak.
// Data source: GameState.winStreaks — server-owned consecutive confirmed wins
// per player at THIS table (server/utils/tableWinStreaks.ts, maintained by
// both engines on hand settlement). The glove appears at 5+ straight wins —
// the same threshold as the 'On Fire' achievement (winStreak >= 5) and the
// Fifth Glove motif: five straight wins earns the copper glove.
// Renders NOTHING below the threshold — no placeholder, no fake state.

import { Hand } from 'lucide-react';

export const FIFTH_GLOVE_MIN_WINS = 5;

export function FifthGloveBadge({ streak, size = 18 }: { streak: number; size?: number }) {
  if (!streak || streak < FIFTH_GLOVE_MIN_WINS) return null;
  return (
    <span
      data-testid="fifth-glove-badge"
      role="img"
      aria-label={`Fifth Glove — ${streak} wins in a row`}
      title={`Fifth Glove — ${streak} wins in a row`}
      className="absolute -bottom-1 -left-1 rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size + 6,
        height: size + 6,
        background: 'linear-gradient(145deg, #e39a63 0%, #b87333 55%, #8c5523 100%)',
        border: '1px solid rgba(255,214,170,0.75)',
        boxShadow: '0 1px 5px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,235,210,0.5)',
        color: '#2a1503',
        zIndex: 5,
      }}
    >
      <Hand size={size - 4} strokeWidth={2.4} />
    </span>
  );
}
