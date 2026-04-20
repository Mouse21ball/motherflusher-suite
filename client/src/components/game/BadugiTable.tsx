import { useState, useEffect, useRef } from "react";
import { GameState, ReactionEvent } from "@/lib/poker/types";
import { PlayerSeat } from "./PlayerSeat";
import { DiscardPile } from "./DiscardPile";
import { ResolutionOverlay } from "./ResolutionOverlay";
import { ReactionBar } from "./ReactionBar";
import { cn } from "@/lib/utils";
import { getPhaseLabel } from "@/lib/phaseLabel";
import { saveSessionResult, saveHandResult } from "@/lib/tableSession";
import { evaluateBadugi } from "@/lib/poker/modes/badugi";
import { evaluateDead7 } from "@/lib/poker/modes/dead7";
import { Fifteen35Mode } from "@/lib/poker/modes/fifteen35";

interface BadugiTableProps {
  gameState: GameState;
  myId: string;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  selectableCards: boolean;
  showVisibleCount?: boolean;
  heroCardClassName?: string;
  onReact?: (emoji: string) => void;
  incomingReactions?: ReactionEvent[];
  modeId?: string;
}

// Scale per seat position — back/top seats are smaller (farther), side seats larger (closer).
// Hero is full-scale (front row).
function getOpponentDepth(index: number, total: number): string {
  if (total === 1) return "scale-[0.68] sm:scale-[0.78]";
  if (total === 2) return "scale-[0.70] sm:scale-[0.80]";
  if (total === 3) {
    // side seats slightly bigger than back center
    return (["scale-[0.73] sm:scale-[0.83]", "scale-[0.67] sm:scale-[0.77]", "scale-[0.73] sm:scale-[0.83]"] as const)[index] ?? "scale-[0.70] sm:scale-[0.80]";
  }
  // 4 opponents: sides larger, top two smaller (farther)
  return (["scale-[0.74] sm:scale-[0.84]", "scale-[0.67] sm:scale-[0.77]", "scale-[0.67] sm:scale-[0.77]", "scale-[0.74] sm:scale-[0.84]"] as const)[index] ?? "scale-[0.70] sm:scale-[0.80]";
}

// Positions opponents in an arc across the top half of the oval.
function getOpponentPosition(index: number, total: number): string {
  if (total === 1) {
    return "-top-2 sm:top-1 left-1/2 -translate-x-1/2";
  }
  if (total === 2) {
    return [
      "-top-2 sm:top-1 left-[26%] -translate-x-1/2",
      "-top-2 sm:top-1 right-[26%] translate-x-1/2",
    ][index] ?? "hidden";
  }
  if (total === 3) {
    // Arc: left-mid | top-center | right-mid
    return [
      "top-[30%] -left-5 sm:left-0 -translate-y-1/2",
      "-top-2 sm:top-1 left-1/2 -translate-x-1/2",
      "top-[30%] -right-5 sm:right-0 -translate-y-1/2",
    ][index] ?? "hidden";
  }
  // 4 opponents (5-player): even arc — left | upper-left | upper-right | right
  return [
    "top-[36%] -left-5 sm:left-0 -translate-y-1/2",
    "-top-2 sm:top-1 left-[22%] sm:left-[24%] -translate-x-1/2",
    "-top-2 sm:top-1 right-[22%] sm:right-[24%] translate-x-1/2",
    "top-[36%] -right-5 sm:right-0 -translate-y-1/2",
  ][index] ?? "hidden";
}

