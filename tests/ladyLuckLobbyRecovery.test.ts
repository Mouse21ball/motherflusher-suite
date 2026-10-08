import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import type { LadyLuckState } from '../shared/modes/ladyluck';
import { createLLTable, handleLLDisconnect, handleLLJoin, handleLLStart } from '../server/ladyluckEngine';
import { storage } from '../server/storage';

vi.mock('../server/ladyluckPersistence', () => ({
  scheduleLLSave: vi.fn(), flushLLFinancialState: vi.fn(), deleteLLPersistedTable: vi.fn(),
}));
vi.mock('../server/storage', () => ({
  LADY_LUCK_HOUSE_ID: '__ladyluck_house__',
  storage: {
    fundLadyLuckBot: vi.fn(), releaseLadyLuckBot: vi.fn(),
    getPlayerProfile: vi.fn(), getLadyLuckOpenStakes: vi.fn(),
  },
}));

let tableId: string;
let frames: { type: string; code?: string; message?: string; state?: LadyLuckState }[];
const latest = () => frames.filter(frame => frame.state).at(-1)!.state!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  frames = [];
  tableId = `lobby-recovery-${Math.random()}`;
  vi.mocked(storage.fundLadyLuckBot).mockResolvedValue(10_000);
  vi.mocked(storage.releaseLadyLuckBot).mockResolvedValue();
  vi.mocked(storage.getPlayerProfile).mockResolvedValue(null);
  vi.mocked(storage.getLadyLuckOpenStakes).mockResolvedValue({ seated: [], spectator: [] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  handleLLDisconnect(tableId, 'host');
  await Promise.resolve();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function join() {
  const ws = { readyState: 1, send: (raw: string) => frames.push(JSON.parse(raw)) };
  handleLLJoin(tableId, 'host', 'Host', 25_000, ws as unknown as WebSocket);
}

describe('Lady Luck solo lobby funding recovery', () => {
  it('retries a failed first fill at two seconds, clears the error and starts normally', async () => {
    vi.mocked(storage.fundLadyLuckBot).mockRejectedValueOnce(new Error('Lady Luck bot stack transfer failed'));
    createLLTable(tableId, 'pony', 'host');
    join();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(latest().players).toHaveLength(1);
    expect(latest().botFillError).toMatchObject({ attempts: 1, retryInMs: 2_000, code: 'BOT_FILL_UNAVAILABLE' });
    expect(frames).toContainEqual(expect.objectContaining({ type: 'll:error', code: 'BOT_FILL_UNAVAILABLE' }));
    await vi.advanceTimersByTimeAsync(1_999);
    expect(storage.fundLadyLuckBot).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(storage.fundLadyLuckBot).toHaveBeenCalledTimes(2);
    expect(vi.mocked(storage.fundLadyLuckBot).mock.calls[0][0]).toBe(vi.mocked(storage.fundLadyLuckBot).mock.calls[1][0]);
    expect(latest().players).toHaveLength(2);
    expect(latest().botFillError).toBeUndefined();
    expect(frames).toContainEqual({ type: 'll:bot_fill_recovered' });
    await vi.advanceTimersByTimeAsync(7_000);
    expect(latest().players).toHaveLength(4);
    expect(latest().phase).toBe('SELECT');
  });

  it('continues through repeated failures and cancels retries when the host leaves', async () => {
    vi.mocked(storage.fundLadyLuckBot).mockRejectedValue(new Error('database unavailable'));
    createLLTable(tableId, 'pony', 'host');
    join();
    await vi.advanceTimersByTimeAsync(18_000);
    expect(storage.fundLadyLuckBot).toHaveBeenCalledTimes(5);
    expect(latest().botFillError?.attempts).toBe(5);
    expect(latest().players).toHaveLength(1);
    handleLLDisconnect(tableId, 'host');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(storage.fundLadyLuckBot).toHaveBeenCalledTimes(5);
  });

  it('recovers when a later refill, rather than the first bot, fails', async () => {
    vi.mocked(storage.fundLadyLuckBot)
      .mockResolvedValueOnce(10_000).mockRejectedValueOnce(new Error('temporary funding failure'))
      .mockResolvedValue(10_000);
    createLLTable(tableId, 'pony', 'host');
    join();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(latest().players).toHaveLength(2);
    expect(latest().botFillError?.attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(latest().players).toHaveLength(3);
    expect(latest().botFillError).toBeUndefined();
  });

  it('resumes filling if the host connects after the initial grace window', async () => {
    createLLTable(tableId, 'pony', 'host');
    await vi.advanceTimersByTimeAsync(12_000);
    expect(storage.fundLadyLuckBot).not.toHaveBeenCalled();
    join();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(latest().players).toHaveLength(2);
  });

  it('does not revive lobby retries after the host manually starts', async () => {
    createLLTable(tableId, 'pony', 'host');
    join();
    await vi.advanceTimersByTimeAsync(10_000);
    handleLLStart(tableId, 'host');
    await vi.advanceTimersByTimeAsync(4_000);
    expect(latest().phase).toBe('SELECT');
    expect(latest().botFillError).toBeUndefined();
  });
});
