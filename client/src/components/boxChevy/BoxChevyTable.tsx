import { CardType, GameState } from '@/lib/poker/types';
import { hasMadeHand } from '../../../../shared/modes/boxchevy';

const NVY  = '#0f1c2e';
const SLV  = '#94a3b8';
const BLU  = '#3b82f6';
const ACT  = '#60a5fa';
const nvA  = (a: number) => `rgba(15,28,46,${a})`;
const blA  = (a: number) => `rgba(59,130,246,${a})`;

const SUITS_SYMBOL: Record<string, string> = { hearts:'♥', diamonds:'♦', clubs:'♣', spades:'♠' };
const SUITS_COLOR:  Record<string, string> = { hearts:'#f87171', diamonds:'#f87171', clubs:SLV, spades:SLV };

interface CardProps {
  card: CardType;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  onClick?: () => void;
}

function PlayingCard({ card, size = 'md', selected, onClick }: CardProps) {
  const dims = size === 'sm' ? { w: 26, h: 38, fs: 10 } : size === 'lg' ? { w: 40, h: 58, fs: 14 } : { w: 34, h: 50, fs: 12 };
  if (card.isHidden) {
    return (
      <div style={{
        width: dims.w, height: dims.h, borderRadius: 5,
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f1c2e 100%)',
        border: `1px solid ${nvA(0.8)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: dims.fs - 2, color: blA(0.4) }}>◈</div>
      </div>
    );
  }
  const color = SUITS_COLOR[card.suit] ?? SLV;
  const sym   = SUITS_SYMBOL[card.suit] ?? '?';
  return (
    <div onClick={onClick} style={{
      width: dims.w, height: dims.h, borderRadius: 5, cursor: onClick ? 'pointer' : 'default',
      background: selected
        ? `linear-gradient(135deg, ${blA(0.25)} 0%, ${nvA(0.9)} 100%)`
        : `linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(240,244,248,0.95) 100%)`,
      border: selected ? `2px solid ${ACT}` : `1px solid rgba(0,0,0,0.18)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 1, flexShrink: 0,
      boxShadow: selected ? `0 0 8px ${blA(0.5)}` : '0 1px 3px rgba(0,0,0,0.25)',
      transform: selected ? 'translateY(-4px)' : undefined,
      transition: 'transform 0.12s ease, box-shadow 0.12s ease',
    }}>
      <div style={{ fontSize: dims.fs, fontWeight: 700, color, lineHeight: 1 }}>{card.rank}</div>
      <div style={{ fontSize: dims.fs - 1, color, lineHeight: 1 }}>{sym}</div>
    </div>
  );
}

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
          {player.cards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)}
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
  selectedCards: Set<number>;
  onCardClick: (idx: number) => void;
  phase: string;
  isDrawPhase: boolean;
}

export function BoxChevyTable({ state, myId, selectedCards, onCardClick, phase, isDrawPhase }: BoxChevyTableProps) {
  const me          = state.players.find(p => p.id === myId);
  const opponents   = state.players.filter(p => p.id !== myId);
  const communityCards: CardType[] = state.communityCards ?? [];

  const heroCards = (me?.cards ?? []).map(c => ({ ...c, isHidden: false }));
  const madeHand  = communityCards.length > 0 && heroCards.length > 0
    ? hasMadeHand(heroCards, communityCards)
    : null;

  const pot = state.pot;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Opponent grid — up to 4 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: opponents.length <= 2 ? `repeat(${opponents.length}, 1fr)` : 'repeat(2, 1fr)',
        gap: 6,
      }}>
        {opponents.slice(0, 4).map(opp => (
          <OpponentPanel key={opp.id} player={opp} phase={phase} />
        ))}
      </div>

      {/* Community cards */}
      <div style={{
        borderRadius: 12,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${nvA(0.7)}`,
        padding: '8px 12px',
      }}>
        <div style={{
          fontSize: 8, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.18em',
          color: ACT, textAlign: 'center', marginBottom: 6, textTransform: 'uppercase',
        }}>
          ◈ COMMUNITY CARDS ◈
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {communityCards.length > 0 ? (
            communityCards.map((c, i) => <PlayingCard key={i} card={c} size="md" />)
          ) : (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                width: 34, height: 50, borderRadius: 5,
                border: `1px dashed ${nvA(0.6)}`,
                background: nvA(0.3),
              }} />
            ))
          )}
        </div>
      </div>

      {/* Pot + Phase label */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
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

      {/* Hero hole cards */}
      <div style={{
        borderRadius: 12,
        background: nvA(0.5),
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${blA(0.25)}`,
        padding: '8px 12px',
      }}>
        <div style={{
          fontSize: 8, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.18em',
          color: SLV, textAlign: 'center', marginBottom: 6, textTransform: 'uppercase',
        }}>
          YOUR HAND {isDrawPhase && <span style={{ color: ACT }}>— TAP TO DISCARD</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {heroCards.map((c, i) => (
            <PlayingCard
              key={i}
              card={c}
              size="lg"
              selected={selectedCards.has(i)}
              onClick={isDrawPhase ? () => onCardClick(i) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
