export const REVIEW_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const GAME_ROUTES = [
  '/badugi', '/dead7', '/fifteen35', '/suitspoker',
  '/flushedup', '/kamikaze', '/bonecrusher', '/box-chevy', '/ladyluck',
];

export interface ReviewGate {
  hasRated: boolean;
  ownBigWin: boolean;
  nativeAvailable: boolean;
  route: string;
  phase: string | null;
  serverLastReviewPromptAt: string | null;
  localLastReviewPromptAt: string | null;
}

/** A lobby is idle; a game route is idle only with an authoritative WAITING snapshot. */
export function isIdleForReview(route: string, phase: string | null): boolean {
  if (phase && phase !== 'WAITING') return false;
  const path = route.split('?')[0];
  if (path === '/') return true;
  return GAME_ROUTES.some(game => path === game || path.startsWith(game + '/'))
    && phase === 'WAITING';
}

export function canAutoPromptForReview(gate: ReviewGate, now = Date.now()): boolean {
  if (!gate.nativeAvailable || !gate.ownBigWin || gate.hasRated
    || !isIdleForReview(gate.route, gate.phase)) return false;
  return [gate.serverLastReviewPromptAt, gate.localLastReviewPromptAt].every(value => {
    if (!value) return true;
    const time = Date.parse(value);
    // Corrupt/future timestamps must not turn the prompt into a spam loop.
    return Number.isFinite(time) && now - time >= REVIEW_COOLDOWN_MS;
  });
}

export function reviewPromptStorageKey(playerId: string): string {
  return `cgp_last_review_prompt_at_${playerId}`;
}

export function reviewRatedStorageKey(playerId: string): string {
  return `cgp_review_rated_${playerId}`;
}