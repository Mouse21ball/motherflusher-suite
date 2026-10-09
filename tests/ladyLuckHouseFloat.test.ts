import { beforeEach, describe, expect, it, vi } from 'vitest';

const HOUSE = '__ladyluck_house__';
const BOT = 'bot_test_1';

// In-memory fake behind the mocked drizzle db.
const { balances, ledger, updateTargets } = vi.hoisted(() => ({
  balances: new Map<string, number>(),
  ledger: [] as any[],
  updateTargets: [] as string[],
}));

vi.mock('../server/db', () => ({
  db: {
    transaction: async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                for: async () =>
                  [...balances.entries()]
                    .map(([id, balance]) => ({ id, balance }))
                    .sort((a, b) => (a.id < b.id ? -1 : 1)),
              }),
            }),
          }),
        }),
        update: () => ({
          set: (values: any) => ({
            where: async () => {
              const target = updateTargets.shift();
              if (target !== undefined && values.chipBalance !== undefined) {
                balances.set(target, values.chipBalance);
              }
            },
          }),
        }),
        insert: () => ({
          values: async (row: any) => {
            ledger.push(row);
          },
        }),
      };
      return fn(tx);
    },
  },
}));

import { storage } from '../server/storage';

function grantEntries() {
  return ledger.filter(e => e.source === 'ladyluck_house_float_grant');
}

beforeEach(() => {
  balances.clear();
  ledger.length = 0;
  updateTargets.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('Lady Luck house float (auto-replenishing bot funding)', () => {
  it('funds a bot from a healthy house with no system grant', async () => {
    balances.set(HOUSE, 50_000);
    balances.set(BOT, 0);
    updateTargets.push(HOUSE, BOT);

    const ok = await storage.transferLadyLuckChips(HOUSE, BOT, 10_000, 'ladyluck_bot_rebuy', 't1');

    expect(ok).toBe(true);
    expect(balances.get(HOUSE)).toBe(40_000);
    expect(balances.get(BOT)).toBe(10_000);
    expect(grantEntries()).toHaveLength(0);
  });

  it('funds a bot from a fully drained house (zero) via a ledger-recorded grant', async () => {
    balances.set(HOUSE, 0);
    balances.set(BOT, 0);
    updateTargets.push(HOUSE, HOUSE, BOT);

    const ok = await storage.transferLadyLuckChips(HOUSE, BOT, 10_000, 'ladyluck_bot_rebuy', 't1');

    expect(ok).toBe(true);
    expect(balances.get(HOUSE)).toBe(0);
    expect(balances.get(BOT)).toBe(10_000);
    const grants = grantEntries();
    expect(grants).toHaveLength(1);
    expect(grants[0].amountChange).toBe(10_000);
    expect(grants[0].beforeBalance).toBe(0);
    expect(grants[0].afterBalance).toBe(10_000);
    expect(grants[0].metadata.grantFor).toBe(BOT);
  });

  it('funds a bot from a partially drained house (25,000 prod balance) via a grant for the shortfall only', async () => {
    balances.set(HOUSE, 25_000);
    balances.set(BOT, 0);
    // 10k bot stack fully covered by the 25k balance: no grant needed here.
    updateTargets.push(HOUSE, BOT);

    const ok = await storage.transferLadyLuckChips(HOUSE, BOT, 10_000, 'ladyluck_bot_rebuy', 't1');

    expect(ok).toBe(true);
    expect(balances.get(HOUSE)).toBe(15_000);
    expect(balances.get(BOT)).toBe(10_000);
    expect(grantEntries()).toHaveLength(0);
  });

  it('grants only the shortfall when the house cannot fully cover the funding', async () => {
    balances.set(HOUSE, 4_000);
    balances.set(BOT, 0);
    updateTargets.push(HOUSE, HOUSE, BOT);

    const ok = await storage.transferLadyLuckChips(HOUSE, BOT, 10_000, 'ladyluck_bot_rebuy', 't1');

    expect(ok).toBe(true);
    expect(balances.get(BOT)).toBe(10_000);
    const grants = grantEntries();
    expect(grants).toHaveLength(1);
    expect(grants[0].amountChange).toBe(6_000); // shortfall only, not a blank check
  });

  it('still fails player-to-player transfers on insufficient balance (economy untouched)', async () => {
    balances.set('p1', 1_000);
    balances.set('p2', 0);

    const ok = await storage.transferLadyLuckChips('p1', 'p2', 5_000, 'ladyluck_sidebet_stake', 't1');

    expect(ok).toBe(false);
    expect(balances.get('p1')).toBe(1_000);
    expect(balances.get('p2')).toBe(0);
    expect(grantEntries()).toHaveLength(0);
  });

  it('does not grant for house-to-player refunds (ineligible source)', async () => {
    balances.set(HOUSE, 1_000);
    balances.set('p1', 0);

    const ok = await storage.transferLadyLuckChips(HOUSE, 'p1', 5_000, 'ladyluck_late_sidebet_refund', 't1');

    expect(ok).toBe(false);
    expect(balances.get(HOUSE)).toBe(1_000);
    expect(grantEntries()).toHaveLength(0);
  });

  it('sweeps excess bot chips back to the house with no grant', async () => {
    balances.set(BOT, 15_000);
    balances.set(HOUSE, 0);
    updateTargets.push(BOT, HOUSE);

    const ok = await storage.transferLadyLuckChips(BOT, HOUSE, 5_000, 'ladyluck_bot_sweep', 't1');

    expect(ok).toBe(true);
    expect(balances.get(BOT)).toBe(10_000);
    expect(balances.get(HOUSE)).toBe(5_000);
    expect(grantEntries()).toHaveLength(0);
  });

  it('fails when an account is missing', async () => {
    balances.set(HOUSE, 50_000);

    const ok = await storage.transferLadyLuckChips(HOUSE, 'bot_ghost', 10_000, 'ladyluck_bot_rebuy', 't1');

    expect(ok).toBe(false);
    expect(grantEntries()).toHaveLength(0);
  });

  it('repeat funding works: second bot funds fine after the first drained the house', async () => {
    balances.set(HOUSE, 0);
    balances.set('bot_a', 0);
    balances.set('bot_b', 0);
    updateTargets.push(HOUSE, HOUSE, 'bot_a', HOUSE, HOUSE, 'bot_b');

    const first = await storage.transferLadyLuckChips(HOUSE, 'bot_a', 10_000, 'ladyluck_bot_rebuy', 't1');
    const second = await storage.transferLadyLuckChips(HOUSE, 'bot_b', 10_000, 'ladyluck_bot_rebuy', 't1');

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(balances.get('bot_a')).toBe(10_000);
    expect(balances.get('bot_b')).toBe(10_000);
    expect(grantEntries()).toHaveLength(2);
  });
});
