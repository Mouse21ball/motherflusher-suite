import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

// Detroit 2026-10-24 (final polish repairs): source pins for the three
// safeguards — settlement readiness (A), lifecycle-based coin flights
// (B), and authoritative hero discard slots (C). The behaviors are
// unit-tested in celebrationPlan.test.ts / bcFlightPlan.test.ts; these
// pins keep the table wired to them.
const read = (p: string) => readFileSync(p, 'utf8');
const bcTable = read('client/src/components/boxChevy/BoxChevyTable.tsx');

describe('final polish repairs — Box Chevy table wiring', () => {
  it('A: celebration is armed at entry and gated on settlement readiness — no branch from the entry snapshot', () => {
    expect(bcTable).toContain('pendingCelebRef');
    expect(bcTable).toContain('settlementReady(liveState as any, pend.handId)');
    expect(bcTable).toContain('celebrationFromSummary(sum, st.players, st.communityCards ?? [])');
    // The defective shape is gone: no winners/rollover branch chosen
    // from the SHOWDOWN entry snapshot, no unconditional audit built
    // alongside winners.
    expect(bcTable).not.toContain('const audit: CelebrationAudit = { rollover: sum.rollover }');
    expect(bcTable).not.toContain("hi = infoFor(a, 'HIGH')");
  });

  it('B: chip flights come from the lifecycle-aware planner; hydration snapshots schedule no flights', () => {
    expect(bcTable).toContain('planChipFlights(');
    expect(bcTable).toContain('epochPropRef.current !== epochSeenRef.current');
    expect(bcTable).toContain('if (prev && !hydration) {');
    const hook = read('client/src/lib/poker/engine/useServerMode.ts');
    expect(hook).toContain('initCount');
    expect(hook).toContain('setInitCount(c => c + 1)');
    const page = read('client/src/pages/BoxChevyGame.tsx');
    expect(page).toContain('hydrationEpoch={initCount}');
  });

  it('B: muck flights render as cards, never coins', () => {
    expect(bcTable).toContain("flight.kind === 'card' || flight.kind === 'muck'");
    expect(bcTable).toContain('isCardVisual');
  });

  it('C: draws are planned from drawSeq with the hero transaction; the phase:lastDrawCount key is dead', () => {
    expect(bcTable).toContain('planDrawFlights(');
    expect(bcTable).toContain('seedDrawBaseline(');
    expect(bcTable).toContain('heroDrawHidden');
    expect(bcTable).not.toContain("${liveState.phase}:${(p as any).lastDrawCount ?? 'x'}");
    const page = read('client/src/pages/BoxChevyGame.tsx');
    expect(page).toContain('heroDrawTx={heroDrawTx}');
    expect(page).toContain('recordDrawTx(indices)');
  });
});
