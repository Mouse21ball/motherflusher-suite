import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Player } from '../shared/gameTypes';
import { makeBotPlayer } from '../server/utils/botPlayer';
import { scheduleBotBanter } from '../server/utils/botBanter';

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    chips: 1000,
    bet: 0,
    cards: [],
    status: 'active',
    isDealer: false,
    declaration: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('bot seat avatars', () => {
  it('assigns a deterministic shared avatar for the seat when converting to a bot', () => {
    const reserved = player('p3', { presence: 'reserved', name: 'Open' });
    const bot = makeBotPlayer(reserved, 'Vega', 'active');

    expect(bot).toMatchObject({
      id: 'p3',
      name: 'Vega',
      presence: 'bot',
      status: 'active',
      avatarUrl: '/emote-gorilla-angry.png',
    });
    expect(makeBotPlayer(reserved, 'Another name').avatarUrl).toBe(bot.avatarUrl);
    expect(reserved).toMatchObject({ presence: 'reserved', name: 'Open' });
  });
});

describe('shared post-showdown bot banter', () => {
  it('selects a non-folded winning bot and schedules its message after the legacy delay', () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5);
    const table = {
      state: {
        phase: 'SHOWDOWN',
        players: [
          player('p1', { presence: 'human' }),
          player('p2', { presence: 'bot', name: 'Vega' }),
          player('p3', { presence: 'bot', status: 'folded', name: 'Slick' }),
        ],
        chatMessages: [],
      },
    };
    const broadcast = vi.fn();

    scheduleBotBanter(table, ['p2'], broadcast);
    expect(random).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(749);
    expect(broadcast).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(table.state.chatMessages).toHaveLength(1);
    expect(table.state.chatMessages[0]).toMatchObject({
      senderId: 'p2',
      senderName: 'Vega',
      text: "That's what I'm talking about.",
    });
    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it('keeps the approximately 55% chance and fences a scheduled message to SHOWDOWN', () => {
    vi.useFakeTimers();
    const table = {
      state: {
        phase: 'SHOWDOWN',
        players: [player('p2', { presence: 'bot' })],
        chatMessages: [],
      },
    };
    const broadcast = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.56);
    scheduleBotBanter(table, [], broadcast);
    expect(vi.getTimerCount()).toBe(0);

    vi.spyOn(Math, 'random').mockRestore();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.5);
    scheduleBotBanter(table, [], broadcast);
    table.state.phase = 'RESOLVE';
    vi.advanceTimersByTime(1100);

    expect(table.state.chatMessages).toHaveLength(0);
    expect(broadcast).not.toHaveBeenCalled();
  });
});