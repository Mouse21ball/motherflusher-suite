// Flushed Up phone-presentation repair pins (Detroit Galaxy QA P1,
// 2026-10-21). The five-seat layout from the first pass only worked at
// desktop widths: ~150px-wide pods (avatar + name in a row) sat on
// percentage centers ~94px apart at Galaxy widths and overlapped; the
// 182px showdown reveal fans piled into neighbouring pods; TWO winner
// celebrations fired for the same showdown (the app-global BIG POT host
// plus the table's own), the table's celebration could activate into
// the NEXT hand, and the rake flight aimed with a hardcoded
// 3.5px-per-percent conversion that is wrong at every real stage size.
// These pins lock the repair's load-bearing source facts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const table = readFileSync('client/src/components/flushedUp/FlushedUpTable.tsx', 'utf8');
const celebrations = readFileSync('client/src/components/celebrations/celebrationService.ts', 'utf8');

describe('Flushed Up phone presentation (P1 repair pins)', () => {
  it('seat arc uses the widened phone geometry, not the desktop-only arc', () => {
    expect(table).toContain('{ x: 29.5, y: 15.5 }');
    expect(table).toContain('{ x: 70.5, y: 15.5 }');
    expect(table).toContain('{ x: 14, y: 29 }');
    expect(table).toContain('{ x: 86, y: 29 }');
    expect(table).not.toContain('{ x: 38, y: 17.5 }');
    expect(table).not.toContain('{ x: 62, y: 17.5 }');
  });

  it('opponent labels stack in a bounded plate instead of a wide name row', () => {
    expect(table).toContain('maxWidth: 96');
    expect(table).toContain('truncate');
  });

  it('showdown reveal fans cascade with overlap instead of spanning 182px', () => {
    expect(table).toContain('marginLeft: cascade ? -14 : 0');
    expect(table).not.toContain("? { gap: '3px' }");
  });

  it('rake flights aim at the winner seat in percent, not 3.5px-per-percent', () => {
    expect(table).not.toContain('* 3.5');
    expect(table).toContain('left: `${wpos.x}%`');
    expect(table).toContain('top: `${wpos.y}%`');
  });

  it('celebration and rake clear when the hand leaves showdown', () => {
    expect(table).toContain("curr.phase !== 'SHOWDOWN' && prev.phase === 'SHOWDOWN'");
    expect(table).toContain('stillThisShowdown');
    expect(table).toContain("liveRef.current.phase === 'SHOWDOWN'");
  });

  it('draw staging is cleared at showdown so hero cards cannot be forced face-down', () => {
    expect(table).toContain("curr.phase === 'SHOWDOWN' && prev.phase !== 'SHOWDOWN'");
  });

  it('the global celebration host does not fire for Flushed Up (table owns the moment)', () => {
    expect(celebrations).toContain("TABLE_OWNED_CELEBRATION_MODES = new Set(['flushed_up'])");
    expect(celebrations).toContain('TABLE_OWNED_CELEBRATION_MODES.has(modeId)');
  });
});
