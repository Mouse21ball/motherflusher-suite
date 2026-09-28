import { randomInt } from 'node:crypto';

/** Fisher–Yates shuffle using unbiased cryptographic random indices. */
export function secureShuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}