import { CardType, GameState } from '@/lib/poker/types';
import { hasMadeHand } from '../../../../shared/modes/boxchevy';
import { PlayingCard } from '@/components/game/Card';

const SLV  = '#94a3b8';
const ACT  = '#60a5fa';
const nvA  = (a: number) => `rgba(15,28,46,${a})`;
const blA  = (a: number) => `rgba(59,130,246,${a})`;

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
  const chipColor  = player.isWinner ? '#fbbf24' : SLV;

  return (
    <div style={{
      borderRadius: 10,
      background: 'rgba(0,0,0,0.40)',
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      border: `1px solid ${isActive && !folded ? blA(0.35) : nvA(0.6)}`,
      padding: '6px 8px',
      display: 'flex', flexDirection: 'column', gap: 4,
      opacity: folded ? 0.45 : 1,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: folded ? SLV : '#e2e8f0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70 }}>
          {player.name}
        </span>
        <span style={{ fontSize: 9, fontFamily: 'monospace', color: chipColor, fontWeight: 700 }}>
          ${player.chips}
        </span>
      </div>
      {player.declaration && (
        <div style={{
          fontSize: 8, fontWeight: 700, textAlign: 'center', fontFamily: 'monospace',
          color: player.declaration === 'SWING' ? '#fbbf24' : player.declaration === 'HIGH' ? ACT : '#86efac',
          background: player.declaration === 'SWING' ? 'rgba(251,191,36,0.15)' : player.declaration === 'HIGH' ? blA(0.12) : 'rgba(134,239,172,0.12)',
          borderRadius: 4, padding: '1px 4px',
        }}>
          {player.declaration}
        </div>
      )}
      {folded ? (
        <div style={{ fontSize: 8, textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>FOLDED</div>
      ) : isShowdown && player.cards.some(c => !c.isHidden) ? (
        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          {player.cards.map((c, i) => (
            <PlayingCard key={i} card={c} className="!w-[26px] !h-[38px]" />
          ))}
        </div>
      ) : (
        <PipRow count={player.cards.length || 5} />
      )}
    </div>
  );
}

interface BoxChevyTableProps {
  state: GameState;
  myId: string;
  phase: string;
  isDrawPhase: boolean;
}

export function BoxChevyTable({ state, myId, phase, isDrawPhase }: BoxChevyTableProps) {
  const me          = state.players.find(p => p.id === myId);
  const opponents   = state.players.filter(p => p.id !== myId);
  const communityCards: CardType[] = (state.communityCards ?? []).map(c => ({ ...c, isHidden: false }));

  const heroCards = (me?.cards ?? []).map(c => ({ ...c, isHidden: false }));
  const madeHand  = communityCards.length > 0 && heroCards.length > 0
    ? hasMadeHand(heroCards, communityCards)
    : null;

  const pot = state.pot;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Opponent grid — up to 4 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: opponents.length <= 2 ? `repeat(${opponents.length}, 1fr)` : 'repeat(2, 1fr)',
        gap: 8,
      }}>
        {opponents.slice(0, 4).map(opp => (
          <OpponentPanel key={opp.id} player={opp} phase={phase} />
        ))}
      </div>

      {/* Community cards — largest, most prominent element */}
      <div style={{
        borderRadius: 14,
        background: 'rgba(0,0,0,0.50)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: `1px solid rgba(96,165,250,0.30)`,
        padding: '10px 12px 14px',
      }}>
        <div style={{
          fontSize: 8, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.22em',
          color: ACT, textAlign: 'center', marginBottom: 10, textTransform: 'uppercase',
        }}>
          ◈ COMMUNITY CARDS ◈
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'flex-end' }}>
          {communityCards.length > 0 ? (
            communityCards.map((c, i) => (
              <PlayingCard key={i} card={c} className="!w-[58px] !h-[84px] sm:!w-[68px] sm:!h-[96px]" />
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
      </div>

      {/* Pot + phase + made-hand indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        fontFamily: 'monospace', fontSize: 11,
      }}>
        <div style={{ color: SLV }}>
          POT <span style={{ color: '#e2e8f0', fontWeight: 700 }}>${pot}</span>
        </div>
        {madeHand !== null && (phase === 'BET_1' || phase === 'BET_2' || phase === 'BET_3' || isDrawPhase) && (
          <div style={{
            fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
            color: madeHand ? '#86efac' : '#fca5a5',
            background: madeHand ? 'rgba(134,239,172,0.12)' : 'rgba(252,165,165,0.12)',
            border: `1px solid ${madeHand ? 'rgba(134,239,172,0.3)' : 'rgba(252,165,165,0.3)'}`,
            borderRadius: 6, padding: '2px 8px',
          }}>
            {madeHand ? '✓ MADE HAND' : '✗ NO MADE HAND'}
          </div>
        )}
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>
          {phase.replace(/_/g, ' ')}
        </div>
      </div>
    </div>
  );
}
