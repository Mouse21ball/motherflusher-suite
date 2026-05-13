import { useMemo } from "react";
import { PlayingCard } from "./Card";
import { evaluateBadugi } from "@/lib/poker/modes/badugi";
import { evaluateDead7 } from "@/lib/poker/modes/dead7";
import { Fifteen35Mode } from "@/lib/poker/modes/fifteen35";
import { evaluateSuitsScore, evaluatePokerHand } from "@shared/modes/suitspoker";
import { getHeroAvatar } from "@shared/engine/avatarMap";
import type { Player, GamePhase } from "@/lib/poker/types";
import { cn } from "@/lib/utils";

// ── Qualifier computation ────────────────────────────────────────────────────

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

// ── Card size helpers ─────────────────────────────────────────────────────────

function cardSizeClass(n: number) {
  if (n <= 2) return 'w-20 h-28 sm:w-24 sm:h-32';
  if (n <= 3) return 'w-16 h-[104px] sm:w-20 sm:h-28';
  if (n <= 5) return 'w-12 h-[88px] sm:w-14 sm:h-[96px]';
  if (n <= 7) return 'w-10 h-[72px] sm:w-12 sm:h-[84px]';
  return 'w-9 h-[64px] sm:w-10 sm:h-[72px]';
}

function cardOverlapClass(n: number) {
  if (n <= 2) return '';
  if (n <= 3) return '-ml-3';
  if (n <= 5) return '-ml-6';
  if (n <= 7) return '-ml-9';
  return '-ml-10';
}

const MAX_VISIBLE_CARDS = 7;

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

// ── Shared sub-components ────────────────────────────────────────────────────

function CardFan({
  cards, n, sizeClass, overlapClass, selectedCardIndices,
  selectableCards, onCardClick, isShowdownPhase, isDrawPhase,
}: {
  cards: Player['cards'];
  n: number;
  sizeClass: string;
  overlapClass: string;
  selectedCardIndices: number[];
  selectableCards: boolean;
  onCardClick: (i: number) => void;
  isShowdownPhase: boolean;
  isDrawPhase: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {isDrawPhase && (
        <span className="text-[9px] font-mono uppercase tracking-widest text-[#C9A227]/55">
          Tap to discard
        </span>
      )}
      <div className="flex items-center">
        {cards.slice(0, MAX_VISIBLE_CARDS).map((card, i) => {
          const isSelected = selectedCardIndices.includes(i);
          return (
            <div
              key={i}
              className={cn(
                "relative transition-all duration-150 cursor-pointer",
                i > 0 && overlapClass,
                isSelected && "brightness-125",
              )}
              style={{ zIndex: isSelected ? 30 : i }}
              onClick={() => selectableCards && onCardClick(i)}
              data-testid={`card-hero-${i}`}
            >
              <div className={cn(
                sizeClass,
                "relative transition-all duration-200",
                isSelected && "-translate-y-2 scale-105",
                isSelected && "ring-2 ring-[#C9A227]/80 rounded-sm shadow-[0_0_16px_rgba(201,162,39,0.45)]",
              )}>
                <PlayingCard
                  card={{ ...card, isHidden: !isShowdownPhase && card.isHidden }}
                  selected={isSelected}
                  className="w-full h-full"
                />
              </div>
            </div>
          );
        })}
        {n > MAX_VISIBLE_CARDS && (
          <div className={cn(
            "relative flex items-center justify-center rounded bg-white/10 border border-white/20 text-[10px] font-bold text-white/60 shrink-0",
            sizeClass,
            overlapClass,
          )}>
            +{n - MAX_VISIBLE_CARDS}
          </div>
        )}
      </div>
    </div>
  );
}

function QualifierBlock({
  qualifier, isShowdownPhase, player, compact = false,
}: {
  qualifier: ReturnType<typeof computeQualifier>;
  isShowdownPhase: boolean;
  player: Player;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-white/50 leading-none">
        {qualifier.label}
      </span>
      {qualifier.status ? (
        <span className={cn(
          "font-mono leading-tight break-words",
          compact ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm",
          qualifier.isMade ? "text-emerald-400/80" : "text-white/45",
        )}>
          {qualifier.status}
        </span>
      ) : (
        <span className="text-xs font-mono text-white/20 leading-none">—</span>
      )}
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
  );
}

function HeroAvatar({ size = 'md' }: { size?: 'sm' | 'md' | '3col' }) {
  const cls = size === 'sm' ? 'w-8 h-8' : size === '3col' ? 'w-12 h-12 sm:w-14 sm:h-14' : 'w-9 h-9';
  return (
    <div
      className={cn("relative rounded-full overflow-hidden bg-black/60 shrink-0", cls)}
      style={{ border: '1.5px solid rgba(201,162,39,0.35)' }}
    >
      <img
        src={getHeroAvatar()} alt="You"
        className="w-full h-full object-cover"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    </div>
  );
}

