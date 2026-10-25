/**
 * Shared interactive tutorial framework types (Detroit 2026-10-21,
 * Phase 2). One framework, four game specs. Every spec is a SAFE
 * SIMULATION: scripted cards only — no server actions, no chips,
 * no live gameplay state is ever touched.
 *
 * Rule truth comes from the engines: example hands in the specs are
 * labeled by the real evaluators (shared/modes/*) and pinned by
 * tests/tutorialSpecs.test.ts, so a tutorial can never drift from
 * the game it teaches.
 */

export type TutSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export interface TutCard {
  rank: string;
  suit: TutSuit;
}

export interface TutAction {
  label: string;
  kind: 'gold' | 'neutral' | 'danger' | 'sky' | 'suit-red' | 'suit-dark';
  /** Shown after the player taps the button. */
  response: string;
  /** When set, a correct tap is acknowledged in the feedback. */
  correct?: boolean;
}

export interface TutStep {
  id: string;
  /** Phase chip, e.g. 'THE GOAL', 'DRAW 1 OF 3', 'DECLARE'. */
  phase: string;
  title: string;
  body: string;
  /** Hero hand for this step (falls back to the previous step's hand). */
  heroCards?: TutCard[];
  heroLabel?: string;
  /** Board cards (Box Chevy community cards; Lady Luck flip track). */
  boardCards?: TutCard[];
  boardLabel?: string;
  /** A second hand shown for comparison (valid/invalid, win/lose). */
  rivalCards?: TutCard[];
  rivalLabel?: string;
  rivalNote?: string;
  verdict?: string;
  verdictKind?: 'win' | 'lose' | 'info';
  /**
   * Interactive draw: hero cards become tappable; up to `max` may be
   * selected, then the draw button swaps them for `replacements`
   * (applied in selection order). Zero selected = stand pat.
   */
  draw?: { max: number; replacements: TutCard[]; buttonLabel: string; afterText: string };
  /** Simulated action buttons with per-button teaching feedback. */
  actions?: TutAction[];
  /** Small-print real-rule note under the stage. */
  note?: string;
}

export interface TutorialSpec {
  modeId: 'badugi' | 'flushedup' | 'box_chevy' | 'ladyluck';
  name: string;
  color: string;
  /** Which face design the real game renders (Badugi: premium). */
  cardVariant: 'premium' | 'classic';
  tagline: string;
  steps: TutStep[];
}
