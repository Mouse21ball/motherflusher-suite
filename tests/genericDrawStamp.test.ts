/**
 * Generic-engine draw-transaction stamps (Detroit 2026-10-21, Flushed Up
 * Phase 3 — the Badugi drawSeq architecture ported to generic modes).
 *
 * The contract (shared/gameTypes.ts): drawSeq is a per-hand monotonic
 * counter incremented on EVERY accepted draw, stand-pat included, for
 * humans and bots; lastDrawCount records how many cards the last draw
 * replaced. Clients key draw animations to drawSeq so each draw animates
 * exactly once and reconnect baselines never replay flights. Before this
 * phase the generic engine never stamped either field, so the generic
 * tables' flight drivers were keyed on a value that was always
 * undefined. These pins keep the stamps from silently disappearing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const engine = readFileSync(resolve(__dirname, '../server/genericEngine.ts'), 'utf8');
const fuTable = readFileSync(resolve(__dirname, '../client/src/components/flushedUp/FlushedUpTable.tsx'), 'utf8');

describe('generic engine draw stamps', () => {
  it('human draw branch stamps lastDrawCount and increments drawSeq', () => {
    expect(engine).toContain('lastDrawCount: drawn.count,');
    expect(engine).toContain('drawSeq: (player.drawSeq ?? 0) + 1,');
  });

  it('bot draw commit stamps the acting bot on DRAW phases', () => {
    expect(engine).toContain("if (table.state.phase.startsWith('DRAW')) {");
    expect(engine).toContain('lastDrawCount: changed, drawSeq: (oldBot.drawSeq ?? 0) + 1');
  });

  it('hand reset restarts the per-hand counters', () => {
    expect(engine).toContain('lastDrawCount: undefined,');
    expect(engine).toContain('drawSeq: 0,');
  });
});

describe('Flushed Up table draw driver', () => {
  it('keys draw flights on drawSeq increments of exactly one', () => {
    expect(fuTable).toContain('currSeq !== prevSeq + 1');
    expect(fuTable).toContain('(p as any).drawSeq ?? 0');
  });

  it('no longer keys flights on phase:lastDrawCount', () => {
    expect(fuTable).not.toContain("`${liveState.phase}:${(p as any).lastDrawCount ?? 'x'}`");
  });

  it('stages the hero slot-faithfully (discarded slots only)', () => {
    expect(fuTable).toContain('staged[p.id].includes(slot)');
    expect(fuTable).toContain('setStaged(prevStaged');
  });
});
