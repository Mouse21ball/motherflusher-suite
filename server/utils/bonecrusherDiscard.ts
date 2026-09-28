import type { CardType } from '../../shared/gameTypes';

type DiscardResult =
  | { ok: false; reason: 'invalid_payload' | 'invalid_index' | 'duplicate_index'; message: string }
  | { ok: true; cards: CardType[]; discardPile: CardType[]; publicIndices: number[] };

/** Validate the entire client selection before removing any card or remapping public slots. */
export function applyBonecrusherDiscard(
  cards: CardType[],
  discardPile: CardType[],
  publicIndices: number[],
  payload: unknown,
): DiscardResult {
  if (!Array.isArray(payload) || payload.length !== 2) {
    return { ok: false, reason: 'invalid_payload', message: 'Select exactly two cards to discard.' };
  }
  if (payload.some(i => !Number.isInteger(i) || i < 0 || i >= cards.length)) {
    return { ok: false, reason: 'invalid_index', message: 'Discard indices must be integers within your hand.' };
  }
  const indices = payload as number[];
  if (new Set(indices).size !== indices.length) {
    return { ok: false, reason: 'duplicate_index', message: 'Discard indices must be unique.' };
  }

  const sorted = [...indices].sort((a, b) => b - a);
  const nextCards = [...cards];
  const nextDiscard = [...discardPile];
  for (const idx of sorted) {
    nextDiscard.push(nextCards[idx]);
    nextCards.splice(idx, 1);
  }
  const removed = new Set(sorted);
  const nextPublic = publicIndices
    .filter(i => !removed.has(i))
    .map(i => i - sorted.filter(ri => ri < i).length);
  return { ok: true, cards: nextCards, discardPile: nextDiscard, publicIndices: nextPublic };
}