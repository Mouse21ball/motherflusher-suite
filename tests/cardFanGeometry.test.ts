import { describe, expect, it } from 'vitest';
import {
  getCardFanGeometry,
  getCardIdentity,
  getSelectionSpreadOffsets,
} from '../client/src/components/flushedUp/cardFanGeometry';

describe('card fan geometry', () => {
  it('curves outer cards below and away from the center', () => {
    const fourCards = Array.from({ length: 4 }, (_, index) =>
      getCardFanGeometry(index, 4, 320, 58),
    );

    expect(fourCards[0].rotation).toBeLessThan(0);
    expect(fourCards[3].rotation).toBeGreaterThan(0);
    expect(fourCards[0].yOffset).toBeGreaterThan(fourCards[1].yOffset);
    expect(fourCards[3].yOffset).toBeGreaterThan(fourCards[2].yOffset);
  });

  it('gives small hands spacing and larger hands responsive overlap', () => {
    const smallHand = getCardFanGeometry(1, 4, 320, 58);
    const largeHand = getCardFanGeometry(1, 8, 320, 58);

    expect(smallHand.overlap).toBeLessThan(0);
    expect(largeHand.overlap).toBeGreaterThan(0);
  });

  it('gives four-card hands a pronounced gap when space is available', () => {
    const geometry = getCardFanGeometry(1, 4, 360, 68);
    expect(geometry.overlap).toBe(-14);
  });

  it('adds centered separation at selected-card boundaries', () => {
    expect(getSelectionSpreadOffsets(4, [1])).toEqual([-10, 0, 10, 10]);
    expect(getSelectionSpreadOffsets(4, [1, 2])).toEqual([-10, 0, 0, 10]);
  });

  it('does not spread an unselected hand', () => {
    expect(getSelectionSpreadOffsets(4, [])).toEqual([0, 0, 0, 0]);
  });

  it('keeps a large four-card Badugi hand inside a narrow Android width', () => {
    const count = 4;
    const availableWidth = 280;
    const cardWidth = 68;
    const selectionExpansion = 20;
    const geometry = getCardFanGeometry(0, count, availableWidth - selectionExpansion, cardWidth);
    const renderedWidth = cardWidth + (cardWidth - geometry.overlap) * (count - 1);

    expect(renderedWidth + selectionExpansion).toBeLessThanOrEqual(availableWidth + 0.001);
  });

  it('fits a large hand on a narrow screen without shrinking below 44px', () => {
    const count = 10;
    const availableWidth = 280;
    const cardWidth = 58;
    const geometry = getCardFanGeometry(0, count, availableWidth, cardWidth);
    const scaledWidth = cardWidth * geometry.scale;
    const step = cardWidth - geometry.overlap;
    const renderedWidth = cardWidth + step * (count - 1);

    expect(scaledWidth).toBeGreaterThanOrEqual(44);
    expect(renderedWidth).toBeLessThanOrEqual(availableWidth * 0.96 + 0.001);
  });

  it('fits a seven-card hand in the full-width mobile hero panel', () => {
    const count = 7;
    const availableWidth = 280;
    const cardWidth = 52;
    const geometry = getCardFanGeometry(0, count, availableWidth, cardWidth);
    const step = cardWidth - geometry.overlap;
    const renderedWidth = cardWidth + step * (count - 1);

    expect(cardWidth * geometry.scale).toBeGreaterThanOrEqual(44);
    expect(renderedWidth).toBeLessThanOrEqual(availableWidth * 0.96 + 0.001);
  });

  it('keeps duplicate and hidden card identities deterministic', () => {
    expect(getCardIdentity({ rank: 'A', suit: 'spades' }, 0)).toBe('A-spades-0');
    expect(getCardIdentity({ rank: 'A', suit: 'spades' }, 1)).toBe('A-spades-1');
    expect(getCardIdentity({ isHidden: true }, 2)).toBe('hidden-2');
  });
});