import { describe, expect, it } from 'vitest';
import {
  canAutoPromptForReview,
  isIdleForReview,
  REVIEW_COOLDOWN_MS,
  type ReviewGate,
} from '../client/src/lib/reviewPrompt';

const NOW = Date.parse('2026-09-29T12:00:00.000Z');
const eligible: ReviewGate = {
  hasRated: false,
  ownBigWin: true,
  nativeAvailable: true,
  route: '/',
  phase: null,
  serverLastReviewPromptAt: null,
  localLastReviewPromptAt: null,
};

describe('Rate the Chain automatic prompt gate', () => {
  it('enforces a seven-day cooldown using both server and per-player local timestamps', () => {
    for (const field of ['serverLastReviewPromptAt', 'localLastReviewPromptAt'] as const) {
      expect(canAutoPromptForReview({
        ...eligible, [field]: new Date(NOW - REVIEW_COOLDOWN_MS + 1).toISOString(),
      }, NOW)).toBe(false);
      expect(canAutoPromptForReview({
        ...eligible, [field]: new Date(NOW - REVIEW_COOLDOWN_MS).toISOString(),
      }, NOW)).toBe(true);
    }
  });

  it('never prompts a player already marked rated', () => {
    expect(canAutoPromptForReview({ ...eligible, hasRated: true }, NOW)).toBe(false);
  });

  it('explicitly blocks the prompt during an active hand, even after a big win', () => {
    expect(isIdleForReview('/badugi?t=table1', 'BET_2')).toBe(false);
    expect(canAutoPromptForReview({
      ...eligible, route: '/badugi?t=table1', phase: 'BET_2',
    }, NOW)).toBe(false);
    expect(canAutoPromptForReview({ ...eligible, phase: 'SHOWDOWN' }, NOW)).toBe(false);
    expect(canAutoPromptForReview({
      ...eligible, route: '/badugi?t=table1', phase: 'WAITING',
    }, NOW)).toBe(true);
  });

  it('requires a native plugin, this player in the BIG_POT award, and a lobby/table route', () => {
    expect(canAutoPromptForReview({ ...eligible, nativeAvailable: false }, NOW)).toBe(false);
    expect(canAutoPromptForReview({ ...eligible, ownBigWin: false }, NOW)).toBe(false);
    expect(canAutoPromptForReview({ ...eligible, route: '/shop' }, NOW)).toBe(false);
  });
});