import { describe, expect, it } from 'vitest';
import { isResolvedZeroChipBalance } from './ladyLuckSpectatorBalance';

describe('Lady Luck spectate balance gate', () => {
  it('does not treat the unresolved profile default as a zero balance', () => {
    expect(isResolvedZeroChipBalance(true, undefined)).toBe(false);
    expect(isResolvedZeroChipBalance(true, 0)).toBe(false);
  });

  it('requires watch-only mode only for a resolved authoritative zero balance', () => {
    expect(isResolvedZeroChipBalance(false, 0)).toBe(true);
    expect(isResolvedZeroChipBalance(false, 1)).toBe(false);
    expect(isResolvedZeroChipBalance(false, null)).toBe(false);
  });
});