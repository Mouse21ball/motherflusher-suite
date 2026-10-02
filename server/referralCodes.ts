import { randomInt } from 'crypto';
import { generateSafeInviteCode } from '../shared/inviteCodeSafety';

const REFERRAL_ALPHABET = '0123456789ABCDEF';

export function generateReferralCode(
  nextRandomIndex: (exclusiveUpperBound: number) => number = randomInt,
): string {
  return generateSafeInviteCode(REFERRAL_ALPHABET, 16, nextRandomIndex);
}