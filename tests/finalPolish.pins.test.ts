// Final-polish pins (Detroit 2026-10-22): the rollover status repair,
// the authoritative showdown summary plumbing, and the frozen-element
// guards (Badugi's engine must not gain any of this).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const generic = readFileSync('server/genericEngine.ts', 'utf8');
const legacy = readFileSync('server/gameEngine.ts', 'utf8');
const fuTable = readFileSync('client/src/components/flushedUp/FlushedUpTable.tsx', 'utf8');
const bcTable = readFileSync('client/src/components/boxChevy/BoxChevyTable.tsx', 'utf8');
const fuMode = readFileSync('shared/modes/flushedUp.ts', 'utf8');
const bcMode = readFileSync('shared/modes/boxchevy.ts', 'utf8');

describe('Rollover status repair', () => {
  it('participant rule in the rollover branch (stabilization supersedes the human-only repair)', () => {
    // The human-only version stranded tables (hero active, bots
    // parked, safety silenced). The participant rule is pinned in
    // stabilization.pins.test.ts; here we pin that the branch keys
    // on participation + funding, never on presence alone.
    expect(generic).toContain("(p.status === 'folded' || p.status === 'active') && newChips > 0");
    expect(generic).toContain("table.fundedSeats.has(p.id)");
  });

  it('does not touch chip balances or the confirmed rebuy path', () => {
    expect(generic).toContain("return 'Use the confirmed table rebuy request.';");
    expect(generic).toContain("hasFundedHuman(s.players, table.fundedSeats)");
  });
});

describe('Showdown summary plumbing', () => {
  it('both generic modes build summaries from their settlements', () => {
    expect(fuMode).toContain("modeId: 'flushed_up'");
    expect(bcMode).toContain("modeId: 'box_chevy'");
    expect(bcMode).toContain('resolveSwingSidePots');
  });

  it('the engine stamps the handId and clears the summary at settle', () => {
    expect(generic).toContain('showdownSummary: result.summary ? { ...result.summary, handId: table.handId } : null');
    expect(generic).toContain('showdownSummary: null,');
  });

  it('the legacy Badugi engine gains none of this (frozen)', () => {
    expect(legacy).not.toContain('showdownSummary');
  });
});

describe('Showdown presentation (summary-driven)', () => {
  it('FU celebration reads the summary and renders comparison + other hands', () => {
    expect(fuTable).toContain('(liveRef.current as any).showdownSummary');
    expect(fuTable).toContain('data-testid="fu-showdown-comparison"');
    expect(fuTable).toContain('data-testid="fu-showdown-others"');
  });

  it('BC celebration renders exact amounts and reasons from the summary', () => {
    expect(bcTable).toContain('winner.exactAmount');
    // Superseded by the stabilization package (Detroit 2026-10-22):
    // the audit roster/paragraphs left the main celebration; the
    // no-winner line is pinned in stabilization.pins.test.ts.
    expect(bcTable).toContain('data-testid="bc-no-winner"');
    // Detroit 2026-10-24 (final polish repairs): the summary is read
    // through the readiness-gated celebrationPlan accessors (handId-
    // fenced) rather than inline at a fixed delay.
    expect(bcTable).toContain('summaryForHand(st, handId)');
    const bcPlan = readFileSync('client/src/components/boxChevy/celebrationPlan.ts', 'utf8');
    expect(bcPlan).toContain('sum.handId === handId');
  });
});