export function BadugiTable({
  gameState, myId, selectedCardIndices, onCardClick, selectableCards,
  showVisibleCount, heroCardClassName, onReact, incomingReactions, modeId,
}: BadugiTableProps) {
  const myIndex = gameState.players.findIndex(p => p.id === myId);
  const orderedPlayers = [...gameState.players];
  if (myIndex !== -1) {
    const p1 = orderedPlayers.splice(myIndex);
    orderedPlayers.unshift(...p1);
  }

  const opponents = orderedPlayers.slice(1);
  const me = orderedPlayers[0];

  // ── Hero made-hand status ─────────────────────────────────────────────────
  // Only shown hero-side, only when cards are held, only outside showdown.
  const showMadeStatus =
    !!me &&
    me.cards.length > 0 &&
    gameState.phase !== 'SHOWDOWN' &&
    gameState.phase !== 'WAITING' &&
    gameState.phase !== 'ANTE' &&
    gameState.phase !== 'DEAL';

  let heroIsMade = false;
  let heroMadeLabel = '';
  if (showMadeStatus && me) {
    if (modeId === 'badugi') {
      const ev = evaluateBadugi(me.cards);
      heroIsMade = !!ev?.isValidBadugi;
      heroMadeLabel = heroIsMade ? `✓ ${ev!.description}` : '✗ No Badugi yet';
    } else if (modeId === 'dead7') {
      const ev = evaluateDead7(me.cards.map(c => ({ ...c, isHidden: false })));
      heroIsMade = !!ev?.isValidBadugi;
      if (ev?.isDead) heroMadeLabel = '✗ Dead — has a 7';
      else if (heroIsMade) heroMadeLabel = `✓ ${ev!.description}`;
      else heroMadeLabel = '✗ No qualifier yet';
    } else if (modeId === 'fifteen35') {
      const ev = Fifteen35Mode.evaluateHand?.(me, []);
      heroIsMade = !!ev?.isValidBadugi;
      heroMadeLabel = heroIsMade
        ? `✓ ${ev!.description}`
        : ev?.description?.includes('BUST')
          ? '✗ Bust'
          : '✗ No qualifier yet';
    }
  }

  const drawNumber = gameState.phase === 'DRAW_1' ? 1 : gameState.phase === 'DRAW_2' ? 2 : gameState.phase === 'DRAW_3' ? 3 : 0;
  const isDrawPhase = drawNumber > 0;
  const isShowdown = gameState.phase === 'SHOWDOWN';

  /* ── Stack leader: single player with most chips, no ties ─────────────── */
  const activePlayers = gameState.players.filter(p => p.presence !== 'reserved');
  const maxChips = activePlayers.length > 1 ? Math.max(...activePlayers.map(p => p.chips)) : -1;
  const leadCandidates = activePlayers.filter(p => p.chips === maxChips);
  const stackLeaderId = leadCandidates.length === 1 ? leadCandidates[0].id : null;

  /* ── Hero chip start: baseline for session P&L persistence ─────────────── */
  const heroChipStartRef = useRef<number | null>(null);
  if (heroChipStartRef.current === null && me) {
    heroChipStartRef.current = me.chips;
  }

  /* ── Hand counter: client-side continuity signal ─────────────────────────── */
  const [handCount, setHandCount] = useState(1);
  const prevPhaseRef = useRef(gameState.phase);
  useEffect(() => {
    if (prevPhaseRef.current === 'SHOWDOWN' && gameState.phase !== 'SHOWDOWN') {
      setHandCount(n => n + 1);
    }
    prevPhaseRef.current = gameState.phase;
  }, [gameState.phase]);

  /* ── Last result echo — brief 1.6s memory after showdown ends ──────────── */
  const [lastResultEcho, setLastResultEcho] = useState<{ text: string; won: boolean } | null>(null);
  const resultEchoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasShowdownRef2 = useRef(gameState.phase === 'SHOWDOWN');
  useEffect(() => {
    const was = wasShowdownRef2.current;
    wasShowdownRef2.current = gameState.phase === 'SHOWDOWN';
    if (was && gameState.phase !== 'SHOWDOWN') {
      const hero = gameState.players.find(p => p.id === myId);
      const net = gameState.heroChipChange ?? 0;
      let text = '';
      let won = false;
      if (hero?.isWinner) {
        text = net > 0 ? `You won +$${net}` : 'You won';
        won = true;
      } else if (hero?.isLoser || net < 0) {
        text = net < 0 ? `Lost $${Math.abs(net)}` : 'Hand lost';
      } else if (hero?.status === 'folded') {
        text = 'Folded';
      }
      if (text) {
        setLastResultEcho({ text, won });
        if (resultEchoTimer.current) clearTimeout(resultEchoTimer.current);
        resultEchoTimer.current = setTimeout(() => setLastResultEcho(null), 1600);
      }
      /* Persist session P&L + hand streak so Home can surface them on return */
      if (hero && heroChipStartRef.current !== null) {
        saveSessionResult(hero.chips - heroChipStartRef.current);
      }
      if (net > 0) saveHandResult('win');
      else if (net < 0) saveHandResult('loss');
    }
  }, [gameState.phase]);

  /* ── Last-action labels: detect fold/bet/call and surface briefly ────────── */
  const [actionLabels, setActionLabels] = useState<Record<string, string>>({});
  const actionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const actionPhaseRef = useRef<string>('');
  const actionBaselineRef = useRef<Record<string, { bet: number; chips: number; status: string }>>({});

  useEffect(() => {
    const phase = gameState.phase;
    const isBetPhase = phase.startsWith('BET') || phase.startsWith('HIT_');

    /* On every phase change, reset the baseline so old diffs don't retrigger */
    if (phase !== actionPhaseRef.current) {
      actionPhaseRef.current = phase;
      actionBaselineRef.current = Object.fromEntries(
        gameState.players
          .filter(p => p.presence !== 'reserved')
          .map(p => [p.id, { bet: p.bet, chips: p.chips, status: p.status }])
      );
      if (!isBetPhase) {
        Object.values(actionTimers.current).forEach(clearTimeout);
        actionTimers.current = {};
        setActionLabels({});
      }
      return;
    }

    if (!isBetPhase) return;

    const baseline = actionBaselineRef.current;
    const updates: Record<string, string> = {};

    gameState.players.forEach(p => {
      if (p.presence === 'reserved') return;
      const old = baseline[p.id];
      if (!old) return;
      let label = '';
      if (p.status === 'folded' && old.status !== 'folded') {
        label = 'Fold';
      } else if (p.bet > old.bet) {
        const diff = p.bet - old.bet;
        label = old.bet === 0 ? `Bet $${diff}` : `Call $${diff}`;
      }
      if (label) {
        updates[p.id] = label;
        /* Advance baseline so repeated re-renders don't retrigger */
        baseline[p.id] = { bet: p.bet, chips: p.chips, status: p.status };
      }
    });

    if (Object.keys(updates).length > 0) {
      setActionLabels(prev => ({ ...prev, ...updates }));
      Object.keys(updates).forEach(pid => {
        if (actionTimers.current[pid]) clearTimeout(actionTimers.current[pid]);
        actionTimers.current[pid] = setTimeout(() => {
          setActionLabels(prev => { const n = { ...prev }; delete n[pid]; return n; });
        }, 750);
      });
    }
  }, [gameState.players, gameState.phase]);

  /* ── Attention context: used to dim/spotlight seats on action ─────────── */
  const anyJustActed = Object.keys(actionLabels).length > 0;
  const hasActivePlayer = !!gameState.activePlayerId && !isShowdown && gameState.phase !== 'WAITING';

  return (
    <div className="relative w-full max-w-3xl mx-auto px-2 sm:px-6 pt-2 pb-4 table-scene-enter">
      {/* Live game message — above the table */}
      <div className="w-full text-center mb-1 relative z-40 min-h-[28px] flex items-center justify-center">
        {gameState.phase !== 'SHOWDOWN' && gameState.messages.slice(-1).map(msg => (
          <p
            key={msg.id}
            className="text-white/60 text-[10px] sm:text-xs font-mono anim-msg-snap drop-shadow-lg bg-[#0B0B0D]/80 backdrop-blur-sm inline-block px-3 py-1.5 rounded-full border border-white/[0.05]"
            data-testid="text-game-message"
          >
            {msg.text}
          </p>
        ))}
      </div>

      {/* Felt oval */}
      <div className="relative w-full table-perspective-oval game-table-felt shadow-2xl overflow-visible min-h-[340px] sm:min-h-[420px]"
        style={{ filter: isShowdown ? 'brightness(0.94)' : 'brightness(1)', transition: 'filter 500ms ease-in-out' }}>
        <div className="absolute inset-0 felt-overlay mix-blend-overlay pointer-events-none rounded-[76px] sm:rounded-[116px]" />

        {/* Opponent seats — arc around top half */}
        {opponents.map((player, i) => (
          <div
            key={player.id}
            className={`absolute ${getOpponentPosition(i, opponents.length)} z-20 ${getOpponentDepth(i, opponents.length)} origin-center`}
          >
            <PlayerSeat
              player={player}
              seatNumber={i + 1}
              isActive={player.id === gameState.activePlayerId}
              isSelf={false}
              showdownState={isShowdown}
              showVisibleCount={showVisibleCount}
              sessionHandCount={handCount}
              isStackLeader={stackLeaderId === player.id}
              lastActionLabel={actionLabels[player.id]}
              justActed={!!actionLabels[player.id]}
              anyJustActed={anyJustActed}
              hasActivePlayer={hasActivePlayer}
            />
          </div>
        ))}

        {/* Pot counter — absolute bottom-right, never overlaps discard pile */}
        <div className="absolute bottom-5 right-5 sm:bottom-7 sm:right-8 z-30">
          <div
            className={cn(
              "pot-counter bg-[#080809]/90 backdrop-blur-sm border border-[#C9A227]/14 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full flex flex-col items-center",
              isShowdown && "anim-pot-collect"
            )}
            data-testid="text-pot"
          >
            <span className="text-[8px] sm:text-[9px] text-[#C9A227]/70 uppercase font-semibold tracking-[0.2em] mb-0.5 font-sans">Pot</span>
            <div className="flex items-center gap-1.5">
              <div className="gold-chip" />
              <span className="text-base sm:text-lg font-mono text-white font-bold tracking-tight tabular-nums">
                ${gameState.pot}
              </span>
            </div>
          </div>
        </div>

        {/* Center content — phase info + discard pile, no longer stacked with pot */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[340px] sm:min-h-[420px] px-4 sm:px-8 py-6">
          <div className="flex flex-col items-center gap-3 my-auto">

            {/* ── WAITING state — live table context ───────────────────────── */}
            {gameState.phase === 'WAITING' ? (() => {
              const reservedCount  = gameState.players.filter(p => p.presence === 'reserved').length;
              const humanPlayers   = gameState.players.filter(p => p.presence === 'human');
              const others         = humanPlayers.filter(p => p.id !== myId);

              /* Build a concise "who's here" label using actual names */
              let nameLabel: string;
              if (others.length === 0) {
                nameLabel = 'Just you here';
              } else if (others.length === 1) {
                nameLabel = `${others[0].name} · you`;
              } else {
                const listed = others.slice(0, 2).map(p => p.name).join(', ');
                nameLabel = others.length > 2
                  ? `${listed} +${others.length - 2} · you`
                  : `${listed} · you`;
              }

              return (
                <div className="flex flex-col items-center gap-2 text-center anim-slide-up">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#00C896', boxShadow: '0 0 6px #00C896' }} />
                    <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: 'rgba(0,200,150,0.75)' }}>Live Table</span>
                  </div>
                  <div
                    className="text-sm font-mono font-medium"
                    style={{ color: 'rgba(255,255,255,0.65)' }}
                    data-testid="text-waiting-who"
                  >
                    {nameLabel}
                  </div>
                  <div className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                    {reservedCount > 0
                      ? `${reservedCount} seat${reservedCount !== 1 ? 's' : ''} open for friends`
                      : 'full table'}
                  </div>
                  {handCount > 1 && (
                    <div
                      className="text-[8px] font-mono tracking-[0.32em] uppercase anim-pulse-gold"
                      style={{ color: 'rgba(255,255,255,0.22)' }}
                      data-testid="text-next-hand-signal"
                    >
                      next hand
                    </div>
                  )}
                </div>
              );
            })() : isShowdown ? null : (() => {
              const humanCount = gameState.players.filter(p => p.presence === 'human').length;
              return (
                <div className="flex flex-col items-center gap-1.5 anim-slide-up">
                  <div
                    className="text-white/30 text-[10px] sm:text-xs font-mono tracking-[0.2em] uppercase font-medium"
                    data-testid="text-phase"
                  >
                    {getPhaseLabel(gameState.phase)}
                  </div>
                  {handCount > 1 && (
                    <div
                      className="text-[9px] font-mono tracking-widest uppercase transition-colors duration-[2000ms]"
                      style={{
                        color: handCount >= 7
                          ? `rgba(201,162,39,0.42)`
                          : handCount >= 4
                          ? `rgba(220,190,70,0.32)`
                          : `rgba(255,255,255,0.26)`,
                      }}
                    >
                      Hand {handCount}
                    </div>
                  )}
                  {/* Live presence — always visible; brighter when others are here */}
                  <div className="flex items-center gap-1" style={{ opacity: humanCount >= 2 ? 0.65 : 0.28 }}>
                    <div className="w-1 h-1 rounded-full" style={{ backgroundColor: '#00C896' }} />
                    <span className="text-[9px] font-mono tracking-widest" style={{ color: 'rgba(0,200,150,0.75)' }}>
                      {humanCount >= 2 ? `${humanCount} live` : 'Live table'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {drawNumber > 0 && (
              <div className="flex items-center gap-1.5" data-testid="text-draw-round">
                {[1, 2, 3].map(d => (
                  <div
                    key={d}
                    className={cn(
                      "w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[9px] sm:text-[10px] font-bold flex items-center justify-center border",
                      d < drawNumber ? "bg-green-600/60 border-green-400 text-white" :
                      d === drawNumber ? "bg-yellow-500/80 border-yellow-300 text-black animate-pulse" :
                      "bg-white/10 border-white/20 text-white/45"
                    )}
                  >
                    {d}
                  </div>
                ))}
                <span className="text-white/50 text-[9px] sm:text-[10px] font-mono ml-1">DRAW</span>
              </div>
            )}

            {/* Discard pile — has clear vertical space, pot is separate (absolute) */}
            <DiscardPile messages={gameState.messages} isDrawPhase={isDrawPhase} />

            {gameState.phase === 'DECLARE' && (
              <div
                className="text-[#C9A227]/60 text-[10px] sm:text-xs font-mono uppercase tracking-wider animate-pulse"
                data-testid="text-declare-prompt"
              >
                Declaration Round
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Last result echo — personal memory anchored near hero seat */}
      {lastResultEcho && (
        <div className="w-full flex justify-center relative z-30 mb-[-6px]">
          <div
            className="text-[9px] font-mono anim-action-label tabular-nums tracking-wide"
            style={{ color: lastResultEcho.won ? 'rgba(201,162,39,0.70)' : 'rgba(248,113,113,0.60)' }}
            data-testid="text-last-result-echo"
          >
            {lastResultEcho.text}
          </div>
        </div>
      )}

      {/* Hero made-hand status badge — tucked between felt edge and hero seat */}
      {showMadeStatus && heroMadeLabel && (
        <div className="w-full flex justify-center relative z-30 mb-[-4px] mt-1" data-testid="text-hero-made-status">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-semibold tracking-wide border transition-all duration-500"
            style={heroIsMade ? {
              backgroundColor: 'rgba(0,200,150,0.10)',
              borderColor: 'rgba(0,200,150,0.30)',
              color: 'rgba(0,200,150,0.90)',
              boxShadow: '0 0 8px rgba(0,200,150,0.12)',
            } : {
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderColor: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            {heroMadeLabel}
          </div>
        </div>
      )}

      {/* Hero seat — rendered below the felt with overlap */}
      <div className="w-full flex justify-center -mt-10 sm:-mt-12 relative z-30 hero-seat-depth">
        {me && (
          <PlayerSeat
            player={me}
            seatNumber={0}
            isActive={me.id === gameState.activePlayerId}
            isSelf={true}
            selectedCardIndices={selectedCardIndices}
            onCardClick={onCardClick}
            selectableCards={selectableCards}
            showdownState={isShowdown}
            showVisibleCount={showVisibleCount}
            heroCardClassName={heroCardClassName}
            isStackLeader={stackLeaderId === me.id}
            className="bg-[#0B0B0D]/85 p-3 sm:p-4 rounded-xl shadow-2xl border border-white/[0.06] backdrop-blur-md pb-4 sm:pb-6"
          />
        )}
      </div>

      {/* Reaction tray — centered below hero seat, floats travel upward into felt */}
      {onReact && (
        <div className="w-full flex justify-center mt-2 relative z-30">
          <ReactionBar onReact={onReact} incomingReactions={incomingReactions} />
        </div>
      )}

      <ResolutionOverlay
        messages={gameState.messages}
        phase={gameState.phase}
        heroPlayer={gameState.players.find(p => p.id === myId)}
        heroChipChange={gameState.heroChipChange}
      />
    </div>
  );
}
