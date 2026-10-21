import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Detroit 2026-10-21 (Phase 1 / P3): Badugi's configured capacity is 5
 * everywhere. The "5/4 players" display came from a stale four-player
 * default left in the legacy engine's table factory (and mirrored in
 * the generic engine's fallback) after the five-seat restoration.
 * These source-level assertions pin the defaults so the stale cap
 * cannot silently return; live occupied/capacity counts are verified
 * on the staging fork by the harness 'phase1' scenario.
 */

const legacy = readFileSync(resolve(__dirname, '../server/gameEngine.ts'), 'utf8');
const generic = readFileSync(resolve(__dirname, '../server/genericEngine.ts'), 'utf8');

describe('Badugi capacity defaults (P3)', () => {
  it('legacy engine table factory defaults Badugi capacity to 5, never 4', () => {
    const factory = legacy.slice(legacy.indexOf('export function getOrCreateBadugiTable'));
    const body = factory.slice(0, factory.indexOf('const botsEnabled'));
    expect(body).toMatch(/options\.maxPlayers\s+\?\? 5/);
    expect(body).not.toMatch(/options\.maxPlayers\s+\?\? 4/);
  });

  it('generic engine caps only Box Chevy at 4 (Badugi + Flushed Up are 5)', () => {
    // Detroit 2026-10-21: Flushed Up joined Badugi at 5 in its own phase;
    // Box Chevy keeps the 4 cap pending its separate design phase.
    expect(generic).toContain("const defaultMax = modeId === 'box_chevy' ? 4 : 5;");
    expect(generic).toContain("maxPlayers: modeId === 'box_chevy' ? 4 : 5,");
    expect(generic).toContain("if (table.modeId === 'box_chevy' && table.state.players.length > 4) {");
    // No capacity expression may single Badugi or Flushed Up out for 4.
    expect(generic).not.toMatch(/modeId === 'badugi'\) \? 4/);
    expect(generic).not.toMatch(/modeId === 'flushed_up'\) \? 4/);
    expect(generic).not.toMatch(/=== 'flushed_up'\) \? 4 : 5/);
  });

  it('Flushed Up table renders and deals to a fifth seat', () => {
    const fu = readFileSync(resolve(__dirname, '../client/src/components/flushedUp/FlushedUpTable.tsx'), 'utf8');
    // Both opponent slices admit 4 others (proto render + deal driver).
    expect(fu.match(/\.slice\(0, 4\)/g)?.length).toBe(2);
    expect(fu).not.toContain('.slice(0, 3)');
    // Deal loop follows the actual seat count, not a hardcoded 20/4.
    expect(fu).toContain('const totalCards = ordered.length * 5;');
    expect(fu).toContain('const seatIdx = i % ordered.length;');
    // Four opponent spots in the arc.
    expect(fu).toContain('{ x: 16, y: 30 }');
    expect(fu).toContain('{ x: 84, y: 30 }');
  });

  it('both engines expose occupied-seat counts for the lobby X/Y display', () => {
    expect(legacy).toContain("playerCount: table.state.players.filter(p => p.presence === 'human' || p.presence === 'bot').length");
    expect(generic).toContain("playerCount: table.state.players.filter(p => p.presence === 'human' || p.presence === 'bot').length");
  });

  it('the in-game PLAYERS pill takes its denominator from room settings, never a literal', () => {
    const bar = readFileSync(resolve(__dirname, '../client/src/components/game/GameStatusBar.tsx'), 'utf8');
    expect(bar).not.toContain('`${activePlayers} / 4`');
    expect(bar).toContain('maxPlayers && maxPlayers > 0 ? `${activePlayers} / ${maxPlayers}` : `${activePlayers}`');
    // All three table pages wire their authoritative table settings through.
    for (const page of ['../client/src/components/badugi/BadugiFullPage.tsx', '../client/src/pages/FlushedUpGame.tsx', '../client/src/pages/BoxChevyGame.tsx']) {
      const src = readFileSync(resolve(__dirname, page), 'utf8');
      expect(src, `${page} must pass maxPlayers to GameStatusBar`).toContain('maxPlayers={tableSettings?.maxPlayers}');
    }
  });
});
