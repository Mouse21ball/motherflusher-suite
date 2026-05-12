export type AnimalAvatar = 'fox' | 'cat' | 'bear' | 'bulldog' | 'gorilla' | 'wolf';

const AVATAR_MAP: Record<AnimalAvatar, string> = {
  fox:     '/emote-fox-smug.png',
  cat:     '/emote-cat-thinking.png',
  bear:    '/emote-bear-celebrating.png',
  bulldog: '/emote-bulldog-cigar.png',
  gorilla: '/emote-gorilla-angry.png',
  wolf:    '/emote-wolf-tilted.png',
};

const SEAT_AVATARS: Record<number, AnimalAvatar> = {
  1: 'wolf',
  2: 'fox',
  3: 'gorilla',
  4: 'bulldog',
  5: 'bear',
};

export function getAvatarForSeat(seatNumber: number): string {
  const animal = SEAT_AVATARS[seatNumber] ?? 'wolf';
  return AVATAR_MAP[animal];
}

export function getHeroAvatar(): string {
  return AVATAR_MAP['cat'];
}
