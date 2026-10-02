import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedBlacklistMatcherTransformers,
} from 'obscenity';

const { blacklistedTerms } = englishDataset.build();

// Invite and table codes are not prose: offensive words must be rejected even
// when embedded within the code rather than surrounded by word boundaries.
const inviteCodeMatcher = new RegExpMatcher({
  blacklistedTerms: blacklistedTerms.map(term => ({
    ...term,
    pattern: {
      ...term.pattern,
      requireWordBoundaryAtStart: false,
      requireWordBoundaryAtEnd: false,
    },
  })),
  blacklistMatcherTransformers: englishRecommendedBlacklistMatcherTransformers,
});

export function isSafeInviteCode(code: string): boolean {
  return !inviteCodeMatcher.hasMatch(code);
}

const DEFAULT_MAX_ATTEMPTS = 100;

export function generateSafeInviteCode(
  alphabet: string,
  length: number,
  randomIndex: (exclusiveUpperBound: number) => number,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): string {
  if (!alphabet || length < 1 || maxAttempts < 1) {
    throw new Error('Invite-code generation requires an alphabet, length, and attempts.');
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let code = '';
    for (let index = 0; index < length; index++) {
      const characterIndex = randomIndex(alphabet.length);
      if (!Number.isInteger(characterIndex) || characterIndex < 0 || characterIndex >= alphabet.length) {
        throw new Error('Invite-code random source returned an invalid character index.');
      }
      code += alphabet[characterIndex];
    }
    if (isSafeInviteCode(code)) return code;
  }

  throw new Error(`Failed to generate a safe invite code after ${maxAttempts} attempts.`);
}