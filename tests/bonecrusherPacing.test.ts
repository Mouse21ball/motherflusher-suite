import { afterEach, describe, expect, it, vi } from 'vitest';
import { BonecrusherMode } from '../shared/modes/bonecrusher';
import { getBotThinkDelay, getModeBotThinkDelay } from '../shared/engine/botUtils';

describe('Bonecrusher pacing', () => {
  afterEach(() => vi.restoreAllMocks());

  it('retains the four flip/bet pairs and all eight betting rounds', () => {
    const phases = BonecrusherMode.phases;
    expect(phases).toEqual([
      'WAITING', 'ANTE', 'DEAL',
      'DISCARD_2', 'REVEAL_1', 'BET_1',
      'STREET_1', 'BET_2',
      'STREET_2', 'BET_3',
      'STREET_3', 'BET_4',
      'SELECT_5',
      'FLIP_1', 'BET_5',
      'FLIP_2', 'BET_6',
      'FLIP_3', 'BET_7',
      'FLIP_4', 'BET_8',
      'DECLARE', 'SHOWDOWN',
    ]);
    expect(phases.filter(phase => phase.startsWith('BET_'))).toHaveLength(8);
    for (let flip = 1; flip <= 4; flip++) {
      const flipIndex = phases.indexOf(`FLIP_${flip}`);
      expect(phases[flipIndex + 1]).toBe(`BET_${flip + 4}`);
    }
  });

  it('shortens only Bonecrusher bot decisions to a 250–450ms cadence', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(getModeBotThinkDelay('bonecrusher', 'shark', 'medium')).toBe(450);
    expect(getModeBotThinkDelay('bonecrusher', 'fish', 'easy')).toBe(450);
    expect(getModeBotThinkDelay('dead7', 'shark', 'medium'))
      .toBe(getBotThinkDelay('shark', 'medium'));

    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(getModeBotThinkDelay('bonecrusher', 'fish', 'medium')).toBe(300);
  });

  it('uses a 250ms automatic deal delay for all three streets', () => {
    for (const phase of ['STREET_1', 'STREET_2', 'STREET_3'] as const) {
      expect(BonecrusherMode.getAutoTransition(phase)?.delay).toBe(250);
    }
  });
});