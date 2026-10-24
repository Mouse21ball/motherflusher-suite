// Coordinated correction plan pins (Detroit 2026-10-22): Flushed Up +
// Box Chevy converge on the approved Badugi experience. Badugi itself
// and the shared BettingControls component are FROZEN — these pins
// assert adoption-by-use, never modification.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const fuTable = readFileSync('client/src/components/flushedUp/FlushedUpTable.tsx', 'utf8');
const fuBar = readFileSync('client/src/components/flushedUp/FlushedUpActionBar.tsx', 'utf8');
const fuPage = readFileSync('client/src/pages/FlushedUpGame.tsx', 'utf8');
const bcTable = readFileSync('client/src/components/boxChevy/BoxChevyTable.tsx', 'utf8');
// 2026-10-24: seatPosition moved verbatim into dealerOrigin.ts (dealer
// flight origins); the geometry literals are pinned there now.
const bcSeats = readFileSync('client/src/components/boxChevy/dealerOrigin.ts', 'utf8');
const bcBar = readFileSync('client/src/components/boxChevy/BoxChevyActionBar.tsx', 'utf8');
const bcPage = readFileSync('client/src/pages/BoxChevyGame.tsx', 'utf8');
const bcEngine = readFileSync('server/boxChevyEngine.ts', 'utf8');
const gift = readFileSync('client/src/components/game/PersonalChipGiftPanel.tsx', 'utf8');
const bettingControls = readFileSync('client/src/components/game/BettingControls.tsx', 'utf8');

describe('Flushed Up — Badugi experience convergence', () => {
  it('pot sits at Badugi latitude (50,42); no 52% pot remnants', () => {
    expect(fuTable).toContain('const POT_POS = { x: 50, y: 42 }');
    expect(fuTable).toContain('top-[42%]');
    expect(fuTable).not.toContain('top-[52%]');
  });

  it('per-pod server-deadline timer bars (hero included)', () => {
    expect(fuTable).toContain('turnDeadline: (liveState as any).turnDeadline ?? null');
    expect(fuTable).toContain("import { serverNowMs } from '@/lib/clockSync'");
    expect(fuTable).toContain('state.turnDeadline - serverNowMs()');
    expect(fuTable).toContain('timerBar(true)');
    expect(fuTable).toContain('timerBar(false)');
  });

  it('raise selection is the shared BettingControls, used as-is', () => {
    expect(fuBar).toContain("import { BettingControls } from '@/components/game/BettingControls'");
    expect(fuBar).toContain('<BettingControls');
    expect(fuBar).toContain('minBet={minBet}');
    expect(fuPage).toContain('minBet={state.minBet ?? 50}');
  });

  it('the old fixed raise (2x call sent as raise-by) is gone', () => {
    expect(fuBar).not.toContain('callAmount * 2');
    expect(fuBar).not.toContain('raiseAmount');
  });

  it('BettingControls retains its approved interface (frozen)', () => {
    expect(bettingControls).toContain('data-testid="input-raise-slider"');
    expect(bettingControls).toContain('getBetSizePresets');
    expect(bettingControls).toContain('canRaiseTo');
  });
});

describe('Box Chevy — DECLARE honesty + qualification comms', () => {
  it('engine stamps the auto-fold reason like Badugi does', () => {
    expect(bcEngine).toContain("autoFoldedAtDeclare: true, foldReason: 'declare-auto-invalid'");
  });

  it('action bar branches on authoritative state, declaration first', () => {
    const declaredAt = bcBar.indexOf("declaration === 'HIGH' || declaration === 'LOW' || declaration === 'SWING'");
    const foldedAt = bcBar.indexOf("heroStatus === 'folded'");
    const buttonsAt = bcBar.indexOf('button-declare-high');
    expect(declaredAt).toBeGreaterThan(-1);
    expect(foldedAt).toBeGreaterThan(declaredAt);
    expect(buttonsAt).toBeGreaterThan(foldedAt);
    expect(bcBar).toContain('AUTO-FOLDED — NO MADE HAND');
    expect(bcBar).toContain('TIMED OUT — FOLDED');
    expect(bcBar).toContain('data-testid="box-chevy-declare-folded"');
    expect(bcPage).toContain('heroStatus={me?.status');
    expect(bcPage).toContain('heroFoldReason={me?.foldReason');
  });

  it('pod plates distinguish the auto-fold from a voluntary fold', () => {
    expect(bcTable).toContain("p.foldReason === 'declare-auto-invalid' ? 'NO MADE HAND' : 'FOLD'");
    expect(bcTable).toContain('foldReason: (p as any).foldReason ?? null');
  });

  it('the in-table validity badge exists and uses the shared evaluator', () => {
    expect(bcTable).toContain('data-testid="box-chevy-validity-badge"');
    expect(bcTable).toContain("getHeroHandValidity('boxchevy', liveState.phase");
    // Stabilization (Detroit 2026-10-22): the in-table badge renders
    // the compact label only — the detail span was removed.
    expect(bcTable).toContain('validity.label');
    expect(bcTable).not.toContain('{validity.detail}');
  });
});

describe('Box Chevy — center-aware layout', () => {
  it('seat map: top pair + mid pair above the band, hero at 80', () => {
    expect(bcSeats).toContain("if (index === 0) return { x: 50, y: 80 }");
    expect(bcSeats).toContain('{ x: 27, y: 10.5 }');
    expect(bcSeats).toContain('{ x: 73, y: 10.5 }');
    expect(bcSeats).toContain('{ x: 18.5, y: 30.5 }');
    expect(bcSeats).toContain('{ x: 81.5, y: 30.5 }');
    // The table consumes the shared map — no private copy drifts back.
    expect(bcTable).toContain("from './dealerOrigin'");
  });

  it('community band is one reserved block with mini cards + pot pill', () => {
    expect(bcTable).toContain('top-[50.5%]');
    expect(bcTable).toContain('!w-[32px] !h-[44px]');
    expect(bcTable).toContain('POT ${state.pot.toLocaleString()}');
    // The community row itself is mini; the only remaining 44x62 cards
    // are the celebration overlay's winner hands (not table geometry).
    expect(bcTable).toContain('<PlayingCard card={card} className="!w-[32px] !h-[44px]" />');
  });

  it('per-pod server-deadline timer bars (hero included)', () => {
    expect(bcTable).toContain('turnDeadline: (liveState as any).turnDeadline ?? null');
    expect(bcTable).toContain('state.turnDeadline - serverNowMs()');
    expect(bcTable).toContain('timerBar(true)');
    expect(bcTable).toContain('timerBar(false)');
  });

  it('opponent hole cards are in-pod tiles, no full-size fans', () => {
    expect(bcTable).toContain('marginLeft: ci > 0 ? -6 : 0');
    expect(bcTable).not.toContain('rotateX(18deg)');
  });
});

describe('Gift panel — no fixed overlay on game pages', () => {
  it('panel supports an in-flow variant', () => {
    expect(gift).toContain('inline?: boolean');
    expect(gift).toContain("'relative max-w-[calc(100vw-24px)]");
  });

  it('FU and BC pages host it inline', () => {
    expect(fuPage).toContain('<PersonalChipGiftPanel inline');
    expect(bcPage).toContain('<PersonalChipGiftPanel inline');
  });
});
