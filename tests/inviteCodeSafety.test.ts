import { describe, expect, it } from 'vitest';
import {
  generateSafeInviteCode,
  isSafeInviteCode,
} from '../shared/inviteCodeSafety';
import { generateReferralCode } from '../server/referralCodes';
import { generateInviteCode } from '../server/crews';
import { generateTableCode } from '../client/src/lib/tableSession';

const CREW_AND_TABLE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function candidateSequenceIndex(
  candidates: string[],
  alphabet: string,
): (exclusiveUpperBound: number) => number {
  let candidate = 0;
  let position = 0;
  return upperBound => {
    const code = candidates[candidate];
    if (!code) throw new Error('The generator requested more test codes than expected.');
    const index = alphabet.indexOf(code[position]);
    if (index < 0) throw new Error(`Test code character is not in the alphabet: ${code}`);
    if (++position === code.length) {
      candidate++;
      position = 0;
    }
    if (upperBound !== alphabet.length) throw new Error('Unexpected test alphabet size.');
    return index;
  };
}

function candidateSequenceRandom(candidates: string[], alphabet: string): () => number {
  const nextIndex = candidateSequenceIndex(candidates, alphabet);
  return () => nextIndex(alphabet.length) / alphabet.length;
}

describe('generated invite-code safety', () => {
  it('rejects profanity embedded in leetspeak and accepts clean codes case-insensitively', () => {
    expect(isSafeInviteCode('354CUM')).toBe(false);
    expect(isSafeInviteCode('x354cumx')).toBe(false);
    expect(isSafeInviteCode('ABC123')).toBe(true);
    expect(isSafeInviteCode('h7d9k2')).toBe(true);
  });

  it('retries profane candidates and preserves the requested code format', () => {
    const safeCode = generateSafeInviteCode(
      CREW_AND_TABLE_ALPHABET,
      6,
      candidateSequenceIndex(['354CUM', 'H7D9K2'], CREW_AND_TABLE_ALPHABET),
    );

    expect(safeCode).toBe('H7D9K2');
    expect(safeCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('filters crew and table codes without changing their established alphabet and length', () => {
    const crewCode = generateInviteCode(candidateSequenceRandom(
      ['354CUM', 'H7D9K2'],
      CREW_AND_TABLE_ALPHABET,
    ));
    const tableCode = generateTableCode(candidateSequenceRandom(
      ['354CUM', 'K7D9H2'],
      CREW_AND_TABLE_ALPHABET,
    ));

    expect(crewCode).toBe('H7D9K2');
    expect(tableCode).toBe('K7D9H2');
    expect(tableCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('filters secure referral codes while retaining 16 uppercase hexadecimal characters', () => {
    const alphabet = '0123456789ABCDEF';
    const code = generateReferralCode(candidateSequenceIndex(
      ['ABCDEF0123456789'],
      alphabet,
    ));

    expect(code).toBe('ABCDEF0123456789');
    expect(code).toMatch(/^[A-F0-9]{16}$/);
  });

  it('throws after a bounded number of unsafe candidates rather than retrying forever', () => {
    let attempts = 0;
    const unsafeCandidates = candidateSequenceIndex(
      ['354CUM', '354CUM', '354CUM'],
      CREW_AND_TABLE_ALPHABET,
    );
    const unsafeRandomIndex = (upperBound: number) => {
      attempts++;
      return unsafeCandidates(upperBound);
    };

    expect(() => generateSafeInviteCode(
      CREW_AND_TABLE_ALPHABET,
      6,
      unsafeRandomIndex,
      3,
    )).toThrow('Failed to generate a safe invite code after 3 attempts.');
    expect(attempts).toBe(18);
  });
});