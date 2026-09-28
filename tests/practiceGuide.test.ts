import { describe, expect, it } from 'vitest';
import type { GameState, Player } from '../shared/gameTypes';
import { getBadugiPracticeGuide } from '../shared/practiceGuide';

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 'hero',
    name: 'You',
    presence: 'human',
    chips: 500,
    bet: 10,
    cards: [],
    status: 'active',
    isDealer: false,
    declaration: null,
    ...overrides,
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    tableId: 'practice',
    phase: 'WAITING',
    pot: 0,
    currentBet: 0,
    minBet: 10,
    activePlayerId: null,
    players: [player()],
    communityCards: [],
    messages: [],
    chatMessages: [],
    deck: [],
    discardPile: [],
    ...overrides,
  };
}

describe('Badugi practice guidance', () => {
  it('maps all live Badugi phases to correctly ordered guidance', () => {
    const phases: GameState['phase'][] = [
      'WAITING', 'ANTE', 'DEAL', 'DRAW_1', 'BET_1', 'DRAW_2', 'BET_2',
      'DRAW_3', 'DECLARE', 'BET_3', 'SHOWDOWN',
    ];
    const guides = phases.map(phase => getBadugiPracticeGuide(state({ phase }), 'hero', 0));

    expect(guides.map(guide => guide.phase)).toEqual(phases.map(phase => phase.replaceAll('_', ' ')));
    expect(guides[0].instruction).toContain('Start one-hand practice');
    expect(guides[1].instruction).toContain('Post 25 practice-chip ante');
    expect(guides[2].instruction).toContain('Deal four cards');
    expect(guides[3].maxPicks).toBe(3);
    expect(guides[5].maxPicks).toBe(2);
    expect(guides[7].maxPicks).toBe(1);
    expect(guides[8].title).toContain('HIGH or LOW');
    expect(guides[9].title).toContain('Final bet');
    expect(guides[10].title).toBe('Showdown');
    expect(guides[10].actions.join(' ')).toContain('Practice another hand');
  });

  it('uses the actual start, ante, and deal controls in setup guidance', () => {
    const waiting = getBadugiPracticeGuide(state(), 'hero', 0);
    const ante = getBadugiPracticeGuide(state({ phase: 'ANTE', activePlayerId: 'hero' }), 'hero', 0);
    const deal = getBadugiPracticeGuide(state({ phase: 'DEAL', activePlayerId: 'hero' }), 'hero', 0);
    expect(waiting.statusText).toBe('Ready to start');
    expect(waiting.actions.join(' ')).toContain('Start one-hand practice');
    expect(ante.status).toBe('your-turn');
    expect(ante.instruction).toContain('Post 25 practice-chip ante');
    expect(ante.actions.join(' ')).not.toContain('automatic');
    expect(deal.instruction).toContain('Deal four cards');
  });

  it.each([
    ['DRAW_1', 3],
    ['DRAW_2', 2],
    ['DRAW_3', 1],
  ] as const)('explains the exact %s pick limit and stand pat', (phase, limit) => {
    const guide = getBadugiPracticeGuide(state({ phase }), 'hero', 1);
    expect(guide.instruction).toContain(`up to ${limit}`);
    expect(guide.selectedCount).toBe(1);
    expect(guide.actions.join(' ')).toContain('stand pat');
  });

  it('describes available check, call, bet, and raise actions from the live bet amounts', () => {
    const facingBet = getBadugiPracticeGuide(
      state({ phase: 'BET_1', currentBet: 35, players: [player({ bet: 10 })] }),
      'hero',
      0,
    );
    expect(facingBet.detail).toContain('owe 25 practice chips');
    expect(facingBet.actions.join(' ')).toContain('Call: tap Call 25');
    expect(facingBet.actions.join(' ')).toContain('Enter at least 35');
    expect(facingBet.actions.join(' ')).not.toContain('Fold');
    expect(facingBet.actions.join(' ')).not.toContain('Check:');

    const noBet = getBadugiPracticeGuide(
      state({ phase: 'BET_2', currentBet: 10, players: [player({ bet: 10 })] }),
      'hero',
      0,
    );
    expect(noBet.detail).toContain('no outstanding amount to call');
    expect(noBet.detail).toContain('Check continues without adding chips');
    expect(noBet.actions.join(' ')).toContain('Check: tap Check');
    expect(noBet.actions.join(' ')).toContain('Bet: enter at least 10');
    expect(noBet.actions.join(' ')).not.toContain('Fold');
    expect(noBet.actions.join(' ')).not.toContain('Call:');
  });

  it('identifies when the player must wait for a bot', () => {
    const guide = getBadugiPracticeGuide(
      state({
        phase: 'DRAW_2',
        activePlayerId: 'bot-1',
        players: [player(), player({ id: 'bot-1', name: 'Mina', presence: 'bot' })],
      }),
      'hero',
      0,
    );
    expect(guide.status).toBe('waiting');
    expect(guide.statusText).toBe('Waiting for bot Mina');
  });

  it('explains declaration qualification and reports showdown winner and qualification', () => {
    const declare = getBadugiPracticeGuide(state({ phase: 'DECLARE' }), 'hero', 0);
    expect(declare.detail).toContain('four-card Badugi');
    expect(declare.actions.join(' ')).toMatch(/Declare High/i);
    expect(declare.actions.join(' ')).toMatch(/Declare Low/i);

    const showdown = getBadugiPracticeGuide(
      state({
        phase: 'SHOWDOWN',
        players: [
          player({ declaration: 'LOW', isWinner: true, score: { isValidBadugi: true } }),
          player({ id: 'bot-1', name: 'Mina', isWinner: false }),
        ],
      }),
      'hero',
      0,
    );
    expect(showdown.status).toBe('complete');
    expect(showdown.detail).toContain('qualified');
    expect(showdown.detail).toContain('declared LOW');
    expect(showdown.detail).toContain('You');
  });
});