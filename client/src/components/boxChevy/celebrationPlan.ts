/**
 * Box Chevy celebration planning (Detroit 2026-10-24, final polish).
 *
 * Pure mapping from the server's authoritative showdown summary to the
 * celebration the table renders. Extracted from BoxChevyTable so the
 * split/tie/SWING/rollover rules are unit-testable.
 *
 * Hard rules (Detroit):
 *  - A HIGH/LOW split yields BOTH winner blocks (never one, never none).
 *  - Tied winners for the same part are preserved (names joined; exact
 *    per-winner payouts kept — equal ties show the shared amount,
 *    unequal ties spell out each winner's amount).
 *  - NO WINNER is produced ONLY when the settlement has zero awards
 *    AND a positive rollover. A settled winning hand can never render
 *    "NO WINNER — $0 ROLLS OVER".
 *  - Folded players' cards are never read: only award winners' hole
 *    cards (already privacy-masked in the snapshot) are used.
 */
import type { ShowdownSummary } from '@shared/modes/showdownSummary';

export interface WinnerInfo {
  name: string;
  amount: number;
  cards: { rank: string; suit: string }[];
  handLabel: string;
  side: 'HIGH' | 'LOW' | 'SWING' | 'SOLE' | 'BOTH';
  /** Authoritative payout from the server's showdown summary. */
  exactAmount?: number;
  /** Set when tied winners received different amounts: the exact
   *  per-winner payouts, spelled out (rendered instead of a single
   *  amount). */
  amountText?: string;
  /** The settlement's own reason text for this award. */
  reason?: string;
  /** The qualifying TEN cards — five hole + five community — in the
   *  winning side's approved comparison order (HIGH ascending, LOW
   *  descending; SWING/BOTH carry both rows). Community cards are
   *  flagged so the two sources stay distinguishable. */
  tenRows?: { label?: string; cards: { rank: string; suit: string; community: boolean }[] }[];
}

export interface CelebrationAudit {
  /** Server-authoritative rollover amount for a no-winner hand. */
  rollover: number;
}

export interface CelebrationBuild {
  highWinner: WinnerInfo | null;
  lowWinner: WinnerInfo | null;
  soleWinner: WinnerInfo | null;
  audit: CelebrationAudit | null;
}

export interface CelebrationPlayer {
  id: string;
  name: string;
  cards?: { rank: string; suit: string }[];
  isWinner?: boolean;
}

/** Box Chevy rank values for presentation ordering (Ace = 1, King = 13). */
export const BC_RANK_VALUE: Record<string, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

export function orderedTen(
  hole: { rank: string; suit: string }[],
  comm: { rank: string; suit: string }[],
  dir: 'asc' | 'desc',
): { rank: string; suit: string; community: boolean }[] {
  const all = [
    ...hole.map(c => ({ ...c, community: false })),
    ...comm.map(c => ({ ...c, community: true })),
  ];
  all.sort((a, b) => (BC_RANK_VALUE[a.rank] - BC_RANK_VALUE[b.rank]) * (dir === 'asc' ? 1 : -1));
  return all;
}

type Award = ShowdownSummary['awards'][number];

/** Settlement readiness for a hand (Safeguard A): the authoritative
 *  settled data for THIS hand exists — either the handId-matching
 *  server summary, or settled winner flags on the snapshot itself
 *  (fold-win path). A winnerless SHOWDOWN ENTRY snapshot is NOT
 *  readiness: the settlement lands later and must be waited for. */
export function settlementReady(
  state: { showdownSummary?: ShowdownSummary | null; players: CelebrationPlayer[] },
  handId: number,
): boolean {
  const sum = state.showdownSummary;
  if (sum && sum.handId === handId && sum.modeId === 'box_chevy') return true;
  return state.players.some(p => p.isWinner);
}

export function summaryForHand(
  state: { showdownSummary?: ShowdownSummary | null },
  handId: number,
): ShowdownSummary | null {
  const sum = state.showdownSummary;
  return sum && sum.handId === handId && sum.modeId === 'box_chevy' ? sum : null;
}

