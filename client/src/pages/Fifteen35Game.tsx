// ─── Fifteen35Game ────────────────────────────────────────────────────────────
// Dedicated vertical-mobile layout for the 15/35 game mode.
// LAYOUT / VISUAL ONLY — zero game logic, engine, state, or payout changes.
//
// Approach: self-contained page that calls useServerMode directly, bypassing
// UnifiedGamePage and ThreeDTableScene.  Other modes (Badugi, Dead 7, Suits)
// continue to use UnifiedGamePage unchanged — this file is the only change.
//
// Image asset slots (drop real art in later; CSS fallback keeps layout intact):
//   /assets/1535/bg-cellblock.jpg      — full-bleed background
//   /assets/1535/avatar-placeholder.png — per-seat avatar fallback
//   /assets/1535/btn-plate.png          — button texture (unused by default)

import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useServerMode } from "@/lib/poker/engine/useServerMode";
import { generateTableCode, saveRecentTable } from "@/lib/tableSession";
import { saveChips } from "@/lib/persistence";
import { trackModePlay } from "@/lib/analytics";
import { getAvatarForSeat, getHeroAvatar } from "@shared/engine/avatarMap";
import { BustOutModal } from "@/components/game/BustOutModal";
import { ChatBox } from "@/components/game/ChatBox";
import { ResolutionOverlay } from "@/components/game/ResolutionOverlay";
import { PlayingCard } from "@/components/game/Card";
import { WinCelebration } from "@/components/game/WinCelebration";
import { sfx } from "@/lib/sounds";
import { usePhaseSounds } from "@/lib/usePhaseSounds";
import { useGameToasts } from "@/lib/useGameToasts";
import { useXPWatcher } from "@/lib/useXPWatcher";
import { XPToast } from "@/components/XPToast";
import { cn } from "@/lib/utils";
import type { Player, Declaration } from "@/lib/poker/types";

// ── Card-value helper (identical to Fifteen35TableScene) ──────────────────────
// ACE=11 (soft; subtract 10 per ace while total > 35). J/Q/K = 0.5. Numeric = face.
function computeVisTotal(cards: Player['cards'], isSelf: boolean): number | null {
  const visible = isSelf ? cards : cards.filter(c => !c.isHidden);
  if (!visible.length) return null;
  const aceCount = visible.filter(c => c.rank === 'A').length;
  let tot = visible.reduce((sum, c) => {
    if (['J', 'Q', 'K'].includes(c.rank)) return sum + 0.5;
    if (c.rank === 'A') return sum + 11;
    return sum + parseInt(c.rank, 10);
  }, 0);
  let flipped = 0;
  while (tot > 35 && flipped < aceCount) { tot -= 10; flipped++; }
  return Math.round(tot * 2) / 2;
}

function fmtTotal(t: number): string {
  return t % 1 !== 0 ? t.toFixed(1) : String(t);
}

// ── Status-chip classification ────────────────────────────────────────────────
type ChipSpec = { label: string; bg: string; border: string; color: string };

function getStatusChip(player: Player, total: number | null): ChipSpec | null {
  if (player.status === 'folded') {
    return { label: 'FOLDED', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.22)' };
  }
  if (player.declaration === 'BUST' || (total !== null && total > 35)) {
    return { label: 'BUSTED', bg: 'rgba(127,29,29,0.45)', border: 'rgba(220,38,38,0.45)', color: '#F87171' };
  }
  if (total === null) return null;
  if (total >= 33 && total <= 35) {
    return { label: 'HIGH MADE', bg: 'rgba(92,65,0,0.45)', border: 'rgba(201,162,39,0.55)', color: '#C9A227' };
  }
  if (total >= 13 && total <= 15) {
    return { label: 'LOW MADE', bg: 'rgba(6,60,40,0.45)', border: 'rgba(16,185,129,0.45)', color: '#6EE7B7' };
  }
  if (total >= 28) {
    return { label: 'DANGER', bg: 'rgba(120,40,0,0.40)', border: 'rgba(249,115,22,0.40)', color: '#FB923C' };
  }
  // Distinguish pressing-low (<13) from mid-range (16–27)
  if (total < 13) {
    return { label: 'PRESSING LOW', bg: 'rgba(12,40,65,0.35)', border: 'rgba(56,189,248,0.25)', color: 'rgba(125,211,252,0.70)' };
  }
  return { label: 'PRESSING', bg: 'rgba(40,20,65,0.35)', border: 'rgba(167,139,250,0.25)', color: 'rgba(196,181,253,0.65)' };
}

// ── Table-ID (read ?t= or generate) ──────────────────────────────────────────
function useTableId(): string {
  const [tableId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('t')?.toUpperCase() ?? '';
    if (/^[A-Z0-9]{6}$/.test(fromUrl)) return fromUrl;
    const newCode = generateTableCode();
    window.history.replaceState(null, '', `/fifteen35?t=${newCode}`);
    return newCode;
  });
  return tableId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual primitives
// ─────────────────────────────────────────────────────────────────────────────

// Corner rivet dots — shared style
const RIVET: CSSProperties = {
  position: 'absolute', width: 5, height: 5, borderRadius: '50%',
  background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.16)',
  pointerEvents: 'none',
};

type BtnVariant = 'gold' | 'red' | 'neutral';

