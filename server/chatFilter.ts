/**
 * Chat moderation filter — two-pass approach.
 *
 * Pass 1: obscenity library (RegExpMatcher + englishDataset + recommended
 *   transformers) — handles leetspeak, character substitution, and word
 *   boundaries across a broad English profanity dataset.
 *
 * Pass 2: custom abbreviated/leetspeak blocklist — catches shortened slang
 *   and internet abbreviations the library's dataset doesn't include.
 *
 * Both passes respect the poker-term whitelist to prevent false positives.
 * Profanity is replaced with equal-length asterisks and the message is always
 * allowed through — silent substitution prevents iterative probing.
 */

import { RegExpMatcher, TextCensor, englishDataset, englishRecommendedTransformers } from 'obscenity';

// ─── Pass 1: obscenity library ────────────────────────────────────────────────
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const censor = new TextCensor().setStrategy(({ matchLength }) => '*'.repeat(matchLength));

// ─── Pass 2: custom abbreviated / leetspeak blocklist ────────────────────────
// Terms the library dataset misses — common abbreviated slurs and internet
// shorthand used to evade basic filters.
const CUSTOM_BLOCKED_TERMS: string[] = [
  // abbreviated profanity
  'sht', 'fk', 'fuk', 'fking', 'fuking',
  'bch', 'btch',
  'azz',
  'mthfkr', 'mfkr', 'mfer',
  // internet command abbreviations
  'stfu', 'gtfo', 'kys',
  // slurs / hate speech
  'ngga', 'ngga',
  'fag',
  'hoe',
  'slut',
  // contextless "as fuck" suffix often evades library
  'asf',
];

// Deduplicate and build a single compiled regex (rebuilt once at module load).
const _dedupedTerms = [...new Set(CUSTOM_BLOCKED_TERMS)];
const CUSTOM_RE = new RegExp(
  _dedupedTerms
    .map(t => `\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    .join('|'),
  'gi',
);

// ─── Poker-term whitelist ─────────────────────────────────────────────────────
// Positions that overlap a whitelisted poker term are excluded from both passes.
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

// ─── Pass 2 helper ────────────────────────────────────────────────────────────
function applyCustomBlocklist(
  text: string,
  whitelist: Array<[number, number]>,
): { text: string; found: boolean } {
  // Use a fresh regex instance each call so lastIndex is always reset.
  const re = new RegExp(CUSTOM_RE.source, 'gi');
  const hits: Array<[number, number]> = []; // [startIndex, matchLength]
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const end   = m.index + m[0].length - 1;
    if (!overlapsAny(start, end, whitelist)) {
      hits.push([start, m[0].length]);
    }
  }
  if (hits.length === 0) return { text, found: false };

  // Replace right-to-left so earlier indices stay valid.
  let result = text;
  for (let i = hits.length - 1; i >= 0; i--) {
    const [start, len] = hits[i]!;
    result = result.slice(0, start) + '*'.repeat(len) + result.slice(start + len);
  }
  return { text: result, found: true };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Filter a chat message for profanity using two passes.
 *
 * @param rawText - The raw message from the client.
 * @returns `{ filtered, hadProfanity }`
 *   - `filtered`     — text safe to store/broadcast (asterisks substituted).
 *   - `hadProfanity` — true if any substitutions were made (use for logging).
 *
 * Length clamping is the caller's responsibility so the same function works
 * for both in-game chat (150 chars) and crew chat (500 chars).
 */
export function filterChatMessage(rawText: string): { filtered: string; hadProfanity: boolean } {
  const text = rawText.trim();
  if (!text) return { filtered: '', hadProfanity: false };

  // Whitelist ranges are computed on the original text once and shared by both
  // passes.  Because pass 1 only swaps characters 1-for-1 (equal-length
  // asterisks), all character positions remain valid for pass 2.
  const whitelist = getWhitelistRanges(text);

  // ── Pass 1: obscenity library ───────────────────────────────────────────────
  const allMatches = matcher.getAllMatches(text, true);
  const active = whitelist.length > 0
    ? allMatches.filter(m => !overlapsAny(m.startIndex, m.endIndex, whitelist))
    : allMatches;
  const pass1Text    = active.length > 0 ? censor.applyTo(text, active) : text;
  const hadPass1     = active.length > 0;

  // ── Pass 2: custom abbreviated / leetspeak blocklist ───────────────────────
  const { text: pass2Text, found: hadPass2 } = applyCustomBlocklist(pass1Text, whitelist);

  return { filtered: pass2Text, hadProfanity: hadPass1 || hadPass2 };
}
