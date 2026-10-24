/**
 * Box Chevy flight planning (Detroit 2026-10-24, final polish).
 *
 * Pure planners extracted from BoxChevyTable so the animation rules
 * are unit-testable. Same proven pattern as the Badugi/Flushed Up
 * drawSeq migrations (Oct 20–21):
 *
 * DRAWS — keyed on the server's per-hand monotonic drawSeq, never on
 * phase or lastDrawCount. A draw animates exactly once: when a seat's
 * drawSeq increments past the per-hand baseline. Phase transitions,
 * snapshot refreshes, and (re)hydration never produce a plan — the
 * baseline is (re)seeded silently. Hero replacement slots come from
 * the client's own draw transaction (the exact indices it submitted,
 * bound to the resulting drawSeq) — Safeguard C: no card-value diffs.
 * Opponents' cards are masked, so their plans are count-only.
 *
 * CHIPS — flights only for genuine positive contributions (Safeguard
 * B): the snapshot must not be a hydration snapshot (actual connection
 * lifecycle state — the hook's init epoch — decides that, never a
 * timing gap), the phase must be ANTE or a BET phase, and a genuine
 * contribution never coincides with a phase change in one snapshot
 * (phase advances arrive in their own broadcast, bets reset).
 */

export interface DrawSeatState {
  id: string;
  drawSeq?: number;
  lastDrawCount?: number;
}

/** The hero's own draw transaction: the indices the client submitted,
 *  bound to the drawSeq the accepted draw produces. */
export interface HeroDrawTx {
  seq: number;
  indices: number[];
}

export interface DrawFlightPlan {
  playerId: string;
  count: number;
  /** Exact replacement slots for the hero (from the client tx);
   *  null = count-based staging (opponents, or a hero draw with no
   *  recorded tx — never slot-staged). */
  slots: number[] | null;
}

export function planDrawFlights(
  baseline: ReadonlyMap<string, number>,
  players: DrawSeatState[],
  heroId: string,
  heroTx: HeroDrawTx | null,
): { plans: DrawFlightPlan[]; baseline: Map<string, number> } {
  const next = new Map(baseline);
  const plans: DrawFlightPlan[] = [];
  for (const p of players) {
    const seq = p.drawSeq ?? 0;
    const prev = baseline.get(p.id);
    next.set(p.id, seq);
    if (prev === undefined) continue; // first sight: seed silently
    if (seq <= prev) continue; // no new draw (incl. per-hand reset)
    const count = p.lastDrawCount ?? 0;
    if (count <= 0) continue; // stand-pat: seq consumed, nothing flies
    plans.push({
      playerId: p.id,
      count,
      slots: p.id === heroId && heroTx && heroTx.seq === seq ? [...heroTx.indices] : null,
    });
  }
  return { plans, baseline: next };
}

/** Seed a baseline from a snapshot without planning anything
 *  (mount, reconnect hydration, new hand). */
export function seedDrawBaseline(players: DrawSeatState[]): Map<string, number> {
  return new Map(players.map(p => [p.id, p.drawSeq ?? 0]));
}

export interface ChipSnapshot {
  phase: string;
  bets: ReadonlyMap<string, number>;
}

export interface ChipFlightPlan {
  playerId: string;
  amount: number;
}

export function planChipFlights(
  prev: ChipSnapshot | null,
  curr: ChipSnapshot,
  hydration: boolean,
): ChipFlightPlan[] {
  if (!prev || hydration) return [];
  if (curr.phase !== 'ANTE' && !curr.phase.startsWith('BET')) return [];
  const plans: ChipFlightPlan[] = [];
  for (const [id, bet] of curr.bets) {
    const delta = bet - (prev.bets.get(id) ?? 0);
    if (delta <= 0) continue;
    // A genuine contribution never changes the phase in the same
    // snapshot (advances broadcast separately, bets reset to 0).
    // ANTE entry is exempt: antes ARE the phase's contributions.
    if (curr.phase !== 'ANTE' && curr.phase !== prev.phase) continue;
    plans.push({ playerId: id, amount: delta });
  }
  return plans;
}
