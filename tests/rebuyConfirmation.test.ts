import { describe, expect, it } from 'vitest';
import type { GameState } from '../shared/gameTypes';
import { applyRebuyStack, readRebuyConfirmation } from '../client/src/lib/poker/engine/rebuyConfirmation';

describe('authoritative rebuy acknowledgements', () => {
  it('reads the absolute server stack and wallet rather than inferring a grant amount', () => {
    expect(readRebuyConfirmation({ tableId: 'QA', chips: 1000, walletBalance: 1250 }, 'QA'))
      .toEqual({ chips: 1000, walletBalance: 1250 });
  });

  it.each([
    { tableId: 'other', chips: 1000, walletBalance: 1000 },
    { tableId: 'QA', amount: 1000 },
    { tableId: 'QA', chips: -1, walletBalance: 1000 },
    { tableId: 'QA', chips: 1.5, walletBalance: 1000 },
    { tableId: 'QA', chips: 1000, walletBalance: -1 },
    { tableId: 'QA', chips: 1000, walletBalance: '1000' },
  ])('does not declare incomplete or mismatched balances successful: %j', message => {
    expect(() => readRebuyConfirmation(message, 'QA')).toThrow('did not confirm');
  });

  it('updates only the corresponding seat and preserves the rest of the hand', () => {
    const state = {
      phase: 'WAITING', currentBet: 20, pot: 200,
      players: [{ id: 'hero', chips: 0 }, { id: 'opponent', chips: 500 }],
    } as GameState;
    const updated = applyRebuyStack(state, 'hero', 1000);
    expect(updated.players.map(player => player.chips)).toEqual([1000, 500]);
    expect(updated.pot).toBe(200);
    expect(updated.phase).toBe('WAITING');
    expect(state.players[0].chips).toBe(0);
    expect(applyRebuyStack(updated, 'hero', 1000).players[0].chips).toBe(1000);
  });
});