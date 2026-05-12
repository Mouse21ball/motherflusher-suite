import { useMemo } from "react";
import { PlayingCard } from "./Card";
import { evaluateBadugi } from "@/lib/poker/modes/badugi";
import { evaluateDead7 } from "@/lib/poker/modes/dead7";
import { Fifteen35Mode } from "@/lib/poker/modes/fifteen35";
import { evaluateSuitsScore, evaluatePokerHand } from "@shared/modes/suitspoker";
import type { Player, GamePhase } from "@/lib/poker/types";
import { cn } from "@/lib/utils";

// ── Qualifier computation (mirrors ThreeDTableScene logic) ───────────────────

const INACTIVE_PHASES = new Set(['SHOWDOWN','WAITING','ANTE','DEAL']);

function computeQualifier(modeId: string, player: Player, phase: GamePhase) {
  const inactive = INACTIVE_PHASES.has(phase);
  const cards = player.cards;

  if (inactive || !cards.length) return { label: qualifierLabel(modeId), status: '', isMade: false };

  if (modeId === 'badugi') {
    const ev = evaluateBadugi(cards);
    const isMade = !!ev?.isValidBadugi;
    const status = isMade && ev ? `✓ ${ev.description}` : '✗ No Badugi yet';
    return { label: 'QUALIFIER', status, isMade };
  }

  if (modeId === 'dead7') {
    const ev = evaluateDead7(cards.map(c => ({ ...c, isHidden: false })));
    const isMade = !!ev?.isValidBadugi;
    const status = ev?.isDead
      ? '✗ Dead — has a 7'
      : isMade ? `✓ ${ev!.description}` : '✗ No qualifier yet';
    return { label: 'HAND', status, isMade };
  }

  if (modeId === 'fifteen35') {
    const ev = Fifteen35Mode.evaluateHand?.(player, []);
    const isMade = !!ev?.isValidBadugi;
    let status = '';
    if (isMade && ev) {
      const total = ev.badugiRankValues![0];
      const rec = total >= 13 && total <= 15 ? ' — LOW' : total >= 33 && total <= 35 ? ' — HIGH' : '';
      status = `✓ ${ev.description}${rec}`;
    } else if (ev?.description?.toLowerCase().includes('bust')) {
      status = '✗ Bust';
    } else {
      status = '✗ No qualifier yet';
    }
    return { label: 'TOTAL', status, isMade };
  }

  if (modeId === 'suitspoker') {
    const pokerEv = evaluatePokerHand(cards);
    const suitsScore = evaluateSuitsScore(cards);
    const suitsQualifies = suitsScore >= 40;
    const isMade = !!pokerEv || suitsQualifies;
    const pokerLabel = pokerEv?.description ?? 'High Card';
    const suitsLabel = `Suits ${suitsScore}${suitsQualifies ? '' : ' (need 40+)'}`;
    return { label: 'HAND', status: `${pokerLabel} · ${suitsLabel}`, isMade };
  }

  return { label: qualifierLabel(modeId), status: '', isMade: false };
}

function qualifierLabel(modeId: string) {
  if (modeId === 'dead7' || modeId === 'suitspoker') return 'HAND';
  if (modeId === 'fifteen35') return 'TOTAL';
  return 'QUALIFIER';
}

// ── Card size helpers ────────────────────────────────────────────────────────

function cardSizeClass(n: number) {
  if (n <= 3) return 'w-14 h-[96px] sm:w-16 sm:h-[112px]';
  if (n <= 5) return 'w-12 h-[84px] sm:w-14 sm:h-[96px]';
  return 'w-10 h-[70px] sm:w-12 sm:h-[84px]';
}

function cardOverlapClass(n: number) {
  if (n <= 3) return '';
  if (n <= 5) return '-ml-3';
  return '-ml-4';
}

// ── Props ────────────────────────────────────────────────────────────────────

