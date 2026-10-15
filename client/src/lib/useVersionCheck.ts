import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useVersionCheck — polls /api/version and flags when the server has a newer
 * build than the one this client loaded with.
 *
 * Detroit 2026-10-15: Phones cache aggressively. Even with no-cache on
 * index.html, a user mid-session won't pick up a deploy until they refresh.
 * This shows a "new version available" prompt so they know to reload.
 */

const POLL_MS = 60_000; // check every minute

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const loadedCommit = useRef<string | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const serverCommit: string | undefined = data?.commit;
      if (!serverCommit) return;

      if (loadedCommit.current === null) {
        // First check — record what we loaded with
        loadedCommit.current = serverCommit;
        return;
      }

      if (serverCommit !== loadedCommit.current) {
        setUpdateAvailable(true);
      }
    } catch {
      // Network hiccup — try again next poll, don't flag
    }
  }, []);

  useEffect(() => {
    check();
    const timer = setInterval(check, POLL_MS);

    // Also check when the user comes back to the tab — catches deploys
    // that happened while the phone was locked/asleep
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  const refresh = useCallback(() => {
    window.location.reload();
  }, []);

  return { updateAvailable, refresh };
}
