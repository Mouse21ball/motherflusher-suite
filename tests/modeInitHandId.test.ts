// mode:init must carry handId exactly like mode:snapshot does.
// Broadcast snapshots spread `handId: table.handId` into the state; the
// three generic init sends (wallet spectator, full-table spectator,
// seated join) shipped the raw state without it, so a reconnecting
// client's first state had handId === undefined. The fu5 and bc5
// staging harnesses both tripped on this while verifying reconnects
// (seat, presence, name, and cards all restored; the sampled handId
// was a missing field, not a different hand). Found 2026-10-21.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const generic = readFileSync('server/genericEngine.ts', 'utf8');

describe('generic mode:init carries handId (wire consistency with snapshots)', () => {
  it('all three init sends include handId: table.handId in the state', () => {
    const initSends = generic.match(/state: \{ \.\.\.(specInitState|initState), handId: table\.handId, players:/g) ?? [];
    expect(initSends.length).toBe(3);
  });

  it('no init send ships the state without handId', () => {
    expect(generic).not.toContain('state: { ...specInitState, players:');
    expect(generic).not.toContain('state: { ...initState, players:');
  });

  it('the snapshot serializer still attaches handId the same way', () => {
    expect(generic).toContain('...table.state, handId: table.handId,');
  });
});
