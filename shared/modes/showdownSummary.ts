// ─── Structured showdown summary (Detroit 2026-10-22) ──────────────────────
// Built by each generic mode's resolveShowdown DIRECTLY from its own
// settlement result — never inferred client-side from animation state
// or feed text. The generic engine stores it on the game state for
// the SHOWDOWN phase only; settlement clears it when the next hand
// begins. Contains no card data: clients join playerIds against the
// same snapshot's (already privacy-masked) player cards.

export interface ShowdownAward {
  playerId: string;
  amount: number;
  /** FU: 'POT' | 'SPLIT' | 'SOLE'. BC: 'HIGH' | 'LOW' | 'SWING' | 'SOLE'. */
  part: string;
  /** Exact reason this award was made, in the mode's approved terms. */
  reason: string;
}

export interface ShowdownEntry {
  playerId: string;
  /** The evaluator's own classification text for this revealed hand. */
  description: string;
  /** Box Chevy only: whether the 10-card hand was made. */
  made?: boolean;
}

export interface ShowdownDeclaration {
  playerId: string;
  /** HIGH | LOW | SWING | FOLD | null (never declared). */
  declaration: string | null;
  /** Human outcome: 'declared' | 'auto-folded (no made hand)' |
   *  'timed out — folded' | 'folded before declare' | 'last one standing'. */
  outcome: string;
}

export interface ShowdownSummary {
  handId: number;
  modeId: string;
  headline: string;
  awards: ShowdownAward[];
  /** Every eligible (non-folded) player's revealed-hand evaluation. */
  entries: ShowdownEntry[];
  /** Decisive ranking comparisons, winner-first, in approved order. */
  comparisons: string[];
  /** Box Chevy only: who declared what at DECLARE, and what became of them. */
  declarations?: ShowdownDeclaration[];
  /** Chips carried to the next hand (0 when the pot fully awarded). */
  rollover: number;
}
