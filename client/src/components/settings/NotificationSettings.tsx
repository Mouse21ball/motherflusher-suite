import { useCallback, useEffect, useState } from 'react';
import {
  activatePushForProfile,
  checkNativePushPermission,
  DEFAULT_NOTIFICATION_PREFERENCES,
  fetchNotificationPreferences,
  isNativePushPlatform,
  requestNativePushPermission,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/pushNotifications';

const OPTIONS: Array<{ key: keyof NotificationPreferences; title: string; detail: string }> = [
  { key: 'streakAtRisk', title: 'Streak at risk', detail: 'A reminder when your streak is about to end.' },
  { key: 'hourlyReady', title: 'Hourly bonus ready', detail: 'Know when your next hourly bonus is available.' },
  { key: 'winBack', title: 'Come back to the tables', detail: 'Occasional reminders to return to the game.' },
];

function permissionLabel(permission: string): string {
  if (permission === 'granted') return 'Allowed in device settings';
  if (permission === 'denied') return 'Blocked in device settings';
  if (permission === 'prompt' || permission === 'prompt-with-rationale') return 'Not enabled yet';
  return 'Status unavailable';
}


export function NotificationSettings({ profileId }: { profileId: string }) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [permission, setPermission] = useState('checking');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const native = isNativePushPlatform();

  const refreshPermission = useCallback(async () => {
    if (!native) {
      setPermission('unavailable');
      return;
    }
    try { setPermission(await checkNativePushPermission()); }
    catch { setPermission('unavailable'); }
  }, [native]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchNotificationPreferences()
      .then(value => { if (mounted) setPreferences(value); })
      .catch(() => { if (mounted) setError('Could not load your saved notification choices.'); })
      .finally(() => { if (mounted) setLoading(false); });
    void refreshPermission();
    return () => { mounted = false; };
  }, [profileId, refreshPermission]);

  const updatePreference = async (key: keyof NotificationPreferences, enabled: boolean) => {
    const previous = preferences;
    const next = { ...preferences, [key]: enabled };
    setPreferences(next);
    setSaving(key);
    setError(null);
    try {
      const saved = await saveNotificationPreferences({ [key]: enabled });
      setPreferences(saved);
    } catch (e) {
      setPreferences(previous);
      setError(e instanceof Error ? e.message : 'Could not save notification preferences.');
      setSaving(null);
      return;
    }
    try {
      await activatePushForProfile(profileId);
    } catch {
      setError('Your preference was saved, but this device could not update its push registration. The app will retry later.');
    } finally {
      setSaving(null);
    }
  };

  const enableOnDevice = async () => {
    setError(null);
    try {
      const result = await requestNativePushPermission();
      setPermission(result);
      if (result === 'granted') await activatePushForProfile(profileId);
      else if (result === 'denied') setError('Notifications are blocked. Change this app’s notification permission in device settings.');
    } catch {
      setError('Could not enable notifications on this device. Check the app’s push notification setup.');
    }
  };

  return (
    <fieldset
      data-testid="settings-notifications"
      className="rounded-xl p-4"
      style={{ background: 'rgba(15,10,25,0.55)', border: '1px solid rgba(255,215,0,0.12)' }}
    >
      <legend style={{ padding: '0 6px', fontSize: 10, color: 'rgba(201,162,39,0.75)', fontFamily: 'monospace', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        Notifications
      </legend>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)', lineHeight: 1.5, margin: '0 0 12px' }}>
        Choose which reminders you receive. These preferences start enabled and can be changed any time.
      </p>

      <div className="mb-3 rounded-lg px-3 py-3" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {!native ? (
          <div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>Push is not available in this browser.</div>
            <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10, marginTop: 4 }}>Device permission status can only be checked in the iOS or Android app. Your saved preferences still apply to your account.</div>
          </div>
        ) : (
          <>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>
              This device: <span data-testid="text-push-permission">{permission === 'checking' ? 'Checking…' : permissionLabel(permission)}</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 4 }}>
              This reports operating-system permission, not proof that push delivery is configured.
            </div>
            <button
              type="button"
              onClick={enableOnDevice}
              disabled={permission === 'checking'}
              className="mt-3 rounded-lg px-3 py-2 font-mono text-[10px] font-bold tracking-wider disabled:opacity-40"
              style={{ minHeight: 42, border: '1px solid rgba(255,215,0,0.48)', color: '#FFD700', background: 'rgba(255,215,0,0.08)' }}
              data-testid="button-enable-push"
            >
              {permission === 'granted' ? 'REFRESH PUSH REGISTRATION' : 'ENABLE ON THIS DEVICE'}
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col divide-y divide-white/[0.07]">
        {OPTIONS.map(({ key, title, detail }) => (
          <label key={key} className="flex cursor-pointer items-center justify-between gap-3 py-3">
            <span>
              <span className="block text-xs text-white/75">{title}</span>
              <span className="mt-1 block text-[10px] leading-relaxed text-white/35">{detail}</span>
            </span>
            <input
              type="checkbox"
              checked={preferences[key]}
              disabled={loading || saving !== null}
              onChange={event => void updatePreference(key, event.target.checked)}
              aria-label={title}
              data-testid={`toggle-notification-${key}`}
              className="h-5 w-5 shrink-0 accent-[#FFD700]"
            />
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-[11px] text-red-300/80">{error}</p>}
    </fieldset>
  );
}
