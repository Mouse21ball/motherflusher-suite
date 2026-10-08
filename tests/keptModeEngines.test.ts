import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { BoxChevyEngine } from '../server/boxChevyEngine';
import { FlushedUpEngine } from '../server/flushedUpEngine';
import { getOrCreateTable } from '../server/genericEngine';
import type { CardType, GameState, Player } from '../shared/gameTypes';
import type { BotFillHost } from '../server/modeEngine';

const cards = (ranks: CardType['rank'][], suit: CardType['suit'] = 'hearts'): CardType[] =>
  ranks.map(rank => ({ rank, suit, isHidden: false }));
const community = cards(['2', '4', '6', '8', '10'], 'clubs');
const made = cards(['A', '3', '5', '7', '9']);
function player(id: string, hand = made): Player {
  return { id, name: id, presence: 'human', chips: 1000, bet: 50, totalBet: 100,
    cards: hand, status: 'active', hasActed: false, isDealer: false, declaration: null };
}
function state(phase: GameState['phase'] = 'DECLARE'): GameState {
  return { tableId: 'engine-policy', phase, players: [player('valid'), player('invalid', cards(['A', '3', '5', '7', '10']))],
    communityCards: community, pot: 200, currentBet: 0, minBet: 50, activePlayerId: 'invalid',
    deck: [], discardPile: [], messages: [], chatMessages: [] };
}
const addMessage = (s: GameState, text: string): GameState => ({
  ...s, messages: [...s.messages, { id: `${s.messages.length}`, text, time: 0 }],
});
afterEach(() => vi.useRealTimers());

describe('independent retained mode engines', () => {
  it.each([BoxChevyEngine, FlushedUpEngine])('$mode.id owns the draw caps for its actual phase sequence', engine => {
    expect(engine.drawCap('DRAW_1')).toBe(3);
    expect(engine.drawCap('DRAW_2')).toBe(2);
    expect(engine.drawCap('DRAW_3')).toBe(1);
    expect(engine.drawCap('BET_1')).toBeNull();
    expect(engine.drawCap('SHOWDOWN')).toBeNull();
  });

  it('uses different mode mechanics and only plumbing in the common runtime', () => {
    expect(BoxChevyEngine.mode.resolveShowdown).not.toBe(FlushedUpEngine.mode.resolveShowdown);
    expect(BoxChevyEngine.mode.botAction).not.toBe(FlushedUpEngine.mode.botAction);
    expect(BoxChevyEngine.drawCap).not.toBe(FlushedUpEngine.drawCap);
    const runtime = readFileSync(new URL('../server/genericEngine.ts', import.meta.url), 'utf8');
    expect(runtime).not.toContain("from '../shared/modes/");
    expect(runtime).not.toMatch(/modeId\s*===\s*['"]/);
    expect(getOrCreateTable('retired_mode', 'unsupported', true)).toBeNull();
  });

  it('Box Chevy folds only non-made active hands on declaration entry, preserving contributions', () => {
    const before = state();
    const next = BoxChevyEngine.onPhaseEnter!(before, addMessage);
    expect(next.players[0]).toEqual(before.players[0]);
    expect(next.players[1]).toMatchObject({ status: 'folded', hasActed: true, declaration: null, chips: 1000, totalBet: 100 });
    expect(next.activePlayerId).toBe('valid');
    expect(next.pot).toBe(200);
    expect(next.messages[0].text).toContain('no made hand — auto-folded');
    expect(BoxChevyEngine.onPhaseEnter!(next, addMessage)).toBe(next);
    expect(before.players[1].status).toBe('active');
  });

  it('Box Chevy leaves repairable hands alone during all draw and bet rounds', () => {
    for (const phase of ['DRAW_1', 'DRAW_2', 'DRAW_3', 'BET_1', 'BET_2', 'BET_3'] as const) {
      const current = state(phase);
      expect(BoxChevyEngine.onPhaseEnter!(current, addMessage)).toBe(current);
    }
  });

  it('Flushed Up requires a flush for a fold win and rolls the net pot over for a non-flush', () => {
    const invalid = player('sole', [...cards(['A', '3', '5', '7']), ...cards(['9'], 'spades')]);
    expect(FlushedUpEngine.canWinUncontested!(invalid)).toBe(false);
    expect(FlushedUpEngine.canWinUncontested!(player('flush'))).toBe(true);
    const next = FlushedUpEngine.resolveUncontested!({ ...state('BET_4'), players: [invalid], pot: 200 }, invalid, 190);
    expect(next.phase).toBe('SHOWDOWN');
    expect(next.pot).toBe(190);
    expect(next.players[0].isWinner).not.toBe(true);
    expect(next.messages.some(message => message.text.includes('$190 rolls over'))).toBe(true);
  });

  it('Flushed Up owns its 10-second fill, 2-second seating, and 3-second start schedule', () => {
    vi.useFakeTimers();
    const table = getOrCreateTable('flushed_up', `fill-${Date.now()}`, true, false, { botsEnabled: false })!;
    table.botsEnabled = true;
    table.state.players = table.state.players.slice(0, 3).map((p, i) => ({
      ...p, presence: i === 0 ? 'human' : 'reserved', status: i === 0 ? 'active' : 'sitting_out',
    }));
    const host: BotFillHost = { getTable: () => table, broadcast: vi.fn(), startHand: vi.fn() };
    FlushedUpEngine.scheduleBotFill!('test', host);
    vi.advanceTimersByTime(9999);
    expect(table.state.players.filter(p => p.presence === 'bot')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(table.state.players.filter(p => p.presence === 'bot')).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(table.state.players.filter(p => p.presence === 'bot')).toHaveLength(2);
    expect(host.startHand).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(host.startHand).toHaveBeenCalledTimes(1);
    expect(table.botFillTimer).toBeUndefined();
  });
});
