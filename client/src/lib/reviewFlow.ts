import { apiUrl } from './apiConfig';
import { track } from './analytics';
import { openStoreListing, requestRateTheChainReview } from './nativeReview';
import { reviewRatedStorageKey } from './reviewPrompt';
import { apiFetch } from './session';

export interface ReviewState {
  hasRated: boolean;
  lastReviewPromptAt: string | null;
  isIdle: boolean;
}

export async function getReviewState(): Promise<ReviewState> {
  const response = await apiFetch(apiUrl('/api/review-state'));
  if (!response.ok) throw new Error('Could not check review eligibility.');
  return response.json() as Promise<ReviewState>;
}

export async function markRated(playerId: string): Promise<boolean> {
  // Keep this device quiet while offline; the next app session syncs the
  // monotonic server flag. Never store a non-player-scoped rating marker.
  try { localStorage.setItem(reviewRatedStorageKey(playerId), '1'); } catch {}
  try {
    const response = await apiFetch(apiUrl('/api/review-state/rated'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Only the explicit menu action is allowed to launch a store listing. */
export async function startMenuReview(playerId: string): Promise<{ launched: boolean; saved: boolean }> {
  // Initiate the native request without waiting on the network.
  const nativeRequest = requestRateTheChainReview();
  const save = markRated(playerId);
  const native = await nativeRequest;
  let launched = native.status === 'success';
  if (!launched) {
    const store = await openStoreListing();
    launched = store.status === 'success';
  }
  if (launched) track({ name: 'review_flow_completed', location: 'menu' });
  return { launched, saved: await save };
}

/** Never redirects a player out of their game on the automatic path. */
export async function startAutoReview(playerId: string): Promise<boolean> {
  const native = await requestRateTheChainReview();
  if (native.status !== 'success') return true; // unavailable/quota: no retries or fallback
  track({ name: 'review_flow_completed', location: 'big_win' });
  return markRated(playerId);
}