import type { CardType } from '../../shared/gameTypes';

export function applyGenericDraw(
  cards: CardType[],
  deck: CardType[],
  discardPile: CardType[],
  payload: unknown,
  drawCap: number,
): { ok: false } | { ok: true; cards: CardType[]; deck: CardType[]; discardPile: CardType[]; count: number } {
  const rawIndices = Array.isArray(payload) ? Array.from(payload) : [];
  if (
    !rawIndices.every((idx): idx is number => Number.isInteger(idx) && idx >= 0 && idx < cards.length)
  ) {
    return { ok: false };
  }

  const indices: number[] = [...new Set(rawIndices as number[])];
  if (indices.length > drawCap) return { ok: false };

  const newCards = [...cards];
  const newDiscard = [...discardPile];
  const newDeck = [...deck];
  for (const idx of indices) {
    newDiscard.push(newCards[idx]);
    if (newDeck.length === 0 && newDiscard.length > 0) {
      const reshuffled = [...newDiscard];
      newDiscard.length = 0;
      for (let ri = reshuffled.length - 1; ri > 0; ri--) {
        const rj = Math.floor(Math.random() * (ri + 1));
        [reshuffled[ri], reshuffled[rj]] = [reshuffled[rj], reshuffled[ri]];
      }
      newDeck.push(...reshuffled);
    }
    const drawn = newDeck.shift();
    if (drawn) newCards[idx] = { ...drawn, isHidden: false };
  }
  return { ok: true, cards: newCards, deck: newDeck, discardPile: newDiscard, count: indices.length };
}