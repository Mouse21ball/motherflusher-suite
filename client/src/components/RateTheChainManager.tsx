import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import {
  currentTableActivity, subscribeCelebrationCompletions, subscribeTableActivity,
} from './celebrations/celebrationService';
import { apiUrl } from '@/lib/apiConfig';
import { track } from '@/lib/analytics';
import { getReviewState, markRated, startAutoReview, type ReviewState } from '@/lib/reviewFlow';
import {
  canAutoPromptForReview, isIdleForReview, reviewPromptStorageKey, reviewRatedStorageKey,
} from '@/lib/reviewPrompt';
import { apiFetch } from '@/lib/session';
import { useServerProfile } from '@/lib/useServerProfile';

function localValue(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function RateTheChainManager() {
  const { profile } = useServerProfile();
  const playerId = profile?.profileId;
  const [location] = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const pending = useRef(false);
  const checking = useRef(false);
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkPending = useCallback(async () => {
    if (!pending.current || checking.current || openRef.current || !playerId) return;
    const nativeAvailable = Capacitor.isNativePlatform()
      && Capacitor.isPluginAvailable('RateTheChainReview');
    if (!nativeAvailable) { pending.current = false; return; }
    if (!isIdleForReview(locationRef.current, currentTableActivity()?.phase ?? null)) return;
    checking.current = true;
    try {
      const state = await getReviewState();
      if (!state.isIdle) return; // a game on another screen/device may be active
      const route = locationRef.current;
      const phase = currentTableActivity()?.phase ?? null;
      if (!isIdleForReview(route, phase)) return;
      if (!canAutoPromptForReview({
        hasRated: state.hasRated || localValue(reviewRatedStorageKey(playerId)) === '1',
        ownBigWin: true,
        nativeAvailable,
        route,
        phase,
        serverLastReviewPromptAt: state.lastReviewPromptAt,
        localLastReviewPromptAt: localValue(reviewPromptStorageKey(playerId)),
      })) {
        pending.current = false;
        return;
      }
      const response = await apiFetch(apiUrl('/api/review-state/claim'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) { pending.current = false; return; }
      const claim = await response.json() as ReviewState & { eligible: boolean };
      if (!claim.eligible || !claim.isIdle) { pending.current = false; return; }
      // If play resumed while the request was in flight, consume the claim
      // conservatively without displaying any prompt during a hand.
      if (!isIdleForReview(locationRef.current, currentTableActivity()?.phase ?? null)) {
        pending.current = false;
        return;
      }
      pending.current = false;
      if (claim.lastReviewPromptAt) {
        try { localStorage.setItem(reviewPromptStorageKey(playerId), claim.lastReviewPromptAt); } catch {}
      }
      openRef.current = true;
      setOpen(true);
      track({ name: 'review_prompt_shown', location: 'big_win' });
    } catch {
      pending.current = false; // do not interrupt play on a network failure
    } finally {
      checking.current = false;
    }
  }, [playerId]);

  useEffect(() => subscribeCelebrationCompletions(event => {
    if (event.type !== 'BIG_POT' || !playerId
      || !event.targets.some(target => target.playerId === playerId)) return;
    pending.current = true;
    void checkPending();
  }), [playerId, checkPending]);

  useEffect(() => subscribeTableActivity(() => {
    if (openRef.current && !isIdleForReview(locationRef.current, currentTableActivity()?.phase ?? null)) {
      openRef.current = false;
      setOpen(false);
    }
    void checkPending();
  }), [checkPending]);
  useEffect(() => { void checkPending(); }, [location, checkPending]);
  useEffect(() => {
    pending.current = false;
    if (openRef.current) { openRef.current = false; setOpen(false); }
  }, [playerId]);

  useEffect(() => {
    if (!playerId || localValue(reviewRatedStorageKey(playerId)) !== '1') return;
    void markRated(playerId);
  }, [playerId]);

  const close = () => {
    if (busy) return;
    openRef.current = false;
    setOpen(false);
    setError(null);
    track({ name: 'review_prompt_dismissed', location: 'big_win' });
  };

  const rate = async () => {
    if (busy || !playerId) return;
    setBusy(true);
    setError(null);
    try {
      // A new hand can start while the custom prompt is visible. Both the
      // current snapshot and the authoritative server must still say idle.
      const state = await getReviewState();
      if (!state.isIdle || !isIdleForReview(locationRef.current, currentTableActivity()?.phase ?? null)) {
        openRef.current = false;
        setOpen(false);
        return;
      }
      const saved = await startAutoReview(playerId);
      if (!saved) {
        setError('Could not save your review preference. Please check your connection.');
        return;
      }
      openRef.current = false;
      setOpen(false);
    } catch {
      setError('Could not check whether the table is idle. Please try again later.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 px-5"
      role="presentation"
    >
      <div className="w-full max-w-sm rounded-2xl border border-amber-400/50 bg-[#141018] p-6 text-center text-white shadow-2xl"
        role="dialog" aria-modal="true" aria-labelledby="rate-chain-title" data-testid="rate-chain-auto-prompt">
        <div aria-hidden="true" className="mb-3 text-3xl text-amber-300">★</div>
        <h2 id="rate-chain-title" className="text-xl font-bold">Enjoying Chain Gang Poker?</h2>
        <p className="mt-3 text-sm text-white/75">That was a big win! Rate the Chain if you're having fun.</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={close} disabled={busy}
            className="min-h-11 flex-1 rounded-lg border border-white/30 text-sm font-semibold disabled:opacity-50"
            data-testid="button-review-not-now">Not now</button>
          <button type="button" onClick={() => { void rate(); }} disabled={busy}
            className="min-h-11 flex-1 rounded-lg bg-amber-400 px-3 text-sm font-bold text-[#1a1413] disabled:opacity-50"
            data-testid="button-review-rate">{busy ? 'One moment…' : 'Rate the Chain'}</button>
        </div>
      </div>
    </div>
  );
}