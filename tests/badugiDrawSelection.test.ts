import { describe, expect, it } from 'vitest';
import { getBadugiDrawLimit, toggleBadugiDrawSelection } from '../client/src/components/badugi/badugiDrawSelection';

describe('Badugi draw-card selection', () => {
  it.each([
    ['DRAW_1', 3],
    ['DRAW_2', 2],
    ['DRAW_3', 1],
    ['BET_4', 0],
  ])('uses the %s phase limit', (phase, expectedLimit) => {
    expect(getBadugiDrawLimit(phase)).toBe(expectedLimit);
  });

  it.each([
    ['DRAW_1', 3],
    ['DRAW_2', 2],
    ['DRAW_3', 1],
  ])('allows every hand position under the %s limit and stays capped through reselects', (phase, limit) => {
    for (let index = 0; index < 4; index += 1) {
      expect(toggleBadugiDrawSelection([], index, limit)).toEqual([index]);
      const oneSelected = [index];
      const selectedAtLimit = Array.from({ length: limit - 1 }, (_, offset) => (index + offset + 1) % 4)
        .reduce<number[]>((selected, next) => toggleBadugiDrawSelection(selected, next, limit), oneSelected);
      expect(selectedAtLimit).toHaveLength(limit);

      const deselected = toggleBadugiDrawSelection(selectedAtLimit, index, limit);
      expect(deselected).not.toContain(index);
      expect(deselected.length).toBe(limit - 1);
      expect(toggleBadugiDrawSelection(deselected, index, limit)).toHaveLength(limit);

      const extraIndex = [0, 1, 2, 3].find(candidate => !selectedAtLimit.includes(candidate));
      if (extraIndex !== undefined) {
        expect(toggleBadugiDrawSelection(selectedAtLimit, extraIndex, limit)).toEqual(selectedAtLimit);
      }
    }
  });
});