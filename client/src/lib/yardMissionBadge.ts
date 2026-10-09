import { useSyncExternalStore } from 'react';

// Presentation-only cache of the quest state already fetched by Home.
// Changing screens must not introduce another quest API request.
let latest: { profileId: string; claimable: boolean } | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function publishYardMissionBadge(profileId: string, claimable: boolean) {
  if (latest?.profileId === profileId && latest.claimable === claimable) return;
  latest = { profileId, claimable };
  listeners.forEach(listener => listener());
}

export function useYardMissionBadge(profileId?: string) {
  return useSyncExternalStore(subscribe, () => latest?.profileId === profileId && latest?.claimable === true, () => false);
}
