import { describe, expect, it } from 'vitest';
import { planDrawFlights, seedDrawBaseline, planChipFlights } from '../client/src/components/boxChevy/flightPlan';

// Detroit 2026-10-24 (final polish, Safeguards B + C): every accepted
// draw produces at most one replacement sequence; unselected hero
// cards never animate; a reconnect cannot replay bets as coin
// flights; a slow snapshot does not suppress a genuine new bet.
const P = (id: string, drawSeq: number, lastDrawCount = 0) => ({ id, drawSeq, lastDrawCount });

describe('planDrawFlights', () => {
  it('first sight seeds the baseline silently (mount / reconnect hydration)', () => {
    const { plans, baseline } = planDrawFlights(new Map(), [P('a', 2, 2), P('me', 1, 3)], 'me', null);
    expect(plans).toEqual([]);
    expect(baseline.get('a')).toBe(2);
  });

  it('a drawSeq increment plans exactly one sequence; phase changes with the same seq plan nothing', () => {
    let base = seedDrawBaseline([P('a', 0), P('me', 0)]);
    // DRAW_1: bot a draws 2.
    let r = planDrawFlights(base, [P('a', 1, 2), P('me', 0)], 'me', null);
    expect(r.plans).toEqual([{ playerId: 'a', count: 2, slots: null }]);
    base = r.baseline;
    // BET_1, DRAW_2, DECLARE snapshots repeat lastDrawCount=2 with seq still 1 — the
    // old `${phase}:${lastDrawCount}` key re-fired on every one of these.
    for (let i = 0; i < 3; i++) {
      r = planDrawFlights(base, [P('a', 1, 2), P('me', 0)], 'me', null);
      expect(r.plans).toEqual([]);
      base = r.baseline;
    }
    // DRAW_2: a draws 1 → exactly one more plan.
    r = planDrawFlights(base, [P('a', 2, 1), P('me', 0)], 'me', null);
    expect(r.plans).toEqual([{ playerId: 'a', count: 1, slots: null }]);
  });

  it('hero slots come from the client draw transaction bound to the resulting drawSeq', () => {
    const base = seedDrawBaseline([P('me', 1, 3)]);
    const tx = { seq: 2, indices: [0, 3] };
    const r = planDrawFlights(base, [P('me', 2, 2)], 'me', tx);
    expect(r.plans).toEqual([{ playerId: 'me', count: 2, slots: [0, 3] }]);
    // The same tx never matches a later seq — no replay.
    const r2 = planDrawFlights(r.baseline, [P('me', 3, 1)], 'me', tx);
    expect(r2.plans).toEqual([{ playerId: 'me', count: 1, slots: null }]);
  });

  it('stand-pat consumes the seq and flies nothing', () => {
    const base = seedDrawBaseline([P('a', 0)]);
    const r = planDrawFlights(base, [P('a', 1, 0)], 'me', null);
    expect(r.plans).toEqual([]);
    // …and the stand-pat seq is not re-planned by later snapshots.
    const r2 = planDrawFlights(r.baseline, [P('a', 1, 0)], 'me', null);
    expect(r2.plans).toEqual([]);
  });

  it('a per-hand seq reset (new hand) plans nothing and reseeds', () => {
    const base = seedDrawBaseline([P('a', 3, 1)]);
    const r = planDrawFlights(base, [P('a', 0, 0)], 'me', null);
    expect(r.plans).toEqual([]);
    expect(r.baseline.get('a')).toBe(0);
  });

  it('ten-hand soak: exactly one plan per accepted draw, none per phase change', () => {
    let base = seedDrawBaseline([P('a', 0), P('b', 0)]);
    let plans = 0; let draws = 0;
    for (let hand = 0; hand < 10; hand++) {
      // New-hand reseed (server resets seqs at settle).
      base = seedDrawBaseline([P('a', 0), P('b', 0)]);
      for (let round = 1; round <= 3; round++) {
        const r = planDrawFlights(base, [P('a', round, 3 - round + 1), P('b', round, 1)], 'me', null);
        plans += r.plans.length; draws += 2; base = r.baseline;
        // Interleaved phase-transition snapshots (BET phases) — no plans allowed.
        const t = planDrawFlights(base, [P('a', round, 3 - round + 1), P('b', round, 1)], 'me', null);
        expect(t.plans).toEqual([]);
        base = t.baseline;
      }
    }
    expect(plans).toBe(draws);
    expect(draws).toBe(60);
  });
});

describe('planChipFlights (Safeguard B: lifecycle, not timing)', () => {
  const snap = (phase: string, bets: Record<string, number>) => ({ phase, bets: new Map(Object.entries(bets)) });
  it('a genuine call in the same phase flies once, however slow the snapshot', () => {
    const plans = planChipFlights(snap('BET_1', { a: 0, me: 50 }), snap('BET_1', { a: 0, me: 150 }), false);
    expect(plans).toEqual([{ playerId: 'me', amount: 100 }]);
  });
  it('a reconnect hydration snapshot never replays earlier bets as flights', () => {
    // Same values as the genuine-bet test — the ONLY difference is the
    // lifecycle flag (new init epoch). Timing is never consulted.
    const plans = planChipFlights(snap('BET_1', { a: 0, me: 50 }), snap('BET_1', { a: 0, me: 150 }), true);
    expect(plans).toEqual([]);
  });
  it('no flights outside ANTE/BET phases (draw, declare, showdown, waiting)', () => {
    for (const ph of ['DRAW_1', 'DECLARE', 'SHOWDOWN', 'WAITING']) {
      expect(planChipFlights(snap(ph, { a: 100 }), snap(ph, { a: 200 }), false)).toEqual([]);
    }
  });
  it('no flight when the phase changed in the same snapshot (advance/reset edge)', () => {
    expect(planChipFlights(snap('BET_1', { a: 0 }), snap('BET_2', { a: 200 }), false)).toEqual([]);
  });
  it('antes fly (phase entry exempt), checks/folds (no positive delta) do not', () => {
    expect(planChipFlights(snap('WAITING', { a: 0 }), snap('ANTE', { a: 25 }), false))
      .toEqual([{ playerId: 'a', amount: 25 }]);
    expect(planChipFlights(snap('ANTE', { a: 25 }), snap('ANTE', { a: 25 }), false)).toEqual([]);
    expect(planChipFlights(snap('BET_1', { a: 100 }), snap('BET_1', { a: 100 }), false)).toEqual([]);
  });
  it('first snapshot (no prev) flies nothing', () => {
    expect(planChipFlights(null, snap('BET_1', { a: 100 }), false)).toEqual([]);
  });
});
