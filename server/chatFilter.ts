/**
 * Chat moderation filter — powered by obscenity.
 * Handles leetspeak, character substitution, and word boundaries via the
 * English dataset + recommended transformers.
 *
 * Poker vocabulary is whitelisted to prevent false positives on common game
 * terms.  The filter replaces profanity with equal-length asterisks and never
 * blocks the message entirely — censored text is stored and broadcast so the
 * sender never knows which words triggered the filter.
 */

import { RegExpMatcher, TextCensor, englishDataset, englishRecommendedTransformers } from 'obscenity';

// ─── Matcher (built once at module load) ─────────────────────────────────────
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// ─── Censor strategy: replace each profane match with N asterisks ─────────────
const censor = new TextCensor().setStrategy(({ matchLength }) => '*'.repeat(matchLength));

// ─── Poker-term whitelist ─────────────────────────────────────────────────────
// Matches that overlap any of these positions are excluded from censoring.
const POKER_TERMS = [
  'flush', 'royal flush', 'straight flush',
  'bust', 'busted', 'bustout',
  'all-in', 'all in',
  'kicker',
  'pot', 'pot-limit',
  'rake',
  'shark', 'sharking',
  'fish', 'fishing',
  'donk', 'donkey', 'donking',
  'tilt', 'tilted', 'tilting',
  'cooler',
  'suckout', 'sucked out',
];

const POKER_RE_SOURCE = POKER_TERMS
  .map(t => `\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  .join('|');

function getWhitelistRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = new RegExp(POKER_RE_SOURCE, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length - 1]);
  }
  return ranges;
}

function overlapsAny(start: number, end: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([ws, we]) => start <= we && end >= ws);
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Filter a chat message for profanity.
 *
 * @param rawText - The raw message from the client.
 * @returns `{ filtered, hadProfanity }`
 *   - `filtered`      — text safe to store/broadcast (asterisks substituted).
 *   - `hadProfanity`  — true if any substitutions were made (use for logging).
 *
 * Note: length clamping is intentionally left to the caller so the same
 * function works for both in-game chat (150 chars) and crew chat (500 chars).
 */
export function filterChatMessage(rawText: string): { filtered: string; hadProfanity: boolean } {
  const text = rawText.trim();
  if (!text) return { filtered: '', hadProfanity: false };

  const allMatches = matcher.getAllMatches(text, true);
  if (allMatches.length === 0) return { filtered: text, hadProfanity: false };

  const whitelist = getWhitelistRanges(text);
  const active = whitelist.length > 0
    ? allMatches.filter(m => !overlapsAny(m.startIndex, m.endIndex, whitelist))
    : allMatches;

  if (active.length === 0) return { filtered: text, hadProfanity: false };

  const filtered = censor.applyTo(text, active);
  return { filtered, hadProfanity: true };
}