interface HeroHandPanelProps {
  player: Player;
  modeId: string;
  phase: GamePhase;
  selectedCardIndices: number[];
  onCardClick: (index: number) => void;
  selectableCards: boolean;
  sessionNetProfit?: number;
  isShowdown?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function HeroHandPanel({
  player, modeId, phase,
  selectedCardIndices, onCardClick, selectableCards,
  sessionNetProfit = 0, isShowdown = false,
}: HeroHandPanelProps) {
  const qualifier = useMemo(
    () => computeQualifier(modeId, player, phase),
    [modeId, player, phase]
  );

  const cards = player.cards;
  const n = cards.length;
  const isDrawPhase = phase.startsWith('DRAW') || phase === 'DRAW';
  const isShowdownPhase = phase === 'SHOWDOWN';
  const sizeClass = cardSizeClass(n);
  const overlapClass = cardOverlapClass(n);

  if (!n) return null;

  return (
    <div
      className="relative z-30 mx-auto w-full max-w-md px-3"
      data-testid="panel-hero-hand"
    >
      <div className="rounded-2xl border border-white/[0.09] bg-[#0B0B0D]/95 backdrop-blur-md overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto] gap-0 divide-x divide-white/[0.06]">

          {/* ── Column 1: Cards ─────────────────────────────────────────── */}
          <div className="px-3 py-3 flex flex-col items-center justify-center gap-2 min-w-[100px] sm:min-w-[120px]">
            {isDrawPhase && (
              <span className="text-[9px] font-mono uppercase tracking-widest text-[#C9A227]/55 mb-0.5">
                Tap to discard
              </span>
            )}
            <div className="flex items-center">
              {cards.map((card, i) => {
                const isSelected = selectedCardIndices.includes(i);
                const canClick = selectableCards;
                return (
                  <div
                    key={i}
                    className={cn(
                      "relative transition-all duration-150 cursor-pointer",
                      i > 0 && overlapClass,
                      isSelected && "brightness-125",
                    )}
                    style={{ zIndex: isSelected ? 30 : i }}
                    onClick={() => canClick && onCardClick(i)}
                    data-testid={`card-hero-${i}`}
                  >
                    <div
                      className={cn(
                        sizeClass,
                        "relative transition-all duration-200",
                        isSelected && "-translate-y-2 scale-105",
                        isSelected && "ring-2 ring-[#C9A227]/80 rounded-sm shadow-[0_0_16px_rgba(201,162,39,0.45)]",
                      )}
                    >
                      <PlayingCard
                        card={{ ...card, isHidden: !isShowdownPhase && card.isHidden }}
                        selected={isSelected}
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Column 2: Player info ────────────────────────────────────── */}
          <div className="px-3 py-3 flex flex-col justify-center gap-1.5 min-w-0">
            <div className="text-sm font-semibold text-white/85 truncate leading-none">
              {player.name}
            </div>
            <div className="text-xl font-mono font-black tabular-nums leading-none"
              style={{ color: '#C9A227' }}
            >
              ${player.chips}
            </div>
            <div className={cn(
              "text-[11px] font-mono font-semibold tabular-nums leading-none",
              sessionNetProfit >= 0 ? "text-emerald-400/70" : "text-red-400/65"
            )}>
              {sessionNetProfit >= 0 ? '+' : ''}${sessionNetProfit} session
            </div>
            {player.bet > 0 && (
              <div className="text-[10px] font-mono text-white/35 leading-none">
                Bet <span className="text-white/55">${player.bet}</span>
              </div>
            )}
            {player.declaration && player.declaration !== 'FOLD' && (
              <span className={cn(
                "text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md w-fit",
                player.declaration === 'HIGH' && "bg-red-600/20 text-red-300/80",
                player.declaration === 'LOW' && "bg-blue-600/20 text-blue-300/80",
                player.declaration === 'SWING' && "bg-purple-600/20 text-purple-300/80",
                player.declaration === 'POKER' && "bg-red-600/20 text-red-300/80",
                player.declaration === 'SUITS' && "bg-blue-600/20 text-blue-300/80",
                player.declaration === 'STAY' && "bg-emerald-600/20 text-emerald-300/80",
                player.declaration === 'BUST' && "bg-red-900/40 text-red-400/80",
              )}>
                {player.declaration}
              </span>
            )}
          </div>

          {/* ── Column 3: Qualifier ──────────────────────────────────────── */}
          <div className="px-3 py-3 flex flex-col justify-center gap-1 min-w-[90px] sm:min-w-[110px]">
            <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 leading-none">
              {qualifier.label}
            </span>
            {qualifier.status ? (
              <span className={cn(
                "text-[11px] font-mono leading-snug",
                qualifier.isMade ? "text-emerald-400/80" : "text-white/45",
              )}>
                {qualifier.status}
              </span>
            ) : (
              <span className="text-[10px] font-mono text-white/20 leading-none">—</span>
            )}
            {/* Winner badge at showdown */}
            {isShowdownPhase && player.isWinner && (
              <span className="mt-1 text-[10px] font-mono font-bold text-[#C9A227] uppercase tracking-wider">
                ✓ Winner
              </span>
            )}
            {isShowdownPhase && player.isLoser && !player.isWinner && (
              <span className="mt-1 text-[10px] font-mono text-red-400/60 uppercase tracking-wider">
                ✗ Lost
              </span>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
