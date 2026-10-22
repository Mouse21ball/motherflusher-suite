// Stabilization package pins (Detroit 2026-10-22).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('stabilization pins', () => {
  it('settle: rollover participant rule covers folded/active participants, bots included', () => {
    const generic = read('server/genericEngine.ts');
    expect(generic).toContain("(p.status === 'folded' || p.status === 'active') && newChips > 0");
    expect(generic).toContain("(p.presence === 'bot' || (p.presence === 'human' && table.fundedSeats.has(p.id)))");
  });

  it('settle: zero-active safety reactivates bots only — never a sat-out human', () => {
    const generic = read('server/genericEngine.ts');
    expect(generic).toContain("p.presence === 'bot' && p.chips > 0 ? 'active' : p.status");
  });

  it('start paths heal stranded seats under the same eligibility rule', () => {
    const generic = read('server/genericEngine.ts');
    expect(generic).toContain('function healStrandedSeats(table: GenericTable, requestingSeatId?: string)');
    expect(generic).toContain('healStrandedSeats(table);');
    expect(generic).toContain('healStrandedSeats(table, playerId);');
    // Gates mirror seat conversion: botsEnabled + non-club for bots.
    expect(generic).toContain("p.presence === 'bot' && table.botsEnabled && !table.crewId");
  });

  it('celebration: no-winner renders one authoritative line; roster/paragraphs are gone', () => {
    const bcTable = read('client/src/components/boxChevy/BoxChevyTable.tsx');
    expect(bcTable).toContain('data-testid="bc-no-winner"');
    expect(bcTable).toContain('NO WINNER — $');
    expect(bcTable).not.toContain('bc-showdown-audit');
    expect(bcTable).not.toContain('audit.declarations');
    expect(bcTable).not.toContain('audit.comparisons');
  });

  it('celebration: winners carry ordered ten-card rows (HIGH asc, LOW desc, SWING both)', () => {
    const bcTable = read('client/src/components/boxChevy/BoxChevyTable.tsx');
    expect(bcTable).toContain('tenRows');
    expect(bcTable).toContain("orderedTen(hole, commCards, 'asc')");
    expect(bcTable).toContain("orderedTen(hole, commCards, 'desc')");
  });

  it('badge: compact one-line labels; long labels retired; evaluation strings untouched', () => {
    const validity = read('shared/modes/heroHandValidity.ts');
    expect(validity).toContain('NO MADE HAND — DISCARD');
    expect(validity).toContain('NO MADE HAND — BOARD PAIR');
    expect(validity).toContain('NO MADE HAND — OUT OF DRAWS');
    expect(validity).toContain("label: '✓ MADE HAND'");
    expect(validity).not.toContain('DUPLICATE RANK');
    expect(validity).not.toContain('10 UNIQUE RANKS');
    // The detailed explanations still exist for tutorial/notice use.
    expect(validity).toContain('NO DRAW CAN FIX THIS HAND');
  });

  it('frozen engines untouched by the stabilization code', () => {
    const fuEngine = read('server/flushedUpEngine.ts');
    expect(fuEngine).not.toContain('healStrandedSeats');
  });
});
