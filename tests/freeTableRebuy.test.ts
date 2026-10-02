import { describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock('../server/db', () => ({ db: mockDb }));

import { storage } from '../server/storage';

function createTransactionMock(options?: {
  player?: { chipBalance: number; chipLoanBalance?: number };
  existingClaim?: { id: number };
}) {
  let selectIndex = 0;
  const selectRows = [options?.player ? [options.player] : [], options?.existingClaim ? [options.existingClaim] : []];
  const selectBuilder = (rows: unknown[]) => {
    const builder: Record<string, any> = {};
    builder.from = vi.fn(() => builder);
    builder.where = vi.fn(() => builder);
    builder.for = vi.fn(async () => rows);
    builder.limit = vi.fn(async () => rows);
    return builder;
  };

  const updateBuilder: Record<string, any> = {};
  updateBuilder.set = vi.fn(() => updateBuilder);
  updateBuilder.where = vi.fn(async () => []);
  const insertBuilder = { values: vi.fn(async () => []) };
  const tx = {
    select: vi.fn(() => selectBuilder(selectRows[selectIndex++] ?? [])),
    update: vi.fn(() => updateBuilder),
    insert: vi.fn(() => insertBuilder),
  };
  mockDb.transaction.mockImplementation(async (callback: (tx: any) => unknown) => callback(tx));
  return { tx, updateBuilder, insertBuilder };
}

describe('claimFreeTableRebuy', () => {
  it('rejects missing authoritative event keys before opening a transaction', async () => {
    mockDb.transaction.mockClear();

    await expect(storage.claimFreeTableRebuy('player-1', '', 'hand-1'))
      .rejects.toMatchObject({ code: 'INVALID_EVENT' });
    await expect(storage.claimFreeTableRebuy('player-1', 'table-1', ' '))
      .rejects.toMatchObject({ code: 'INVALID_EVENT' });

    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('credits 1,000 chips and records the idempotency key in the same transaction', async () => {
    const { tx, updateBuilder, insertBuilder } = createTransactionMock({ player: { chipBalance: 400 } });

    const result = await storage.claimFreeTableRebuy('player-1', 'badugi:ABCD', 'hand-12:player-1');

    expect(result).toEqual({ granted: true, chipBalance: 1400 });
    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(tx.update).toHaveBeenCalledOnce();
    expect(updateBuilder.set).toHaveBeenCalledWith(expect.objectContaining({ chipBalance: 1400 }));
    expect(tx.insert).toHaveBeenCalledOnce();
    expect(insertBuilder.values).toHaveBeenCalledWith(expect.objectContaining({
      playerId: 'player-1',
      beforeBalance: 400,
      amountChange: 1000,
      afterBalance: 1400,
      source: 'freeTableRebuy',
      gameId: 'badugi:ABCD',
      handId: 'hand-12:player-1',
    }));
  });

  it('returns the current balance on a duplicate event without crediting again', async () => {
    const { tx } = createTransactionMock({
      player: { chipBalance: 1400 },
      existingClaim: { id: 81 },
    });

    const result = await storage.claimFreeTableRebuy('player-1', 'badugi:ABCD', 'hand-12:player-1');

    expect(result).toEqual({ granted: false, chipBalance: 1400 });
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('returns not-found if there is no player profile', async () => {
    const { tx } = createTransactionMock();

    await expect(storage.claimFreeTableRebuy('missing-player', 'badugi:ABCD', 'hand-12:player-1'))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(tx.select).toHaveBeenCalledOnce();
    expect(tx.update).not.toHaveBeenCalled();
  });
});

describe('grantTableChipLoan', () => {
  it('records an eligible table loan under the retriable table request key', async () => {
    const { tx, updateBuilder, insertBuilder } = createTransactionMock({
      player: { chipBalance: 400, chipLoanBalance: 0 },
    });

    await expect(storage.grantTableChipLoan('player-1', 'dead7:table-1', 'request-12345678'))
      .resolves.toEqual({ success: true, newBalance: 1_400 });

    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(updateBuilder.set).toHaveBeenCalledWith(expect.objectContaining({
      chipBalance: expect.anything(),
      chipLoanBalance: 1_000,
    }));
    expect(insertBuilder.values).toHaveBeenCalledWith(expect.objectContaining({
      playerId: 'player-1',
      beforeBalance: 400,
      amountChange: 1_000,
      afterBalance: 1_400,
      source: 'chip_loan_grant',
      gameId: 'dead7:table-1',
      handId: 'request-12345678',
    }));
  });

  it('treats a retried request as the original successful loan without granting again', async () => {
    const { tx, updateBuilder, insertBuilder } = createTransactionMock({
      player: { chipBalance: 1_400, chipLoanBalance: 1_000 },
      existingClaim: { id: 42 },
    });

    await expect(storage.grantTableChipLoan('player-1', 'dead7:table-1', 'request-12345678'))
      .resolves.toEqual({ success: true, newBalance: 1_400 });

    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(updateBuilder.set).not.toHaveBeenCalled();
    expect(insertBuilder.values).not.toHaveBeenCalled();
  });

  it('rejects an existing unrelated loan and wallet balances over 500', async () => {
    createTransactionMock({ player: { chipBalance: 400, chipLoanBalance: 1_000 } });
    await expect(storage.grantTableChipLoan('player-1', 'table-1', 'request-12345678'))
      .resolves.toMatchObject({ success: false, error: 'existing_loan' });

    createTransactionMock({ player: { chipBalance: 501, chipLoanBalance: 0 } });
    await expect(storage.grantTableChipLoan('player-1', 'table-1', 'request-87654321'))
      .resolves.toMatchObject({ success: false, error: 'not_broke' });
  });

  it('does not open a transaction without a player, table, and request key', async () => {
    mockDb.transaction.mockClear();
    await expect(storage.grantTableChipLoan('player-1', '', 'request-12345678'))
      .resolves.toMatchObject({ success: false, error: 'invalid_request' });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});