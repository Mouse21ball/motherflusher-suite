// Flushed Up phone-presentation pins. Original P1 repair 2026-10-21
// (widened arc, cascaded fans); SUPERSEDED 2026-10-22 by Detroit's
// coordinated correction plan: Flushed Up adopts the approved Badugi
// oval ring and Badugi's contained opponent pod (cards as in-pod mini
// tiles), because the arc + fans still overlapped and ran off-screen
// on his Galaxy retest. The celebration/rake/staging pins below are
// unchanged from the P1 repair — those fixes carry forward.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const table = readFileSync('client/src/components/flushedUp/FlushedUpTable.tsx', 'utf8');
const celebrations = readFileSync('client/src/components/celebrations/celebrationService.ts', 'utf8');

describe('Flushed Up phone presentation (correction plan pins)', () => {
  it('seat map is the approved Badugi oval ring, hero at 75.2', () => {
    expect(table).toContain("if (index === 0) return { x: 50, y: 75.2 }");
    expect(table).toContain('{ x: 50, y: 14 }');
    expect(table).toContain('{ x: 18.5, y: 34 }');
    expect(table).toContain('{ x: 81.5, y: 34 }');
    expect(table).toContain('{ x: 81.5, y: 54 }');
    expect(table).not.toContain('{ x: 29.5, y: 15.5 }');
    expect(table).not.toContain('{ x: 14, y: 29 }');
  });

  it('opponent pods are Badugi-style contained panels with a bounded name line', () => {
    expect(table).toContain("background: 'rgba(10,5,25,0.55)'");
    expect(table).toContain("maxWidth: '100px'");
    expect(table).toContain('truncate');
  });

  it('opponent cards are in-pod mini tiles — no showdown fans remain', () => {
    expect(table).toContain('marginLeft: ci > 0 ? -6 : 0');
    expect(table).not.toContain('OPP_SHOWDOWN');
    expect(table).not.toContain('marginLeft: cascade');
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
