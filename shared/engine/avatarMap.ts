export type AnimalAvatar = 'fox' | 'cat' | 'bear' | 'bulldog' | 'gorilla' | 'wolf';

const AVATAR_MAP: Record<AnimalAvatar, string> = {
  fox:     '/emote-fox-smug.webp',
  cat:     '/emote-cat-thinking.webp',
  bear:    '/emote-bear-celebrating.webp',
  bulldog: '/emote-bulldog-cigar.webp',
  gorilla: '/emote-gorilla-angry.webp',
  wolf:    '/emote-wolf-tilted.webp',
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
