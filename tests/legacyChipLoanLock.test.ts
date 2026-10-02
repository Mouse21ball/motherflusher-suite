import { afterEach, expect, it, vi } from 'vitest';
import { db } from '../server/db';
import { storage } from '../server/storage';

afterEach(() => vi.restoreAllMocks());

it('locks legacy HTTP loan eligibility before crediting and preserves duplicate rejection', async () => {
  let balance = 0;
  let loan = 0;
  const lock = vi.fn(async (mode: string) => {
    expect(mode).toBe('update');
    return [{ chipBalance: balance, chipLoanBalance: loan }];
  });
  const selection = {
    from: () => selection,
    where: () => selection,
    limit: () => selection,
    for: lock,
  };
  const credit = vi.fn(async () => { balance += 1000; loan = 1000; });
  const tx = {
    select: () => selection,
    update: () => ({ set: () => ({ where: credit }) }),
  };
  vi.spyOn(db, 'transaction').mockImplementation(async operation => operation(tx as any));
  const ledger = vi.spyOn(storage as any, '_insertChipLedger').mockResolvedValue(undefined);

  expect(await storage.grantChipLoan('legacy-player')).toEqual({ success: true, newBalance: 1000 });
  expect(await storage.grantChipLoan('legacy-player')).toEqual({ success: false, error: 'existing_loan' });
  expect(lock).toHaveBeenCalledTimes(2);
  expect(credit).toHaveBeenCalledOnce();
  expect(ledger).toHaveBeenCalledOnce();
  expect(balance).toBe(1000);
});