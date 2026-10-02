import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client/src/lib/apiConfig', () => ({ apiUrl: (path: string) => `https://table.example${path}` }));
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../client/src/lib/session', () => ({ apiFetch: request }));
import { assertTableProtocolCapability } from '../client/src/lib/poker/engine/tableProtocol';

afterEach(() => { vi.useRealTimers(); request.mockReset(); });

describe('table protocol capability contract', () => {
  it('uses the platform-aware URL and accepts the matching backend', async () => {
    request.mockResolvedValue({ ok: true, json: async () => ({ tableProtocol: { version: 1, rebuy: true } }) });
    await expect(assertTableProtocolCapability('rebuy')).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith('https://table.example/api/version', expect.objectContaining({
      cache: 'no-store', signal: expect.any(AbortSignal),
    }));
  });

  it.each(['leave', 'rebuy', 'borrow'] as const)('rejects an old server before sending %s', async capability => {
    request.mockResolvedValue({ ok: true, json: async () => ({ commit: 'old-server' }) });
    await expect(assertTableProtocolCapability(capability)).rejects.toThrow('server needs an update');
  });

  it('does not mistake a successful HTTP response for protocol support', async () => {
    request.mockResolvedValue({ ok: true, json: async () => ({ tableProtocol: { version: 2, rebuy: true } }) });
    await expect(assertTableProtocolCapability('rebuy')).rejects.toThrow('server needs an update');
  });

  it('bounds a stalled HTTP request rather than hanging before the socket timeout', async () => {
    vi.useFakeTimers();
    request.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const pending = expect(assertTableProtocolCapability('rebuy')).rejects.toThrow('server did not respond');
    await vi.advanceTimersByTimeAsync(8_000);
    await pending;
  });
});