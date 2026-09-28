import type { Player } from '../../shared/gameTypes';
import { getAvatarForSeat } from '../../shared/engine/avatarMap';

/** Convert an existing seat into a bot without changing its other hand state. */
export function makeBotPlayer(player: Player, name: string, status?: Player['status']): Player {
  const seatNumber = Number(player.id.match(/^p(\d+)$/)?.[1] ?? 0);
  return {
    ...player,
    name,
    presence: 'bot',
    avatarUrl: getAvatarForSeat(seatNumber),
    ...(status ? { status } : {}),
  };
}