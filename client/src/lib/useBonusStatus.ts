import { useEffect, useState } from 'react';
import { apiUrl } from './apiConfig';
import { ensurePlayerIdentity } from './persistence';
import { apiFetch } from './session';
import { useServerProfile } from './useServerProfile';

export interface BonusStatus {
  daily: { available: boolean; streak: number; day: number; chips: number; xp: number };
  hourly: { available: boolean; chips: number; nextAt: string | null };
  welcomeKitClaimed: boolean;
}

export function useBonusStatus(): BonusStatus | null {
  const { profile } = useServerProfile();
  const [status, setStatus] = useState<BonusStatus | null>(null);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    const refresh = () => {
      const id = ensurePlayerIdentity().id;
      apiFetch(apiUrl(`/api/players/${id}/rewards/status`))
        .then(r => { if (!r.ok) throw new Error('Bonus status unavailable'); return r.json(); })
        .then((data: BonusStatus) => { if (active) setStatus(data); })
        .catch(() => { if (active) setStatus(null); });
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [profile?.profileId, profile?.chipBalance, profile?.xp]);
  return status;
}