const BTN_STYLES: Record<BtnVariant, CSSProperties> = {
  gold: {
    background: 'linear-gradient(180deg,#221C00 0%,#140F00 100%)',
    border: '1px solid rgba(201,162,39,0.52)',
    color: '#C9A227',
    boxShadow: '0 2px 10px rgba(0,0,0,0.65), inset 0 1px 0 rgba(201,162,39,0.10)',
  },
  red: {
    background: 'linear-gradient(180deg,#1E0606 0%,#110202 100%)',
    border: '1px solid rgba(220,38,38,0.42)',
    color: '#F87171',
    boxShadow: '0 2px 10px rgba(0,0,0,0.65), inset 0 1px 0 rgba(220,38,38,0.08)',
  },
  neutral: {
    background: 'linear-gradient(180deg,#1C1C20 0%,#111116 100%)',
    border: '1px solid rgba(255,255,255,0.13)',
    color: 'rgba(255,255,255,0.68)',
    boxShadow: '0 2px 10px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)',
  },
};

function MetalBtn({
  variant = 'neutral', onClick, children, disabled = false, testId, style,
}: {
  variant?: BtnVariant; onClick?: () => void; children: React.ReactNode;
  disabled?: boolean; testId?: string; style?: CSSProperties;
}) {
  return (
    <button
      data-testid={testId}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '11px 8px',
        borderRadius: 7,
        fontFamily: "'Oswald','Impact',sans-serif",
        fontSize: 12, fontWeight: 700,
        letterSpacing: '0.16em', textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.36 : 1,
        transition: 'opacity 130ms, filter 130ms',
        userSelect: 'none',
        width: '100%',
        ...BTN_STYLES[variant],
        ...style,
      }}
    >
      <span style={{ ...RIVET, top: 3, left: 3 }} />
      <span style={{ ...RIVET, top: 3, right: 3 }} />
      <span style={{ ...RIVET, bottom: 3, left: 3 }} />
      <span style={{ ...RIVET, bottom: 3, right: 3 }} />
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// ── Top status bar ────────────────────────────────────────────────────────────
function F35StatusBar({
  ante, humanCount, totalSeats, pot, onChat, onLeave,
}: {
  ante: number; humanCount: number; totalSeats: number; pot: number;
  onChat: () => void; onLeave: () => void;
}) {
  return (
    <div
      className="flex-shrink-0 flex items-center px-3 gap-2 w-full z-10"
      style={{ height: 48, background: 'rgba(9,9,12,0.97)', borderBottom: '1px solid rgba(201,162,39,0.16)' }}
    >
      {/* Menu / chat icon */}
      <button
        onClick={onChat}
        data-testid="button-menu"
        className="flex-shrink-0 flex flex-col justify-center gap-[5px] w-8 h-8"
        aria-label="Chat"
      >
        <span className="block h-[2px] w-5 rounded" style={{ background: 'rgba(255,255,255,0.38)' }} />
        <span className="block h-[2px] w-3.5 rounded" style={{ background: 'rgba(255,255,255,0.25)' }} />
        <span className="block h-[2px] w-5 rounded" style={{ background: 'rgba(255,255,255,0.38)' }} />
      </button>

      {/* Stat blocks */}
      <div className="flex-1 flex items-center justify-center gap-0">
        <StatBlk label="ANTES" value={`$${ante}`} />
        <div className="w-px h-6 mx-3" style={{ background: 'rgba(255,255,255,0.07)' }} />
        <StatBlk label="PLAYERS" value={`${totalSeats}/${totalSeats}`} />
        <div className="w-px h-6 mx-3" style={{ background: 'rgba(255,255,255,0.07)' }} />
        <StatBlk label="POT" value={pot > 0 ? `$${pot.toLocaleString()}` : '—'} gold={pot > 0} />
      </div>

      {/* Leave icon */}
      <button
        onClick={onLeave}
        data-testid="button-leave"
        className="flex-shrink-0 flex items-center justify-center w-8 h-8"
        aria-label="Leave table"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.32)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function StatBlk({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-[2px]">
      <span style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: gold ? '#C9A227' : 'rgba(255,255,255,0.72)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

// ── Title block ───────────────────────────────────────────────────────────────
function F35Title({ phase }: { phase: string }) {
  const phaseLabel =
    phase === 'WAITING' ? 'WAITING FOR PLAYERS' :
    phase === 'ANTE'    ? 'ANTE UP' :
    phase === 'DEAL'    ? 'DEALING' :
    phase === 'SHOWDOWN' ? 'SHOWDOWN' :
    phase.startsWith('BET_') ? `BETTING · ROUND ${phase.slice(4)}` :
    phase.startsWith('HIT_') ? `ROUND ${phase.slice(4)} · HIT OR STAY` :
    phase;

  return (
    <div className="flex flex-col items-center pt-2 pb-1 select-none">
      <div
        data-testid="text-fifteen35-brand"
        style={{
          fontFamily: "'Oswald','Impact','Anton',sans-serif",
          fontSize: 'clamp(44px,13vw,68px)', fontWeight: 900,
          letterSpacing: '0.04em', lineHeight: 1,
          color: '#C9A227',
          textShadow: '0 0 40px rgba(201,162,39,0.32), 0 4px 14px rgba(0,0,0,0.95), 2px 2px 0 rgba(0,0,0,0.75)',
        }}
      >
        15/35
      </div>
      <div style={{ fontFamily: "'Oswald','Inter',sans-serif", fontSize: 'clamp(8px,2.2vw,11px)', fontWeight: 600, letterSpacing: '0.26em', color: 'rgba(201,162,39,0.48)', textTransform: 'uppercase', marginTop: 4 }}>
        MAKE 13–15 OR 33–35
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 'clamp(6px,1.5vw,8px)', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.16)', textTransform: 'uppercase', marginTop: 2 }}>
        BEAT WHOEVER ENDS UP YOUR WAY
      </div>
      <div
        data-testid="text-phase"
        className="mt-2 rounded px-3 py-0.5"
        style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {phaseLabel}
      </div>
    </div>
  );
}

// ── THE RULE panel ────────────────────────────────────────────────────────────
const RULES = [
  { icon: '✓', text: 'Qualify LOW: 13–15' },
  { icon: '✓', text: 'Qualify HIGH: 33–35' },
  { icon: '✗', text: 'Avoid busting over 35' },
  { icon: '⚖', text: 'Beat matching totals' },
];

function F35RulePanel() {
  return (
    <div
      className="mx-3 rounded-lg overflow-hidden"
      style={{ background: 'rgba(9,9,13,0.88)', border: '1px solid rgba(201,162,39,0.20)' }}
    >
      <div className="px-3 pt-2.5 pb-1.5">
        <div style={{ fontFamily: "'Oswald','Impact',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.26em', color: 'rgba(201,162,39,0.78)', textTransform: 'uppercase' }}>
          THE RULE
        </div>
      </div>
      <div className="px-3 pb-2.5 flex flex-col gap-[6px]">
        {RULES.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span style={{ fontSize: 9, color: 'rgba(201,162,39,0.52)', width: 10, textAlign: 'center', flexShrink: 0 }}>{r.icon}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.42)', letterSpacing: '0.06em' }}>{r.text}</span>
          </div>
        ))}
      </div>
      <div
        className="px-3 py-1.5 flex items-center gap-1.5"
        style={{ borderTop: '1px solid rgba(201,162,39,0.09)', background: 'rgba(201,162,39,0.025)' }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,39,0.42)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
        </svg>
        <span style={{ fontFamily: 'monospace', fontSize: 7.5, letterSpacing: '0.26em', color: 'rgba(201,162,39,0.36)', textTransform: 'uppercase' }}>GUARD IS WATCHING</span>
      </div>
    </div>
  );
}

// ── Opponent row ──────────────────────────────────────────────────────────────
function F35OpponentRow({
  player, seatIndex, isActive, isShowdown, revealed, phase, lastAction,
}: {
  player: Player; seatIndex: number; isActive: boolean; isShowdown: boolean;
  revealed: boolean; phase: string; lastAction?: string;
}) {
  const inPlay = !['WAITING', 'ANTE'].includes(phase);
  const isFolded = player.status === 'folded';
  const total = computeVisTotal(player.cards, false);
  const chip = getStatusChip(player, total);
  const avatarSrc = getAvatarForSeat(seatIndex);
  const isBust = player.declaration === 'BUST' || (total !== null && total > 35);
  const isQual = !isBust && total !== null && ((total >= 13 && total <= 15) || (total >= 33 && total <= 35));

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 transition-opacity"
      style={{
        opacity: isFolded ? 0.35 : 1,
        background: isActive ? 'rgba(201,162,39,0.04)' : 'transparent',
        borderLeft: `2px solid ${isActive ? 'rgba(201,162,39,0.52)' : 'transparent'}`,
      }}
      data-testid={`fifteen35-seat-${player.id}`}
    >
      {/* Avatar */}
      <div
        className="relative flex-shrink-0 rounded-full overflow-hidden"
        style={{
          width: 40, height: 40,
          border: `2px solid ${isActive ? 'rgba(201,162,39,0.78)' : 'rgba(255,255,255,0.10)'}`,
          boxShadow: isActive ? '0 0 10px rgba(201,162,39,0.38)' : 'none',
          background: '#18181C',
        }}
      >
        <img
          src={avatarSrc}
          alt={player.name}
          className="w-full h-full object-cover"
          onError={e => {
            const img = e.currentTarget as HTMLImageElement;
            img.src = '/assets/1535/avatar-placeholder.png';
            img.onerror = null;
          }}
        />
        <div
          className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center"
          style={{ width: 14, height: 14, background: '#0A0A0E', border: '1px solid rgba(255,255,255,0.18)', fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}
        >
          {seatIndex}
        </div>
      </div>

      {/* Name + chips */}
      <div className="flex flex-col justify-center min-w-0 flex-shrink-0" style={{ width: 74 }}>
        <span className="truncate" style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.68)', lineHeight: 1.2 }}>{player.name}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'rgba(201,162,39,0.82)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
          ${player.chips.toLocaleString()}
        </span>
        {lastAction && !isFolded && (
          <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.30)', lineHeight: 1 }}>{lastAction}</span>
        )}
      </div>

      {/* Cards — zoom-scaled by count so all cards stay readable with no overlap */}
      {(() => {
        const n = (inPlay && player.cards.length > 0) ? player.cards.length : 1;
        const zoom = n <= 2 ? 1 : n === 3 ? 0.78 : n === 4 ? 0.65 : n === 5 ? 0.56 : 0.50;
        return (
          <div className="flex items-center gap-0.5 flex-shrink-0" style={{ zoom }}>
            {inPlay && player.cards.length > 0 ? (
              player.cards.map((card, i) => (
                <PlayingCard
                  key={i}
                  card={(isShowdown && revealed) ? { ...card, isHidden: false } : card}
                  className="w-9 h-[52px] sm:w-9 sm:h-[52px]"
                />
              ))
            ) : (
              <div className="w-9 h-[52px] rounded border" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }} />
            )}
          </div>
        );
      })()}

      {/* Total box */}
      {inPlay ? (
        <div
          className="flex-shrink-0 rounded px-1.5 py-0.5 text-center"
          style={{
            minWidth: 34,
            fontFamily: 'monospace', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            background: isBust ? 'rgba(127,29,29,0.50)' : isQual ? 'rgba(6,60,40,0.50)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isBust ? 'rgba(220,38,38,0.42)' : isQual ? 'rgba(16,185,129,0.38)' : 'rgba(255,255,255,0.09)'}`,
            color: isBust ? '#F87171' : isQual ? '#6EE7B7' : 'rgba(255,255,255,0.72)',
          }}
          data-testid="text-fifteen35-total"
        >
          {total !== null ? fmtTotal(total) : '—'}
        </div>
      ) : (
        <div className="flex-shrink-0 rounded" style={{ width: 34, height: 22, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }} />
      )}

      {/* Status chip */}
      <div className="flex-1 flex justify-end min-w-0">
        {chip && (
          <span
            style={{
              fontFamily: 'monospace', fontSize: 7, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              padding: '2px 6px', borderRadius: 4,
              background: chip.bg, border: `1px solid ${chip.border}`, color: chip.color,
              whiteSpace: 'nowrap',
            }}
          >
            {chip.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Hero strip ────────────────────────────────────────────────────────────────
function F35HeroStrip({ player, isShowdown, phase }: { player: Player; isShowdown: boolean; phase: string }) {
  const inPlay = !['WAITING', 'ANTE'].includes(phase);
  const total = computeVisTotal(player.cards, true);
  const isBust = player.declaration === 'BUST' || (total !== null && total > 35);
  const isLowMade = !isBust && total !== null && total >= 13 && total <= 15;
  const isHighMade = !isBust && total !== null && total >= 33 && total <= 35;
  const isDanger = !isBust && !isLowMade && !isHighMade && total !== null && total >= 28;
  const avatarSrc = getHeroAvatar();

  const totalBg = isBust ? 'rgba(127,29,29,0.58)' : (isLowMade || isHighMade) ? 'rgba(6,60,40,0.58)' : isDanger ? 'rgba(120,40,0,0.48)' : 'rgba(255,255,255,0.05)';
  const totalBorder = isBust ? 'rgba(220,38,38,0.48)' : (isLowMade || isHighMade) ? 'rgba(16,185,129,0.45)' : isDanger ? 'rgba(249,115,22,0.38)' : 'rgba(255,255,255,0.11)';
  const totalColor = isBust ? '#F87171' : (isLowMade || isHighMade) ? '#6EE7B7' : isDanger ? '#FB923C' : 'rgba(255,255,255,0.88)';

  return (
    <div style={{ borderTop: '1px solid rgba(201,162,39,0.14)', background: 'rgba(8,8,11,0.97)', padding: '10px 12px 8px' }}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="relative flex-shrink-0 rounded-full overflow-hidden"
          style={{
            width: 54, height: 54,
            border: '2px solid rgba(201,162,39,0.52)',
            boxShadow: '0 0 16px rgba(201,162,39,0.22)',
            background: '#18181C',
          }}
        >
          <img
            src={avatarSrc}
            alt={player.name}
            className="w-full h-full object-cover"
            onError={e => {
              const img = e.currentTarget as HTMLImageElement;
              img.src = '/assets/1535/avatar-placeholder.png';
              img.onerror = null;
            }}
          />
        </div>

        {/* Name + chips + NEEDS */}
        <div className="flex flex-col gap-[3px]">
          <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.90)', lineHeight: 1 }}>
            {player.name}
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 900, color: '#C9A227', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            ${player.chips.toLocaleString()}
          </span>
          {inPlay && (
            <div className="flex gap-1 mt-0.5">
              <NeedsChip label="13–15" on={isLowMade} />
              <NeedsChip label="33–35" on={isHighMade} />
            </div>
          )}
          {player.declaration === 'STAY' && !isBust && (
            <span
              className="self-start mt-0.5 rounded"
              style={{ fontFamily: 'monospace', fontSize: 7, fontWeight: 700, letterSpacing: '0.20em', textTransform: 'uppercase', padding: '2px 5px', background: 'rgba(6,60,40,0.45)', border: '1px solid rgba(16,185,129,0.38)', color: '#6EE7B7' }}
            >
              STAY
            </span>
          )}
          {/* ALL-IN badge */}
          {player.chips <= 0 && player.status === 'active' && inPlay && (
            <span
              className="self-start mt-0.5 rounded"
              style={{ fontFamily: 'monospace', fontSize: 7, fontWeight: 700, letterSpacing: '0.20em', textTransform: 'uppercase', padding: '2px 5px', background: 'rgba(92,65,0,0.40)', border: '1px solid rgba(201,162,39,0.35)', color: 'rgba(201,162,39,0.80)' }}
            >
              ALL IN
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Total */}
        {inPlay && (
          <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
            <span style={{ fontFamily: 'monospace', fontSize: 7, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>TOTAL</span>
            <div
              className="rounded text-center"
              style={{
                minWidth: 48, padding: '4px 8px',
                fontFamily: 'monospace', fontSize: 18, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                background: totalBg, border: `1px solid ${totalBorder}`, color: totalColor,
              }}
              data-testid="text-fifteen35-total-hero"
            >
              {total !== null ? fmtTotal(total) : '—'}
            </div>
            {isBust && <span style={{ fontFamily: 'monospace', fontSize: 7, color: '#F87171', textTransform: 'uppercase', letterSpacing: '0.16em' }}>BUST</span>}
          </div>
        )}
      </div>

      {/* Hero cards — zoom-scaled by count, no overlap, always readable */}
      {inPlay && player.cards.length > 0 && (() => {
        const n = player.cards.length;
        const zoom = n <= 2 ? 1 : n === 3 ? 0.88 : n === 4 ? 0.76 : n === 5 ? 0.66 : n === 6 ? 0.58 : 0.52;
        return (
          <div className="flex gap-1.5 mt-2.5 justify-center" style={{ zoom }}>
            {player.cards.map((c, i) => (
              <PlayingCard
                key={i}
                card={isShowdown ? { ...c, isHidden: false } : c}
                className="w-12 h-16 sm:w-12 sm:h-16 shadow-md"
              />
            ))}
          </div>
        );
      })()}
    </div>
  );
}

function NeedsChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className="rounded"
      style={{
        fontFamily: 'monospace', fontSize: 7, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        padding: '2px 5px',
        background: on ? 'rgba(6,60,40,0.48)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${on ? 'rgba(16,185,129,0.42)' : 'rgba(255,255,255,0.09)'}`,
        color: on ? '#6EE7B7' : 'rgba(255,255,255,0.28)',
      }}
    >
      {on ? '✓ ' : ''}{label}
    </span>
  );
}

// ── Turn countdown strip ──────────────────────────────────────────────────────
function F35Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, deadline - now);
  const secs = Math.ceil(remaining / 1000);
  const pct = Math.max(0, Math.min(100, (remaining / 30000) * 100));
  const urgent = remaining <= 5000;

  return (
    <div className="w-full mb-1" data-testid="turn-countdown">
      <div className="flex justify-between items-center mb-0.5 px-0.5">
        <span style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.24em', textTransform: 'uppercase', color: urgent ? 'rgba(248,113,113,0.85)' : 'rgba(255,255,255,0.22)' }}
          className={urgent ? 'animate-pulse' : ''}>
          {urgent ? 'HURRY!' : 'YOUR TURN'}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: urgent ? '#F87171' : 'rgba(255,255,255,0.40)' }}
          data-testid="text-turn-seconds">{secs}s</span>
      </div>
      <div className="h-0.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className={cn('h-full transition-all duration-200', urgent ? 'bg-red-500/70' : 'bg-[#C9A227]/55')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Action zone ───────────────────────────────────────────────────────────────
function F35ActionZone({
  phase, chips, myBet, currentBet, pot, onAction, isMyTurn,
  myDeclaration, turnDeadline, locked, openSeatsCount, humanCount,
}: {
  phase: string; chips: number; myBet: number; currentBet: number; pot: number;
  onAction: (action: string, payload?: unknown) => void; isMyTurn: boolean;
  myDeclaration: Declaration; turnDeadline: number | null | undefined;
  locked: boolean; openSeatsCount: number; humanCount: number;
}) {
  const [betAmount, setBetAmount] = useState(() => Math.max(currentBet - myBet, 2));
  const callAmount = currentBet - myBet;
  const canCheck = callAmount === 0;

  useEffect(() => {
    setBetAmount(Math.max(callAmount > 0 ? callAmount * 2 : 2, 2));
  }, [phase, callAmount]);

  // Auto-ante
  const autoAnteFired = useRef(false);
  useEffect(() => {
    if (phase !== 'ANTE' || !isMyTurn || chips <= 0) { autoAnteFired.current = false; return; }
    const t = setTimeout(() => {
      if (!autoAnteFired.current) { autoAnteFired.current = true; sfx.chipClink(); onAction('ante'); }
    }, 180);
    return () => clearTimeout(t);
  }, [phase, isMyTurn, chips, onAction]);

  // Auto-restart after showdown
  const autoRestartFired = useRef(false);
  useEffect(() => {
    if (phase !== 'SHOWDOWN' || chips <= 0 || !isMyTurn) { autoRestartFired.current = false; return; }
    const t = setTimeout(() => {
      if (!autoRestartFired.current) { autoRestartFired.current = true; onAction('restart'); }
    }, 3000);
    return () => clearTimeout(t);
  }, [phase, chips, isMyTurn, onAction]);

  if (locked) {
    return (
      <div className="flex items-center justify-center min-h-[56px]">
        <div className="flex items-center gap-1.5">
          <span className="thinking-dot" style={{ animationDelay: '0ms' }} />
          <span className="thinking-dot" style={{ animationDelay: '140ms' }} />
          <span className="thinking-dot" style={{ animationDelay: '280ms' }} />
        </div>
      </div>
    );
  }

  if (!isMyTurn && phase !== 'SHOWDOWN' && phase !== 'WAITING') {
    return (
      <div className="flex items-center justify-center min-h-[56px]">
        <span className="anim-pulse-gold" style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.18)' }}>
          Waiting for opponents…
        </span>
      </div>
    );
  }

  if (phase === 'DEAL') {
    return (
      <div className="flex items-center justify-center min-h-[56px]">
        <span className="anim-pulse-gold" style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(201,162,39,0.38)' }}>
          Dealing…
        </span>
      </div>
    );
  }

  if (phase === 'ANTE') {
    return (
      <div className="flex items-center justify-center min-h-[56px]">
        <span className="anim-pulse-gold" style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(201,162,39,0.40)' }}>
          Auto-posting ante…
        </span>
      </div>
    );
  }

  if (phase === 'SHOWDOWN') {
    return (
      <div className="flex flex-col items-center gap-2 py-1">
        <MetalBtn variant="gold" onClick={() => { autoRestartFired.current = true; onAction('restart'); }} testId="button-next-hand">
          NEXT HAND
        </MetalBtn>
        {chips <= 0 && (
          <button
            onClick={() => onAction('rebuy')}
            data-testid="button-rebuy"
            style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '5px 14px', cursor: 'pointer' }}
          >
            Rebuy $1,000
          </button>
        )}
        <span className="anim-pulse-gold" style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.13)' }}>
          Next hand…
        </span>
      </div>
    );
  }

  if (phase === 'WAITING') {
    const hc = humanCount;
    const hasOpenSeats = openSeatsCount > 0;
    const msg = hc >= 2
      ? `${hc} players here — ${hasOpenSeats ? 'start now or wait for more' : 'full table'}`
      : 'Share the link — friends can still join';
    return (
      <div className="flex flex-col items-center gap-2 py-1">
        <div
          className="w-full rounded-lg px-3 py-2 text-center"
          style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(0,200,150,0.60)', background: 'rgba(0,200,150,0.045)', border: '1px solid rgba(0,200,150,0.12)', lineHeight: 1.5 }}
        >
          {msg}
        </div>
        <MetalBtn variant="gold" onClick={() => { sfx.buttonTap(); onAction('start'); }} disabled={chips <= 0} testId="button-deal-me-in">
          DEAL ME IN
        </MetalBtn>
        {chips <= 0 && (
          <button
            onClick={() => onAction('rebuy')}
            data-testid="button-rebuy-waiting"
            style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)', background: 'transparent', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, padding: '5px 14px', cursor: 'pointer' }}
          >
            Rebuy $1,000
          </button>
        )}
      </div>
    );
  }

  // HIT phase
  if (phase.startsWith('HIT_')) {
    const hideHit = myDeclaration === 'STAY' || myDeclaration === 'BUST';
    return (
      <div className="flex flex-col gap-2 py-1">
        {turnDeadline && isMyTurn && <F35Countdown deadline={turnDeadline} />}
        <div style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', textAlign: 'center', color: 'rgba(255,255,255,0.18)', paddingBottom: 2 }}>
          {hideHit ? 'STANDING — FOLD OR WAIT' : 'HIT · STAY · FOLD'}
        </div>
        <div className={cn('grid gap-2', hideHit ? 'grid-cols-2' : 'grid-cols-3')}>
          <MetalBtn variant="red" onClick={() => { sfx.fold(); onAction('fold'); }} testId="button-fold">FOLD</MetalBtn>
          <MetalBtn variant="neutral" onClick={() => { sfx.check(); onAction('stay'); }} testId="button-stay">STAY</MetalBtn>
          {!hideHit && (
            <MetalBtn variant="gold" onClick={() => { sfx.cardDeal(); onAction('hit'); }} testId="button-hit">HIT</MetalBtn>
          )}
        </div>
      </div>
    );
  }

  // BET phase — all-in guard
  if (chips <= 0 && phase.startsWith('BET_')) {
    return (
      <div className="flex flex-col items-center gap-2 py-1">
        <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(201,162,39,0.60)', background: 'rgba(201,162,39,0.06)', border: '1px solid rgba(201,162,39,0.18)', borderRadius: 5, padding: '4px 14px' }}>
          ALL IN
        </div>
        <MetalBtn variant="neutral" onClick={() => onAction('check')} testId="button-check-allin">CHECK (ALL IN)</MetalBtn>
      </div>
    );
  }

  // BET phase — normal
  if (phase.startsWith('BET_')) {
    const minRaiseTo = callAmount > 0 ? currentBet + Math.max(callAmount, 2) : Math.max(currentBet, 2);
    const maxRaiseTo = myBet + chips;
    const clamp = (v: number) => Math.max(minRaiseTo, Math.min(maxRaiseTo, Math.round(v)));
    const halfPot = clamp(currentBet + Math.max(2, Math.floor((pot + callAmount) / 2)));
    const onePot  = clamp(currentBet + Math.max(2, pot + callAmount));
    const twoPot  = clamp(currentBet + Math.max(2, 2 * (pot + callAmount)));
    const allInTo = maxRaiseTo;

    const presets = [
      { label: '½ POT',  amt: halfPot, tid: 'button-bet-half-pot' },
      { label: 'POT',    amt: onePot,  tid: 'button-bet-pot' },
      { label: '2× POT', amt: twoPot,  tid: 'button-bet-two-pot' },
      { label: 'ALL IN', amt: allInTo, tid: 'button-bet-allin' },
    ];

    const raiseDisabled = betAmount < minRaiseTo || chips < (betAmount - myBet);

    return (
      <div className="flex flex-col gap-2 py-1">
        {/* Pot / call info */}
        <div className="flex justify-between items-center px-0.5">
          <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.28)' }}>
            Pot <span style={{ color: 'rgba(255,255,255,0.52)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>${pot}</span>
          </span>
          {callAmount > 0 && (
            <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(201,162,39,0.78)' }}>
              To call: <strong>${callAmount}</strong>
            </span>
          )}
        </div>

        {/* Countdown */}
        {turnDeadline && isMyTurn && <F35Countdown deadline={turnDeadline} />}

        {/* Primary actions */}
        <div className="grid grid-cols-3 gap-2">
          <MetalBtn variant="red" onClick={() => { sfx.fold(); onAction('fold'); }} testId="button-fold">FOLD</MetalBtn>
          <MetalBtn variant="neutral" onClick={() => { sfx.check(); onAction(canCheck ? 'check' : 'call'); }} testId={canCheck ? 'button-check' : 'button-call'}>
            {canCheck ? 'CHECK' : `CALL $${callAmount}`}
          </MetalBtn>
          <MetalBtn variant="gold" onClick={() => { sfx.raise(); onAction('raise', betAmount); }} disabled={raiseDisabled} testId="button-raise">
            {callAmount > 0 ? `RAISE $${betAmount}` : `BET $${betAmount}`}
          </MetalBtn>
        </div>

        {/* Bet-size presets */}
        {chips > 0 && maxRaiseTo > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {presets.map(p => {
              const active = p.amt === betAmount;
              const disabled = p.amt < minRaiseTo || p.amt > maxRaiseTo;
              return (
                <button
                  key={p.label}
                  onClick={() => !disabled && setBetAmount(p.amt)}
                  disabled={disabled}
                  data-testid={p.tid}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '6px 4px', borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.28 : 1,
                    background: active ? 'rgba(201,162,39,0.09)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${active ? 'rgba(201,162,39,0.50)' : 'rgba(255,255,255,0.07)'}`,
                    transition: 'border-color 130ms',
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: active ? '#C9A227' : 'rgba(255,255,255,0.48)' }}>
                    {p.label}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 8, fontVariantNumeric: 'tabular-nums', color: active ? 'rgba(201,162,39,0.65)' : 'rgba(255,255,255,0.27)' }}>
                    ${p.amt - myBet}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page root
// ─────────────────────────────────────────────────────────────────────────────
export default function Fifteen35Game() {
  const tableId = useTableId();
  const [, navigate] = useLocation();

  useEffect(() => {
    trackModePlay('fifteen35');
    saveRecentTable(tableId);
  }, [tableId]);

  const { state, handleAction, myId, role, sessionStats } = useServerMode(tableId, 'fifteen35');

  usePhaseSounds(state.phase);
  useGameToasts(state, myId, '15/35');
  const { toast: xpToast, dismiss: dismissXP } = useXPWatcher();

  const isSpectator = role === 'spectator';
  const me = state.players.find(p => p.id === myId);
  const isShowdown = state.phase === 'SHOWDOWN';

  // ── Bust-out modal — preserves the all-in fix from UnifiedGamePage ─────────
  const [bustDismissed, setBustDismissed] = useState(false);
  const heroBust = !!me && me.chips <= 0 && !isSpectator && me.status !== 'active';
  const bustEligiblePhase = me?.status === 'sitting_out' || state.phase === 'WAITING' || state.phase === 'SHOWDOWN';
  const showBustModal = heroBust && bustEligiblePhase && !bustDismissed;
  useEffect(() => { if (me && me.chips > 0) setBustDismissed(false); }, [me?.chips]);

  // ── Bust counter (same as UnifiedGamePage) ────────────────────────────────
  const bustCountedRef = useRef(false);
  useEffect(() => {
    if (heroBust && bustEligiblePhase && !bustCountedRef.current) {
      bustCountedRef.current = true;
      const lt = parseInt(localStorage.getItem('cgp_lifetime_busts') || '0', 10);
      localStorage.setItem('cgp_lifetime_busts', (lt + 1).toString());
      const ss = parseInt(sessionStorage.getItem('cgp_session_busts') || '0', 10);
      sessionStorage.setItem('cgp_session_busts', (ss + 1).toString());
    }
    if (!heroBust) bustCountedRef.current = false;
  }, [heroBust, bustEligiblePhase]);

  const lifetimeBusts = parseInt(localStorage.getItem('cgp_lifetime_busts') || '0', 10);
  const sessionBusts  = parseInt(sessionStorage.getItem('cgp_session_busts') || '0', 10);
  const hasNeverPurchased = !localStorage.getItem('cgp_first_purchase_complete');

  // ── Chat ──────────────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);

  // ── Post-action lock (prevents double-fire) ───────────────────────────────
  const [actionLocked, setActionLocked] = useState(false);
  const lockRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PASSIVE = ['restart', 'rebuy', 'chat', 'reaction', 'ante'];
  const handleControlAction = (action: string, payload?: unknown) => {
    handleAction(action, payload);
    if (!PASSIVE.includes(action)) {
      setActionLocked(true);
      if (lockRef.current) clearTimeout(lockRef.current);
      lockRef.current = setTimeout(() => setActionLocked(false), 280);
    }
  };

  // ── Showdown stagger-reveal ───────────────────────────────────────────────
  const [sdRevealCount, setSdRevealCount] = useState(0);
  const sdOrderRef    = useRef<string[]>([]);
  const sdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (state.phase !== 'SHOWDOWN') {
      setSdRevealCount(0);
      if (sdIntervalRef.current) { clearInterval(sdIntervalRef.current); sdIntervalRef.current = null; }
      return;
    }
    const active = state.players.filter(p => p.presence !== 'reserved');
    sdOrderRef.current = [
      ...active.filter(p => !p.isWinner).map(p => p.id),
      ...active.filter(p =>  p.isWinner).map(p => p.id),
    ];
    setSdRevealCount(0);
    let n = 0;
    sdIntervalRef.current = setInterval(() => {
      n++; setSdRevealCount(n);
      if (n >= sdOrderRef.current.length) { clearInterval(sdIntervalRef.current!); sdIntervalRef.current = null; }
    }, 320);
    return () => { if (sdIntervalRef.current) { clearInterval(sdIntervalRef.current); sdIntervalRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);
  const revealedSet = new Set(sdOrderRef.current.slice(0, sdRevealCount));

  // ── Action-label flash ────────────────────────────────────────────────────
  const [actionLabels, setActionLabels] = useState<Record<string, string>>({});
  const actionTimers  = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const actionPhaseRef = useRef('');
  const actionBaseRef  = useRef<Record<string, { bet: number; chips: number; status: string }>>({});
  useEffect(() => {
    const isBetPhase = state.phase.startsWith('BET') || state.phase.startsWith('HIT_');
    if (state.phase !== actionPhaseRef.current) {
      actionPhaseRef.current = state.phase;
      actionBaseRef.current = Object.fromEntries(
        state.players.filter(p => p.presence !== 'reserved')
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
    const base = actionBaseRef.current;
    const updates: Record<string, string> = {};
    state.players.forEach(p => {
      if (p.presence === 'reserved') return;
      const old = base[p.id]; if (!old) return;
      let label = '';
      if (p.status === 'folded' && old.status !== 'folded') label = 'Fold';
      else if (p.bet > old.bet) { const d = p.bet - old.bet; label = old.bet === 0 ? `Bet $${d}` : `Call $${d}`; }
      if (label) { updates[p.id] = label; base[p.id] = { bet: p.bet, chips: p.chips, status: p.status }; }
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
  }, [state.players, state.phase]);

  // ── Win celebration ───────────────────────────────────────────────────────
  const [showCelebration, setShowCelebration] = useState(false);
  const celebFiredRef = useRef(false);
  useEffect(() => {
    if (state.phase === 'SHOWDOWN' && !celebFiredRef.current) {
      const hero = state.players.find(p => p.id === myId);
      if (hero?.isWinner) { celebFiredRef.current = true; setShowCelebration(true); }
    }
    if (state.phase !== 'SHOWDOWN') celebFiredRef.current = false;
  }, [state.phase, state.players, myId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const opponents    = state.players.filter(p => p.id !== myId && p.presence !== 'reserved');
  const humanCount   = state.players.filter(p => p.presence === 'human').length;
  const openSeats    = state.players.filter(p => p.presence === 'reserved').length;
  const totalSeats   = state.players.filter(p => p.presence !== 'reserved').length;
  const ante         = state.minBet ?? 1;

  return (
    <div
      className="h-[100dvh] overflow-hidden flex flex-col"
      data-mode="fifteen35"
      style={{
        background: '#0D0D0F',
        backgroundImage: "url('/assets/1535/bg-cellblock.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* ── Top status bar ────────────────────────────────────────────────── */}
      <F35StatusBar
        ante={ante}
        humanCount={humanCount}
        totalSeats={totalSeats}
        pot={state.pot}
        onChat={() => setChatOpen(true)}
        onLeave={() => { if (me) saveChips('fifteen35', me.chips); navigate('/'); }}
      />

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 440 }}
      >
        {/* Dark overlay for readability */}
        <div style={{ minHeight: '100%', background: 'rgba(8,8,12,0.72)' }}>

          {/* Title */}
          <F35Title phase={state.phase} />

          {/* THE RULE */}
          <div className="mt-2 mb-3">
            <F35RulePanel />
          </div>

          {/* Game message (non-showdown) */}
          {state.phase !== 'SHOWDOWN' && state.messages.slice(-1).map(msg => (
            <div key={msg.id} className="mx-3 mb-2">
              <p
                className="text-center rounded-full"
                style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.38)', background: 'rgba(0,0,0,0.60)', border: '1px solid rgba(255,255,255,0.05)', padding: '4px 14px' }}
                data-testid="text-game-message"
              >
                {msg.text}
              </p>
            </div>
          ))}

          {/* Opponent rows */}
          <div
            className="mx-3 rounded-lg overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(10,10,14,0.82)' }}
          >
            {opponents.length === 0 ? (
              <div
                className="flex items-center justify-center"
                style={{ height: 56, fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.18)' }}
              >
                Waiting for players…
              </div>
            ) : opponents.map((player, i) => (
              <div
                key={player.id}
                style={{ borderBottom: i < opponents.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
              >
                <F35OpponentRow
                  player={player}
                  seatIndex={i + 1}
                  isActive={player.id === state.activePlayerId}
                  isShowdown={isShowdown}
                  revealed={revealedSet.has(player.id)}
                  phase={state.phase}
                  lastAction={actionLabels[player.id]}
                />
              </div>
            ))}
          </div>

          {/* Spectator note */}
          {isSpectator && (
            <div className="flex justify-center mt-3">
              <span style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(0,200,150,0.45)', background: 'rgba(0,200,150,0.05)', border: '1px solid rgba(0,200,150,0.12)', borderRadius: 4, padding: '3px 10px' }}>
                Spectating
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Fixed bottom: hero + actions ──────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 flex flex-col"
        style={{
          background: 'linear-gradient(to top, #080809 88%, rgba(8,8,9,0) 100%)',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        }}
      >
        {/* Hero strip */}
        {me && (
          <F35HeroStrip
            player={me}
            isShowdown={isShowdown}
            phase={state.phase}
          />
        )}

        {/* Action zone */}
        {!isSpectator && (
          <div className="px-3 pt-1 pb-1">
            <F35ActionZone
              phase={state.phase}
              chips={me?.chips ?? 0}
              myBet={me?.bet ?? 0}
              currentBet={state.currentBet}
              pot={state.pot}
              onAction={handleControlAction}
              isMyTurn={state.activePlayerId === myId || state.phase === 'WAITING'}
              myDeclaration={me?.declaration ?? null}
              turnDeadline={state.turnDeadline}
              locked={actionLocked}
              openSeatsCount={openSeats}
              humanCount={humanCount}
            />
          </div>
        )}
      </div>

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      <ResolutionOverlay
        messages={state.messages}
        phase={state.phase}
        heroPlayer={state.players.find(p => p.id === myId)}
        heroChipChange={state.heroChipChange}
      />

      {showCelebration && (
        <WinCelebration isScoop={false} onDone={() => setShowCelebration(false)} />
      )}

      {xpToast && xpToast.xpGained > 0 && (
        <XPToast
          key={xpToast.id}
          xpGained={xpToast.xpGained}
          leveledUp={xpToast.leveledUp}
          newLevel={xpToast.newLevel}
          newAchievementName={xpToast.achievementName}
          onDone={dismissXP}
        />
      )}

      <BustOutModal
        open={showBustModal}
        lifetimeBusts={lifetimeBusts}
        sessionBusts={sessionBusts}
        hasNeverPurchased={hasNeverPurchased}
        onRebuy={() => { handleAction('rebuy'); setBustDismissed(true); }}
        onSpectate={() => setBustDismissed(true)}
        onLeaveTable={() => { if (me) saveChips('fifteen35', me.chips); navigate('/'); }}
        onClaimDailyBonus={() => { setBustDismissed(true); navigate('/'); }}
        onWatchAd={undefined}
        onStarterPack={undefined}
      />

      <ChatBox
        messages={state.chatMessages}
        myId={myId}
        onSendMessage={(text) => handleAction('chat', text)}
        open={chatOpen}
        onOpenChange={setChatOpen}
      />
    </div>
  );
}
