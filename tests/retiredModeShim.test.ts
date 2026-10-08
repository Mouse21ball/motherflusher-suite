// ─── Retired-mode shim tests ─────────────────────────────────────────────────
// Verifies the 9→4-cut compatibility shim: old native clients (bundled UI) that
// tap a retired mode button get a graceful `mode:retired` response naming the
// mode in plain language with both store listings — never a bare unknown-mode
// rejection, and never a hang (legacy `mode:error` is still sent so old clients
// land on their connection-failed state instead of spinning forever).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addGenericConnection, RETIRED_MODES } from '../server/genericEngine';

function mockWs() {
  const sent: string[] = [];
  return {
    sent,
    ws: {
      send: (data: string) => { sent.push(data); },
      readyState: 1,
    } as unknown as import('ws').WebSocket,
  };
}

const RETIRED_IDS = ['dead7', 'fifteen35', 'suits_poker', 'kamikaze', 'bonecrusher'];

describe('retired-mode shim', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('covers exactly the five cut modes', () => {
    expect(Object.keys(RETIRED_MODES).sort()).toEqual([...RETIRED_IDS].sort());
  });

  it.each(RETIRED_IDS)('retired mode %s → mode:retired with plain message + store links', async (modeId) => {
    const { sent, ws } = mockWs();
    const result = await addGenericConnection(`shim-test-${modeId}`, modeId, 'sess-1', ws, 'Tester');
    expect(result).toBeNull();

    const types = sent.map((s) => JSON.parse(s).type);
    expect(types).toContain('mode:retired');
    // Old clients ignore mode:retired — the legacy error must still go out so
    // they land on connection-failed instead of hanging on a spinner.
    expect(types).toContain('mode:error');

    const retired = JSON.parse(sent.find((s) => JSON.parse(s).type === 'mode:retired')!);
    expect(retired.modeId).toBe(modeId);
    expect(retired.modeName).toBe(RETIRED_MODES[modeId]);
    expect(retired.message).toContain(RETIRED_MODES[modeId]);
    expect(retired.message).toMatch(/update the app/i);
    // No error codes or unknown-mode language in the user-facing message.
    expect(retired.message).not.toMatch(/unknown-mode|error code|ERR_/i);
    expect(retired.storeUrls.ios).toMatch(/^https:\/\/apps\.apple\.com\/app\/id\d+/);
    expect(retired.storeUrls.android).toMatch(/^https:\/\/play\.google\.com\/store\/apps\/details/);
  });

  it('truly unknown mode → only mode:error, no mode:retired', async () => {
    const { sent, ws } = mockWs();
    const result = await addGenericConnection('shim-test-unknown', 'not_a_real_mode', 'sess-1', ws, 'Tester');
    expect(result).toBeNull();
    const types = sent.map((s) => JSON.parse(s).type);
    expect(types).not.toContain('mode:retired');
    expect(types).toContain('mode:error');
  });

  it('kept modes are not treated as retired', () => {
    expect(RETIRED_MODES['flushed_up']).toBeUndefined();
    expect(RETIRED_MODES['box_chevy']).toBeUndefined();
    expect(RETIRED_MODES['badugi']).toBeUndefined();
    expect(RETIRED_MODES['ladyluck']).toBeUndefined();
  });
});
