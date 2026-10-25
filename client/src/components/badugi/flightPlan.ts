/**
 * flightPlan — pure draw-transaction detection for the BadugiTable flight
 * system (Detroit 2026-10-20, Bug 1/2 fix).
 *
 * Animations must be keyed to confirmed server TRANSACTIONS, never to the
 * shape of a state snapshot. The server stamps every accepted draw action
 * (human or bot, including stand-pat) with a per-hand monotonic `drawSeq`.
 * A draw animation is planned exactly when a player's drawSeq increments —
 * and never for any other reason:
 *
 * - phase transitions (the old `${phase}:${lastDrawCount}` key replayed the
 *   same draw on every phase change, because lastDrawCount persists),
 * - turn-timer updates, betting updates, or any other snapshot,
 * - duplicate / repeated snapshots of the same state,
 * - reconnect baselines (state that predates this client is recorded as
 *   already-seen, never animated).
 */

export interface DrawTxPlayer {
  id: string;
  drawSeq?: number;
  lastDrawCount?: number;
}

export interface DrawTx {
  playerId: string;
  /** Cards discarded in this transaction (0 = stand-pat: recorded, no flights). */
  count: number;
  seq: number;
}

/** Seq map of everything already seen/animated — the reconnect baseline. */
export function baselineSeqs(players: DrawTxPlayer[]): Map<string, number> {
  return new Map(players.map(p => [p.id, p.drawSeq ?? 0]));
}

/**
 * Compare the already-animated seq map against a fresh snapshot.
 * Returns the NEW transactions (seq increments for known players) and the
 * updated map. Players absent from the map are baselined silently — a seat
 * filled mid-hand never replays draws that happened before it was watched.
 */
export function detectDrawTransactions(
  animated: ReadonlyMap<string, number>,
  players: DrawTxPlayer[],
): { transactions: DrawTx[]; seqs: Map<string, number> } {
  const seqs = new Map(animated);
  const transactions: DrawTx[] = [];
  for (const p of players) {
    const seq = p.drawSeq ?? 0;
    if (!seqs.has(p.id)) {
      seqs.set(p.id, seq);
      continue;
    }
    const prev = seqs.get(p.id)!;
    if (seq > prev) {
      transactions.push({ playerId: p.id, count: p.lastDrawCount ?? 0, seq });
      seqs.set(p.id, seq);
    }
  }
  return { transactions, seqs };
}

/**
 * Declaration visibility (Detroit 2026-10-21, Phase 1 / P1): a HIGH/LOW
 * badge is shown ONLY for a server-authoritative declaration already
 * present in game state. The server sets `declaration` on the player
 * record when the declaration is accepted (and the table announces it),
 * so a badge can never leak a hidden declaration or be inferred from
 * cards. 'FOLD', null, and anything else render no badge.
 */
export function declarationBadge(declaration: string | null | undefined): 'HIGH' | 'LOW' | null {
  return declaration === 'HIGH' || declaration === 'LOW' ? declaration : null;
}

export interface CardIdentity {
  rank: string;
  suit: string;
}

/**
 * Indices whose card identity changed between two hands. The server
 * replaces cards in place at the discarded indices, so the diff of the
 * pre/post hands is exactly the set of replaced slots — the slots the
 * client must stage (hide until their replacement flight lands). Kept
 * slots never appear in the result, so kept cards are never disturbed.
 */
export function replacedIndices(prev: CardIdentity[], curr: CardIdentity[]): number[] {
  const out: number[] = [];
  const n = Math.max(prev.length, curr.length);
  for (let i = 0; i < n; i++) {
    const a = prev[i];
    const b = curr[i];
    if (!a || !b || a.rank !== b.rank || a.suit !== b.suit) out.push(i);
  }
  return out;
}
