// ─── useServerProfile ─────────────────────────────────────────────────────────
// Fetches the canonical player profile from the server on mount.
// Returns server-authoritative fields: chipBalance, lifetimeProfit,
// handsPlayed, displayName, email, hasAuth, and computed level.
//
// Falls back silently to `null` values so callers can always fall back to
// localStorage stats when the fetch is loading or fails (e.g. offline).

import { useState, useEffect } from 'react';
import { ensurePlayerIdentity } from './persistence';
import { apiUrl } from './apiConfig';

export interface ServerProfile {
  profileId:      string;
  displayName:    string;
  chipBalance:    number;
  handsPlayed:    number;
  lifetimeProfit: number;
  level:          number;
  hasAuth:        boolean;
  email:          string | null;
}

interface UseServerProfileResult {
  profile:  ServerProfile | null;
  loading:  boolean;
  refetch:  () => void;
}

export function useServerProfile(): UseServerProfileResult {
  const [profile,  setProfile]  = useState<ServerProfile | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [tick,     setTick]     = useState(0);

  useEffect(() => {
    let cancelled = false;
    const identity = ensurePlayerIdentity();

    setLoading(true);
    fetch(apiUrl(`/api/auth/me/${identity.id}`))
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<ServerProfile>;
      })
      .then(data => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        // Silently fail — callers fall back to localStorage
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]);

  const refetch = () => setTick(t => t + 1);

  return { profile, loading, refetch };
}