function DeclarationBadge({ declaration }: { declaration: string }) {
  return (
    <span className={cn(
      "text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md w-fit",
      declaration === 'HIGH'  && "bg-red-600/20 text-red-300/80",
      declaration === 'LOW'   && "bg-blue-600/20 text-blue-300/80",
      declaration === 'SWING' && "bg-purple-600/20 text-purple-300/80",
      declaration === 'POKER' && "bg-red-600/20 text-red-300/80",
      declaration === 'SUITS' && "bg-blue-600/20 text-blue-300/80",
      declaration === 'STAY'  && "bg-emerald-600/20 text-emerald-300/80",
      declaration === 'BUST'  && "bg-red-900/40 text-red-400/80",
    )}>
      {declaration}
    </span>
  );
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

  const isTwoColumn = modeId === 'badugi' || modeId === 'dead7';

  if (!n) return null;

  return (
    <div
      className="relative z-30 mx-auto w-full max-w-md px-3"
      data-testid="panel-hero-hand"
    >
      <div className="relative rounded-2xl border border-[#C9A227]/30 bg-gradient-to-br from-[#1a1a1f]/90 to-[#0a0a0e]/95 backdrop-blur-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]">

        {/* Gold accent line at top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-gradient-to-r from-transparent via-[#C9A227]/40 to-transparent rounded-full" />

        {isTwoColumn ? (
          /* ── 2-column layout: Badugi / Dead 7 ──────────────────────────── */
          <div className="grid grid-cols-2 gap-0 divide-x divide-white/[0.06]">

            {/* Column 1: Cards */}
            <div className="px-3 py-3 flex items-center justify-center min-w-0 overflow-hidden">
              <CardFan
                cards={cards} n={n}
                sizeClass={sizeClass} overlapClass={overlapClass}
                selectedCardIndices={selectedCardIndices}
                selectableCards={selectableCards} onCardClick={onCardClick}
                isShowdownPhase={isShowdownPhase} isDrawPhase={isDrawPhase}
              />
            </div>

            {/* Column 2: Player info (top) + Qualifier (bottom), gold divider */}
            <div className="px-3 py-3 flex flex-col justify-center gap-2 min-w-0 overflow-hidden">

              {/* Top half: avatar row + name + chips + session */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <HeroAvatar size="sm" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm sm:text-base font-semibold text-white/85 truncate leading-none">
                      {player.name}
                    </span>
                    <span className="text-lg sm:text-xl font-bold font-mono tabular-nums leading-none mt-0.5" style={{ color: '#C9A227' }}>
                      ${player.chips}
                    </span>
                  </div>
                </div>
                {sessionNetProfit !== 0 && (
                  <span className={cn(
                    "text-xs font-mono tabular-nums leading-none",
                    sessionNetProfit >= 0 ? "text-emerald-400/70" : "text-red-400/65"
                  )}>
                    {sessionNetProfit >= 0 ? '+' : ''}${sessionNetProfit} session
                  </span>
                )}
                {player.declaration && player.declaration !== 'FOLD' && (
                  <DeclarationBadge declaration={player.declaration} />
                )}
              </div>

              {/* Gold divider */}
              <div className="border-t border-[#C9A227]/20" />

              {/* Bottom half: qualifier */}
              <QualifierBlock qualifier={qualifier} isShowdownPhase={isShowdownPhase} player={player} />

            </div>
          </div>
        ) : (
          /* ── 3-column layout: 15/35 / Suits & Poker ───────────────────── */
          <div className="grid grid-cols-[1.4fr_1fr_1.2fr] gap-x-3 sm:gap-x-4 divide-x divide-white/[0.06]">

            {/* Column 1: Cards */}
            <div className="px-3 py-3 flex items-center justify-center min-w-0 overflow-hidden">
              <CardFan
                cards={cards} n={n}
                sizeClass={sizeClass} overlapClass={overlapClass}
                selectedCardIndices={selectedCardIndices}
                selectableCards={selectableCards} onCardClick={onCardClick}
                isShowdownPhase={isShowdownPhase} isDrawPhase={isDrawPhase}
              />
            </div>

            {/* Column 2: Player avatar + name + chips + session */}
            <div className="px-3 py-3 pb-4 flex flex-col justify-center gap-1 min-w-0 overflow-hidden">
              <HeroAvatar size="3col" />
              <div className="text-xs sm:text-sm font-semibold text-white/85 truncate leading-none mt-0.5">
                {player.name}
              </div>
              <div className="text-base sm:text-lg font-bold font-mono tabular-nums leading-none" style={{ color: '#C9A227' }}>
                ${player.chips}
              </div>
              {sessionNetProfit !== 0 && (
                <div className={cn(
                  "text-[10px] sm:text-xs font-mono tabular-nums leading-none",
                  sessionNetProfit >= 0 ? "text-emerald-400/70" : "text-red-400/65"
                )}>
                  {sessionNetProfit >= 0 ? '+' : ''}${sessionNetProfit} session
                </div>
              )}
              {player.bet > 0 && (
                <div className="text-[10px] font-mono text-white/35 leading-none">
                  Bet <span className="text-white/55">${player.bet}</span>
                </div>
              )}
              {player.declaration && player.declaration !== 'FOLD' && (
                <DeclarationBadge declaration={player.declaration} />
              )}
            </div>

            {/* Column 3: Qualifier / Total */}
            <div className="px-3 py-3 pb-4 flex flex-col justify-center gap-1 min-w-0 overflow-hidden">
              <QualifierBlock qualifier={qualifier} isShowdownPhase={isShowdownPhase} player={player} compact />
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
