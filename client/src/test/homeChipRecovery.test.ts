import { describe, expect, it } from 'vitest';
import { shouldShowHomeChipRecovery } from '../pages/homeChipRecovery';

describe('Home chip recovery visibility', () => {
  it('shows recovery only for a resolved authoritative zero balance', () => {
    expect(shouldShowHomeChipRecovery({ chipBalance: 0 }, false)).toBe(true);
    expect(shouldShowHomeChipRecovery({ chipBalance: 0 }, true)).toBe(false);
    expect(shouldShowHomeChipRecovery(null, false)).toBe(false);
    expect(shouldShowHomeChipRecovery({ chipBalance: 1 }, false)).toBe(false);
  });
});