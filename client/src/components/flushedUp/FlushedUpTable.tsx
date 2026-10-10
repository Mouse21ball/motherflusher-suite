import { AnimatePresence, motion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '@shared/gameTypes';
import { CardHand } from './CardHand';
import { PlayingCard } from '@/components/game/Card';
import type { CardAnimState } from './useCardAnimations';
import { evaluateFlushedUpHand } from '@shared/modes/flushedUp';
import type { FlushedUpEval } from '@shared/modes/flushedUp';
import { TableDealAnimator } from './TableDealAnimator';
import { TableBoard } from '@/components/game/TableBoard';
import { OpponentStrip } from '@/components/game/OpponentStrip';
import { YourHandPanel } from '@/components/game/YourHandPanel';
import { PhaseTracker } from '@/components/game/PhaseTracker';
import { YardHeroIdentity } from '@/components/game/YardHeroIdentity';
import { YardOpponentSeat } from '@/components/game/YardOpponentSeat';
import { Crown } from 'lucide-react';

/* ── Showdown helpers ─────────────────────────────────────────────────────── */

function suitGlowColor(suit: string): string {
  if (suit === 'hearts' || suit === 'diamonds') return 'rgba(196,30,58,0.85)';
  if (suit === 'spades') return 'rgba(100,130,210,0.85)';
  return 'rgba(30,150,70,0.85)';
}

function rankLabel(v: number): string {
  if (v === 14) return 'A';
  if (v === 13) return 'K';
  if (v === 12) return 'Q';
  if (v === 11) return 'J';
  return String(v);
}

function showdownLabel(ev: FlushedUpEval): string {
  const SYM: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const sym = SYM[ev.bestSuit] ?? '';
  if (ev.isFlush) {
    const top = rankLabel(ev.rankValues[0] ?? 14);
    return `5-Card Flush ${sym} ${top}-high`;
  }
  if (ev.suitCount <= 1) return 'No Flush';
  const top = rankLabel(ev.rankValues[0] ?? 14);
  return `${ev.suitCount}-Card ${sym} ${top}-high`;
}

/* ── Phase label ─────────────────────────────────────────────────────────── */

/* ── Animated pot counter ─────────────────────────────────────────────────── */

function AnimatedPot({ pot }: { pot: number }) {
  const spring = useSpring(pot, { stiffness: 80, damping: 20 });
  const display = useTransform(spring, v => Math.round(v).toLocaleString());
  useEffect(() => { spring.set(pot); }, [pot, spring]);

  return (
    <div data-pot-anchor style={{
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(245,158,11,0.55)',
      boxShadow: '0 0 20px rgba(245,158,11,0.16), 0 2px 12px rgba(0,0,0,0.5)',
      textAlign: 'center',
      padding: '6px 22px',
      borderRadius: 50,
    }}>
      <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#FDE68A', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        POT
      </div>
      <motion.div style={{
        fontSize: 18, fontFamily: 'monospace', fontWeight: 800,
        color: '#FDE68A', letterSpacing: '0.05em', display: 'inline-block',
      }}>
        {display}
      </motion.div>
    </div>
  );
}

/* ── Opponent panel ───────────────────────────────────────────────────────── */

interface OppPanelProps {
  name: string;
  chips: number;
  cardCount: number;
  status: string;
  isActive: boolean;
  isWinner: boolean;
  isDealer: boolean;
  seatNum: number;
}

function OpponentPanel({ name, chips, cardCount, status, isActive, isWinner, isDealer, seatNum, declaration }: OppPanelProps & { declaration?: string | null }) {
  const isFolded = status === 'folded';
  return <YardOpponentSeat name={name} chips={chips} seat={seatNum} active={isActive} folded={isFolded} winner={isWinner} dealer={isDealer}>
    {declaration && <span className="yard-opponent-declaration">{declaration}</span>}
    {!isFolded && <span className="yard-opponent-cards">{Array.from({ length: Math.max(cardCount, 5) }).map((_, i) =>
      <i key={i} data-celebration-card />)}</span>}
  </YardOpponentSeat>;
}

/* ── Empty seat panel ─────────────────────────────────────────────────────── */
/* ── Props ───────────────────────────────────────────────────────────────── */

interface FlushedUpTableProps {
  state: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  isDrawPhase: boolean;
  animState: CardAnimState;
}

/* ── Table ───────────────────────────────────────────────────────────────── */

export function FlushedUpTable({
  state,
  myId,
  selectedCardIndices,
  onCardClick,
  isDrawPhase,
  animState,
}: FlushedUpTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const me = state.players.find(p => p.id === myId);
  const isShowdown = state.phase === 'SHOWDOWN';
  const communityCards = (state.communityCards ?? []).map(card => ({ ...card, isHidden: false }));
  const [visibleCount, setVisibleCount] = useState(communityCards.length);
  const prevLenRef = useRef(communityCards.length);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const newLen = communityCards.length;
    const oldLen = prevLenRef.current;
    prevLenRef.current = newLen;
    if (newLen === 0) {
      setVisibleCount(0);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }
    if (oldLen === 0 && newLen > 0) {
      setVisibleCount(0);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      for (let i = 0; i < newLen; i++) timersRef.current.push(setTimeout(() => setVisibleCount(i + 1), 200 + i * 300));
      return () => { timersRef.current.forEach(clearTimeout); };
    }
    if (newLen > oldLen) setVisibleCount(newLen);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityCards.length]);

  const heroHandEval: FlushedUpEval | null = me && me.cards.length > 0 && !me.cards.some(card => card.isHidden)
    ? evaluateFlushedUpHand(me.cards.map(c => ({ ...c, isHidden: false })))
    : null;
  const heroIsWinner = !!me?.isWinner;
  const heroIsLoser  = isShowdown && !heroIsWinner && me?.status !== 'folded';
  const heroGlowColor = heroIsWinner && heroHandEval ? suitGlowColor(heroHandEval.bestSuit) : null;

  /* Reorder opponents: player left of hero first, wrap around */
  const myIndex = state.players.findIndex(p => p.id === myId);
  const reorderedOpps = [
    ...state.players.slice(myIndex + 1),
    ...state.players.slice(0, myIndex),
  ].filter(p => p.id !== myId);

  const opponentSeats = [
    ...reorderedOpps.map((opp) => {
      const seatNum = parseInt(opp.id.replace('p', ''), 10) || 1;
      const open = opp.presence === 'reserved' || opp.presence === 'open';
      return <div key={opp.id} data-deal-seat={opp.id} data-player-seat={opp.id}>
        {open ? <YardOpponentSeat name="OPEN" chips={0} seat={seatNum} open />
          : <OpponentPanel name={opp.name} chips={opp.chips} cardCount={opp.cards.length} status={opp.status}
            isActive={state.activePlayerId === opp.id} isWinner={!!opp.isWinner} isDealer={!!opp.isDealer}
            seatNum={seatNum} declaration={opp.declaration} />}
      </div>;
    }),
    ...Array.from({ length: Math.max(0, 3 - reorderedOpps.length) }, (_, index) =>
      <div key={`open-${index}`}><YardOpponentSeat name="OPEN" chips={0} seat={0} open /></div>),
  ];

  const heroCardW = 64;
  const heroCardH = 90;
  const liveReadout = heroHandEval
    ? `${heroHandEval.suitCount}/5 SUIT MATCH · ${showdownLabel(heroHandEval)}`
    : me?.status === 'folded' ? 'FOLDED · HAND COMPLETE' : 'TRACKING SUIT MATCH';
  const heroCards = me ? <div className="yard-hero-hand">
    <YardHeroIdentity state={state} myId={myId} accent="#D946EF" />
    <PhaseTracker phase={state.phase} totalPlayers={state.players.filter(pl => pl.status === 'active').length} />
    <div data-deal-seat={myId} data-player-seat={myId} style={{ display:'flex',flexDirection:'column',alignItems:'center',paddingBottom:8 }}>
      {isDrawPhase && selectedCardIndices.length > 0 && <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
        style={{ marginBottom:4,padding:'3px 12px',borderRadius:20,background:'rgba(217,70,239,0.18)',border:'1px solid rgba(217,70,239,0.45)',fontSize:11,fontFamily:'monospace',color:'#F0ABFC',letterSpacing:'0.08em' }}>
        {selectedCardIndices.length} SELECTED · TAP DRAW
      </motion.div>}
      {me && me.cards.length > 0 ? <>
        <YourHandPanel hint={isDrawPhase ? "Tap cards to select for discard" : undefined}>
        <div style={{ opacity:heroIsLoser?0.55:1,filter:heroGlowColor?`drop-shadow(0 0 14px ${heroGlowColor}) drop-shadow(0 0 6px ${heroGlowColor})`:'none',transition:'opacity 0.4s ease, filter 0.4s ease' }}>
          <CardHand cards={me.cards} selectedIndices={selectedCardIndices} onCardClick={onCardClick} isSelectable={isDrawPhase}
            dealingIndices={animState.dealingIndices} drawingIndices={animState.drawingIndices} discardingIndices={animState.discardingIndices}
            isShowdown={isShowdown} celebrationCardMarkers cardWidth={heroCardW} cardHeight={heroCardH} />
        </div>
        </YourHandPanel>
        {isShowdown && heroHandEval && me.status !== 'folded' && <div style={{ marginTop:3,fontSize:12,fontFamily:'monospace',color:heroIsWinner?'#FDE68A':'rgba(255,255,255,.7)',fontWeight:heroIsWinner?700:400,letterSpacing:'.08em',textAlign:'center' }}>{showdownLabel(heroHandEval)}</div>}
      </> : <div style={{ display:'flex',gap:4,paddingTop:12,paddingBottom:6 }}>{Array.from({length:5}).map((_,i)=><div key={i} style={{width:heroCardW,height:heroCardH,borderRadius:8,border:'1px dashed rgba(217,70,239,.25)'}} />)}</div>}
    </div>
  </div> : undefined;

  return (<>
    <OpponentStrip opponents={reorderedOpps} activePlayerId={state.activePlayerId ?? undefined} totalCards={5} phase={state.phase} />
    <TableBoard rootRef={tableRef} gameAccent="#D946EF" title="FLUSHED UP" subtitle="CHASE THE FLUSH" phase={state.phase}
      heroCards={heroCards} heroPlayerId={myId}
      centerReadout={<span className="yard-table-readout">{liveReadout}</span>}
      pot={state.pot > 0 ? <AnimatedPot pot={state.pot} /> : undefined}>
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'visible',
    }}>
      <div data-deal-anchor="deck" style={{
        position: 'absolute', left: '50%', top: '50%', width: 44, height: 44,
        transform: 'translate(-50%, -50%)', pointerEvents: 'none', opacity: 0,
      }} />
      <div className="yard-flushed-community">
        {communityCards.length > 0 ? <div className="yard-flushed-community-cards">
          {communityCards.map((card, i) => <div key={i} style={{ flexShrink:0,width:58,height:84 }}>
            <AnimatePresence>{i < visibleCount && <motion.div key={`comm-${i}`} data-celebration-card
              initial={{ opacity:0,y:-22,rotateY:90,scale:.85 }} animate={{ opacity:1,y:0,rotateY:0,scale:1 }}
              transition={{ duration:.32,ease:'easeOut' }} style={{ transformOrigin:'top center' }}>
              <PlayingCard card={card} className="!w-[58px] !h-[84px] sm:!w-[68px] sm:!h-[96px]" />
            </motion.div>}</AnimatePresence>
          </div>)}
        </div> : <div className="yard-flushed-community-cards">{Array.from({length:5}).map((_,i)=><div key={i} className="yard-community-placeholder" />)}</div>}
      </div>
      <TableDealAnimator players={state.players} phase={state.phase} myId={myId} tableRoot={tableRef.current?.closest('.yard-table-board') ?? tableRef.current} />
    </div>
    </TableBoard>
  </>);
}
