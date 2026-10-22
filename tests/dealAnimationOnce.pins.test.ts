// Deal animation must play EXACTLY ONCE per hand in the generic-mode
// tables (Detroit Galaxy QA, 2026-10-21: Flushed Up and Box Chevy
// dealt twice; Badugi — legacy engine, handId increments once per
// hand — was perfect and is not touched).
//
// Root cause: the generic engine increments handId twice per played
// hand (entering ANTE, then again in dealCards), and both tables
// triggered their deal-flight block on any handId change — so the
// block ran at ANTE (no cards dealt yet) and again at DEAL. The fix
// gates the trigger on the DEAL phase, keying the animation to the
// dealt hand's id: one animation per legitimate deal, later hands
// included, and no replay on reconnect (no id change into DEAL).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const fu = readFileSync('client/src/components/flushedUp/FlushedUpTable.tsx', 'utf8');
const bc = readFileSync('client/src/components/boxChevy/BoxChevyTable.tsx', 'utf8');

const GATED = "prev.handId !== curr.handId && curr.phase === 'DEAL'";

describe('deal animation fires once per hand (generic tables)', () => {
  it('Flushed Up deal trigger is gated on the DEAL phase', () => {
    expect(fu).toContain(GATED);
  });

  it('Box Chevy deal trigger is gated on the DEAL phase', () => {
    expect(bc).toContain(GATED);
  });

  it('neither table keeps the ungated handId-only trigger', () => {
    const ungated = /const isNewHand = prev\.handId !== undefined && curr\.handId !== undefined && prev\.handId !== curr\.handId;\n/;
    expect(fu).not.toMatch(ungated);
    expect(bc).not.toMatch(ungated);
  });
});
