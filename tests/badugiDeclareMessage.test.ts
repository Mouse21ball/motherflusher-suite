import { describe, expect, it } from 'vitest';
import { BadugiMode } from '../shared/modes/badugi';
import { destroyBadugiTable, getOrCreateBadugiTable, handleBadugiAction } from '../server/gameEngine';

describe('Badugi public declaration messages', () => {
  it.each(['HIGH', 'LOW', 'FOLD'] as const)('names the declaring player for %s', declaration => {
    const tableId = `declare-copy-${declaration}`;
    const table = getOrCreateBadugiTable(tableId, true, true, { botsEnabled: false });
    try {
      table.state = {
        ...table.state,
        phase: 'DECLARE',
        activePlayerId: 'p1',
        players: table.state.players.map(player => {
          if (player.id === 'p1') {
            return { ...player, name: 'Alice', presence: 'human' as const, status: 'active' as const, hasActed: false };
          }
          if (player.id === 'p2') {
            return { ...player, name: 'Bob', presence: 'human' as const, status: 'active' as const, hasActed: false };
          }
          return { ...player, status: 'folded' as const };
        }),
      };

      handleBadugiAction(tableId, 'p1', 'declare', { declaration });

      expect(table.state.messages.map(message => message.text)).toContain(`Alice declared ${declaration}`);
      expect(table.state.messages.map(message => message.text)).not.toContain(`You declared ${declaration}`);
    } finally {
      destroyBadugiTable(tableId);
    }
  });

  it('keeps the post-declaration betting phase', () => {
    const declareIndex = BadugiMode.phases.indexOf('DECLARE');
    expect(BadugiMode.phases[declareIndex + 1]).toBe('BET_3');
  });
});