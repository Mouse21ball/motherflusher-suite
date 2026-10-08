// ─── Badugi rollover player-set tests ────────────────────────────────────────
// Detroit's rule: when the pot rolls over (no valid badugi anywhere), the next
// hand is played by everyone who hasn't voluntarily folded. Players auto-folded
// at DECLARE (no valid hand, but made it to the end) are still in for the
// rolled-over pot. Voluntary folders sit out.

import { describe, it, expect } from 'vitest';
import { nextHandStatus } from '../server/gameEngine';

describe('badugi rollover player set', () => {
  it('active player stays active on rollover', () => {
    expect(nextHandStatus({ status: 'active' }, 1000, true)).toBe('active');
  });

  it('declare auto-folded player is back in on rollover', () => {
    expect(nextHandStatus({ status: 'folded', autoFoldedAtDeclare: true }, 1000, true)).toBe('active');
  });

  it('voluntary folder sits out the rollover hand', () => {
    expect(nextHandStatus({ status: 'folded' }, 1000, true)).toBe('sitting_out');
    expect(nextHandStatus({ status: 'folded', autoFoldedAtDeclare: false }, 1000, true)).toBe('sitting_out');
  });

  it('broke player sits out even if still-in', () => {
    expect(nextHandStatus({ status: 'active' }, 0, true)).toBe('sitting_out');
    expect(nextHandStatus({ status: 'folded', autoFoldedAtDeclare: true }, 0, true)).toBe('sitting_out');
  });

  it('normal (non-rollover) reset: everyone with chips plays', () => {
    expect(nextHandStatus({ status: 'active' }, 1000, false)).toBe('active');
    expect(nextHandStatus({ status: 'folded' }, 1000, false)).toBe('active');
    expect(nextHandStatus({ status: 'folded', autoFoldedAtDeclare: true }, 1000, false)).toBe('active');
    expect(nextHandStatus({ status: 'active' }, 0, false)).toBe('sitting_out');
  });
});
