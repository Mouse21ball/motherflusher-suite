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

  it('generic engine no longer caps Badugi at 4 anywhere', () => {
    expect(generic).toContain("const defaultMax = (modeId === 'flushed_up' || modeId === 'box_chevy') ? 4 : 5;");
    // No capacity expression may single Badugi out for 4: not the factory
    // default, not the restore path, not the broadcast trim guard.
    expect(generic).not.toMatch(/modeId === 'badugi'\) \? 4/);
    expect(generic).not.toMatch(/table\.modeId === 'badugi'\) && table\.state\.players\.length > 4/);
    expect(generic).not.toMatch(/=== 'badugi'\) \? 4 : 5/);
  });

  it('both engines expose occupied-seat counts for the lobby X/Y display', () => {
    expect(legacy).toContain("playerCount: table.state.players.filter(p => p.presence === 'human' || p.presence === 'bot').length");
    expect(generic).toContain("playerCount: table.state.players.filter(p => p.presence === 'human' || p.presence === 'bot').length");
  });
});
