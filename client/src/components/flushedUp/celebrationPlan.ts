/**
 * Flushed Up celebration planning (Detroit 2026-10-25).
 *
 * Pure mapping from the server's authoritative settlement to the
 * celebration the table renders. Extracted from FlushedUpTable after
 * Detroit's Galaxy report: showdowns revealed the hands but never
 * celebrated — no winner, no payout, no flush.
 *
 * Root cause this module exists to prevent: the old table gated the
 * celebration on `isWinner` flags read from the SHOWDOWN *entry*
 * snapshot. The generic engine broadcasts the phase first and settles
 * ~650ms later, so that entry snapshot is winnerless by design and
 * the celebration was simply never scheduled. (The "server summary
 * first" branch behind it was also dead: it read the summary off a
 * ref that never carried it.) The Box Chevy repair of 2026-10-24
 * established the correct pattern — wait for authoritative settled
 * data for THIS hand — and this module applies it to Flushed Up.
 *
 * Hard rules:
 *  - Readiness = the handId-matching server summary (mode
 *    'flushed_up') OR settled winner flags on the snapshot itself
 *    (fold-win path, which carries no summary). A winnerless entry
 *    snapshot is NOT readiness.
 *  - Winner name(s), exact payout, and the flush label come from
 *    the settlement — never re-derived at entry time.
 *  - Split pots name ALL winners (existing Detroit 2026-10-15 rule).
 *  - Folded players' cards are never read: only award winners' and
 *    summary entries' cards (already privacy-masked) are used.
 */
import type { ShowdownSummary } from '@shared/modes/showdownSummary';
import { evaluateFlushedUpHand } from '@shared/modes/flushedUp';
import type { CardType } from '@shared/gameTypes';

export interface FUCelebration {
  winnerName: string;
  amount: number;
  /** The winning hand's five cards, shown WITH the celebration. */
  cards: { rank: string; suit: string }[];
  /** What the winner had — the settlement's reason / evaluator text
   *  (e.g. "Flush ♥A-K-9-5-2"). */
  handLabel: string;
  /** Decisive comparison text from the summary (sole-winner case). */
  comparison: string;
  /** Other eligible revealed hands from the summary (audit rows). */
  others: { name: string; cards: { rank: string; suit: string }[]; description: string }[];
}

export interface FUPlayer {
  id: string;
  name: string;
  cards?: { rank: string; suit: string }[];
  isWinner?: boolean;
}

interface FUSettleState {
  showdownSummary?: ShowdownSummary | null;
  players: FUPlayer[];
}

/** Settlement readiness for a hand: authoritative settled data for
 *  THIS hand exists. See the header — entry snapshots don't count. */
export function fuSettlementReady(state: FUSettleState, handId: number | undefined): boolean {
  if (summaryForHand(state, handId)) return true;
  return state.players.some(p => p.isWinner);
}

export function summaryForHand(state: FUSettleState, handId: number | undefined): ShowdownSummary | null {
  const sum = state.showdownSummary;
  return sum && handId !== undefined && sum.handId === handId && sum.modeId === 'flushed_up' ? sum : null;
}

/** The first winner's id from settled data (summary award first,
 *  then a settled winner flag), or null while unsettled. Used for
 *  the rake flight's destination seat. */
export function firstWinnerId(state: FUSettleState, handId: number | undefined): string | null {
  const sum = summaryForHand(state, handId);
  if (sum && sum.awards.length > 0) return sum.awards[0].playerId;
  return state.players.find(p => p.isWinner)?.id ?? null;
}

/** Relative seat index of a player (hero = 0, opponents 1.. in state
 *  order) — the same ordering the table renders pods in. */
export function seatIndexOf(players: FUPlayer[], myId: string, playerId: string): number {
  if (playerId === myId) return 0;
  const others = players.filter(p => p.id !== myId);
  const idx = others.findIndex(p => p.id === playerId);
  return idx >= 0 ? idx + 1 : 0;
}

/** Celebration from the server summary — the authoritative path.
 *  Mirrors the semantics the table's (previously unreachable) inline
 *  summary branch implemented: sole winner takes the award's reason
 *  as the label and the first comparison as the comparison; a split
 *  names every winner and takes the first comparison as the label. */
export function celebrationFromSummary(sum: ShowdownSummary, players: FUPlayer[]): FUCelebration | null {
  if (sum.awards.length === 0) return null;
  const byId = new Map(players.map(p => [p.id, p]));
  const first = sum.awards[0];
  const firstPlayer = byId.get(first.playerId);
  const cards = (firstPlayer?.cards ?? []).map(c => ({ rank: c.rank, suit: c.suit }));
  const split = sum.awards.length > 1;
  const winnerName = split
    ? `SPLIT — ${sum.awards.map(a => byId.get(a.playerId)?.name ?? a.playerId).join(' & ')}`
    : (firstPlayer?.name ?? first.playerId);
  const amount = sum.awards.reduce((s, a) => s + a.amount, 0);
  const handLabel = split ? (sum.comparisons[0] ?? '') : first.reason;
  const comparison = split ? '' : (sum.comparisons[0] ?? '');
  const others = sum.entries
    .filter(e => e.playerId !== first.playerId)
    .map(e => ({
      name: byId.get(e.playerId)?.name ?? e.playerId,
      cards: (byId.get(e.playerId)?.cards ?? []).map(c => ({ rank: c.rank, suit: c.suit })),
      description: e.description,
    }));
  return { winnerName, amount, cards, handLabel, comparison, others };
}

/** Fallback for settlements that carry NO summary (fold-win direct
 *  awards): build from the SETTLED snapshot's winner flags — read at
 *  build time, never from the showdown entry snapshot. The hand
 *  label is the evaluator's own description of the winning hand. */
export function celebrationFromWinners(players: FUPlayer[], pot: number): FUCelebration | null {
  const winners = players.filter(p => p.isWinner);
  if (winners.length === 0) return null;
  const winner = winners[0];
  const cards = (winner.cards ?? []).map(c => ({ rank: c.rank, suit: c.suit }));
  let handLabel = '';
  try {
    handLabel = evaluateFlushedUpHand(cards as CardType[])?.description ?? '';
  } catch { /* evaluation failed — celebrate with cards, no label */ }
  const winnerName = winners.length > 1
    ? `SPLIT — ${winners.map(w => w.name).join(' & ')}`
    : winner.name;
  return { winnerName, amount: pot, cards, handLabel, comparison: '', others: [] };
}
