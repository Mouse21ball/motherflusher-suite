import { describe, expect, it } from 'vitest';
import {
  getEntitledReactions,
  REACTION_EMOTES,
  STARTER_REACTION_EMOTES,
  VIP_REACTION_EMOTES,
} from '../client/src/lib/retention';

describe('reaction entitlements', () => {
  it.each([
    [1, 0],
    [11, 5],
    [21, 10],
    [36, 15],
  ])('unlocks the advertised VIP extra count at level %i', (level, expectedCount) => {
    expect(getEntitledReactions(level, 0)).toHaveLength(expectedCount);
  });

  it.each([
    [1, 0, 0],
    [1, 5, 5],
    [11, 0, 5],
    [11, 5, 10],
    [21, 0, 10],
    [21, 5, 15],
    [36, 0, 15],
    [36, 5, 20],
  ])('combines %i-level VIP with %i claimed starter emotes', (level, starterCount, expectedCount) => {
    const available = getEntitledReactions(level, starterCount);
    expect(available).toHaveLength(expectedCount);
    expect(new Set(available).size).toBe(expectedCount);
  });

  it('keeps starter and VIP catalogs distinct and caps at all 20 curated reactions', () => {
    expect(STARTER_REACTION_EMOTES).toHaveLength(5);
    expect(VIP_REACTION_EMOTES).toHaveLength(15);
    expect(REACTION_EMOTES).toHaveLength(20);
    expect(new Set(REACTION_EMOTES).size).toBe(20);
    expect(getEntitledReactions(36, 99)).toEqual(REACTION_EMOTES);
  });

  it('treats an unknown level and an unclaimed starter pack as locked', () => {
    expect(getEntitledReactions(undefined, 0)).toEqual([]);
  });
});