import { describe, expect, it, vi } from 'vitest';
import { runSingleRebuyFlight } from '../client/src/lib/poker/engine/singleRebuyFlight';

describe('synchronous rebuy single flight', () => {
  it('coalesces same-tick submissions before even starting the preflight request', async () => {
    const slot = { current: null as Promise<void> | null };
    let complete!: () => void;
    const operation = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
    const first = runSingleRebuyFlight(slot, operation);
    const second = runSingleRebuyFlight(slot, operation);
    expect(second).toBe(first);
    expect(slot.current).toBe(first);
    await Promise.resolve();
    expect(operation).toHaveBeenCalledOnce();
    complete();
    await first;
    expect(slot.current).toBeNull();
  });

  it('releases on failure and permits a deliberate retry', async () => {
    const slot = { current: null as Promise<void> | null };
    await expect(runSingleRebuyFlight(slot, async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    expect(slot.current).toBeNull();
    await expect(runSingleRebuyFlight(slot, async () => {})).resolves.toBeUndefined();
  });
});