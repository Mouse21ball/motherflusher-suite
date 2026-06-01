// ─── useServerProfile ─────────────────────────────────────────────────────────
// Fetches the canonical player profile from the server on mount.
// Returns server-authoritative fields: chipBalance, lifetimeProfit,
// handsPlayed, displayName, email, hasAuth, level, avatarId, cooldowns,
// and equipped cosmetics (equippedAvatarId, equippedFrameId, equippedNameColorId).
//
// Falls back silently to `null` values so callers can always fall back to
// localStorage stats when the fetch is loading or fails (e.g. offline).

import { useState, useEffect } from 'react';
import { ensurePlayerIdentity } from './persistence';
import { apiUrl } from './apiConfig';
import { apiFetch, getSessionToken, setSessionToken } from './session';
import { setUserId } from './analytics';

export interface ServerProfile {
  profileId:            string;
  displayName:          string;
  chipBalance:          number;
  stripes:              number;
  handsPlayed:          number;
  lifetimeProfit:       number;
  level:                number;
  hasAuth:              boolean;
  email:                string | null;
  // ── Avatar & customisation ─────────────────────────────────────────────────
  avatarId:             string | null;  // null → show initials
  equippedAvatarId:     string | null;  // premium avatar override
  equippedFrameId:      string | null;  // decorative frame
  equippedNameColorId:  string | null;  // colored display name
  // ── Cooldowns ─────────────────────────────────────────────────────────────
  lastNameChangeAt:     string | null;  // ISO string; null → never changed
  nextResetAt:          string | null;  // ISO string; null → auth account (no reset)
  sessionToken?:        string;         // issued by server on every /me call
  // ── Subscription ───────────────────────────────────────────────────────────
  activeSubscriptionTier:  string | null;  // "gold_pro" | "diamond_elite" | null
  subscriptionExpiresAt:   string | null;  // ISO string
  // ── Admin ──────────────────────────────────────────────────────────────────
  isAdmin?:                boolean;        // true only for admin accounts
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

    // ── Profile fetch strategy ─────────────────────────────────────────────────
    // 1. Returning users (have a token): GET /api/auth/me — token in header,
    //    player ID resolved server-side. Returns full profile + refreshed token.
    // 2. New guests (no token yet): fall back to POST /api/auth/guest-init,
    //    which creates the server-side profile and issues a first session token.
    //    This also fixes the Ticket C bootstrap: new guests must have a token
    //    before they can open a WebSocket connection.

    const fetchProfile = async (): Promise<ServerProfile> => {
      const existingToken = getSessionToken();

      if (existingToken) {
        // Fast path: authenticated refresh
        const r = await apiFetch(apiUrl('/api/auth/me'));
        if (r.ok) return r.json() as Promise<ServerProfile>;
        // 401 means the token expired — fall through to guest-init below
        if (r.status !== 401) throw new Error(`${r.status}`);
      }

      // Bootstrap path: no token or token expired — initialize as guest.
      // apiFetch attaches X-Session-Token automatically, but guest-init
      // doesn't require one (and will ignore it if present).
      const r = await fetch(apiUrl('/api/auth/guest-init'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ profileId: identity.id, displayName: identity.name }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json() as Promise<ServerProfile>;
    };

    fetchProfile()
      .then(data => {
        if (!cancelled) {
          if (data.sessionToken) setSessionToken(data.sessionToken);
          setProfile(data);
          if (data.hasAuth) setUserId(data.profileId);
        }
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
