// ─── Retired-mode shim tests ─────────────────────────────────────────────────
// Verifies the 9→4-cut compatibility shim: old native clients (bundled UI) that
// tap a retired mode button get legacy-readable init/error frames naming the
// mode and its platform store — no unknown-mode fallback or revived mechanics.
// The new client notice also understands Milo's dedicated mode:retired type.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addGenericConnection, RETIRED_MODES } from '../server/genericEngine';
import { readRetiredModeNotice } from '../client/src/lib/poker/engine/retiredModeNotice';
import { APP_STORE_LISTING_URL, PLAY_STORE_LISTING_URL } from '../shared/mobileStoreListings';

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

const RETIRED_IDS = ['dead7', 'fifteen35', 'suits_poker', 'suitspoker', 'kamikaze', 'bonecrusher'];

describe('retired-mode shim', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('covers the five cut games and both historical Suits wire IDs', () => {
    expect(Object.keys(RETIRED_MODES).sort()).toEqual([...RETIRED_IDS].sort());
    expect(new Set(Object.values(RETIRED_MODES)).size).toBe(5);
    expect(RETIRED_MODES.suitspoker).toBe(RETIRED_MODES.suits_poker);
    expect(RETIRED_MODES.constructor).toBeUndefined();
    expect(RETIRED_MODES.__proto__).toBeUndefined();
  });

  it.each(RETIRED_IDS.flatMap(mode => ['ios', 'android'].map(platform => [mode, platform])))(
    'retired mode %s on %s → legacy-readable message and platform store', async (modeId, platform) => {
    const { sent, ws } = mockWs();
    const result = await addGenericConnection(`shim-test-${modeId}`, modeId, 'sess-1', ws, 'Tester',
      false, false, undefined, {}, undefined, { platform });
    expect(result).toBeNull();

    const types = sent.map((s) => JSON.parse(s).type);
    expect(types).toEqual(['mode:init', 'error']);
    expect(JSON.stringify(sent)).not.toMatch(/unknown-mode|MODE_RETIRED|mode-retired/);

    const retired = JSON.parse(sent.find((s) => JSON.parse(s).type === 'error')!);
    expect(retired.modeId).toBe(modeId);
    expect(retired.modeName).toBe(RETIRED_MODES[modeId]);
    expect(retired.message).toContain(RETIRED_MODES[modeId]);
    expect(retired.message).toMatch(/update the app/i);
    // No error codes or unknown-mode language in the user-facing message.
    expect(retired.message).not.toMatch(/unknown-mode|error code|ERR_/i);
    expect(retired.updateUrl).toBe(platform === 'ios' ? APP_STORE_LISTING_URL : PLAY_STORE_LISTING_URL);
    expect(retired).not.toHaveProperty('code');
    expect(retired).not.toHaveProperty('reason');
    const notice = readRetiredModeNotice(retired);
    expect(notice).toMatchObject({ modeId, modeName: retired.modeName, message: retired.message, updateUrl: retired.updateUrl,
      storeUrls: { ios: APP_STORE_LISTING_URL, android: PLAY_STORE_LISTING_URL } });
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
    expect(RETIRED_MODES['lady_luck']).toBeUndefined();
  });

  it.each(['ios', 'android'])('client also accepts Milo-style mode:retired on %s', platform => {
    expect(readRetiredModeNotice({
      type: 'mode:retired', modeId: 'kamikaze', modeName: 'Kamikaze',
      message: 'Kamikaze has been retired. Update the app to play the new lineup.',
      storeUrls: { ios: APP_STORE_LISTING_URL, android: PLAY_STORE_LISTING_URL },
    }, platform)).toMatchObject({ modeName: 'Kamikaze',
      updateUrl: platform === 'ios' ? APP_STORE_LISTING_URL : PLAY_STORE_LISTING_URL });
  });

  it('does not turn ordinary errors or normal snapshots into retirement notices', () => {
    expect(readRetiredModeNotice({ type: 'error', message: 'Bet rejected.' })).toBeNull();
    expect(readRetiredModeNotice({ type: 'mode:snapshot', updateRequired: true })).toBeNull();
    expect(readRetiredModeNotice({ type: 'mode:error', reason: 'unknown-mode' })).toBeNull();
  });

  it('never follows arbitrary payload links and offers both configured listings when platform is unknown', () => {
    const notice = readRetiredModeNotice({
      type: 'error', updateRequired: true, modeName: 'Dead 7',
      updateUrl: 'https://untrusted.example/', storeUrls: { ios: 'javascript:alert(1)', android: 'https://untrusted.example/' },
    });
    expect(notice).toMatchObject({
      message: 'Dead 7 has been retired. Please update the app to continue.',
      updateUrl: null, storeUrls: { ios: APP_STORE_LISTING_URL, android: PLAY_STORE_LISTING_URL },
    });
  });
});
