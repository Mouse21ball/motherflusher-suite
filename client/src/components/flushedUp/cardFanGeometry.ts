export interface CardFanGeometry {
  rotation: number;
  yOffset: number;
  overlap: number;
  scale: number;
}

export function getCardIdentity(card: { rank?: string; suit?: string; isHidden?: boolean }, occurrence: number): string {
  // Hero snapshots retain rank/suit while toggling isHidden at reveal time.
  // Ignore that presentation flag so the same physical card keeps its key.
  const hasFaceIdentity = Boolean(card.rank && card.suit);
  const face = hasFaceIdentity ? `${card.rank}-${card.suit}` : 'hidden';
  return `${face}-${occurrence}`;
}

/**
 * The hand is laid out in the space it actually has, rather than in a
 * breakpoint-sized approximation.  This keeps a five-card hand generous on a
 * tablet and still readable on a narrow Android viewport.
 */
export function getCardFanGeometry(
  index: number,
  count: number,
  availableWidth: number,
  cardWidth: number,
): CardFanGeometry {
  if (count <= 1) return { rotation: 0, yOffset: 0, overlap: 0, scale: 1 };

  const safeWidth = Math.max(1, availableWidth);
  const minimumReadableScale = Math.min(1, 44 / cardWidth);
  const naturalWidth = count * cardWidth;
  const scale = Math.min(1, Math.max(minimumReadableScale, safeWidth / naturalWidth));
  const targetWidth = safeWidth * 0.96;
  const generousGap = count <= 4 ? 8 : count === 5 ? 4 : 0;
  const naturalStep = cardWidth + generousGap;
  // Flex layout still allocates the unscaled card width. Base the step on that
  // footprint so transform scaling cannot conceal horizontal overflow.
  const step = Math.min(naturalStep, Math.max(12, (targetWidth - cardWidth) / (count - 1)));
  // Negative overlap is intentional: small hands receive positive spacing,
  // while larger hands use positive overlap to remain inside the container.
  const overlap = cardWidth - step;

  const midpoint = (count - 1) / 2;
  const normalized = midpoint === 0 ? 0 : (index - midpoint) / midpoint;
  const maxRotation = Math.min(13, 5.5 + Math.max(0, 5 - count) * 1.4);
  const rotation = normalized * maxRotation;
  const yOffset = Math.abs(normalized) ** 1.7 * Math.min(26, 8 + count * 1.8);

  return { rotation, yOffset, overlap, scale };
}