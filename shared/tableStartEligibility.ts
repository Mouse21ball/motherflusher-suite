interface StartSeat {
  id: string;
  presence?: string;
  chips?: number;
  status?: string;
}

export function hasFundedHuman(
  players: readonly StartSeat[],
  fundedSeats: ReadonlySet<string>,
): boolean {
  return players.some(player =>
    player.presence === 'human'
    && player.status === 'active'
    && player.chips !== undefined
    && player.chips > 0
    && fundedSeats.has(player.id)
  );
}

export function canStartNextHand(
  players: readonly StartSeat[],
  fundedSeats: ReadonlySet<string>,
): boolean {
  const eligible = players.filter(player =>
    player.status === 'active'
    && player.chips !== undefined
    && player.chips > 0
    && (player.presence === 'bot'
      || (player.presence === 'human' && fundedSeats.has(player.id)))
  );
  return eligible.length >= 2 && eligible.some(player => player.presence === 'human');
}