export function celebrationFromSummary(
  sum: ShowdownSummary,
  players: CelebrationPlayer[],
  community: { rank: string; suit: string }[],
): CelebrationBuild {
  const byId = new Map(players.map(p => [p.id, p]));
  const commCards = community.map(c => ({ rank: c.rank, suit: c.suit }));

  const infoFor = (a: Award, side: WinnerInfo['side']): WinnerInfo => {
    const p = byId.get(a.playerId);
    const hole = (p?.cards ?? []).map(c => ({ rank: c.rank, suit: c.suit }));
    const asc = orderedTen(hole, commCards, 'asc');
    const desc = orderedTen(hole, commCards, 'desc');
    const declaration = sum.declarations?.find(d => d.playerId === a.playerId)?.declaration ?? null;
    let tenRows: WinnerInfo['tenRows'];
    if (side === 'HIGH') tenRows = [{ cards: asc }];
    else if (side === 'LOW') tenRows = [{ cards: desc }];
    else if (side === 'SWING' || side === 'BOTH') tenRows = [{ label: 'HIGH', cards: asc }, { label: 'LOW', cards: desc }];
    else if (declaration === 'LOW') tenRows = [{ cards: desc }];
    else if (declaration === 'SWING') tenRows = [{ label: 'HIGH', cards: asc }, { label: 'LOW', cards: desc }];
    else tenRows = [{ cards: asc }];
    return {
      name: p?.name ?? a.playerId,
      amount: a.amount,
      exactAmount: a.amount,
      cards: hole,
      handLabel: sum.entries.find(e => e.playerId === a.playerId)?.description ?? '',
      side,
      reason: a.reason,
      tenRows,
    };
  };

  /** One block for a part's winner(s). Ties merge: names joined; the
   *  block's cards are the first winner's (identical sequences tie);
   *  amounts stay exact — shared amount when equal, spelled-out
   *  per-winner amounts when they differ. */
  const groupInfo = (awards: Award[], side: WinnerInfo['side']): WinnerInfo | null => {
    if (awards.length === 0) return null;
    const first = infoFor(awards[0], side);
    if (awards.length === 1) return first;
    const names = awards.map(a => byId.get(a.playerId)?.name ?? a.playerId);
    const amounts = awards.map(a => a.amount);
    const allEqual = amounts.every(v => v === amounts[0]);
    return {
      ...first,
      name: names.join(' & '),
      ...(allEqual
        ? {}
        : { exactAmount: undefined, amountText: awards.map((a, i) => `${names[i]} $${amounts[i].toLocaleString()}`).join(' · ') }),
    };
  };

  const byPart = (part: string) => sum.awards.filter(a => a.part === part);
  const highAwards = byPart('HIGH');
  const lowAwards = byPart('LOW');
  const swingAwards = byPart('SWING');
  const bothAwards = byPart('HIGH + LOW');
  const soleAwards = sum.awards.filter(a => a.part !== 'HIGH' && a.part !== 'LOW' && a.part !== 'SWING' && a.part !== 'HIGH + LOW');

  let soleWinner: WinnerInfo | null = null;
  if (swingAwards.length > 0) soleWinner = groupInfo(swingAwards, 'SWING');
  else if (bothAwards.length > 0) soleWinner = groupInfo(bothAwards, 'BOTH');
  else if (soleAwards.length > 0 && highAwards.length === 0 && lowAwards.length === 0) soleWinner = groupInfo(soleAwards, 'SOLE');

  const highWinner = groupInfo(highAwards, 'HIGH');
  const lowWinner = groupInfo(lowAwards, 'LOW');

  // NO WINNER exists only for a genuine winnerless settlement with a
  // positive rollover. Awards present — or a $0 "rollover" — never
  // produce it.
  const audit: CelebrationAudit | null =
    sum.awards.length === 0 && sum.rollover > 0 ? { rollover: sum.rollover } : null;

  return { highWinner, lowWinner, soleWinner, audit };
}
